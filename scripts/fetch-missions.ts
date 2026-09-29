/**
 * Full spacecraft trajectories from JPL Horizons.
 *
 * For each mission in scripts/lib/missions.ts:
 *   1. Find the span Horizons has an ephemeris for (launch → end of mission).
 *   2. Decide, over time, which body the spacecraft is "with": the deepest
 *      body whose region (Laplace sphere of influence, or a multiple of its
 *      radius for small bodies) contains it — Earth at launch, the Sun in
 *      cruise, Jupiter during a flyby, Eros in orbit. Encounters shorter
 *      than the daily sampling are found by refining any interval where the
 *      spacecraft could have passed through a region.
 *   3. Within each such segment, sample the spacecraft relative to that body
 *      at adaptive intervals (dense near close approaches): osculating
 *      elements where the body's gravity dominates, Hermite states near
 *      small bodies where no conic describes the motion.
 *   4. For landers, find touchdown as the moment after which the body-fixed
 *      position stops changing, and record the site.
 *
 * Output:
 *   src/data/missions.json                   bundled index (identity, span, landing)
 *   public/data/missions/<slug>.json          trajectory segments, loaded at runtime
 *
 * Requires src/data/{orientation,moons,smallBodies}.json.
 * Run: node scripts/fetch-missions.ts [name ...]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { bodyFixedToEcliptic, type OrientationModel } from "../src/astro/orientation.ts";
import { ROOT, isoToJulian, julianToIso, sig, writeJson } from "./lib/common.ts";
import { type StateTable, coverage, vectorGrid, vectorsAt } from "./lib/horizons.ts";
import { MISSIONS, type MissionConfig } from "./lib/missions.ts";

const DAY_S = 86_400;
const GM_SUN = 132_712_440_041.279_42;
const COARSE_STEP_MINUTES = 1440;
const MINUTE = 1 / 1440;

// ── Candidate bodies ────────────────────────────────────────────────────

interface CandidateBody {
  name: string;
  /** Horizons command for its ephemeris, and center code if Horizons accepts it as a center. */
  command: string;
  center: string | null;
  gm: number;       // km^3/s^2, 0 if unknown
  radius: number;   // km, 0 if unknown
  parent: string | null;
  depth: number;
  /** Gravity strong enough for osculating conics to describe nearby motion. */
  keplerian: boolean;
  orientation?: OrientationModel;
}

const orientationData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/orientation.json"), "utf8")) as {
  systems: Record<string, number[][]>;
  bodies: Record<string, { gm?: number; radii?: number[]; poleRa?: number[]; poleDec?: number[]; primeMeridian?: number[]; nutPrecRa?: number[]; nutPrecDec?: number[]; nutPrecPm?: number[]; system?: number }>;
};
const moonData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/moons.json"), "utf8")) as {
  moons: Array<{ name: string; naifId: number; parent: string; gm: number | null; radius: number | null }>;
};
const smallBodyData = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/smallBodies.json"), "utf8")) as {
  bodies: Array<{ name: string; spkid: number; horizonsCommand: string; radius: number | null }>;
};

function orientationFor(naifId: number): OrientationModel | undefined {
  const record = orientationData.bodies[naifId];
  if (!record?.poleRa || !record.poleDec || !record.primeMeridian) return undefined;
  return {
    poleRa: record.poleRa,
    poleDec: record.poleDec,
    primeMeridian: record.primeMeridian,
    nutPrecRa: record.nutPrecRa,
    nutPrecDec: record.nutPrecDec,
    nutPrecPm: record.nutPrecPm,
    angles: record.system === undefined ? undefined : orientationData.systems[record.system],
  };
}

function naifBody(name: string, naifId: number, parent: string | null, depth: number): CandidateBody {
  const record = orientationData.bodies[naifId];
  const radii = record?.radii;
  const gm = record?.gm ?? 0;
  return {
    name,
    command: String(naifId),
    center: `500@${naifId}`,
    gm,
    radius: radii ? Math.cbrt(radii[0] * radii[1] * radii[2]) : 0,
    parent,
    depth,
    keplerian: gm >= 1,
    orientation: orientationFor(naifId),
  };
}

