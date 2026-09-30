/**
 * Stars: every star within 20 parsecs, every naked-eye star, and every star
 * with an IAU name — about 11,000, from SIMBAD.
 *
 * Each star moves in a straight line at its measured space velocity
 * relative to the Sun (proper motion and radial velocity), from its J2000
 * position. Over the ±250,000 years the clock spans that is accurate to a
 * small fraction of the distances between stars: the Galaxy's pull on the
 * Sun and on a nearby star differ only by a weak tide. Positions are in the
 * far display frame (the Galactic plane is the screen; see astro/galactic).
 *
 * Data: public/data/stars.json (scripts/fetch-stars.ts), nearest first.
 */

import { J2000 } from "../astro/constants";
import { starState } from "../astro/galactic";
import { DEFAULT_STAR_COLOR, STAR_CLASS_COLORS } from "../data/palette";

type StarRow = [
  iauName: string | null,
  designation: string,
  ra: number,
  dec: number,
  parallax: number,
  pmRa: number,
  pmDec: number,
  radialVelocity: number | null,
  spectralType: string | null,
  magnitude: number | null,
  band: string | null,
];

interface StarFile {
  generatedAt: string;
  stars: StarRow[];
}

const CLASSES = Object.keys(STAR_CLASS_COLORS);

export class StarPopulation {
  readonly count: number;
  /** IAU name where there is one, else the designation. */
  readonly names: string[];
  readonly iauNames: (string | null)[];
  readonly designations: string[];
  readonly spectralTypes: (string | null)[];
  readonly magnitudes: Float32Array;
  readonly bands: (string | null)[];
  readonly parallaxes: Float64Array;
  readonly radialVelocityKnown: Uint8Array;
  /** Absolute magnitude in the star's band (NaN if unknown). */
  readonly absoluteMagnitude: Float32Array;
  /** Index into `colors`. */
  readonly colorIndex: Uint8Array;
  readonly colors: readonly string[] = [...CLASSES.map((c) => STAR_CLASS_COLORS[c]), DEFAULT_STAR_COLOR];

  /** Current position (km, far display frame), as of `time`. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Top-down (x, y) distance from the Sun of the nearest star, as of `time`: no view closer in can show one. */
  nearestProjectedDistance = Number.POSITIVE_INFINITY;
  private time = Number.NaN;

  private readonly x0: Float64Array;
  private readonly y0: Float64Array;
  private readonly z0: Float64Array;
  /** km/day */
  private readonly vx: Float64Array;
  private readonly vy: Float64Array;
  private readonly vz: Float64Array;

  constructor(file: StarFile) {
    const rows = file.stars;
    const count = rows.length;
    this.count = count;
    this.iauNames = rows.map((row) => row[0]);
    this.designations = rows.map((row) => row[1]);
    this.names = rows.map((row) => row[0] ?? row[1]);
    this.spectralTypes = rows.map((row) => row[8]);
    this.bands = rows.map((row) => row[10]);
    this.magnitudes = new Float32Array(count);
    this.parallaxes = new Float64Array(count);
    this.radialVelocityKnown = new Uint8Array(count);
    this.absoluteMagnitude = new Float32Array(count);
    this.colorIndex = new Uint8Array(count);
    this.x = new Float64Array(count);
    this.y = new Float64Array(count);
    this.z = new Float64Array(count);
    this.x0 = new Float64Array(count);
    this.y0 = new Float64Array(count);
    this.z0 = new Float64Array(count);
    this.vx = new Float64Array(count);
    this.vy = new Float64Array(count);
    this.vz = new Float64Array(count);

    const position = [0, 0, 0];
    const velocity = [0, 0, 0];
    rows.forEach((row, index) => {
      const [, , ra, dec, parallax, pmRa, pmDec, radialVelocity, spectralType, magnitude] = row;
      starState(ra, dec, parallax, pmRa, pmDec, radialVelocity ?? 0, position, velocity);
      this.x0[index] = position[0];
      this.y0[index] = position[1];
      this.z0[index] = position[2];
      this.vx[index] = velocity[0];
      this.vy[index] = velocity[1];
      this.vz[index] = velocity[2];
      this.parallaxes[index] = parallax;
      this.radialVelocityKnown[index] = radialVelocity === null ? 0 : 1;
      this.magnitudes[index] = magnitude ?? Number.NaN;
      // M = m + 5 log10(parallax in arcsec) + 5
      this.absoluteMagnitude[index] = magnitude === null ? Number.NaN : magnitude + 5 * Math.log10(parallax / 1000) + 5;
      this.colorIndex[index] = starClassIndex(spectralType);
    });
  }

  static async load(): Promise<StarPopulation> {
    const response = await fetch("/data/stars.json");
    if (!response.ok) throw new Error(`stars.json: HTTP ${response.status}`);
    return new StarPopulation(await response.json() as StarFile);
  }

  colorOf(index: number): string {
    return this.colors[this.colorIndex[index]];
  }

  /** Move every star to time t (JD). */
  update(t: number): void {
    if (t === this.time) return;
    this.time = t;
    const dt = t - J2000;
    const { x, y, z, x0, y0, z0, vx, vy, vz } = this;
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.count; index++) {
      const px = x0[index] + vx[index] * dt;
      const py = y0[index] + vy[index] * dt;
      const pz = z0[index] + vz[index] * dt;
      x[index] = px;
      y[index] = py;
      z[index] = pz;
      const d = px * px + py * py;
      if (d < nearest) nearest = d;
    }
    this.nearestProjectedDistance = Math.sqrt(nearest);
  }

  positionAt(index: number, t: number, out: Float64Array | number[]): void {
    const dt = t - J2000;
    out[0] = this.x0[index] + this.vx[index] * dt;
    out[1] = this.y0[index] + this.vy[index] * dt;
    out[2] = this.z0[index] + this.vz[index] * dt;
  }

  /** Space velocity relative to the Sun, km/s. */
  speedOf(index: number): number {
    return Math.hypot(this.vx[index], this.vy[index], this.vz[index]) / 86_400;
  }
}

/** Spectral class letter ("M4.0V" → M, "DA1.9" → D, "sdM1" → M); the default color if none. */
function starClassIndex(spectralType: string | null): number {
  const match = spectralType ? /([OBAFGKMLTYD])/.exec(spectralType.replace(/^(sd|esd|usd|d|g|c)(?=[OBAFGKM])/, "")) : null;
  const index = match ? CLASSES.indexOf(match[1]) : -1;
  return index >= 0 ? index : CLASSES.length;
}
