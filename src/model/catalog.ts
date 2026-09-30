/**
 * Builds the body hierarchy from the generated data files in src/data.
 * See scripts/README.md for how each file is produced.
 */

import { AU_KM, DAYS_PER_CENTURY, DEG, GM_SUN, J2000 } from "../astro/constants";
import { type KeplerElements, KeplerOrbit, elementsFromPeriapsis } from "../astro/kepler";
import { poleFrameToEcliptic } from "../astro/rotation";
import {
  COMET_COLOR,
  ASTEROID_COLOR,
  BLACK_HOLE_COLOR,
  DEFAULT_DWARF_COLOR,
  DEFAULT_MOON_COLOR,
  DWARF_COLORS,
  MOON_COLORS,
  PLANET_COLORS,
  SPACECRAFT_STATUS_COLORS,
  SUN_COLOR,
} from "../data/palette";
import planetData from "../data/planets.json";
import moonData from "../data/moons.json";
import moonDiscovery from "../data/moonDiscovery.json";
import smallBodyData from "../data/smallBodies.json";
import spacecraftData from "../data/spacecraft.json";
import missionData from "../data/missions.json";
import orientationData from "../data/orientation.json";
import galaxyData from "../data/galaxy.json";
import type { OrientationModel } from "../astro/orientation";
import { type Body, type BodyKind, type Discovery, type MissionInfo, type MoonCategory, type Motion, type MotionSegment, orbitAt, segmentAt, spliceSegment } from "./body";


type OrientationRecord = Partial<Omit<OrientationModel, "angles">> & {
  system?: number;
  radii?: number[];
  gm?: number;
};
const orientation = orientationData.bodies as Record<string, OrientationRecord>;
const orientationSystems = orientationData.systems as Record<string, number[][]>;

function orientationFor(naifId: number): OrientationModel | undefined {
  const record = orientation[naifId];
  if (!record?.poleRa || !record.poleDec || !record.primeMeridian) return undefined;
  return {
    poleRa: record.poleRa,
    poleDec: record.poleDec,
    primeMeridian: record.primeMeridian,
    nutPrecRa: record.nutPrecRa,
    nutPrecDec: record.nutPrecDec,
    nutPrecPm: record.nutPrecPm,
    angles: record.system === undefined ? undefined : orientationSystems[record.system],
  };
}

/** SBDB SPK-IDs (20000433) → NAIF IDs (2000433) for numbered asteroids. */
function naifIdForSmallBody(spkid: number): number {
  return spkid >= 20_000_000 && spkid < 30_000_000 ? spkid - 18_000_000 : spkid;
}

const PLANET_NAIF_IDS: Record<string, number> = {
  Mercury: 199, Venus: 299, Earth: 399, Mars: 499, Jupiter: 599, Saturn: 699, Uranus: 799, Neptune: 899,
};

/** Planets whose discovery is recorded (the rest are known since antiquity). */
const PLANET_DISCOVERY: Record<string, Discovery> = {
  Uranus: { by: "William Herschel", year: 1781, date: "March 13, 1781" },
  Neptune: { by: "Johann Galle", year: 1846, date: "September 23, 1846" },
};

// NASA Saturnian Rings Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html)
const SATURN_RINGS = [
  { name: "D", innerRadius: 66_900, outerRadius: 74_510, color: "#f0e0c0", opacity: 0.045 },
  { name: "C", innerRadius: 74_658, outerRadius: 92_000, color: "#e8d4b0", opacity: 0.135 },
  { name: "B", innerRadius: 92_000, outerRadius: 117_580, color: "#f5e8d0", opacity: 0.4125 },
  { name: "Cassini Division", innerRadius: 117_580, outerRadius: 122_170, color: "#d0c0a0", opacity: 0.03 },
  { name: "A", innerRadius: 122_170, outerRadius: 136_775, color: "#eedcb8", opacity: 0.3 },
  { name: "Encke Gap", innerRadius: 133_589, outerRadius: 133_740, color: "#000000", opacity: 0 },
  { name: "F", innerRadius: 139_826, outerRadius: 140_612, color: "#f0dcc0", opacity: 0.1875 },
];

