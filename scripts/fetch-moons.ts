/**
 * Planetary satellites: mean orbits fitted to the JPL ephemerides.
 *
 * Sources:
 *   https://ssd.jpl.nasa.gov/sats/elem/
 *     The list of satellites with JPL ephemerides, each one's reference
 *     plane (Laplace plane, planet equator, or ecliptic), and period.
 *   https://ssd.jpl.nasa.gov/api/horizons.api
 *     Planet-centered state vectors sampled over 2000–2050, and each
 *     satellite's physical data header (radius).
 *   https://ssd.jpl.nasa.gov/sats/phys_par/
 *     Mean radius and GM for well-characterized satellites.
 *   src/data/orientation.json (NAIF PCK, run fetch-orientation.ts first)
 *     Planet GM and pole orientation, triaxial radii.
 *
 * For every satellite, a precessing Keplerian orbit (constant a, e, i;
 * linearly advancing mean longitude, periapsis, and node) is least-squares
 * fitted to the Horizons positions in the satellite's reference plane. This
 * is the model the app evaluates, so the fit is the best such orbit for the
 * whole span — rather than an osculating snapshot that drifts, or published
 * mean elements whose conventions vary between ephemeris solutions.
 *
 * Satellites without a published radius keep radius = null; the app draws
 * them as points.
 *
 * Output: src/data/moons.json
 * Run:    node scripts/fetch-moons.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  ROOT,
  fetchText,
  isoToJulian,
  leadingNumber,
  parseHtmlTables,
  horizonsCoverageLimit,
  sig,
  sleep,
  writeJson,
} from "./lib/common.ts";
import { type FitSample, fitMeanElements, stateToParams } from "./lib/orbitFit.ts";

const ELEMENTS_URL = "https://ssd.jpl.nasa.gov/sats/elem/";
const PHYSICAL_URL = "https://ssd.jpl.nasa.gov/sats/phys_par/";
const HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";

const PLANET_NAIF_IDS: Record<string, number> = {
  Earth: 399, Mars: 499, Jupiter: 599, Saturn: 699, Uranus: 799, Neptune: 899, Pluto: 999,
};

/** Default fit epoch: 2025-01-01 TDB. */
const EPOCH = 2460676.5;
const DEG = Math.PI / 180;
/** The J2000 ecliptic as a pole (RA, Dec in ICRF): its node on the equator is the equinox. */
const ECLIPTIC_POLE: [number, number] = [270, 90 - 84381.406 / 3600];

interface MoonRecord {
  name: string;
  naifId: number;
  parent: string;
  /** Reference plane pole (RA, Dec, deg, ICRF). Retrograde orbits use the flipped pole. */
  referencePole: [number, number];
  epoch: number;         // JD (TDB)
  a: number;             // km
  e: number;
  i: number;             // deg
  node: number;          // deg, from the plane's node on the ICRF equator
  argPeri: number;       // deg
  meanAnomaly: number;   // deg at epoch
  meanMotion: number;    // deg/day
  nodeRate: number;      // deg/day
  argPeriRate: number;   // deg/day
  fitRmsKm: number;
  fitSpanDays: number;
  radius: number | null; // km
  gm: number | null;     // km^3/s^2
  radiusSource: string | null;
}

interface TableRow {
  name: string;
  naifId: number;
  parent: string;
  pole: [number, number];
  period: number;
  epoch: number;
}

/** "S2003_J_18" → "S/2003 J 18"; IAU names pass through unchanged. */
function displayName(raw: string): string {
  const provisional = raw.match(/^S(\d{4})_?([A-Z])_?(\d+)$/);
  return provisional ? `S/${provisional[1]} ${provisional[2]} ${provisional[3]}` : raw;
}

/** JPL epochs are written "2000-01-01.5" (fractional day). */
function epochToJulian(text: string): number {
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(\.\d+)?$/);
  if (!match) throw new Error(`Unrecognized epoch ${text}`);
  const midnight = isoToJulian(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return midnight + Number(match[4] ?? 0);
}

