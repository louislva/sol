/**
 * The asteroid point cloud: the brightest ~25,000 asteroids from the JPL
 * Small-Body Database (main belt, trojans, NEOs, Centaurs, TNOs), stored as
 * structure-of-arrays and propagated in bulk.
 *
 * The catalog is sorted by absolute magnitude H, so any prefix of it is the
 * set of the largest objects: level of detail is simply "draw the first N".
 *
 * Data: public/data/asteroids.json (scripts/fetch-asteroids.ts).
 */

import { AU_KM, DEG, TWO_PI } from "../astro/constants";

interface AsteroidFile {
  count: number;
  columns: {
    epoch: number[];
    a: number[];
    e: number[];
    i: number[];
    node: number[];
    argPeri: number[];
    meanAnomaly: number[];
    meanMotion: number[];
    H: number[];
  };
  names: string[];
}

export class AsteroidPopulation {
  readonly count: number;
  readonly names: string[];
  readonly H: Float32Array;
  readonly semiMajorAxisAu: Float32Array;
  readonly eccentricity: Float64Array;
  readonly inclinationDeg: Float32Array;

  /** Heliocentric x/y (km) of each asteroid, as of `computedAt`. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  private readonly computedAt: Float64Array;
  /** Indices of the asteroids selected by the last `update`. */
  readonly visible: Uint32Array;
  visibleCount = 0;
  /** Distance bounds of each orbit's projection onto the ecliptic (km). */
  private readonly minDistance: Float64Array;
  private readonly maxDistance: Float64Array;

  // Projected orbit basis, pre-multiplied by a and b: x = ax·(cos E − e) + bx·sin E.
  private readonly ax: Float64Array;
  private readonly ay: Float64Array;
  private readonly bx: Float64Array;
  private readonly by: Float64Array;
  private readonly meanAnomalyAtEpoch: Float64Array;
  private readonly meanMotion: Float64Array;
  private readonly epoch: Float64Array;
  /** Perihelion (maximum) speed of each asteroid, km/day. */
  private readonly maxSpeed: Float64Array;

  constructor(file: AsteroidFile, exclude: (name: string) => boolean) {
    const keep: number[] = [];
    for (let index = 0; index < file.count; index++) {
      if (!exclude(file.names[index])) keep.push(index);
    }
    const count = keep.length;
    this.count = count;
    this.names = keep.map((index) => file.names[index]);
    this.H = new Float32Array(count);
    this.semiMajorAxisAu = new Float32Array(count);
    this.eccentricity = new Float64Array(count);
    this.inclinationDeg = new Float32Array(count);
    this.x = new Float64Array(count);
    this.y = new Float64Array(count);
    this.computedAt = new Float64Array(count).fill(Number.NaN);
    this.visible = new Uint32Array(count);
    this.minDistance = new Float64Array(count);
    this.maxDistance = new Float64Array(count);
    this.ax = new Float64Array(count);
    this.ay = new Float64Array(count);
    this.bx = new Float64Array(count);
    this.by = new Float64Array(count);
    this.meanAnomalyAtEpoch = new Float64Array(count);
    this.meanMotion = new Float64Array(count);
    this.epoch = new Float64Array(count);
    this.maxSpeed = new Float64Array(count);

    const c = file.columns;
    keep.forEach((source, index) => {
      const a = c.a[source] * AU_KM;
      const e = c.e[source];
      const b = a * Math.sqrt(1 - e * e);
      const i = c.i[source] * DEG;
      const node = c.node[source] * DEG;
      const argPeri = c.argPeri[source] * DEG;
      const cosO = Math.cos(node);
      const sinO = Math.sin(node);
      const cosW = Math.cos(argPeri);
      const sinW = Math.sin(argPeri);
      const cosI = Math.cos(i);
      this.ax[index] = a * (cosO * cosW - sinO * sinW * cosI);
      this.ay[index] = a * (sinO * cosW + cosO * sinW * cosI);
      this.bx[index] = b * (-cosO * sinW - sinO * cosW * cosI);
      this.by[index] = b * (-sinO * sinW + cosO * cosW * cosI);
      this.eccentricity[index] = e;
      this.meanAnomalyAtEpoch[index] = c.meanAnomaly[source] * DEG;
      this.meanMotion[index] = c.meanMotion[source] * DEG;
      this.epoch[index] = c.epoch[source];
      this.H[index] = c.H[source];
      this.semiMajorAxisAu[index] = c.a[source];
      this.inclinationDeg[index] = c.i[source];
      this.maxSpeed[index] = this.meanMotion[index] * a * Math.sqrt((1 + e) / (1 - e));
      // Projection shortens in-plane distances by at most |cos i|.
      this.minDistance[index] = a * (1 - e) * Math.abs(cosI);
      this.maxDistance[index] = a * (1 + e);
    });
  }

  static async load(exclude: (name: string) => boolean): Promise<AsteroidPopulation> {
    const response = await fetch("/data/asteroids.json");
    if (!response.ok) throw new Error(`asteroids.json: HTTP ${response.status}`);
    return new AsteroidPopulation(await response.json() as AsteroidFile, exclude);
  }

  /**
   * Select the asteroids among the first `count` whose orbits can reach the
   * given range of distances from the Sun (the viewport's), and bring their
   * positions up to date at time t. Each position is refreshed only once the
   * asteroid could have moved `tolerancePx` on screen at `zoom` (px/km), and
   * orbits that cannot reach the view are never propagated.
   */
  update(t: number, count: number, zoom: number, viewMin: number, viewMax: number, tolerancePx = 0.5): void {
    count = Math.min(count, this.count);
    this.visibleCount = 0;
    if (count === 0) return;
    const toleranceKm = tolerancePx / zoom;
    const { minDistance, maxDistance, computedAt, maxSpeed, visible } = this;
    let visibleCount = 0;
    for (let index = 0; index < count; index++) {
      if (maxDistance[index] < viewMin || minDistance[index] > viewMax) continue;
      if (!(Math.abs(t - computedAt[index]) * maxSpeed[index] < toleranceKm)) {
        this.propagate(t, index, index + 1);
        computedAt[index] = t;
      }
      visible[visibleCount++] = index;
    }
    this.visibleCount = visibleCount;
  }

  /** Heliocentric x/y (km) of one asteroid at time t. */
  positionAt(index: number, t: number, out: Float64Array | number[]): void {
    this.propagate(t, index, index + 1, out);
  }

  private propagate(t: number, start: number, end: number, single?: Float64Array | number[]): void {
    const { ax, ay, bx, by, eccentricity, meanAnomalyAtEpoch, meanMotion, epoch, x, y } = this;
    for (let index = start; index < end; index++) {
      const e = eccentricity[index];
      let M = (meanAnomalyAtEpoch[index] + meanMotion[index] * (t - epoch[index])) % TWO_PI;
      if (M > Math.PI) M -= TWO_PI;
      else if (M < -Math.PI) M += TWO_PI;
      let E = M + e * Math.sin(M);
      for (let iteration = 0; iteration < 12; iteration++) {
        const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= delta;
        if (delta < 1e-10 && delta > -1e-10) break;
      }
      const cosEMinusE = Math.cos(E) - e;
      const sinE = Math.sin(E);
      const px = ax[index] * cosEMinusE + bx[index] * sinE;
      const py = ay[index] * cosEMinusE + by[index] * sinE;
      if (single) {
        single[0] = px;
        single[1] = py;
      } else {
        x[index] = px;
        y[index] = py;
      }
    }
  }
}