const SPEED_OF_LIGHT_KM_S = 299_792.458;
/** Stellar velocity dispersion around Sgr A* (km/s), for its sphere of influence. */
const NUCLEAR_CLUSTER_DISPERSION_KM_S = 100;

const LABEL_PRIORITY: Record<BodyKind, number> = {
  star: 0,
  blackHole: 1,
  planet: 1,
  dwarf: 2,
  barycenter: 99,
  spacecraft: 4,
  comet: 4,
  moon: 5,
  asteroid: 6,
};

interface Landing {
  body: string;
  time: number;
  /** Body-fixed position (km). */
  position: [number, number, number];
  latitude: number;
  longitude: number;
}

interface MissionIndexEntry {
  name: string;
  spkid: number;
  type: string;
  icon: string;
  status: string;
  fate?: string;
  start: number;
  end: number | null;
  escapes?: boolean;
  landing: Landing | null;
  file: string;
}

export interface MissionFile {
  segments: Array<{
    start: number;
    end: number;
    parent: string;
    motion: "keplerSeries" | "hermite";
    epochs: number[];
    rows: number[][];
  }>;
  landing: Landing | null;
}

export interface EphemerisSeries {
  start: number;
  step: number;
  /** [q (km), e, i, node, argPeri, M (deg), n (deg/day)] per epoch. */
  rows: number[][];
}

export interface EphemerisFile {
  planets: Record<string, EphemerisSeries>;
  smallBodies: Record<string, EphemerisSeries>;
}

/** Heliocentric osculating-element series → blended Kepler series. */
function seriesMotion(series: EphemerisSeries): Motion {
  const epochs = Float64Array.from(series.rows, (_, index) => series.start + index * series.step);
  const orbits = series.rows.map(([q, e, i, node, argPeri, M, n], index) => new KeplerOrbit(elementsFromPeriapsis({
    q,
    e,
    tp: epochs[index] - M / n,
    meanMotion: n * DEG,
    i: i * DEG,
    node: node * DEG,
    argPeri: argPeri * DEG,
  })));
  return { kind: "keplerSeries", blend: "position", epochs, orbits };
}

function formatFitError(km: number): string {
  return km < 1000 ? `${Math.round(km)} km` : `${Math.round(km / 1000).toLocaleString()}k km`;
}

type PlanetTableEntry = (typeof planetData.tables)[number]["planets"][number];

/** JPL approximate-positions table entry → secular Kepler elements. */
function planetElements(planet: PlanetTableEntry, span: [number, number]): KeplerElements {
  const perDay = 1 / DAYS_PER_CENTURY;
  const [a, e, I, L, longPeri, longNode] = planet.elements;
  const [aDot, eDot, IDot, LDot, longPeriDot, longNodeDot] = planet.rates;
  const extra = "extraTerms" in planet ? planet.extraTerms : undefined;
  return {
    epoch: J2000,
    a: a * AU_KM,
    e,
    i: I * DEG,
    node: longNode * DEG,
    argPeri: (longPeri - longNode) * DEG,
    meanAnomaly: (L - longPeri) * DEG,
    meanMotion: (LDot - longPeriDot) * DEG * perDay,
    rates: {
      a: aDot * AU_KM * perDay,
      e: eDot * perDay,
      i: IDot * DEG * perDay,
      node: longNodeDot * DEG * perDay,
      argPeri: (longPeriDot - longNodeDot) * DEG * perDay,
      span,
    },
    meanAnomalyTerms: extra ? { b: extra.b * DEG, c: extra.c * DEG, s: extra.s * DEG, f: extra.f * DEG } : undefined,
  };
}

