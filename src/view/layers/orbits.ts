/**
 * Orbit paths.
 *
 * Paths are sampled uniformly in eccentric anomaly, with a point count
 * chosen per orbit from its on-screen size so the chord error stays below a
 * fraction of a pixel. Orbits far larger than the viewport (a planet's orbit
 * while zoomed in on the planet) are sampled only along the arc near the
 * view, so the line still passes exactly through the planet.
 *
 * Sampled paths are cached relative to the parent and reused until the
 * orbit's slow secular drift could have moved them by a noticeable amount.
 */

import { KeplerOrbit } from "../../astro/kepler";
import { type Body, orbitAt, segmentAt } from "../../model/body";
import type { World } from "../../model/world";
import type { Camera } from "../camera";

const CHORD_TOLERANCE_PX = 0.35;
const MIN_POINTS = 24;
const MAX_FULL_POINTS = 1024;
const LOCAL_ARC_POINTS = 192;
/** Orbits whose radius exceeds this many viewport diagonals are sampled locally. */
const LOCAL_SAMPLING_THRESHOLD = 3;
const DRIFT_TOLERANCE_PX = 0.25;
/** Screen coordinates are clamped to this margin so huge paths stay well-conditioned. */
const SCREEN_MARGIN = 2000;

interface SampledPath {
  /** x, y pairs (km) relative to the focus. */
  points: Float64Array;
  count: number;
  closed: boolean;
}

interface CachedPath extends SampledPath {
  orbit: KeplerOrbit;
  time: number;
}

/** Paths are cached per body, or per orbit for objects that are not bodies (satellites). */
type PathKey = Body | KeplerOrbit;

export interface DrawnOrbit {
  body: Body;
  /** Screen-space polyline (x, y pairs) as drawn, for hit testing. */
  screen: Float32Array;
  count: number;
}

export class OrbitLayer {
  private readonly cache = new Map<PathKey, CachedPath>();
  private readonly localPath = new Float64Array(LOCAL_ARC_POINTS * 2);
  /** Anomaly of each large orbit's point nearest the view, from last frame. */
  private readonly localAnomaly = new Map<PathKey, number>();
  private readonly screenPool: Float32Array[] = [];
  /** Orbits drawn this frame. */
  readonly drawn: DrawnOrbit[] = [];
  private readonly scratch = new Float64Array(3);
  /** Satellite orbits drawn this frame; the paths of others are let go. */
  private readonly satellitesDrawn = new Set<KeplerOrbit>();

  beginFrame(): void {
    this.drawn.length = 0;
    for (const key of this.cache.keys()) {
      if (key instanceof KeplerOrbit && !this.satellitesDrawn.has(key)) this.cache.delete(key);
    }
    for (const key of this.localAnomaly.keys()) {
      if (key instanceof KeplerOrbit && !this.satellitesDrawn.has(key)) this.localAnomaly.delete(key);
    }
    this.satellitesDrawn.clear();
  }

  /**
   * Draw a body's orbit about its current parent.
   * @param alpha overall opacity (already includes fading and emphasis)
   */
  draw(ctx: CanvasRenderingContext2D, world: World, camera: Camera, body: Body, alpha: number): void {
    const source = body.orbitSource ?? body;
    const t = world.time;
    const segment = segmentAt(source, t);
    const orbit = orbitAt(segment.motion, t);
    if (!orbit || !segment.parent) return;

    const eph = world.ephemeris;
    const parentOffset = eph.resolve(segment.parent);
    const focusX = camera.worldToScreenX(eph.positions[parentOffset]);
    const focusY = camera.worldToScreenY(eph.positions[parentOffset + 1]);
    const zoom = camera.zoom;

    const path = orbit.isClosed
      ? this.closedPath(body, orbit, t, focusX, focusY, camera, segment.parent.kind === "star")
      : this.openPath(body, orbit, t, world);
    if (!path) return;

    const screen = this.strokePath(ctx, path.points, path.count, path.closed, focusX, focusY, zoom, camera);
    if (!screen) return;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = body.color;
    ctx.stroke();
    this.drawn.push({ body, screen: screen.buffer, count: screen.count });
  }

