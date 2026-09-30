/**
 * Draws one frame: the Galaxy and the stars, the asteroid cloud, orbits,
 * bodies and rings, satellites, labels, and the scale bar — and records what
 * was drawn for hit testing.
 */

import { AU_KM } from "../astro/constants";
import { LIGHT_YEAR_KM, PARSEC_KM, patternAngle } from "../astro/galactic";
import { bodyFixedToEcliptic } from "../astro/orientation";
import { type Body, type BodyKind, existsAt, orbitAt, segmentAt, visibleParentAt } from "../model/body";
import { sameTarget, type Target, type World } from "../model/world";
import type { Camera } from "./camera";
import { GalaxyGl } from "./galaxy/galaxyGl";
import { sampleGalaxy } from "./galaxy/syntheticGalaxy";
import { BLACK_HOLE_RIM_COLOR } from "../data/palette";
import { drawSpacecraftIcon, drawStickFigure } from "./layers/icons";
import { LabelLayer } from "./layers/labels";
import { OrbitLayer } from "./layers/orbits";
import {
  drawAsteroids,
  drawSatellites,
  satelliteDetailVisible,
} from "./layers/populations";
import { RingRenderer } from "./layers/rings";
import { drawScaleBar } from "./layers/scaleBar";
import { StarLayer } from "./layers/stars";
import { TrailLayer } from "./layers/trails";
import { PickBuffer } from "./picking";
import { profiler } from "./profiler";

/** Smallest on-screen radius (px) per kind; bodies are true-scale above it. */
const MIN_RADIUS_PX: Record<BodyKind, number> = {
  star: 20,
  planet: 4,
  dwarf: 3,
  moon: 3,
  asteroid: 2,
  comet: 2,
  spacecraft: 8,
  barycenter: 0,
  blackHole: 5,
};

const ORBIT_ALPHA = 0.35;
const ORBIT_LINE_WIDTH = 2;
/** Fade width (px) for bodies disappearing into a parent drawn at its minimum size. */
const PARENT_FADE_PX = { star: 16, other: 4 };
/** Labels fade out between these distances (px) from the parent's edge. */
const LABEL_FADE_START_PX = 44;
const LABEL_FADE_END_PX = 20;
/** Bodies within this margin (px) of the viewport are still processed. */
const CULL_MARGIN_PX = 50;
const SOL_LABEL_ZOOM = 0.0019;
const TRAIL_ALPHA = 0.6;
/** Named asteroids are labelled only in views smaller than this (km). */
const ASTEROID_LABEL_VIEW_RADIUS_KM = 0.3 * 149_597_870.7;
/** Opacity of a spacecraft behind the body it is next to (or standing on). */
const SEEN_THROUGH_ALPHA = 0.35;
/** Landed spacecraft get a figure once the body they stand on is this large (px radius). */
const FIGURE_MIN_BODY_PX = 30;
/** Discs larger than this (px) are drawn as the part that crosses the viewport. */
const LARGE_DISC_PX = 20_000;
const SOL_FADE_MS = 300;
/**
 * Far out, the Sun shrinks from its 20 px minimum toward a star's dot: it
 * starts below the zoom at which 2,000 AU spans 500 px, as the square root
 * of the zoom.
 */
const SUN_SHRINK_ZOOM = 500 / (2_000 * AU_KM);
const SUN_FAR_RADIUS_PX = 2.5;
/** The synthetic Galaxy fades in between these view radii… */
const GALAXY_FADE = [3_000 * LIGHT_YEAR_KM, 12_000 * LIGHT_YEAR_KM];
/** …and thins out within this distance of the Sun, where the real stars are. */
const GALAXY_GAP = [1_500 * LIGHT_YEAR_KM, 4_000 * LIGHT_YEAR_KM];

export interface ViewState {
  hovered: Target | null;
  selected: Target | null;
  followed: Target | null;
  /** The body whose frame spacecraft trails are drawn in. */
  trailFrame: Target;
}