export class Catalog {
  readonly bodies: Body[] = [];
  private readonly byName = new Map<string, Body>();
  readonly sun: Body;
  /** Julian dates the planet model is valid for (JPL Table 2: 3000 BC – 3000 AD). */
  readonly validSpan: [number, number] = [planetData.tables[1].validFrom, planetData.tables[1].validTo];

  constructor() {
    this.sun = this.add({
      name: "Sun",
      kind: "star",
      radius: orientation[10]?.radii?.[0] ?? 695_700,
      color: SUN_COLOR,
      gm: GM_SUN,
      motion: { kind: "fixed" },
      parent: null,
      orientation: orientationFor(10),
      dataSource: "Fixed at the origin (heliocentric frame)",
    });
    this.addGalacticCenter();
    this.addPlanets();
    // Small bodies before moons: Pluto's moons need Pluto.
    this.addSmallBodies();
    this.addMoons();
    this.addSpacecraft();
    this.linkHierarchy();
  }

  /**
   * Sagittarius A*, the Galaxy's central black hole: drawn at the size of its
   * event horizon (Schwarzschild radius), moving relative to the Sun as the
   * Sun orbits it.
   */
  private addGalacticCenter(): void {
    const gm = GM_SUN * galaxyData.sagittariusAStarMass;
    this.add({
      name: "Sagittarius A*",
      designation: "Sgr A*",
      kind: "blackHole",
      radius: (2 * gm) / SPEED_OF_LIGHT_KM_S ** 2,
      color: BLACK_HOLE_COLOR,
      gm,
      motion: { kind: "galacticCenter", model: galaxyData },
      parent: this.sun,
      orbitVisibility: "never",
      dataSource: "Mass: GRAVITY Collaboration 2022; place and motion: Reid et al. 2019",
    });
  }

  get(name: string): Body | undefined {
    return this.byName.get(name);
  }

  /** Case-insensitive lookup by name or designation. */
  find(query: string): Body | undefined {
    const needle = query.trim().toLowerCase();
    return this.byName.get(query)
      ?? this.bodies.find((body) => body.name.toLowerCase() === needle || body.designation?.toLowerCase() === needle);
  }

  private require(name: string): Body {
    const body = this.byName.get(name);
    if (!body) throw new Error(`Unknown body "${name}"`);
    return body;
  }

  private add(spec: {
    name: string;
    kind: BodyKind;
    radius: number | null;
    color: string;
    gm?: number | null;
    /** A single, unbounded motion about `parent`... */
    motion?: Motion;
    parent?: Body | null;
    /** ...or an explicit timeline. */
    segments?: MotionSegment[];
    existsFrom?: number;
    existsUntil?: number;
    orbitVisibility?: Body["orbitVisibility"];
  } & Partial<Pick<Body, "orientation" | "rings" | "moonCategory" | "mission" | "discovery" | "designation" | "naifId" | "dataSource" | "orbitSource">>): Body {
    if (this.byName.has(spec.name)) throw new Error(`Duplicate body "${spec.name}"`);
    const body: Body = {
      index: this.bodies.length,
      name: spec.name,
      kind: spec.kind,
      radius: spec.radius,
      color: spec.color,
      gm: spec.gm ?? null,
      segments: spec.segments ?? [{
        start: Number.NEGATIVE_INFINITY,
        end: Number.POSITIVE_INFINITY,
        parent: spec.parent ?? null,
        motion: spec.motion ?? { kind: "fixed" },
      }],
      existsFrom: spec.existsFrom ?? Number.NEGATIVE_INFINITY,
      existsUntil: spec.existsUntil ?? Number.POSITIVE_INFINITY,
      children: [],
      depth: 0,
      frameRadius: 0,
      orbitVisibility: spec.orbitVisibility ?? (spec.kind === "star" || spec.kind === "barycenter" ? "never" : "always"),
      labelPriority: LABEL_PRIORITY[spec.kind],
      orientation: spec.orientation,
      rings: spec.rings,
      moonCategory: spec.moonCategory,
      mission: spec.mission,
      discovery: spec.discovery,
      designation: spec.designation,
      naifId: spec.naifId,
      dataSource: spec.dataSource ?? "",
      orbitSource: spec.orbitSource,
    };
    // Draw irregular bodies with their triaxial shape (PCK radii), when the
    // axes differ by more than a few percent and the orientation is known.
    const radii = spec.naifId === undefined ? undefined : orientation[spec.naifId]?.radii;
    if (radii && body.orientation && Math.max(...radii) > 1.05 * Math.min(...radii)) {
      body.radii = [radii[0], radii[1], radii[2]];
    }
    this.bodies.push(body);
    this.byName.set(body.name, body);
    return body;
  }

