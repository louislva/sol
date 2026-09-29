/**
 * Position resolution for the body hierarchy.
 *
 * A body's heliocentric position is its motion relative to its parent plus
 * the parent's heliocentric position, resolved recursively. Positions at the
 * current simulation time are memoized in a flat typed array for the frame.
 */

import { conicPosition } from "../astro/kepler";
import { bodyFixedToEcliptic } from "../astro/orientation";
import { type Body, type Motion, segmentAt, seriesIndex } from "./body";

const seriesScratch = new Float64Array(3);
const TWO_PI = Math.PI * 2;

/** Signed smallest difference b − a of two angles (radians). */
function angleDelta(a: number, b: number): number {
  const delta = (b - a) % TWO_PI;
  return delta > Math.PI ? delta - TWO_PI : delta < -Math.PI ? delta + TWO_PI : delta;
}

export class Ephemeris {
  readonly bodies: readonly Body[];
  /** x, y, z per body index (km, heliocentric J2000 ecliptic) at `time`. */
  readonly positions: Float64Array;
  private readonly stamps: Uint32Array;
  private generation = 1;
  private currentTime = Number.NaN;
  private readonly scratch = new Float64Array(3);

  constructor(bodies: readonly Body[]) {
    this.bodies = bodies;
    this.positions = new Float64Array(bodies.length * 3);
    this.stamps = new Uint32Array(bodies.length);
  }

  get time(): number {
    return this.currentTime;
  }

  setTime(t: number): void {
    if (t === this.currentTime) return;
    this.currentTime = t;
    this.generation++;
  }

  /** Resolve a body's position at the current time; returns its offset into `positions`. */
  resolve(body: Body): number {
    const offset = body.index * 3;
    if (this.stamps[body.index] === this.generation) return offset;

    const t = this.currentTime;
    const segment = segmentAt(body, t);
    let px = 0;
    let py = 0;
    let pz = 0;
    if (segment.parent) {
      const parentOffset = this.resolve(segment.parent);
      px = this.positions[parentOffset];
      py = this.positions[parentOffset + 1];
      pz = this.positions[parentOffset + 2];
    }
    evaluateMotion(segment.motion, t, this.scratch);
    this.positions[offset] = px + this.scratch[0];
    this.positions[offset + 1] = py + this.scratch[1];
    this.positions[offset + 2] = pz + this.scratch[2];
    this.stamps[body.index] = this.generation;
    return offset;
  }

  x(body: Body): number {
    return this.positions[this.resolve(body)];
  }

  y(body: Body): number {
    return this.positions[this.resolve(body) + 1];
  }

  /** Heliocentric position at an arbitrary time (not memoized). */
  positionAt(body: Body, t: number, out: Float64Array | number[]): void {
    const segment = segmentAt(body, t);
    evaluateMotion(segment.motion, t, out);
    const step = this.scratch;
    for (let parent = segment.parent; parent; ) {
      const parentSegment = segmentAt(parent, t);
      evaluateMotion(parentSegment.motion, t, step);
      out[0] += step[0];
      out[1] += step[1];
      out[2] += step[2];
      parent = parentSegment.parent;
    }
  }
}

/** Position relative to the segment's parent (km, J2000 ecliptic). */
export function evaluateMotion(motion: Motion, t: number, out: Float64Array | number[]): void {
  switch (motion.kind) {
    case "fixed":
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      return;
    case "kepler":
      motion.orbit.positionAt(t, out);
      return;
    case "keplerSeries": {
      const { epochs, orbits } = motion;
      const index = seriesIndex(epochs, t);
      if (index === epochs.length - 1 || t <= epochs[0]) {
        orbits[index].positionAt(t, out);
        return;
      }
      const weight = (t - epochs[index]) / (epochs[index + 1] - epochs[index]);
      const first = orbits[index].elements;
      const second = orbits[index + 1].elements;
      if (motion.blend === "elements" && (first.e < 1) === (second.e < 1)) {
        // Interpolate the conic itself; the mean anomaly blends the two
        // conics' predictions for time t, so it is continuous at the samples.
        const m1 = first.meanAnomaly + first.meanMotion * (t - first.epoch);
        const m2 = second.meanAnomaly + second.meanMotion * (t - second.epoch);
        const closed = first.e < 1;
        const lerp = (a: number, b: number) => a + (b - a) * weight;
        const lerpAngle = (a: number, b: number) => a + angleDelta(a, b) * weight;
        conicPosition(
          lerp(first.a, second.a),
          lerp(first.e, second.e),
          lerp(first.i, second.i),
          lerpAngle(first.node, second.node),
          lerpAngle(first.argPeri, second.argPeri),
          closed ? lerpAngle(m1, m2) : lerp(m1, m2),
          out
        );
        return;
      }
      orbits[index].positionAt(t, out);
      orbits[index + 1].positionAt(t, seriesScratch);
      out[0] += (seriesScratch[0] - out[0]) * weight;
      out[1] += (seriesScratch[1] - out[1]) * weight;
      out[2] += (seriesScratch[2] - out[2]) * weight;
      return;
    }
    case "hermite": {
      const { epochs, states } = motion;
      const index = seriesIndex(epochs, t);
      const base = index * 6;
      if (index === epochs.length - 1 || t <= epochs[0]) {
        out[0] = states[base];
        out[1] = states[base + 1];
        out[2] = states[base + 2];
        return;
      }
      const h = epochs[index + 1] - epochs[index];
      const s = (t - epochs[index]) / h;
      const s2 = s * s;
      const s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1;
      const h10 = (s3 - 2 * s2 + s) * h;
      const h01 = -2 * s3 + 3 * s2;
      const h11 = (s3 - s2) * h;
      for (let axis = 0; axis < 3; axis++) {
        out[axis] = h00 * states[base + axis] + h10 * states[base + 3 + axis]
          + h01 * states[base + 6 + axis] + h11 * states[base + 9 + axis];
      }
      return;
    }
    case "surface": {
      const m = bodyFixedToEcliptic(motion.orientation, t);
      const [x, y, z] = motion.position;
      out[0] = m[0] * x + m[1] * y + m[2] * z;
      out[1] = m[3] * x + m[4] * y + m[5] * z;
      out[2] = m[6] * x + m[7] * y + m[8] * z;
      return;
    }
    case "barycentric": {
      evaluateMotion(segmentAt(motion.partner, t).motion, t, out);
      out[0] *= -motion.massRatio;
      out[1] *= -motion.massRatio;
      out[2] *= -motion.massRatio;
      return;
    }
  }
}