export class Renderer {
  readonly picks = new PickBuffer();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly orbits = new OrbitLayer();
  private readonly rings = new RingRenderer();
  private readonly labels = new LabelLayer();
  private readonly trails = new TrailLayer();
  private readonly galaxy: GalaxyGl;
  private galaxySampled = false;
  private readonly centerScratch = new Float64Array(3);
  private readonly stars = new StarLayer();
  private readonly brightened = new Map<string, string>();
  private readonly bodyTargets: Target[];

  // Per-body projection for the current frame, indexed by body.index.
  private readonly screenX: Float64Array;
  private readonly screenY: Float64Array;
  private readonly radiusPx: Float32Array;
  private readonly opacity: Float32Array;
  private readonly projected: Uint8Array;

  private readonly frameScratch = new Float64Array(3);
  private solLabelOpacity = 1;
  private lastFrameMs = performance.now();

  constructor(canvas: HTMLCanvasElement, world: World) {
    // Transparent: the synthetic Galaxy's WebGL canvas shows through from behind.
    this.ctx = canvas.getContext("2d")!;
    this.galaxy = new GalaxyGl(canvas);
    const count = world.bodies.length;
    this.screenX = new Float64Array(count);
    this.screenY = new Float64Array(count);
    this.radiusPx = new Float32Array(count);
    this.opacity = new Float32Array(count);
    this.projected = new Uint8Array(count);
    this.bodyTargets = world.bodies.map((body) => ({ type: "body", body }));
  }

  render(world: World, camera: Camera, state: ViewState): void {
    const ctx = this.ctx;
    const now = performance.now();
    const frameMs = now - this.lastFrameMs;
    this.lastFrameMs = now;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(camera.pixelRatio, 0, 0, camera.pixelRatio, 0, 0);

    this.picks.clear();
    this.orbits.beginFrame();
    profiler.measure("project", () => this.project(world, camera));

    const galaxyAlpha = fade(camera.viewRadius, GALAXY_FADE[0], GALAXY_FADE[1]);
    profiler.measure("galaxy", () => this.drawGalaxy(world, camera, galaxyAlpha));
    if (world.stars && this.viewReachesStars(world, camera)) {
      const stars = world.stars;
      const highlight = [state.hovered, state.selected].find((target) => target?.type === "star");
      world.positionAt(state.followed ?? state.trailFrame, world.time, this.frameScratch);
      const sliceZ = this.frameScratch[2];
      profiler.measure("stars", () => this.stars.draw(
        ctx, stars, camera, world.time, this.picks, this.labels, sliceZ, highlight?.type === "star" ? highlight.index : -1,
        // Soften into the synthetic Galaxy's texture at galactic scale.
        1 - 0.45 * galaxyAlpha
      ));
    }

    if (world.asteroids) {
      const asteroids = world.asteroids;
      profiler.measure("asteroids", () => drawAsteroids(ctx, asteroids, camera, world.time, this.picks));
    }
    profiler.measure("orbits", () => this.drawOrbits(world, camera, state));
    profiler.measure("trails", () => this.drawTrails(world, camera, state));

    const earth = world.earth;
    const showSatellites = world.satellites !== null
      && world.satellites.validAt(world.time)
      && this.projected[earth.index] === 1
      && satelliteDetailVisible(camera);
    profiler.measure("bodies", () => this.drawBodies(world, camera, state, frameMs));

    if (showSatellites) {
      const highlight = [state.hovered, state.selected].find((target) => target?.type === "satellite");
      const satellites = world.satellites!;
      profiler.measure("satellite motion", () => satellites.update(world.time, camera.zoom));
      profiler.measure("satellites", () => drawSatellites(
        ctx,
        satellites,
        camera,
        this.screenX[earth.index],
        this.screenY[earth.index],
        (earth.radius ?? 0) * camera.zoom,
        this.picks,
        highlight?.type === "satellite" ? highlight.index : -1
      ));
    }

    this.addPopulationLabels(world, camera, state);
    profiler.measure("labels", () => this.labels.draw(ctx, camera.width, camera.height));
    this.picks.setOrbits(this.orbits.drawn);
    drawScaleBar(ctx, camera.zoom, camera.width, camera.height);
  }

