/**
 * Active Earth satellites from CelesTrak, and the orbital shells of the
 * large constellations (Starlink, OneWeb, GPS, ...), which read better as
 * population bands than as thousands of overlapping dots.
 *
 * Propagation is Keplerian plus the secular J2 drift of the node and the
 * argument of perigee — the dominant effect over the weeks between catalog
 * refreshes (the ISS node regresses about 5° per day). Elements are in the
 * Earth-equatorial frame and are rotated into the ecliptic.
 *
 * Data: public/data/satellites.json (scripts/fetch-satellites.ts).
 */

import {
  EARTH_EQUATORIAL_RADIUS_KM,
  EARTH_J2,
  DEG,
  OBLIQUITY_J2000,
  TWO_PI,
  utcJulianToTdb,
} from "../astro/constants";
import { SATELLITE_CATEGORY_COLORS } from "../data/palette";

export type SatelliteCategory = keyof typeof SATELLITE_CATEGORY_COLORS;
const CATEGORIES = Object.keys(SATELLITE_CATEGORY_COLORS) as SatelliteCategory[];

interface SatelliteRecord {
  noradId: number;
  name: string;
  a: number;
  e: number;
  i: number;
  Omega: number;
  omega: number;
  M0: number;
  n: number;     // deg/day
  epoch: number; // JD (UTC)
  category: SatelliteCategory;
}

export interface ConstellationBand {
  innerRadiusKm: number;
  outerRadiusKm: number;
  meanRadiusKm: number;
  count: number;
}

export interface SatelliteConstellation {
  name: string;
  group: string;
  color: string;
  count: number;
  bands: ConstellationBand[];
}

interface SatelliteFile {
  generatedAt: string;
  satellites: SatelliteRecord[];
  constellations: SatelliteConstellation[];
}

const COS_OBLIQUITY = Math.cos(OBLIQUITY_J2000);
const SIN_OBLIQUITY = Math.sin(OBLIQUITY_J2000);

export class SatellitePopulation {
  readonly count: number;
  readonly names: string[];
  readonly noradIds: Uint32Array;
  readonly categoryIndex: Uint8Array;
  readonly categories = CATEGORIES;
  readonly constellations: readonly SatelliteConstellation[];
  readonly generatedAt: string;

  /** Earth-relative x/y/z (km, ecliptic), each as of `computedAt`. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  private readonly computedAt: Float64Array;
  /** Perigee (maximum) speed of each satellite, km/day. */
  private readonly speed: Float64Array;

  readonly semiMajorAxis: Float64Array;
  readonly eccentricity: Float64Array;
  readonly inclination: Float64Array;
  private readonly semiMinorAxis: Float64Array;
  private readonly cosI: Float64Array;
  private readonly sinI: Float64Array;
  private readonly node0: Float64Array;
  private readonly nodeRate: Float64Array;
  private readonly argPeri0: Float64Array;
  private readonly argPeriRate: Float64Array;
  private readonly meanAnomaly0: Float64Array;
  private readonly meanMotion: Float64Array;
  private readonly epoch: Float64Array;
  /**
   * Cached orbit orientation per satellite: the in-plane basis P, Q
   * (ecliptic x, y, z each) and when it was computed. J2 turns it slowly, so
   * it is refreshed only when the drift could show on screen.
   */
  private readonly basis: Float64Array;
  private readonly basisTime: Float64Array;
  private readonly orientationRate: Float64Array;

  constructor(file: SatelliteFile) {
    const records = file.satellites;
    const count = records.length;
    this.count = count;
    this.generatedAt = file.generatedAt;
    this.constellations = file.constellations;
    this.names = records.map((record) => record.name);
    this.noradIds = new Uint32Array(count);
    this.categoryIndex = new Uint8Array(count);
    this.x = new Float64Array(count);
    this.y = new Float64Array(count);
    this.z = new Float64Array(count);
    this.computedAt = new Float64Array(count).fill(Number.NaN);
    this.speed = new Float64Array(count);
    this.semiMajorAxis = new Float64Array(count);
    this.eccentricity = new Float64Array(count);
    this.inclination = new Float64Array(count);
    this.semiMinorAxis = new Float64Array(count);
    this.cosI = new Float64Array(count);
    this.sinI = new Float64Array(count);
    this.node0 = new Float64Array(count);
    this.nodeRate = new Float64Array(count);
    this.argPeri0 = new Float64Array(count);
    this.argPeriRate = new Float64Array(count);
    this.meanAnomaly0 = new Float64Array(count);
    this.meanMotion = new Float64Array(count);
    this.epoch = new Float64Array(count);
    this.basis = new Float64Array(count * 6);
    this.basisTime = new Float64Array(count).fill(Number.NaN);
    this.orientationRate = new Float64Array(count);

    records.forEach((record, index) => {
      const { a, e } = record;
      const i = record.i * DEG;
      const n = record.n * DEG;
      const p = a * (1 - e * e);
      const j2Factor = 1.5 * EARTH_J2 * (EARTH_EQUATORIAL_RADIUS_KM / p) ** 2 * n;
      const sinI = Math.sin(i);
      this.noradIds[index] = record.noradId;
      this.categoryIndex[index] = Math.max(0, CATEGORIES.indexOf(record.category));
      this.semiMajorAxis[index] = a;
      this.eccentricity[index] = e;
      this.inclination[index] = i;
      this.semiMinorAxis[index] = a * Math.sqrt(1 - e * e);
      this.cosI[index] = Math.cos(i);
      this.sinI[index] = sinI;
      this.node0[index] = record.Omega * DEG;
      this.nodeRate[index] = -j2Factor * Math.cos(i);
      this.argPeri0[index] = record.omega * DEG;
      this.argPeriRate[index] = j2Factor * (2 - 2.5 * sinI * sinI);
      this.meanAnomaly0[index] = record.M0 * DEG;
      this.meanMotion[index] = n;
      this.epoch[index] = utcJulianToTdb(record.epoch);
      this.orientationRate[index] = Math.abs(this.nodeRate[index]) + Math.abs(this.argPeriRate[index]);
      this.speed[index] = n * a * Math.sqrt((1 + e) / (1 - e));
    });
  }