  /**
   * JPL approximate planet elements. Table 1 is used where it is valid
   * (1800–2050, several times more accurate); Table 2 before and after.
   */
  private addPlanets(): void {
    const [modern, longSpan] = planetData.tables;
    for (const planet of longSpan.planets) {
      const modernPlanet = modern.planets.find((candidate) => candidate.name === planet.name)!;
      const longSpanOrbit = new KeplerOrbit(planetElements(planet, [longSpan.validFrom, longSpan.validTo]));
      const segments = (parent: Body): MotionSegment[] => [
        { start: Number.NEGATIVE_INFINITY, end: modern.validFrom, parent, motion: { kind: "kepler", orbit: longSpanOrbit } },
        { start: modern.validFrom, end: modern.validTo, parent, motion: { kind: "kepler", orbit: new KeplerOrbit(planetElements(modernPlanet, [modern.validFrom, modern.validTo])) } },
        { start: modern.validTo, end: Number.POSITIVE_INFINITY, parent, motion: { kind: "kepler", orbit: longSpanOrbit } },
      ];
      const source = `JPL approximate planetary elements (${modern.name}; ${longSpan.name} outside it)`;

      if (planet.name === "Earth-Moon Barycenter") {
        const barycenter = this.add({
          name: planet.name,
          kind: "barycenter",
          radius: null,
          color: PLANET_COLORS.Earth,
          gm: orientation[3]?.gm ?? null,
          segments: segments(this.sun),
          dataSource: source,
          naifId: 3,
        });
        // Earth's reflex motion about the barycenter is set once the Moon exists.
        this.add({
          name: "Earth",
          kind: "planet",
          radius: planet.meanRadiusKm ?? null,
          color: PLANET_COLORS.Earth,
          gm: orientation[399]?.gm ?? null,
          motion: { kind: "fixed" },
          parent: barycenter,
          orbitSource: barycenter,
          orientation: orientationFor(399),
          discovery: {},
          naifId: 399,
          dataSource: source,
        });
        continue;
      }

      const naifId = PLANET_NAIF_IDS[planet.name];
      this.add({
        name: planet.name,
        kind: "planet",
        radius: planet.meanRadiusKm ?? null,
        color: PLANET_COLORS[planet.name],
        gm: orientation[naifId]?.gm ?? null,
        segments: segments(this.sun),
        orientation: orientationFor(naifId),
        rings: planet.name === "Saturn" ? SATURN_RINGS : undefined,
        discovery: PLANET_DISCOVERY[planet.name] ?? {},
        naifId,
        dataSource: source,
      });
    }
  }