  /** Screen position, displayed size, and occlusion for every shown body. */
  private project(world: World, camera: Camera): void {
    const t = world.time;
    const zoom = camera.zoom;
    const eph = world.ephemeris;
    const { width, height } = camera;
    this.projected.fill(0);

    for (const body of world.bodies) {
      const index = body.index;
      if (body.kind === "barycenter" || !existsAt(body, t)) continue;

      const parent = visibleParentAt(body, t);
      // A body is never more visible than its parent: the moons (and
      // orbiters) of a planet hidden in the Sun's disc, or skipped as too
      // small to matter, are hidden too. Parents come before children.
      if (parent && (!this.projected[parent.index] || this.opacity[parent.index] === 0)) continue;
      const parentShown = parent !== null;
      const parentRadius = parentShown ? this.radiusPx[parent.index] : 0;

      // Level of detail: a satellite system entirely inside its parent's
      // disc, or entirely off screen, needs no propagation at all.
      const orbit = orbitAt(segmentAt(body, t).motion, t);
      if (parentShown && orbit?.isClosed) {
        const reach = orbit.apoapsis * zoom;
        if (reach < parentRadius) continue;
        const px = this.screenX[parent.index];
        const py = this.screenY[parent.index];
        if (px < -reach - CULL_MARGIN_PX || px > width + reach + CULL_MARGIN_PX
          || py < -reach - CULL_MARGIN_PX || py > height + reach + CULL_MARGIN_PX) continue;
      }

      const offset = eph.resolve(body);
      const x = camera.worldToScreenX(eph.positions[offset]);
      const y = camera.worldToScreenY(eph.positions[offset + 1]);
      const radius = Math.max((body.radius ?? 0) * zoom, minRadiusPx(body.kind, zoom));
      this.screenX[index] = x;
      this.screenY[index] = y;
      this.radiusPx[index] = radius;

      let opacity = 1;
      if (parent && parentShown) {
        const distance = Math.hypot(x - this.screenX[parent.index], y - this.screenY[parent.index]);
        const parentTrueRadius = (parent.radius ?? 0) * zoom;
        if (parentTrueRadius >= MIN_RADIUS_PX[parent.kind]) {
          // Resolved disc: hidden only while actually behind the parent.
          const behind = eph.positions[offset + 2] < eph.positions[parent.index * 3 + 2];
          // Spacecraft stay faintly visible through the body, so a lander on
          // the far side can still be found.
          if (behind && distance < parentTrueRadius) opacity = body.kind === "spacecraft" ? SEEN_THROUGH_ALPHA : 0;
        } else {
          // Parent drawn at its minimum size: fade out as the body disappears into it.
          const fade = parent.kind === "star" ? PARENT_FADE_PX.star : PARENT_FADE_PX.other;
          opacity = Math.max(0, Math.min(1, (distance - parentRadius) / fade));
        }
      }
      this.opacity[index] = parentShown ? Math.min(opacity, this.opacity[parent.index]) : opacity;
      this.projected[index] = 1;
    }
  }

  private drawOrbits(world: World, camera: Camera, state: ViewState): void {
    const ctx = this.ctx;
    const t = world.time;
    ctx.lineWidth = ORBIT_LINE_WIDTH;
    for (const body of world.bodies) {
      if (body.orbitVisibility === "never" || !this.projected[body.index]) continue;
      const focused = this.isFocused(body, state);
      if (body.orbitVisibility === "focus" && !focused) continue;

      const source = body.orbitSource ?? body;
      const orbit = orbitAt(segmentAt(source, t).motion, t);
      let fade = 1;
      const parent = visibleParentAt(body, t);
      if (orbit?.isClosed && parent && this.projected[parent.index]) {
        // An orbit smaller than the parent's disc carries no information.
        const reach = orbit.apoapsis * camera.zoom;
        fade = Math.max(0, Math.min(1, (reach - this.radiusPx[parent.index] - 2) / 10));
      }
      if (fade <= 0) continue;
      const alpha = Math.min(1, ORBIT_ALPHA * fade * (focused ? 2 : 1));
      this.orbits.draw(ctx, world, camera, body, alpha);
    }
    ctx.globalAlpha = 1;
  }

