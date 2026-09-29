/**
 * Draws one frame: asteroid cloud, orbits, constellation shells, bodies and
 * rings, satellites, labels, and the scale bar — and records what was drawn
 * for hit testing.
 */

import { type Body, type BodyKind, existsAt, orbitAt, segmentAt, visibleParentAt } from "../model/body";
import { sameTarget, type Target, type World } from "../model/world";
import type { Camera } from "./camera";
import { drawSpacecraftIcon } from "./layers/icons";
import { LabelLayer } from "./layers/labels";
import { OrbitLayer } from "./layers/orbits";
import {
  drawAsteroids,
  drawConstellationBands,
  drawSatellites,
  satelliteDetailVisible,
} from "./layers/populations";
import { RingRenderer } from "./layers/rings";
import { drawScaleBar } from "./layers/scaleBar";
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
};

const BACKGROUND = "#000000";
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
/** Discs larger than this (px) are drawn as the part that crosses the viewport. */
const LARGE_DISC_PX = 20_000;
const SOL_FADE_MS = 300;

export interface ViewState {
  hovered: Target | null;
  selected: Target | null;
  /** Filter for bodies the user chose to hide (moon detail level). */
  isShown: (body: Body) => boolean;
}

export class Renderer {
  readonly picks = new PickBuffer();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly orbits = new OrbitLayer();
  private readonly rings = new RingRenderer();
  private readonly labels = new LabelLayer();
  private readonly brightened = new Map<string, string>();
  private readonly bodyTargets: Target[];

  // Per-body projection for the current frame, indexed by body.index.
  private readonly screenX: Float64Array;
  private readonly screenY: Float64Array;
  private readonly radiusPx: Float32Array;
  private readonly opacity: Float32Array;
  private readonly projected: Uint8Array;

  private solLabelOpacity = 1;
  private lastFrameMs = performance.now();

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
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
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(camera.pixelRatio, 0, 0, camera.pixelRatio, 0, 0);

    this.picks.clear();
    this.orbits.beginFrame();
    profiler.measure("project", () => this.project(world, camera, state));

    if (world.asteroids) {
      const asteroids = world.asteroids;
      profiler.measure("asteroids", () => drawAsteroids(ctx, asteroids, camera, world.time, this.picks));
    }
    profiler.measure("orbits", () => this.drawOrbits(world, camera, state));

    const earth = world.earth;
    const showSatellites = world.satellites !== null
      && this.projected[earth.index] === 1
      && satelliteDetailVisible(camera);
    if (showSatellites) {
      drawConstellationBands(ctx, world.satellites!, camera, this.screenX[earth.index], this.screenY[earth.index]);
    }

    profiler.measure("bodies", () => this.drawBodies(world, camera, state, frameMs));

    if (showSatellites) {
      const highlight = [state.hovered, state.selected].find((target) => target?.type === "satellite");
      profiler.measure("satellites", () => drawSatellites(
        ctx,
        world.satellites!,
        camera,
        world.time,
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
  private project(world: World, camera: Camera, state: ViewState): void {
    const t = world.time;
    const zoom = camera.zoom;
    const eph = world.ephemeris;
    const { width, height } = camera;
    this.projected.fill(0);

    for (const body of world.bodies) {
      const index = body.index;
      if (body.kind === "barycenter" || !state.isShown(body) || !existsAt(body, t)) continue;

      const parent = visibleParentAt(body, t);
      const parentShown = parent !== null && this.projected[parent.index] === 1;
      const parentRadius = parentShown ? this.radiusPx[parent.index] : 0;
      // A body is never more visible than its parent: the moons of a planet
      // hidden in the Sun's disc are hidden too.
      if (parentShown && this.opacity[parent.index] === 0) continue;

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
      const radius = Math.max((body.radius ?? 0) * zoom, MIN_RADIUS_PX[body.kind]);
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
          if (behind && distance < parentTrueRadius) opacity = 0;
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
          drawSpacecraftIcon(ctx, body.mission?.icon ?? "probe", x, y, radius, color);
        } else {
          ctx.fillStyle = color;
          traceDisc(ctx, x, y, radius, camera.width, camera.height);
          ctx.fill();
          if (body.kind !== "star" && radius < LARGE_DISC_PX) {
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

      // Label bodies drawn near their minimum size; larger discs speak for themselves.
      if (radius <= MIN_RADIUS_PX[body.kind] * 1.5 || hovered || selected) {
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

  private labelAlpha(body: Body, x: number, y: number, t: number): number {
    const parent = visibleParentAt(body, t);
    if (!parent || !this.projected[parent.index]) return 1;
    const gap = Math.hypot(x - this.screenX[parent.index], y - this.screenY[parent.index]) - this.radiusPx[parent.index];
    return Math.max(0, Math.min(1, (gap - LABEL_FADE_END_PX) / (LABEL_FADE_START_PX - LABEL_FADE_END_PX)));
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
