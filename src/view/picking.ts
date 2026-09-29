/**
 * Hit testing against what was actually drawn last frame: bodies, point
 * populations, and orbit polylines. What you see is what you can hover.
 */

import type { Target } from "../model/world";
import type { DrawnOrbit } from "./layers/orbits";

const BODY_MIN_HIT_PX = 8;
const DOT_HIT_PX = 6;
const ORBIT_HIT_PX = 6;

export interface PickResult {
  target: Target;
  /** True when the pointer is on the object itself rather than its orbit. */
  direct: boolean;
}

export class PickBuffer {
  private bodies: Array<{ target: Target; x: number; y: number; radius: number }> = [];
  // Point populations: parallel typed arrays reused across frames.
  private dotCount = 0;
  private dotIsSatellite = new Uint8Array(1024);
  private dotIndices = new Uint32Array(1024);
  private dotX = new Float32Array(1024);
  private dotY = new Float32Array(1024);
  private orbits: readonly DrawnOrbit[] = [];

  clear(): void {
    this.bodies.length = 0;
    this.dotCount = 0;
  }

  addBody(target: Target, x: number, y: number, radius: number): void {
    this.bodies.push({ target, x, y, radius: Math.max(radius, BODY_MIN_HIT_PX) });
  }

  addDot(kind: "asteroid" | "satellite", index: number, x: number, y: number): void {
    if (this.dotCount === this.dotX.length) this.growDots();
    const slot = this.dotCount++;
    this.dotIsSatellite[slot] = kind === "satellite" ? 1 : 0;
    this.dotIndices[slot] = index;
    this.dotX[slot] = x;
    this.dotY[slot] = y;
  }

  private growDots(): void {
    const capacity = this.dotX.length * 2;
    const grow = <T extends Uint8Array | Uint32Array | Float32Array>(array: T, make: (size: number) => T): T => {
      const next = make(capacity);
      next.set(array);
      return next;
    };
    this.dotIsSatellite = grow(this.dotIsSatellite, (size) => new Uint8Array(size));
    this.dotIndices = grow(this.dotIndices, (size) => new Uint32Array(size));
    this.dotX = grow(this.dotX, (size) => new Float32Array(size));
    this.dotY = grow(this.dotY, (size) => new Float32Array(size));
  }

  setOrbits(orbits: readonly DrawnOrbit[]): void {
    this.orbits = orbits;
  }

  pick(x: number, y: number): PickResult | null {
    // Bodies drawn later sit on top; among overlapping hits take the closest center.
    let best: Target | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of this.bodies) {
      const distance = Math.hypot(candidate.x - x, candidate.y - y);
      if (distance <= candidate.radius && distance <= bestDistance) {
        best = candidate.target;
        bestDistance = distance;
      }
    }
    if (best) return { target: best, direct: true };

    let bestDot = -1;
    let bestDotDistance = DOT_HIT_PX * DOT_HIT_PX;
    for (let index = 0; index < this.dotCount; index++) {
      const dx = this.dotX[index] - x;
      const dy = this.dotY[index] - y;
      const distance = dx * dx + dy * dy;
      if (distance <= bestDotDistance) {
        bestDot = index;
        bestDotDistance = distance;
      }
    }
    if (bestDot >= 0) {
      const type = this.dotIsSatellite[bestDot] ? "satellite" : "asteroid";
      return { target: { type, index: this.dotIndices[bestDot] }, direct: true };
    }

    let bestOrbit: DrawnOrbit | null = null;
    let bestOrbitDistance = ORBIT_HIT_PX;
    for (const orbit of this.orbits) {
      const distance = distanceToPolyline(orbit.screen, orbit.count, x, y);
      if (distance <= bestOrbitDistance) {
        bestOrbit = orbit;
        bestOrbitDistance = distance;
      }
    }
    return bestOrbit ? { target: { type: "body", body: bestOrbit.body }, direct: false } : null;
  }
}

function distanceToPolyline(points: Float32Array, count: number, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index + 1 < count; index++) {
    const x1 = points[index * 2];
    const y1 = points[index * 2 + 1];
    const dx = points[index * 2 + 2] - x1;
    const dy = points[index * 2 + 3] - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}
