/**
 * The body model.
 *
 * Every object's motion is a timeline of segments. Each segment names the
 * body it moves relative to (its parent during that interval) and how it
 * moves. Planets and moons have a single, unbounded segment; a spacecraft
 * can launch from Earth, cruise around the Sun, then orbit or land on a
 * target, each phase a segment with its own parent and motion model.
 */

import type { KeplerOrbit } from "../astro/kepler";

export type BodyKind =
  | "star"
  | "barycenter"
  | "planet"
  | "dwarf"
  | "moon"
  | "asteroid"
  | "comet"
  | "spacecraft";

export type MoonCategory = "major" | "medium" | "named" | "minor";
export type SpacecraftIcon = "probe" | "orbiter" | "telescope";

export type Motion =
  /** At the parent's position (the Sun, or a body resting at a barycenter). */
  | { kind: "fixed" }
  /** Two-body orbit about the parent. */
  | { kind: "kepler"; orbit: KeplerOrbit }
  /**
   * Osculating orbits sampled at increasing epochs. Between two epochs the
   * positions on the two bracketing conics are blended linearly in time, so
   * the path is exact at every sample and continuous between them.
   */
  | { kind: "keplerSeries"; epochs: Float64Array; orbits: KeplerOrbit[] }
  /**
   * Reflex motion about a barycenter: position = −massRatio × (partner's
   * position relative to this body). Earth about the Earth–Moon barycenter.
   */
  | { kind: "barycentric"; partner: Body; massRatio: number };

export interface MotionSegment {
  /** Julian date (TDB) the segment starts; −Infinity for "always". */
  start: number;
  /** Julian date (TDB) the segment ends; +Infinity for "forever". */
  end: number;
  /** Body this segment's motion is relative to; null only for the root (Sun). */
  parent: Body | null;
  motion: Motion;
}

/** IAU body orientation: pole (RA/Dec, ICRF) and prime meridian, secular terms only. */
export interface Orientation {
  poleRa: [number, number];   // deg, deg/century
  poleDec: [number, number];  // deg, deg/century
  primeMeridian: [number, number]; // deg, deg/day
}

export interface Ring {
  innerRadius: number; // km
  outerRadius: number; // km
  color: string;
  opacity: number;
}

export interface Discovery {
  by?: string;
  year?: number;
  date?: string;
}

export interface MissionInfo {
  spkid: number;
  type: "deep_space" | "earth_orbiter" | "planetary_orbiter";
  status: "active" | "ended";
  launch: number; // JD
  end?: number;   // JD
  icon: SpacecraftIcon;
  /** Epoch of the osculating elements the trajectory is built from. */
  elementsEpoch?: number;
}

export interface Body {
  /** Dense index into ephemeris arrays; assigned by the catalog. */
  index: number;
  name: string;
  kind: BodyKind;
  /** Mean radius in km, or null when no size has been published. */
  radius: number | null;
  color: string;
  /** Gravitational parameter (km³/s²) when known. */
  gm: number | null;
  segments: MotionSegment[];
  /** The time span the object exists in the scene (launch → end of mission). */
  existsFrom: number;
  existsUntil: number;

  /** Bodies whose motion is relative to this one in any segment. */
  children: Body[];
  /** Hierarchy depth of the principal parent chain (Sun = 0). */
  depth: number;
  /**
   * Radius (km) of the region this body dominates — its Hill sphere, widened
   * to cover its satellites. The camera adopts a body as its reference frame
   * when the view sits inside this region.
   */
  frameRadius: number;

  /** Body whose orbit to draw for this one (Earth draws the barycenter's). */
  orbitSource?: Body;
  /** Draw the orbit always, only while focused (hovered/selected), or never. */
  orbitVisibility: "always" | "focus" | "never";
  /** Label rank: lower labels win collisions. */
  labelPriority: number;

  orientation?: Orientation;
  rings?: Ring[];
  moonCategory?: MoonCategory;
  mission?: MissionInfo;
  discovery?: Discovery;
  /** Designation or catalog number, when it differs from the name. */
  designation?: string;
  naifId?: number;
  /** Where the orbital data came from, for the info panel. */
  dataSource: string;
}

/**
 * Replace the part of a timeline between `start` and `end` with a new
 * segment, clipping the segments around it.
 */
export function spliceSegment(segments: readonly MotionSegment[], replacement: MotionSegment): MotionSegment[] {
  const result: MotionSegment[] = [];
  for (const segment of segments) {
    if (segment.start < replacement.start) result.push({ ...segment, end: Math.min(segment.end, replacement.start) });
  }
  result.push(replacement);
  for (const segment of segments) {
    if (segment.end > replacement.end) result.push({ ...segment, start: Math.max(segment.start, replacement.end) });
  }
  return result;
}

/** Segment in effect at time t (the nearest one outside the covered span). */
export function segmentAt(body: Body, t: number): MotionSegment {
  const segments = body.segments;
  if (segments.length === 1) return segments[0];
  for (const segment of segments) {
    if (t < segment.end) return segment;
  }
  return segments[segments.length - 1];
}

/** The osculating orbit describing a motion at time t, if it is orbital. */
export function orbitAt(motion: Motion, t: number): KeplerOrbit | null {
  switch (motion.kind) {
    case "kepler": return motion.orbit;
    case "keplerSeries": return motion.orbits[seriesIndex(motion.epochs, t, true)];
    default: return null;
  }
}

/**
 * Index into a sorted epoch list: the sample at or before t (clamped), or
 * with `nearest`, the closest sample.
 */
export function seriesIndex(epochs: Float64Array, t: number, nearest = false): number {
  const last = epochs.length - 1;
  if (t <= epochs[0]) return 0;
  if (t >= epochs[last]) return last;
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (epochs[middle] <= t) low = middle;
    else high = middle;
  }
  return nearest && t - epochs[low] > epochs[high] - t ? high : low;
}

export function parentAt(body: Body, t: number): Body | null {
  return segmentAt(body, t).parent;
}

export function existsAt(body: Body, t: number): boolean {
  return t >= body.existsFrom && t <= body.existsUntil;
}

/**
 * Nearest ancestor that is drawn (skips barycenters): the body this one is
 * visually "inside" of, for occlusion and labelling.
 */
export function visibleParentAt(body: Body, t: number): Body | null {
  let parent = parentAt(body, t);
  while (parent && parent.kind === "barycenter") parent = parentAt(parent, t);
  return parent;
}