  /** Flown paths of the spacecraft being looked at. */
  private drawTrails(world: World, camera: Camera, state: ViewState): void {
    const shown = new Set<Body>();
    for (const target of [state.followed, state.selected, state.hovered]) {
      if (target?.type !== "body" || target.body.kind !== "spacecraft" || shown.has(target.body)) continue;
      if (!this.projected[target.body.index]) continue;
      shown.add(target.body);
      this.trails.draw(this.ctx, world, camera, target.body, state.trailFrame, TRAIL_ALPHA);
    }
    this.trails.retain(shown);
  }

  private drawBodies(world: World, camera: Camera, state: ViewState, frameMs: number): void {
    const ctx = this.ctx;
    const t = world.time;
    for (const body of world.bodies) {
      const index = body.index;
      if (!this.projected[index]) continue;
      const opacity = this.opacity[index];
      const x = this.screenX[index];
      const y = this.screenY[index];
      const radius = this.radiusPx[index];
      if (x < -radius - CULL_MARGIN_PX || x > camera.width + radius + CULL_MARGIN_PX
        || y < -radius - CULL_MARGIN_PX || y > camera.height + radius + CULL_MARGIN_PX) continue;

      const hovered = sameTarget(state.hovered, this.bodyTargets[index]);
      const selected = sameTarget(state.selected, this.bodyTargets[index]);
      if (opacity > 0) {
        const color = hovered || selected ? this.brighten(body.color) : body.color;
        ctx.globalAlpha = opacity;
        if (body.kind === "spacecraft") {
          const segment = segmentAt(body, t);
          const ground = segment.motion.kind === "surface" ? segment.parent : null;
          if (ground && this.projected[ground.index] && (ground.radius ?? 0) * camera.zoom >= FIGURE_MIN_BODY_PX) {
            this.drawLanded(ground, x, y, color);
          } else {
            drawSpacecraftIcon(ctx, body.mission?.icon ?? "probe", x, y, radius, color);
          }
        } else {
          ctx.fillStyle = color;
          if (!body.radii || !this.traceEllipsoid(body, x, y, camera.zoom, t)) {
            traceDisc(ctx, x, y, radius, camera.width, camera.height);
          }
          ctx.fill();
          if (body.kind === "blackHole") {
            ctx.strokeStyle = BLACK_HOLE_RIM_COLOR;
            ctx.lineWidth = 1;
            ctx.stroke();
          } else if (body.kind !== "star" && radius < LARGE_DISC_PX) {
            ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
        if (body.rings) this.rings.draw(ctx, body, x, y, camera.zoom, opacity, t, camera.width, camera.height);
        if (selected && radius < LARGE_DISC_PX) {
          ctx.strokeStyle = body.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (opacity > 0.2) this.picks.addBody(this.bodyTargets[index], x, y, radius);
      }

      if (body.kind === "star") this.drawSolLabel(camera, x, y, radius, frameMs);

      // Label bodies drawn near their minimum size (larger discs speak for
      // themselves). Individual asteroids only get one close up.
      const labelled = hovered || selected || (radius <= MIN_RADIUS_PX[body.kind] * 1.5
        && (body.kind !== "asteroid" || camera.viewRadius < ASTEROID_LABEL_VIEW_RADIUS_KM));
      if (labelled) {
        this.labels.add(
          body.name,
          x,
          y + radius + 4,
          hovered || selected ? -1 : body.labelPriority * 1e7 - (body.radius ?? 0),
          this.labelAlpha(body, x, y, t) * (opacity > 0 ? 1 : 0)
        );
      }
    }
  }

  /**
   * Silhouette of a triaxial body: the orthographic projection of its
   * ellipsoid, turning with the body. Returns false when too small to matter.
   */
  private traceEllipsoid(body: Body, x: number, y: number, zoom: number, t: number): boolean {
    const [a, b, c] = body.radii!;
    if (Math.max(a, b, c) * zoom < 3 || Math.max(a, b, c) * zoom > LARGE_DISC_PX) return false;
    const m = bodyFixedToEcliptic(body.orientation!, t);
    // Projected shape matrix: the xy block of M·diag(a², b², c²)·Mᵀ.
    const d = [a * a, b * b, c * c];
    const p = m[0] * m[0] * d[0] + m[1] * m[1] * d[1] + m[2] * m[2] * d[2];
    const q = m[0] * m[3] * d[0] + m[1] * m[4] * d[1] + m[2] * m[5] * d[2];
    const r = m[3] * m[3] * d[0] + m[4] * m[4] * d[1] + m[5] * m[5] * d[2];
    const mean = (p + r) / 2;
    const spread = Math.hypot((p - r) / 2, q);
    const major = Math.sqrt(mean + spread) * zoom;
    const minor = Math.sqrt(Math.max(0, mean - spread)) * zoom;
    const angle = 0.5 * Math.atan2(2 * q, p - r);
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, Math.max(major, MIN_RADIUS_PX[body.kind]), Math.max(minor, MIN_RADIUS_PX[body.kind]), angle, 0, Math.PI * 2);
    return true;
  }

  /**
   * A landed spacecraft on a resolved body: the lander with a little figure
   * standing beside it, "up" pointing away from the body's center.
   */
  private drawLanded(ground: Body, x: number, y: number, color: string): void {
    const centerX = this.screenX[ground.index];
    const centerY = this.screenY[ground.index];
    const offset = Math.hypot(x - centerX, y - centerY);
    // Near the limb, "up" is away from the body; across the disc it points at
    // the viewer, so the figure simply stands upright.
    const up = offset > 0.7 * this.radiusPx[ground.index] ? Math.atan2(y - centerY, x - centerX) : -Math.PI / 2;
    const side = up + Math.PI / 2;
    drawSpacecraftIcon(this.ctx, "lander", x, y, 6, color);
    drawStickFigure(this.ctx, x + Math.cos(side) * 9, y + Math.sin(side) * 9, up, 16, "#ffffff");
  }

  private labelAlpha(body: Body, x: number, y: number, t: number): number {
    // A landed spacecraft is meant to be seen on its body.
    if (segmentAt(body, t).motion.kind === "surface") return 1;
    const parent = visibleParentAt(body, t);
    if (!parent || !this.projected[parent.index]) return 1;
    const gap = Math.hypot(x - this.screenX[parent.index], y - this.screenY[parent.index]) - this.radiusPx[parent.index];
    return Math.max(0, Math.min(1, (gap - LABEL_FADE_END_PX) / (LABEL_FADE_START_PX - LABEL_FADE_END_PX)));
  }

  /** The synthetic Milky Way (WebGL, behind this canvas); sampled the first time it is needed. */
  private drawGalaxy(world: World, camera: Camera, alpha: number): void {
    if (alpha <= 0 || !this.galaxy.available) {
      this.galaxy.clear();
      return;
    }
    if (!this.galaxySampled) {
      this.galaxy.setStars(sampleGalaxy(world.galaxy));
      this.galaxySampled = true;
    }
    world.galacticCenter(this.centerScratch);
    this.galaxy.draw({
      centerX: camera.worldToScreenX(this.centerScratch[0]),
      centerY: camera.worldToScreenY(this.centerScratch[1]),
      scale: 1000 * PARSEC_KM * camera.zoom,
      armAngle: patternAngle(world.galaxy.patternSpeeds.arms, world.time),
      barAngle: patternAngle(world.galaxy.patternSpeeds.bar, world.time),
      width: camera.width,
      height: camera.height,
      pixelRatio: camera.pixelRatio,
      alpha,
      sunX: camera.worldToScreenX(0),
      sunY: camera.worldToScreenY(0),
      gapInner: GALAXY_GAP[0] * camera.zoom,
      gapOuter: GALAXY_GAP[1] * camera.zoom,
    });
  }

  /** Could any star be in view? The nearest is light-years away; skip them all until then. */
  private viewReachesStars(world: World, camera: Camera): boolean {
    const stars = world.stars!;
    stars.update(world.time);
    const farthest = Math.hypot(camera.centerX, camera.centerY) + camera.viewRadius;
    return farthest >= stars.nearestProjectedDistance;
  }

  /** Labels for a hovered or selected asteroid or satellite. */
  private addPopulationLabels(world: World, camera: Camera, state: ViewState): void {
    const position = [0, 0, 0];
    for (const target of [state.hovered, state.selected]) {
      if (!target || target.type === "body") continue;
      world.position(target, position);
      this.labels.add(world.name(target), camera.worldToScreenX(position[0]), camera.worldToScreenY(position[1]) + 8, -1);
    }
  }

  /** "SOL" and a zoom hint on the Sun's face while it fills the view at startup scale. */
  private drawSolLabel(camera: Camera, x: number, y: number, radius: number, frameMs: number): void {
    const target = camera.zoom >= SOL_LABEL_ZOOM ? 1 : 0;
    const step = frameMs / SOL_FADE_MS;
    this.solLabelOpacity = target > this.solLabelOpacity
      ? Math.min(target, this.solLabelOpacity + step)
      : Math.max(target, this.solLabelOpacity - step);
    if (this.solLabelOpacity <= 0.01) return;

    const ctx = this.ctx;
    const fontSize = Math.max(radius * 0.18, 14);
    ctx.globalAlpha = this.solLabelOpacity;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.font = `bold ${fontSize}px "Space Mono", monospace`;
    ctx.textBaseline = "bottom";
    ctx.fillText("SOL", x, y);
    ctx.font = `${Math.max(fontSize * 0.4, 9)}px "Space Mono", monospace`;
    ctx.textBaseline = "top";
    ctx.fillText("scroll to zoom out 🔍", x, y + 4);
    ctx.globalAlpha = 1;
  }

  private isFocused(body: Body, state: ViewState): boolean {
    const target = this.bodyTargets[body.index];
    return sameTarget(state.hovered, target) || sameTarget(state.selected, target);
  }

  /** Blend 40% toward white, for hover/selection emphasis. */
  private brighten(hex: string): string {
    let result = this.brightened.get(hex);
    if (!result) {
      const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
      result = `#${channels.map((value) => Math.round(value + (255 - value) * 0.4).toString(16).padStart(2, "0")).join("")}`;
      this.brightened.set(hex, result);
    }
    return result;
  }
}

/** Smallest on-screen radius for a body of this kind at this zoom. */
function minRadiusPx(kind: BodyKind, zoom: number): number {
  const base = MIN_RADIUS_PX[kind];
  if (kind !== "star" || zoom >= SUN_SHRINK_ZOOM) return base;
  return Math.max(SUN_FAR_RADIUS_PX, base * Math.sqrt(zoom / SUN_SHRINK_ZOOM));
}

/** 0 below `from`, 1 above `to`, linear in log space between. */
function fade(value: number, from: number, to: number): number {
  return Math.max(0, Math.min(1, Math.log(value / from) / Math.log(to / from)));
}

/**
 * Path for a filled disc. Very large discs (a planet filling the screen at
 * close zoom) are traced as just the wedge of the rim that crosses the
 * viewport, computed in double precision, instead of an arc with a radius of
 * millions of pixels.
 */
function traceDisc(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, width: number, height: number): void {
  ctx.beginPath();
  if (radius < LARGE_DISC_PX) {
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    return;
  }
  const viewX = width / 2;
  const viewY = height / 2;
  const toView = Math.hypot(viewX - x, viewY - y);
  const halfDiagonal = Math.hypot(width, height) / 2;
  if (toView + halfDiagonal <= radius) {
    ctx.rect(0, 0, width, height); // the viewport is entirely inside the disc
    return;
  }
  // Wedge from the center through the rim, wide enough to cover the viewport.
  const direction = Math.atan2(viewY - y, viewX - x);
  const spread = Math.min(Math.PI, (2 * halfDiagonal) / radius + 0.01);
  const steps = 96;
  ctx.moveTo(x, y);
  for (let step = 0; step <= steps; step++) {
    const angle = direction - spread + (2 * spread * step) / steps;
    ctx.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
  }
  ctx.closePath();
}