/** Radius from a Horizons object-data header, if one is published. */
function parseHorizonsRadius(text: string): number | null {
  const header = text.split("$$SOE")[0];
  const match = header.match(
    /(?:Mean radius|Radius|Radii)[^=:\n]*?[=:]\s*~?\s*([\d.]+)(?:\s*[x×]\s*([\d.]+)(?:\s*[x×]\s*([\d.]+))?)?/i
  );
  if (!match) return null;
  const axes = [match[1], match[2], match[3]].filter(Boolean).map(Number);
  if (!axes.every((value) => Number.isFinite(value) && value > 0)) return null;
  // Volume-equivalent mean radius. "a x b" is read as a spheroid a × b × b.
  if (axes.length === 1) return axes[0];
  const [first, second, third = second] = axes;
  return Math.cbrt(first * second * third);
}

/** Rotation taking reference-plane coordinates to ICRF (x toward the plane's node on the equator). */
function poleFrame([raDeg, decDeg]: [number, number]): number[][] {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const z = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const x = [-Math.sin(ra), Math.cos(ra), 0];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x, y, z]; // rows: frame axes expressed in ICRF
}

function toFrame(frame: number[][], v: number[]): [number, number, number] {
  return [
    frame[0][0] * v[0] + frame[0][1] * v[1] + frame[0][2] * v[2],
    frame[1][0] * v[0] + frame[1][1] * v[1] + frame[1][2] * v[2],
    frame[2][0] * v[0] + frame[2][1] * v[1] + frame[2][2] * v[2],
  ];
}

/**
 * Sample offsets (days from the epoch): dense over the first few periods,
 * then geometrically spaced out to the full span in both directions, with
 * irregular ratios so samples never alias with the orbital period.
 */
function sampleOffsets(period: number, halfSpan: number): number[] {
  const offsets = new Set<number>();
  if (3 * period >= halfSpan) {
    for (let k = -30; k <= 30; k++) offsets.add((halfSpan * k) / 30);
  } else {
    for (let k = 0; k <= 24; k++) offsets.add((period * k) / 8);
    for (let reach = 3 * period * 2.2, m = 1; reach < halfSpan; reach *= 2.2, m++) {
      for (const factor of [1, 1.37]) {
        const offset = reach * factor * (1 + 0.013 * m);
        if (offset < halfSpan) {
          offsets.add(offset);
          offsets.add(-offset);
        }
      }
    }
    offsets.add(halfSpan);
    offsets.add(-halfSpan);
  }
  return [...offsets].sort((a, b) => a - b);
}

class HorizonsError extends Error {
  readonly text: string;
  constructor(text: string) {
    super(text.replace(/\s+/g, " ").slice(0, 240));
    this.text = text;
  }
}

/** Planet-centered ICRF states (km, km/day) at epoch + offsets, and the object-data header. */
async function fetchStates(naifId: number, planetId: number, epoch: number, offsets: number[]) {
  const url = new URL(HORIZONS_URL);
  url.searchParams.set("format", "text");
  url.searchParams.set("COMMAND", `'${naifId}'`);
  url.searchParams.set("OBJ_DATA", "YES");
  url.searchParams.set("MAKE_EPHEM", "YES");
  url.searchParams.set("EPHEM_TYPE", "VECTORS");
  url.searchParams.set("CENTER", `'500@${planetId}'`);
  url.searchParams.set("REF_PLANE", "FRAME");
  url.searchParams.set("REF_SYSTEM", "ICRF");
  url.searchParams.set("OUT_UNITS", "KM-D");
  url.searchParams.set("VEC_TABLE", "2");
  url.searchParams.set("CSV_FORMAT", "YES");
  url.searchParams.set("TLIST", offsets.map((offset) => `'${(epoch + offset).toFixed(6)}'`).join(" "));
  const text = await fetchText(url);
  const body = text.split("$$SOE")[1]?.split("$$EOE")[0];
  if (!body) throw new HorizonsError(text);
  const states = body.trim().split("\n").map((line) => {
    const fields = line.split(",").map((field) => Number(field.trim()));
    return { jd: fields[0], position: fields.slice(2, 5), velocity: fields.slice(5, 8) };
  });
  // Object data precedes the ephemeris header (which describes the *center* body).
  return { states, header: text.split(/^\s*Ephemeris \/|\$\$SOE/m)[0] };
}

interface MoonFit {
  elements: ReturnType<typeof fitMeanElements>["elements"];
  rmsKm: number;
  pole: [number, number];
  epoch: number;
  halfSpan: number;
  header: string;
}