const ALWAYS: CandidateBody[] = [
  naifBody("Mercury", 199, "Sun", 1),
  naifBody("Venus", 299, "Sun", 1),
  naifBody("Earth", 399, "Sun", 1),
  naifBody("Moon", 301, "Earth", 2),
  naifBody("Mars", 499, "Sun", 1),
  naifBody("Jupiter", 599, "Sun", 1),
  naifBody("Saturn", 699, "Sun", 1),
  naifBody("Uranus", 799, "Sun", 1),
  naifBody("Neptune", 899, "Sun", 1),
  naifBody("Pluto", 999, "Sun", 1),
];

function targetBody(name: string): CandidateBody {
  const moon = moonData.moons.find((candidate) => candidate.name === name);
  if (moon) {
    const body = naifBody(name, moon.naifId, moon.parent, 2);
    body.gm ||= moon.gm ?? 0;
    body.radius ||= moon.radius ?? 0;
    body.keplerian = body.gm >= 1;
    return body;
  }
  const small = smallBodyData.bodies.find((candidate) => candidate.name === name);
  if (!small) throw new Error(`Unknown target ${name}`);
  const naifId = small.spkid >= 20_000_000 && small.spkid < 30_000_000 ? small.spkid - 18_000_000 : small.spkid;
  const record = orientationData.bodies[naifId];
  const gm = record?.gm ?? 0;
  return {
    name,
    command: small.horizonsCommand,
    // Resolved in processMission: not every small body is available as a
    // Horizons center, in which case relative states are differences.
    center: `500@${naifId}`,
    gm,
    radius: small.radius ?? (record?.radii ? Math.cbrt(record.radii[0] * record.radii[1] * record.radii[2]) : 0),
    parent: "Sun",
    depth: 1,
    keplerian: gm >= 1,
    orientation: orientationFor(naifId),
  };
}

/**
 * Region in which a body is the natural frame for a nearby spacecraft:
 * its Laplace sphere of influence, but at least 20 radii (100 for small
 * bodies, whose formal spheres can be smaller than the orbits flown there).
 */
function regionRadius(body: CandidateBody, distanceToParent: number, parentGm: number): number {
  const soi = body.gm > 0 && parentGm > 0 ? distanceToParent * (body.gm / parentGm) ** 0.4 : 0;
  return Math.max(soi, (body.keplerian ? 20 : 100) * body.radius);
}

// ── Vector helpers ──────────────────────────────────────────────────────

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Osculating elements [q km, e, i, node, argPeri, M (deg), n (deg/day)] from a state (km, km/day). */
function stateToElements(r: number[], v: number[], mu: number): number[] {
  const rMag = norm(r);
  const vSq = dot(v, v);
  const h = cross(r, v);
  const hMag = norm(h);
  const eVector = r.map((component, index) => ((vSq - mu / rMag) * component - dot(r, v) * v[index]) / mu);
  const e = norm(eVector);
  const a = 1 / (2 / rMag - vSq / mu);
  const i = Math.acos(Math.max(-1, Math.min(1, h[2] / hMag)));
  const node = Math.hypot(h[0], h[1]) < 1e-12 * hMag ? 0 : Math.atan2(h[0], -h[1]);
  const nodeVector = [Math.cos(node), Math.sin(node), 0];
  const inPlane = cross(h.map((value) => value / hMag), nodeVector);
  const argPeri = e > 1e-12 ? Math.atan2(dot(eVector, inPlane), dot(eVector, nodeVector)) : 0;
  const nu = Math.atan2(dot(r, inPlane), dot(r, nodeVector)) - argPeri;
  let M: number;
  if (e < 1) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    M = E - e * Math.sin(E);
  } else {
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    M = e * Math.sinh(H) - H;
  }
  const n = Math.sqrt(mu / Math.abs(a) ** 3);
  const deg = 180 / Math.PI;
  return [sig(Math.abs(a * (1 - e)), 12), sig(e, 12), sig(i * deg, 12), sig(node * deg, 12), sig(argPeri * deg, 12), sig(M * deg, 12), sig(n * deg, 12)];
}

// ── Pipeline ────────────────────────────────────────────────────────────

interface SegmentPlan {
  start: number;
  end: number;
  parent: CandidateBody | null; // null: the Sun
}

async function heliocentric(command: string, start: number, end: number): Promise<StateTable> {
  return vectorGrid(command, "500@10", start, end, COARSE_STEP_MINUTES);
}