  /** Satellites: precessing orbits fitted to the JPL ephemerides (scripts/fetch-moons.ts). */
  private addMoons(): void {
    const discoveries = moonDiscovery as Record<string, Discovery>;
    for (const moon of moonData.moons) {
      const orbit = new KeplerOrbit({
        epoch: moon.epoch,
        a: moon.a,
        e: moon.e,
        i: moon.i * DEG,
        node: moon.node * DEG,
        argPeri: moon.argPeri * DEG,
        meanAnomaly: moon.meanAnomaly * DEG,
        meanMotion: moon.meanMotion * DEG,
        rates: { node: moon.nodeRate * DEG, argPeri: moon.argPeriRate * DEG },
        frame: poleFrameToEcliptic(moon.referencePole[0], moon.referencePole[1]),
      });

      const category: MoonCategory = moon.radius !== null && moon.radius > 100 ? "major"
        : moon.radius !== null && moon.radius > 10 ? "medium"
        : moon.name.startsWith("S/") ? "minor"
        : "named";

      this.add({
        name: moon.name,
        kind: "moon",
        radius: moon.radius,
        color: MOON_COLORS[moon.name] ?? DEFAULT_MOON_COLOR,
        gm: moon.gm || null,
        motion: { kind: "kepler", orbit },
        parent: this.require(moon.parent),
        moonCategory: category,
        // Small moons are dots; their orbits would only clutter the planet.
        orbitVisibility: category === "major" || category === "medium" ? "always" : "focus",
        orientation: orientationFor(moon.naifId),
        discovery: discoveries[moon.name],
        naifId: moon.naifId,
        dataSource: `Orbit fitted to JPL Horizons (±${Math.round(moon.fitSpanDays / 730.5)} yr, rms ${formatFitError(moon.fitRmsKm)})`,
      });
    }

    // Earth and Pluto move about their barycenters, opposite their big moons.
    this.setReflexMotion("Earth", "Moon");
    this.setReflexMotion("Pluto", "Charon");
  }

  /** Dwarf planets, comets and asteroids: osculating element series from JPL Horizons. */
  private addSmallBodies(): void {
    for (const entry of smallBodyData.bodies) {
      const motion: Motion = {
        kind: "keplerSeries",
        blend: "position",
        epochs: Float64Array.from(entry.elements, (element) => element.epoch),
        orbits: entry.elements.map((element) => new KeplerOrbit(elementsFromPeriapsis({
          q: element.q,
          e: element.e,
          tp: element.tp,
          meanMotion: element.n * DEG,
          i: element.i * DEG,
          node: element.node * DEG,
          argPeri: element.argPeri * DEG,
        }))),
      };
      const kind = entry.kind as "dwarf" | "comet" | "asteroid";
      const color = kind === "dwarf" ? DWARF_COLORS[entry.name] ?? DEFAULT_DWARF_COLOR
        : kind === "comet" ? COMET_COLOR
        : ASTEROID_COLOR;
      const naifId = entry.name === "Pluto" ? 999 : naifIdForSmallBody(entry.spkid);
      const dataSource = `JPL Horizons osculating elements, 1900–2100 (${entry.orbitSolution})`;

      // Pluto and Charon orbit their common barycenter, which lies outside
      // Pluto; the series describes the barycenter. Pluto's reflex motion is
      // set once Charon exists (see addMoons).
      let parent = this.sun;
      let orbitSource: Body | undefined;
      if (entry.name === "Pluto") {
        parent = this.add({
          name: "Pluto Barycenter",
          kind: "barycenter",
          radius: null,
          color,
          gm: orientation[9]?.gm ?? null,
          motion,
          parent: this.sun,
          naifId: 9,
          dataSource,
        });
        orbitSource = parent;
      }

      this.add({
        name: entry.name,
        kind,
        radius: entry.radius,
        color,
        gm: orientation[naifId]?.gm ?? null,
        motion: orbitSource ? { kind: "fixed" } : motion,
        parent,
        orbitSource,
        orbitVisibility: kind === "asteroid" ? "focus" : "always",
        orientation: orientationFor(naifId),
        discovery: entry.discovery,
        designation: entry.designation,
        naifId,
        dataSource,
      });
    }
  }

  /** Put a body opposite its partner about their barycenter (its current parent). */
  private setReflexMotion(name: string, partnerName: string): void {
    const body = this.require(name);
    const partner = this.require(partnerName);
    const massRatio = (partner.gm ?? 0) / ((body.gm ?? 0) + (partner.gm ?? 0));
    body.segments = body.segments.map((segment) => ({
      ...segment,
      motion: { kind: "barycentric", partner, massRatio },
    }));
  }

