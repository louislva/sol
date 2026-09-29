/**
 * Position resolution for the body hierarchy.
 *
 * A body's heliocentric position is its motion relative to its parent plus
 * the parent's heliocentric position, resolved recursively. Positions at the
 * current simulation time are memoized in a flat typed array for the frame.
 */

import { type Body, type Motion, segmentAt, seriesIndex } from "./body";

const seriesScratch = new Float64Array(3);

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
      orbits[index].positionAt(t, out);
      if (index === epochs.length - 1 || t <= epochs[0]) return;
      const weight = (t - epochs[index]) / (epochs[index + 1] - epochs[index]);
      orbits[index + 1].positionAt(t, seriesScratch);
      out[0] += (seriesScratch[0] - out[0]) * weight;
      out[1] += (seriesScratch[1] - out[1]) * weight;
      out[2] += (seriesScratch[2] - out[2]) * weight;
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