  /**
   * Draw an Earth satellite's orbit. Earth's disc hides the part of it behind
   * Earth, as it hides the satellites there: the half of the orbit below the
   * ecliptic plane through Earth's center, which projects to one side of the
   * line of nodes.
   */
  drawSatellite(
    ctx: CanvasRenderingContext2D,
    orbit: KeplerOrbit,
    t: number,
    earthX: number,
    earthY: number,
    earthRadiusPx: number,
    camera: Camera,
    color: string,
    alpha: number
  ): void {
    this.satellitesDrawn.add(orbit);
    const path = this.closedPath(orbit, orbit, t, earthX, earthY, camera, false);
    if (!path) return;

    ctx.save();
    // Orbit normal h = P × Q; the far half lies toward h_z·(h_x, h_y).
    const { P, Q } = orbit.shapeAt(t);
    const hx = P[1] * Q[2] - P[2] * Q[1];
    const hy = P[2] * Q[0] - P[0] * Q[2];
    const hz = P[0] * Q[1] - P[1] * Q[0];
    if (Math.hypot(hx, hy) > 1e-9 && earthRadiusPx > 0) {
      const back = Math.atan2(hz * hy, hz * hx);
      const hidden = new Path2D();
      hidden.rect(0, 0, camera.width, camera.height);
      const start = back - Math.PI / 2;
      hidden.moveTo(earthX + earthRadiusPx * Math.cos(start), earthY + earthRadiusPx * Math.sin(start));
      hidden.arc(earthX, earthY, earthRadiusPx, start, back + Math.PI / 2);
      hidden.closePath();
      ctx.clip(hidden, "evenodd");
    }
    if (this.strokePath(ctx, path.points, path.count, path.closed, earthX, earthY, camera.zoom, camera)) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A closed orbit's path about its focus: the whole ring, or for huge orbits the arc near the view. */
  private closedPath(
    key: PathKey,
    orbit: KeplerOrbit,
    t: number,
    focusX: number,
    focusY: number,
    camera: Camera,
    aboutSun: boolean
  ): SampledPath | null {
    const radiusPx = orbit.apoapsis * camera.zoom;
    if (!this.ringMayBeVisible(orbit, t, focusX, focusY, radiusPx, camera)) return null;
    if (radiusPx > LOCAL_SAMPLING_THRESHOLD * Math.hypot(camera.width, camera.height)) {
      const count = this.sampleLocalArc(key, orbit, t, focusX, focusY, camera);
      return count === 0 ? null : { points: this.localPath, count, closed: false };
    }
    return this.fullPath(key, orbit, t, radiusPx, aboutSun);
  }

  /** Cheap rejection: can any part of the orbit's projected ring touch the viewport? */
  private ringMayBeVisible(
    orbit: KeplerOrbit,
    t: number,
    focusX: number,
    focusY: number,
    radiusPx: number,
    camera: Camera
  ): boolean {
    const nearestX = Math.max(0, Math.min(camera.width, focusX));
    const nearestY = Math.max(0, Math.min(camera.height, focusY));
    if (Math.hypot(nearestX - focusX, nearestY - focusY) > radiusPx) return false;

    // Projection shrinks in-plane distances by at most |cos i|, the z
    // component of the orbit normal (P × Q).
    const { P, Q } = orbit.shapeAt(t);
    const normalZ = Math.abs(P[0] * Q[1] - P[1] * Q[0]);
    const innerPx = orbit.periapsis * camera.zoom * normalZ;
    const farthestX = Math.max(Math.abs(focusX), Math.abs(camera.width - focusX));
    const farthestY = Math.max(Math.abs(focusY), Math.abs(camera.height - focusY));
    return Math.hypot(farthestX, farthestY) >= innerPx;
  }

  private fullPath(key: PathKey, orbit: KeplerOrbit, t: number, radiusPx: number, aboutSun: boolean): CachedPath {
    const wanted = Math.min(
      MAX_FULL_POINTS,
      Math.max(MIN_POINTS, Math.ceil(Math.PI * Math.sqrt(radiusPx / (2 * CHORD_TOLERANCE_PX))))
    );
    // Round up to a power of two so small zoom changes reuse the cache.
    const count = Math.min(MAX_FULL_POINTS, 2 ** Math.ceil(Math.log2(wanted)));
    const cached = this.cache.get(key);
    const drift = orbit.geometryDriftPerDay * Math.abs(t - (cached?.time ?? t)) * radiusPx;
    if (cached && cached.orbit === orbit && cached.closed && cached.count === count && drift < DRIFT_TOLERANCE_PX) {
      return cached;
    }

    const points = cached && cached.points.length >= count * 2 ? cached.points : new Float64Array(count * 2);
    orbit.samplePath(t, count, points, -Math.PI, Math.PI, aboutSun);
    const entry = { orbit, points, count, time: t, closed: true };
    this.cache.set(key, entry);
    return entry;
  }

  /**
   * Hyperbolic paths: comets show both legs out to a few perihelion
   * distances; spacecraft only the outbound leg (the inbound leg of an
   * osculating escape orbit was never flown).
   */
  private openPath(body: Body, orbit: KeplerOrbit, t: number, world: World): CachedPath {
    const count = 256;
    const cached = this.cache.get(body);
    // Open orbits are drawn out to a distance that grows with the object's,
    // so refresh them as it moves.
    if (cached && cached.orbit === orbit && !cached.closed && Math.abs(t - cached.time) < 1) return cached;

    world.ephemeris.positionAt(body.orbitSource ?? body, t, this.scratch);
    const parent = segmentAt(body.orbitSource ?? body, t).parent!;
    const parentPosition = [0, 0, 0];
    world.ephemeris.positionAt(parent, t, parentPosition);
    const distance = Math.hypot(
      this.scratch[0] - parentPosition[0],
      this.scratch[1] - parentPosition[1],
      this.scratch[2] - parentPosition[2]
    );
    const reach = orbit.hyperbolicAnomalyAtRadius(Math.max(4 * orbit.periapsis, 1.5 * distance), t);
    const current = orbit.anomalyAt(t);
    const [from, to] = body.kind === "spacecraft"
      ? [Math.min(0, current), Math.max(current, reach)]
      : [-reach, reach];

    const points = cached?.points.length === count * 2 ? cached.points : new Float64Array(count * 2);
    orbit.samplePath(t, count, points, from, to, parent.kind === "star");
    const entry = { orbit, points, count, time: t, closed: false };
    this.cache.set(body, entry);
    return entry;
  }

  /**
   * Sample only the arc of a very large closed orbit that passes near the
   * view: find the anomaly closest to the view center, then sample a window
   * around it wide enough to span the viewport. The closest anomaly moves
   * little between frames, so it is refined from last frame's value and only
   * searched for from scratch when that fails.
   */
  private sampleLocalArc(key: PathKey, orbit: KeplerOrbit, t: number, focusX: number, focusY: number, camera: Camera): number {
    const { a, e, b, P, Q } = orbit.shapeAt(t);
    const zoom = camera.zoom;
    // View center relative to the focus, in km.
    const cx = (camera.width / 2 - focusX) / zoom;
    const cy = (camera.height / 2 - focusY) / zoom;
    const distanceSquared = (anomaly: number) => {
      const x = a * (Math.cos(anomaly) - e);
      const y = b * Math.sin(anomaly);
      return (P[0] * x + Q[0] * y - cx) ** 2 + (P[1] * x + Q[1] * y - cy) ** 2;
    };
    const refine = (low: number, high: number) => {
      for (let iteration = 0; iteration < 40; iteration++) {
        const m1 = high - (high - low) / 1.618_034;
        const m2 = low + (high - low) / 1.618_034;
        if (distanceSquared(m1) < distanceSquared(m2)) high = m2;
        else low = m1;
      }
      return (low + high) / 2;
    };

    const viewRadiusKm = camera.viewRadius;
    const previous = this.localAnomaly.get(key);
    let center = previous === undefined ? Number.NaN : refine(previous - 0.05, previous + 0.05);
    if (!(distanceSquared(center) <= (2 * viewRadiusKm) ** 2)) {
      const coarse = 96;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < coarse; index++) {
        const anomaly = (index / coarse) * Math.PI * 2;
        const distance = distanceSquared(anomaly);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = anomaly;
        }
      }
      center = refine(best - (Math.PI * 2) / coarse, best + (Math.PI * 2) / coarse);
    }
    this.localAnomaly.set(key, center);
    if (distanceSquared(center) > (2 * viewRadiusKm) ** 2) return 0;