  /**
   * Replace element-table and coarse motions with the high-resolution
   * ephemerides (public/data/ephemerides.json) within their span.
   */
  applyEphemerides(file: EphemerisFile): void {
    for (const [name, series] of Object.entries(file.planets)) this.applySeries(name, series);
    for (const [name, series] of Object.entries(file.smallBodies)) this.applySeries(name, series);
  }

  /**
   * Use an osculating-element series for a body within the series' span,
   * relative to the body's existing parent there; the existing model stays
   * in effect before and after.
   */
  applySeries(name: string, series: EphemerisSeries): void {
    const body = this.get(name === "Pluto" ? "Pluto Barycenter" : name);
    if (!body || series.rows.length < 2) return;
    const start = series.start;
    const end = series.start + series.step * (series.rows.length - 1);
    body.segments = spliceSegment(body.segments, { start, end, parent: segmentAt(body, start).parent, motion: seriesMotion(series) });
  }

  /**
   * Spacecraft. Each mission's full trajectory (public/data/missions) is
   * loaded at runtime and installed with `applyMission`; until then a single
   * osculating conic stands in, and landers already sit at their sites.
   */
  private addSpacecraft(): void {
    const conics = new Map(spacecraftData.spacecraft.map((craft) => [craft.name, craft]));
    const missions = new Map((missionData.missions as unknown as MissionIndexEntry[]).map((mission) => [mission.name, mission]));
    for (const name of new Set([...missions.keys(), ...conics.keys()])) {
      const mission = missions.get(name);
      const conic = conics.get(name);
      const segments: MotionSegment[] = [];
      if (conic) {
        const el = conic.elements;
        const orbit = new KeplerOrbit(elementsFromPeriapsis({
          q: el.q,
          e: el.e,
          tp: el.tp,
          meanMotion: el.n * DEG,
          i: el.i * DEG,
          node: el.node * DEG,
          argPeri: el.argPeri * DEG,
        }));
        segments.push({ start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY, parent: this.require(conic.center), motion: { kind: "kepler", orbit } });
      }
      if (mission?.landing) {
        const surface = this.surfaceSegment(mission.landing);
        if (segments.length) segments[0].end = surface.start;
        segments.push(surface);
      }
      if (segments.length === 0) continue;

      const status = (mission?.status ?? conic!.status) as "active" | "ended";
      const launch = mission?.start ?? conic!.launchJD;
      const end = mission ? mission.end ?? undefined : conic!.endJD ?? undefined;
      this.add({
        name,
        kind: "spacecraft",
        radius: null,
        color: SPACECRAFT_STATUS_COLORS[status],
        segments,
        // A lander known only by its site appears once it has landed; the
        // full trajectory extends this back to launch.
        existsFrom: conic ? launch : mission!.landing!.time,
        existsUntil: mission?.escapes ? Number.POSITIVE_INFINITY : end ?? Number.POSITIVE_INFINITY,
        mission: {
          spkid: mission?.spkid ?? conic!.spkid,
          type: (mission?.type ?? conic!.missionType) as MissionInfo["type"],
          status,
          launch,
          end,
          icon: (mission?.icon ?? conic!.iconType) as MissionInfo["icon"],
          elementsEpoch: mission ? undefined : conic!.elements.epoch,
          fate: mission?.fate,
          landing: mission?.landing ?? undefined,
          trajectoryFile: mission?.file,
          escapes: mission?.escapes,
        },
        naifId: mission?.spkid ?? conic!.spkid,
        dataSource: mission ? "JPL Horizons trajectory" : "JPL Horizons osculating elements",
      });
    }
  }