/** Fetch samples around `epoch` and fit a precessing orbit in the satellite's reference plane. */
async function fitMoon(row: TableRow, mu: number, epoch: number, halfSpan: number): Promise<MoonFit> {
  const planetId = PLANET_NAIF_IDS[row.parent];
  const fetched = await fetchStates(row.naifId, planetId, epoch, sampleOffsets(row.period, halfSpan));

  // Retrograde orbits are fitted in the flipped plane so the (p, q)
  // inclination parameters stay far from their singularity.
  const epochState = fetched.states.find((state) => Math.abs(state.jd - epoch) < 1e-6) ?? fetched.states[0];
  let pole = row.pole;
  let frame = poleFrame(pole);
  const r0 = toFrame(frame, epochState.position);
  const v0 = toFrame(frame, epochState.velocity);
  if (r0[0] * v0[1] - r0[1] * v0[0] < 0) {
    pole = [(pole[0] + 180) % 360, -pole[1]];
    frame = poleFrame(pole);
  }
  const samples: FitSample[] = fetched.states.map((state) => ({
    dt: state.jd - epoch,
    position: toFrame(frame, state.position),
  }));
  const initial = stateToParams(toFrame(frame, epochState.position), toFrame(frame, epochState.velocity), mu);
  initial[1] -= initial[2] * (epochState.jd - epoch);
  const { elements, rmsKm } = fitMeanElements(initial, samples, row.period);
  if (![elements.a, elements.e, elements.meanMotion, rmsKm].every(Number.isFinite)) {
    throw new Error("fit did not converge");
  }
  return { elements, rmsKm, pole, epoch, halfSpan, header: fetched.header };
}

/** Accept a fit whose RMS error is within this fraction of the orbit size. */
const GOOD_FIT = 0.02;
const SPAN_YEARS = [25, 8, 3];