/** The deepest candidate whose region contains the spacecraft at each sample. */
function assignParents(
  craft: StateTable,
  bodies: CandidateBody[],
  tables: Map<string, StateTable>,
  bodyIndexAt: (table: StateTable, jd: number) => number
): Array<CandidateBody | null> {
  const parents: Array<CandidateBody | null> = [];
  let current: CandidateBody | null = null;
  for (let k = 0; k < craft.jd.length; k++) {
    const jd = craft.jd[k];
    let best: CandidateBody | null = null;
    for (const body of bodies) {
      const table = tables.get(body.name)!;
      const index = bodyIndexAt(table, jd);
      const position = table.position[index];
      const parentPosition = body.parent && body.parent !== "Sun"
        ? tables.get(body.parent)!.position[bodyIndexAt(tables.get(body.parent)!, jd)]
        : [0, 0, 0];
      const parentGm = body.parent && body.parent !== "Sun" ? bodies.find((b) => b.name === body.parent)!.gm : GM_SUN;
      const region = regionRadius(body, norm(sub(position, parentPosition)), parentGm);
      // Hysteresis: once inside, stay until 25% beyond the region.
      const limit = body === current ? 1.25 * region : region;
      if (norm(sub(craft.position[k], position)) < limit && (!best || body.depth > best.depth)) best = body;
    }
    parents.push(best);
    current = best;
  }
  return parents;
}

function exactIndex(table: StateTable, jd: number): number {
  // Tables share the craft's epochs; find by binary search with a small tolerance.
  let low = 0;
  let high = table.jd.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (table.jd[middle] < jd - 1e-7) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Parent timeline for a mission: daily samples, refined around any
 * interval where a region boundary might be crossed or an encounter hidden.
 */
async function planSegments(config: MissionConfig, start: number, end: number, bodies: CandidateBody[]): Promise<SegmentPlan[]> {
  const command = String(config.spkid);
  const craft = await heliocentric(command, start, end);
  const tables = new Map<string, StateTable>();
  for (const body of bodies) tables.set(body.name, await heliocentric(body.command, craft.jd[0], craft.jd[craft.jd.length - 1] + 1e-6));

  const coarse = assignParents(craft, bodies, tables, exactIndex);

  // Intervals to refine: parent changes, or a possible pass through a region
  // between samples (closest approach of the straight-line relative motion).
  const windows: Array<{ start: number; end: number; step: number; bodies: Set<CandidateBody> }> = [];
  for (let k = 0; k + 1 < craft.jd.length; k++) {
    let step = Number.POSITIVE_INFINITY;
    const flagged = new Set<CandidateBody>();
    for (const body of bodies) {
      const table = tables.get(body.name)!;
      const relative = sub(craft.position[k], table.position[k]);
      const velocity = sub(craft.velocity[k], table.velocity[k]).map((value) => value * DAY_S);
      const span = craft.jd[k + 1] - craft.jd[k];
      const speed = norm(velocity);
      const tau = speed > 0 ? Math.max(0, Math.min(span, -dot(relative, velocity) / (speed * speed))) : 0;
      const closest = norm(relative.map((value, axis) => value + velocity[axis] * tau));
      const parentGm = body.parent && body.parent !== "Sun" ? bodies.find((b) => b.name === body.parent)!.gm : GM_SUN;
      const parentPosition = body.parent && body.parent !== "Sun" ? tables.get(body.parent)!.position[k] : [0, 0, 0];
      const region = regionRadius(body, norm(sub(table.position[k], parentPosition)), parentGm);
      const crossing = (coarse[k] === body) !== (coarse[k + 1] === body);
      if (crossing || (closest < 1.5 * region && coarse[k] !== body)) {
        step = Math.min(step, Math.max(MINUTE, Math.min(60 * MINUTE, region / Math.max(speed, 1) / 20)));
        flagged.add(body);
      }
    }
    if (Number.isFinite(step)) windows.push({ start: craft.jd[k], end: craft.jd[k + 1], step, bodies: flagged });
  }

  // Merge adjacent windows and resample them finely, against the bodies
  // involved (and their parents, which set their regions) plus the parents
  // in effect at either end.
  const merged: typeof windows = [];
  for (const window of windows) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end + 1e-9) {
      last.end = window.end;
      last.step = Math.min(last.step, window.step);
      window.bodies.forEach((body) => last.bodies.add(body));
    } else {
      merged.push({ ...window, bodies: new Set(window.bodies) });
    }
  }

  const timeline: Array<{ jd: number; parent: CandidateBody | null }> = craft.jd.map((jd, k) => ({ jd, parent: coarse[k] }));
  for (const window of merged) {
    const stepMinutes = Math.max(1, Math.round(Math.max(window.step, (window.end - window.start) / 4000) * 1440));
    const involved = new Set(window.bodies);
    for (const jd of [window.start, window.end]) {
      const parent = coarse[exactIndex(craft, jd)];
      if (parent) involved.add(parent);
    }
    for (const body of [...involved]) {
      const parent = bodies.find((candidate) => candidate.name === body.parent);
      if (parent) involved.add(parent);
    }
    const local = bodies.filter((body) => involved.has(body));
    const fineCraft = await vectorGrid(command, "500@10", window.start, window.end, stepMinutes);
    const fineTables = new Map<string, StateTable>();
    for (const body of local) fineTables.set(body.name, await vectorGrid(body.command, "500@10", window.start, window.end, stepMinutes));
    const fine = assignParents(fineCraft, local, fineTables, exactIndex);
    fineCraft.jd.forEach((jd, index) => timeline.push({ jd, parent: fine[index] }));
  }
  timeline.sort((a, b) => a.jd - b.jd);

  // Runs of the same parent become segments; boundaries at the midpoints.
  const segments: SegmentPlan[] = [];
  for (let index = 0; index < timeline.length; index++) {
    const sample = timeline[index];
    const last = segments[segments.length - 1];
    if (last && last.parent === sample.parent) continue;
    const boundary = index === 0 ? start : (timeline[index - 1].jd + sample.jd) / 2;
    if (last) last.end = boundary;
    segments.push({ start: boundary, end: end, parent: sample.parent });
  }
  return segments;
}