  private surfaceSegment(landing: Landing): MotionSegment {
    const body = this.require(landing.body);
    if (!body.orientation) throw new Error(`No orientation model for ${body.name}`);
    return {
      start: landing.time,
      end: Number.POSITIVE_INFINITY,
      parent: body,
      motion: { kind: "surface", position: landing.position, orientation: body.orientation },
    };
  }

  /** Install a mission's full trajectory (public/data/missions/<name>.json). */
  applyMission(body: Body, file: MissionFile): void {
    const segments: MotionSegment[] = [];
    for (const segment of file.segments) {
      const parent = this.require(segment.parent);
      const epochs = Float64Array.from(segment.epochs);
      let motion: Motion;
      if (segment.motion === "hermite") {
        motion = { kind: "hermite", epochs, states: Float64Array.from(segment.rows.flat()) };
      } else {
        const orbits = segment.rows.map(([q, e, i, node, argPeri, M, n], index) => new KeplerOrbit(elementsFromPeriapsis({
          q,
          e,
          tp: epochs[index] - M / n,
          meanMotion: n * DEG,
          i: i * DEG,
          node: node * DEG,
          argPeri: argPeri * DEG,
        })));
        motion = { kind: "keplerSeries", blend: "elements", epochs, orbits };
      }
      segments.push({ start: segment.start, end: segment.end, parent, motion });
    }
    if (file.landing) segments.push(this.surfaceSegment(file.landing));
    if (segments.length === 0) return;
    const last = segments[segments.length - 1];
    if (body.mission?.escapes && last.motion.kind === "keplerSeries") {
      // Coast on the last osculating hyperbola beyond the end of the data.
      const orbits = last.motion.orbits;
      segments.push({ start: last.end, end: Number.POSITIVE_INFINITY, parent: last.parent, motion: { kind: "kepler", orbit: orbits[orbits.length - 1] } });
    }
    body.segments = segments;
    body.existsFrom = segments[0].start;
    for (const segment of segments) {
      if (segment.parent && !segment.parent.children.includes(body)) segment.parent.children.push(body);
    }
  }

  /** Children lists, hierarchy depth, and each body's dominated region. */
  private linkHierarchy(): void {
    for (const body of this.bodies) {
      for (const segment of body.segments) {
        if (segment.parent && !segment.parent.children.includes(body)) segment.parent.children.push(body);
      }
    }

    const principalParent = (body: Body) => body.segments[body.segments.length - 1].parent;
    for (const body of this.bodies) {
      let depth = 0;
      for (let parent = principalParent(body); parent; parent = principalParent(parent)) depth++;
      body.depth = depth;
    }

    for (const body of this.bodies) {
      if (body.kind === "star") {
        body.frameRadius = Number.POSITIVE_INFINITY;
        continue;
      }
      if (body.kind === "blackHole") {
        // Sphere of influence: where its gravity outweighs the surrounding
        // stars', GM/σ² with the nuclear star cluster's velocity dispersion.
        body.frameRadius = body.gm! / NUCLEAR_CLUSTER_DISPERSION_KM_S ** 2;
        continue;
      }
      if (body.kind === "barycenter" || body.kind === "spacecraft") continue;

      // Hill sphere about the primary, using the barycenter's orbit where one exists.
      let hill = 0;
      const orbitHolder = body.orbitSource ?? body;
      const orbit = orbitAt(segmentAt(orbitHolder, J2000).motion, J2000);
      const primary = principalParent(orbitHolder);
      if (orbit?.isClosed && body.gm && primary?.gm) {
        hill = orbit.periapsis * Math.cbrt(body.gm / (3 * primary.gm));
      }

      let satelliteExtent = 0;
      for (const child of body.children) {
        const childOrbit = orbitAt(segmentAt(child, J2000).motion, J2000);
        if (child.kind === "moon" && childOrbit?.isClosed) {
          satelliteExtent = Math.max(satelliteExtent, childOrbit.apoapsis);
        }
      }

      body.frameRadius = Math.max(hill, (body.radius ?? 0) * 10, satelliteExtent * 1.25);
    }
  }
}