async function main(): Promise<void> {
  const orientation = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/orientation.json"), "utf8")
  ) as { bodies: Record<string, { poleRa?: [number, number]; poleDec?: [number, number]; primeMeridian?: [number, number]; radii?: number[]; gm?: number }> };

  const [elementsHtml, physicalHtml] = await Promise.all([fetchText(ELEMENTS_URL), fetchText(PHYSICAL_URL)]);
  const physical = new Map<number, { gm: number | null; radius: number | null }>();
  for (const row of parseHtmlTables(physicalHtml)[0].slice(2)) {
    physical.set(Number(row[2]), { gm: leadingNumber(row[3]), radius: leadingNumber(row[4]) });
  }

  // One row per satellite: keep the most recent solution when a satellite
  // is listed under several ephemerides (e.g. Puck in URA182 and URA184).
  const rows = new Map<number, TableRow>();
  for (const cells of parseHtmlTables(elementsHtml)[0].slice(1)) {
    const [, parent, rawName, code, , frame, epoch, , , , , , , P, , , ra, dec] = cells;
    const naifId = Number(code);
    const planetId = PLANET_NAIF_IDS[parent];
    if (!planetId) throw new Error(`Unknown parent planet ${parent}`);

    let pole: [number, number];
    if (frame === "ecliptic") {
      pole = ECLIPTIC_POLE;
    } else if (frame === "Laplace") {
      pole = [Number(ra), Number(dec)];
    } else if (frame === "equatorial") {
      // The planet's equator, oriented by its spin: the IAU north pole,
      // flipped for planets rotating retrograde about it (Uranus).
      const planet = orientation.bodies[planetId];
      if (!planet?.poleRa || !planet.poleDec || !planet.primeMeridian) throw new Error(`No pole for ${parent}`);
      const centuries = (EPOCH - 2451545.0) / 36525;
      const poleRa = planet.poleRa[0] + planet.poleRa[1] * centuries;
      const poleDec = planet.poleDec[0] + planet.poleDec[1] * centuries;
      pole = planet.primeMeridian[1] < 0 ? [(poleRa + 180) % 360, -poleDec] : [poleRa, poleDec];
    } else {
      throw new Error(`Unknown frame ${frame} for ${rawName}`);
    }

    const row = { name: displayName(rawName), naifId, parent, pole, period: Number(P), epoch: epochToJulian(epoch) };
    const existing = rows.get(naifId);
    if (!existing || row.epoch > existing.epoch) rows.set(naifId, row);
  }

  // ONLY=Moon,Io,Titan limits the run to a few satellites (for testing; nothing is written).
  const only = process.env.ONLY?.split(",");
  const moons: MoonRecord[] = [];
  const failures: string[] = [];
  let index = 0;
  for (const row of rows.values()) {
    if (only && !only.includes(row.name)) continue;
    index++;
    const planetId = PLANET_NAIF_IDS[row.parent];
    const pck = orientation.bodies[row.naifId];
    const jplPhysical = physical.get(row.naifId);
    const moonGm = jplPhysical?.gm ?? pck?.gm ?? null;
    const mu = ((orientation.bodies[planetId]?.gm ?? 0) + (moonGm ?? 0)) * 86_400 ** 2;

    // Prefer the longest span that fits well; strongly perturbed irregular
    // satellites get a shorter span that stays accurate near the present.
    // Ephemerides that do not cover the default epoch move the epoch inside
    // their coverage.
    const fits: MoonFit[] = [];
    for (const years of SPAN_YEARS) {
      const halfSpan = years * 365.25;
      let epoch = EPOCH;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fits.push(await fitMoon(row, mu, epoch, halfSpan));
          break;
        } catch (error) {
          const limit = error instanceof HorizonsError ? horizonsCoverageLimit(error.text) : null;
          if (!limit) break;
          epoch = limit.side === "after" ? Math.floor(limit.jd - halfSpan) - 1.5 : Math.ceil(limit.jd + halfSpan) + 1.5;
        } finally {
          await sleep(250);
        }
      }
      const latest = fits[fits.length - 1];
      if (latest && latest.halfSpan === halfSpan && latest.rmsKm / latest.elements.a <= GOOD_FIT) break;
    }
    if (fits.length === 0) {
      failures.push(row.name);
      continue;
    }
    const chosen = fits.find((fit) => fit.rmsKm / fit.elements.a <= GOOD_FIT)
      ?? fits.reduce((best, fit) => (fit.rmsKm / fit.elements.a < best.rmsKm / best.elements.a ? fit : best));
    const { elements, rmsKm, pole, epoch, halfSpan } = chosen;

    let radius: number | null = jplPhysical?.radius ?? null;
    let radiusSource: string | null = radius !== null ? "JPL sats/phys_par" : null;
    if (radius === null && pck?.radii) {
      radius = Math.cbrt(pck.radii[0] * pck.radii[1] * pck.radii[2]);
      radiusSource = "NAIF pck00011";
    }
    if (radius === null) {
      radius = parseHorizonsRadius(chosen.header);
      if (radius !== null) radiusSource = "JPL Horizons";
    }

    const wrapDeg = (radians: number) => ((radians / DEG) % 360 + 360) % 360;
    moons.push({
      name: row.name,
      naifId: row.naifId,
      parent: row.parent,
      referencePole: [sig(pole[0], 9), sig(pole[1], 9)],
      epoch,
      a: sig(elements.a, 10),
      e: sig(elements.e, 8),
      i: sig(elements.i / DEG, 8),
      node: sig(wrapDeg(elements.node), 10),
      argPeri: sig(wrapDeg(elements.argPeri), 10),
      meanAnomaly: sig(wrapDeg(elements.meanAnomaly), 10),
      meanMotion: sig(elements.meanMotion / DEG, 12),
      nodeRate: sig(elements.nodeRate / DEG, 8),
      argPeriRate: sig(elements.argPeriRate / DEG, 8),
      fitRmsKm: sig(rmsKm, 4),
      fitSpanDays: halfSpan * 2,
      radius,
      gm: moonGm,
      radiusSource,
    });
    const relative = rmsKm / elements.a;
    console.log(`[${index}/${rows.size}] ${row.name.padEnd(16)} ±${halfSpan / 365.25}y rms ${rmsKm.toFixed(0).padStart(7)} km (${(relative * 100).toFixed(2)}% of a)`);
  }

  if (only) {
    console.log(JSON.stringify(moons, null, 1));
    return;
  }
  writeJson("src/data/moons.json", {
    source: [ELEMENTS_URL, PHYSICAL_URL, HORIZONS_URL],
    generatedAt: new Date().toISOString(),
    method: "Precessing Keplerian orbits least-squares fitted to Horizons state vectors (±25, ±8 or ±3 years about the epoch; see fitSpanDays), in each satellite's reference plane.",
    moons,
  });
  console.log(`${moons.length} satellites fitted; ${moons.filter((moon) => moon.radius !== null).length} with a published radius`);
  if (failures.length) console.warn(`No ephemeris fit for: ${failures.join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