/** Earliest time after which the spacecraft sits still on the body (within tolerance). */
async function findTouchdown(config: MissionConfig, body: CandidateBody, from: number, end: number): Promise<{ time: number; position: number[] } | null> {
  if (!body.orientation) throw new Error(`No orientation model for ${body.name}`);
  const command = String(config.spkid);
  const center = body.center;
  const relativeAt = async (jd: number): Promise<number[]> => {
    if (center) return (await vectorsAt(command, center, [jd])).position[0];
    const craft = await vectorsAt(command, "500@10", [jd]);
    const target = await vectorsAt(body.command, "500@10", [jd]);
    return sub(craft.position[0], target.position[0]);
  };
  const bodyFixed = async (jd: number) => {
    const m = bodyFixedToEcliptic(body.orientation!, jd);
    const v = await relativeAt(jd);
    return [0, 1, 2].map((column) => m[column] * v[0] + m[3 + column] * v[1] + m[6 + column] * v[2]);
  };
  const final = await bodyFixed(end);
  const tolerance = Math.max(0.05, 0.002 * body.radius);
  const atRest = async (jd: number) => norm(sub(await bodyFixed(jd), final)) < tolerance;
  if (!(await atRest(end - 1 * MINUTE))) {
    // The ephemeris stops at touchdown (no surface phase): land where it ends,
    // if that is on the surface.
    const altitude = norm(final) - body.radius;
    return Math.abs(altitude) < Math.max(1, 0.02 * body.radius) ? { time: end, position: final } : null;
  }
  let low = from;
  let high = end;
  while (high - low > MINUTE) {
    const middle = (low + high) / 2;
    if (await atRest(middle)) high = middle;
    else low = middle;
  }
  return { time: high, position: final };
}