  static async load(): Promise<SatellitePopulation> {
    const response = await fetch("/data/satellites.json");
    if (!response.ok) throw new Error(`satellites.json: HTTP ${response.status}`);
    return new SatellitePopulation(await response.json() as SatelliteFile);
  }

  colorOf(index: number): string {
    return SATELLITE_CATEGORY_COLORS[this.categories[this.categoryIndex[index]]];
  }

  categoryOf(index: number): SatelliteCategory {
    return this.categories[this.categoryIndex[index]];
  }

  /** Refresh each Earth-relative position once it could have moved tolerancePx on screen. */
  update(t: number, zoom: number, tolerancePx = 0.5): void {
    const toleranceKm = tolerancePx / zoom;
    const { basisTime, orientationRate, semiMajorAxis, computedAt, speed } = this;
    for (let index = 0; index < this.count; index++) {
      if (Math.abs(t - computedAt[index]) * speed[index] < toleranceKm) continue;
      if (!(Math.abs(t - basisTime[index]) * orientationRate[index] * semiMajorAxis[index] < 0.4 * toleranceKm)) {
        this.orient(index, t);
      }
      this.propagate(index, t, this.x, this.y, this.z, index);
      computedAt[index] = t;
    }
  }

  /** Earth-relative x/y/z (km, ecliptic) of one satellite at time t. */
  positionAt(index: number, t: number, out: Float64Array | number[]): void {
    const x = [0];
    const y = [0];
    const z = [0];
    this.orient(index, t);
    this.propagate(index, t, x, y, z, 0);
    out[0] = x[0];
    out[1] = y[0];
    out[2] = z[0];
  }

  /** Orbit plane orientation at time t (node and perigee advanced by J2), in the ecliptic. */
  private orient(index: number, t: number): void {
    const dt = t - this.epoch[index];
    const node = this.node0[index] + this.nodeRate[index] * dt;
    const argPeri = this.argPeri0[index] + this.argPeriRate[index] * dt;
    const cosO = Math.cos(node);
    const sinO = Math.sin(node);
    const cosW = Math.cos(argPeri);
    const sinW = Math.sin(argPeri);
    const cosI = this.cosI[index];
    const sinI = this.sinI[index];
    // P, Q in the equatorial frame, then rotated about x by −ε into the ecliptic.
    const px = cosO * cosW - sinO * sinW * cosI;
    const py = sinO * cosW + cosO * sinW * cosI;
    const pz = sinW * sinI;
    const qx = -cosO * sinW - sinO * cosW * cosI;
    const qy = -sinO * sinW + cosO * cosW * cosI;
    const qz = cosW * sinI;
    const basis = this.basis;
    const offset = index * 6;
    basis[offset] = px;
    basis[offset + 1] = COS_OBLIQUITY * py + SIN_OBLIQUITY * pz;
    basis[offset + 2] = -SIN_OBLIQUITY * py + COS_OBLIQUITY * pz;
    basis[offset + 3] = qx;
    basis[offset + 4] = COS_OBLIQUITY * qy + SIN_OBLIQUITY * qz;
    basis[offset + 5] = -SIN_OBLIQUITY * qy + COS_OBLIQUITY * qz;
    this.basisTime[index] = t;
  }

  private propagate(
    index: number,
    t: number,
    outX: Float64Array | number[],
    outY: Float64Array | number[],
    outZ: Float64Array | number[],
    outIndex: number
  ): void {
    const dt = t - this.epoch[index];
    const e = this.eccentricity[index];
    let M = (this.meanAnomaly0[index] + this.meanMotion[index] * dt) % TWO_PI;
    if (M > Math.PI) M -= TWO_PI;
    else if (M < -Math.PI) M += TWO_PI;
    let E = M + e * Math.sin(M);
    for (let iteration = 0; iteration < 12; iteration++) {
      const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= delta;
      if (delta < 1e-10 && delta > -1e-10) break;
    }
    const xo = this.semiMajorAxis[index] * (Math.cos(E) - e);
    const yo = this.semiMinorAxis[index] * Math.sin(E);
    const basis = this.basis;
    const offset = index * 6;
    outX[outIndex] = basis[offset] * xo + basis[offset + 3] * yo;
    outY[outIndex] = basis[offset + 1] * xo + basis[offset + 4] * yo;
    outZ[outIndex] = basis[offset + 2] * xo + basis[offset + 5] * yo;
  }
}