    // Arc length per unit anomaly is at least the semi-minor axis times the
    // projection factor; widen the window to cover the viewport generously.
    const normalZ = Math.max(0.05, Math.abs(P[0] * Q[1] - P[1] * Q[0]));
    const halfWidth = Math.min(Math.PI, (3 * viewRadiusKm) / (Math.min(a, b) * normalZ));
    const out = this.localPath;
    for (let index = 0; index < LOCAL_ARC_POINTS; index++) {
      const anomaly = center - halfWidth + (2 * halfWidth * index) / (LOCAL_ARC_POINTS - 1);
      const x = a * (Math.cos(anomaly) - e);
      const y = b * Math.sin(anomaly);
      out[index * 2] = P[0] * x + Q[0] * y;
      out[index * 2 + 1] = P[1] * x + Q[1] * y;
    }
    return LOCAL_ARC_POINTS;
  }

  /** Build the canvas path, skipping runs of off-screen points. */
  private strokePath(
    ctx: CanvasRenderingContext2D,
    points: Float64Array,
    count: number,
    closed: boolean,
    focusX: number,
    focusY: number,
    zoom: number,
    camera: Camera
  ): { buffer: Float32Array; count: number } | null {
    const buffer = this.screenBuffer(count + 1);
    const minX = -SCREEN_MARGIN;
    const minY = -SCREEN_MARGIN;
    const maxX = camera.width + SCREEN_MARGIN;
    const maxY = camera.height + SCREEN_MARGIN;

    const total = closed ? count + 1 : count;
    let anyVisible = false;
    let penDown = false;
    let previousInside = false;
    let previousX = 0;
    let previousY = 0;
    ctx.beginPath();
    for (let step = 0; step < total; step++) {
      const index = step % count;
      const x = focusX + points[index * 2] * zoom;
      const y = focusY + points[index * 2 + 1] * zoom;
      buffer[step * 2] = x;
      buffer[step * 2 + 1] = y;
      const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
      if (inside) anyVisible = true;
      if (inside || previousInside) {
        if (!penDown) {
          if (step > 0 && !previousInside) ctx.moveTo(previousX, previousY);
          else ctx.moveTo(x, y);
          penDown = true;
          if (step > 0 && !previousInside) ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      } else {
        penDown = false;
      }
      previousInside = inside;
      previousX = x;
      previousY = y;
    }
    return anyVisible ? { buffer, count: total } : null;
  }

  private screenBuffer(points: number): Float32Array {
    const slot = this.drawn.length;
    let buffer = this.screenPool[slot];
    if (!buffer || buffer.length < points * 2) {
      buffer = new Float32Array(Math.max(points * 2, 256));
      this.screenPool[slot] = buffer;
    }
    return buffer;
  }
}