/** Sample one segment adaptively; returns epochs and rows. */
async function sampleSegment(config: MissionConfig, plan: SegmentPlan, parentGm: number) {
  const command = String(config.spkid);
  const parent = plan.parent;
  const hermite = parent !== null && !parent.keplerian;
  const mu = parentGm * DAY_S * DAY_S;

  const statesAt = async (epochs: number[]): Promise<StateTable> => {
    if (!parent) return vectorsAt(command, "500@10", epochs);
    if (parent.center) return vectorsAt(command, parent.center, epochs);
    const craft = await vectorsAt(command, "500@10", epochs);
    const target = await vectorsAt(parent.command, "500@10", craft.jd);
    return {
      jd: craft.jd,
      position: craft.position.map((position, index) => sub(position, target.position[index])),
      velocity: craft.velocity.map((velocity, index) => sub(velocity, target.velocity[index])),
    };
  };

  /** Sampling interval (days) suited to the state. */
  const stepFor = (position: number[], velocityKmS: number[]): number => {
    const distance = norm(position);
    const speed = Math.max(1e-9, norm(velocityKmS)) * DAY_S; // km/day
    const crossing = distance / speed;
    if (hermite) return Math.max(MINUTE, Math.min(0.5, crossing));
    if (!parent) return Math.max(0.25, Math.min(30, 0.1 * crossing));
    const energy = (speed * speed) / 2 - mu / distance;
    if (energy < 0) {
      const a = -mu / (2 * energy);
      const period = 2 * Math.PI * Math.sqrt(a ** 3 / mu);
      // Bound: the conic itself describes each revolution; sample slowly
      // enough to follow the orbit's evolution, not its motion.
      return Math.max(1 / 24, Math.min(5, 20 * period));
    }
    return Math.max(MINUTE, Math.min(1, 0.1 * crossing));
  };

  const epochs: number[] = [];
  const rows: number[][] = [];
  const push = (table: StateTable, index: number) => {
    const jd = table.jd[index];
    if (epochs.length && jd <= epochs[epochs.length - 1] + 1e-9) return;
    epochs.push(jd);
    const position = table.position[index];
    const velocity = table.velocity[index].map((value) => value * DAY_S);
    rows.push(hermite
      ? [...position.map((value) => sig(value, 12)), ...velocity.map((value) => sig(value, 12))]
      : stateToElements(position, velocity, mu));
  };

  let cursor = await statesAt([plan.start + 1e-7]);
  let lastLog = Date.now();
  push(cursor, 0);
  const segmentEnd = plan.end - 1e-7;
  // Horizons reports epochs to ~0.1 s; treat anything within a second as the end.
  const endTolerance = 1 / DAY_S;
  while (epochs[epochs.length - 1] < segmentEnd - endTolerance) {
    if (Date.now() - lastLog > 10_000) {
      lastLog = Date.now();
      console.log(`      … ${julianToIso(epochs[epochs.length - 1]).slice(0, 16)} (${epochs.length} samples)`);
    }
    const last = cursor.jd.length - 1;
    const step = stepFor(cursor.position[last], cursor.velocity[last]);
    const from = cursor.jd[last];
    const batch: number[] = [];
    for (let k = 1; k <= 150 && from + k * step < segmentEnd - endTolerance; k++) batch.push(from + k * step);
    batch.push(Math.min(segmentEnd, from + (batch.length + 1) * step));
    const states = await statesAt(batch);
    if (states.jd.length === 0) throw new Error(`No states after JD ${from}`);
    // Accept samples until one says the step was too coarse there.
    let accepted = 0;
    for (; accepted < states.jd.length; accepted++) {
      push(states, accepted);
      if (step > 1.5 * stepFor(states.position[accepted], states.velocity[accepted])) {
        accepted++;
        break;
      }
    }
    if (states.jd[accepted - 1] <= from + 1e-9) {
      throw new Error(`Sampling stalled at JD ${from} (step ${step} d, batch starts ${states.jd[0]})`);
    }
    cursor = { jd: states.jd.slice(0, accepted), position: states.position.slice(0, accepted), velocity: states.velocity.slice(0, accepted) };
  }
  return { hermite, epochs, rows };
}

function slug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Whether Horizons can report the spacecraft relative to this body's center at `jd`. */
async function centerWorks(command: string, center: string, jd: number): Promise<boolean> {
  try {
    await vectorsAt(command, center, [jd]);
    return true;
  } catch {
    return false;
  }
}

async function processMission(config: MissionConfig) {
  const bodies = [...ALWAYS, ...(config.targets ?? []).map(targetBody)];
  if (config.landsOn && !bodies.some((body) => body.name === config.landsOn)) bodies.push(targetBody(config.landsOn));
  const command = String(config.spkid);

  const nowPlus = isoToJulian(new Date().toISOString()) + 365 * 30;
  let [start, end] = await coverage(command, "500@10", 2_440_000.5, nowPlus);
  start += MINUTE;
  end -= MINUTE;
  const extendsToFuture = end > nowPlus - 1;

  let landing: { body: string; time: number; position: number[]; latitude: number; longitude: number } | null = null;
  let plans = await planSegments(config, start, end, bodies);

  // Small-body centers: use Horizons' own relative vectors when available
  // (consistent with the spacecraft solution), else heliocentric differences.
  for (const body of bodies) {
    if (body.depth !== 1 || ALWAYS.includes(body) || !body.center) continue;
    const during = plans.find((plan) => plan.parent === body);
    if (!during || !(await centerWorks(command, body.center, (during.start + during.end) / 2))) body.center = null;
  }

  if (config.landsOn) {
    const body = bodies.find((candidate) => candidate.name === config.landsOn)!;
    const lastWithBody = [...plans].reverse().find((plan) => plan.parent === body);
    if (!lastWithBody) throw new Error(`${config.name} never reaches ${body.name}`);
    // The body's own ephemeris (as a center) can end before the spacecraft's.
    const searchEnd = body.center
      ? Math.min(lastWithBody.end, (await coverage(command, body.center, lastWithBody.start, end))[1] - MINUTE)
      : lastWithBody.end;
    const touchdown = await findTouchdown(config, body, lastWithBody.start, searchEnd);
    if (!touchdown) throw new Error(`${config.name}: no touchdown found on ${body.name}`);
    const r = norm(touchdown.position);
    landing = {
      body: body.name,
      time: touchdown.time,
      position: touchdown.position.map((value) => sig(value, 10)),
      latitude: sig((Math.asin(touchdown.position[2] / r) * 180) / Math.PI, 8),
      longitude: sig((Math.atan2(touchdown.position[1], touchdown.position[0]) * 180) / Math.PI, 8),
    };
    plans = plans.filter((plan) => plan.start < touchdown.time);
    plans[plans.length - 1].end = touchdown.time;
  }

  const segments = [];
  for (const plan of plans) {
    const parentGm = plan.parent ? plan.parent.gm : GM_SUN;
    const { hermite, epochs, rows } = await sampleSegment(config, plan, parentGm);
    segments.push({
      start: plan.start,
      end: plan.end,
      parent: plan.parent?.name ?? "Sun",
      motion: hermite ? "hermite" : "keplerSeries",
      epochs,
      rows,
    });
    console.log(`    ${julianToIso(plan.start).slice(0, 16)} → ${julianToIso(plan.end).slice(0, 16)}  ${(plan.parent?.name ?? "Sun").padEnd(22)} ${hermite ? "hermite" : "conics "} ${epochs.length} samples`);
  }

  const file = `data/missions/${slug(config.name)}.json`;
  writeJson(`public/${file}`, {
    name: config.name,
    source: "JPL Horizons",
    generatedAt: new Date().toISOString(),
    note: "Segments relative to `parent`. keplerSeries rows: [q km, e, i, node, argPeri, M deg, n deg/day]; hermite rows: [x, y, z km, vx, vy, vz km/day]; J2000 ecliptic; epochs JD (TDB).",
    segments,
    landing,
  });

  return {
    name: config.name,
    spkid: config.spkid,
    type: config.type,
    icon: config.icon,
    status: config.status,
    fate: config.fate,
    start,
    end: landing ? null : extendsToFuture ? null : end,
    finalParent: segments[segments.length - 1].parent,
    landing,
    file,
  };
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const indexPath = path.join(ROOT, "src/data/missions.json");
  const previous = fs.existsSync(indexPath)
    ? (JSON.parse(fs.readFileSync(indexPath, "utf8")) as { missions: Array<{ name: string }> }).missions
    : [];
  const results = new Map(previous.map((mission) => [mission.name, mission]));

  // The index is rewritten after each mission, so a long run can be
  // interrupted and resumed (Horizons responses are cached).
  const writeIndex = () => writeJson("src/data/missions.json", {
    source: "JPL Horizons",
    generatedAt: new Date().toISOString(),
    missions: MISSIONS.map((config) => results.get(config.name)).filter(Boolean),
  }, true);
  for (const config of MISSIONS) {
    if (only.length && !only.includes(config.name)) continue;
    console.log(`${config.name} (${config.spkid})`);
    try {
      results.set(config.name, await processMission(config));
      writeIndex();
    } catch (error) {
      console.error(`  FAILED: ${String(error).slice(0, 300)}`);
    }
  }
  writeIndex();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
