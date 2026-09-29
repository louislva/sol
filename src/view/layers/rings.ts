/**
 * Planetary rings, drawn as one fill of a cached radial gradient.
 *
 * The gradient is built once per ring system in kilometres; each frame the
 * canvas transform maps it to the screen, projecting the ring plane (the
 * planet's equator, from its IAU pole) onto the ecliptic — so rings appear
 * as the ellipse you would see looking down on the solar system.
 */

import { DAYS_PER_CENTURY, J2000 } from "../../astro/constants";
import { poleToEcliptic } from "../../astro/rotation";
import type { Body, Ring } from "../../model/body";

/** Rings fade in as the planet's disc grows from 30 to 35 px in radius. */
const FADE_START_PX = 30;
const FADE_END_PX = 35;
const TEXTURE_SAMPLES_PER_RING = 48;

export class RingRenderer {
  private readonly gradients = new Map<Body, { gradient: CanvasGradient; outer: number }>();

  draw(
    ctx: CanvasRenderingContext2D,
    body: Body,
    screenX: number,
    screenY: number,
    zoom: number,
    opacity: number,
    t: number,
    viewWidth: number,
    viewHeight: number
  ): void {
    const rings = body.rings;
    if (!rings || !body.radius || !body.orientation) return;
    const planetPx = body.radius * zoom;
    if (planetPx < FADE_START_PX) return;
    const fade = Math.min(1, (planetPx - FADE_START_PX) / (FADE_END_PX - FADE_START_PX));

    // Skip when the viewport lies wholly outside the ring system or wholly
    // inside the planet's disc.
    const halfDiagonal = Math.hypot(viewWidth, viewHeight) / 2;
    const toView = Math.hypot(viewWidth / 2 - screenX, viewHeight / 2 - screenY);
    const outerPx = Math.max(...rings.map((ring) => ring.outerRadius)) * zoom;
    if (toView - halfDiagonal > outerPx || toView + halfDiagonal < planetPx) return;

    let entry = this.gradients.get(body);
    if (!entry) {
      entry = buildGradient(ctx, rings);
      this.gradients.set(body, entry);
    }

    const centuries = (t - J2000) / DAYS_PER_CENTURY;
    const { poleRa, poleDec } = body.orientation;
    const [nx, ny, nz] = poleToEcliptic(poleRa[0] + poleRa[1] * centuries, poleDec[0] + poleDec[1] * centuries);
    const horizontal = Math.hypot(nx, ny);
    // u: in the ring plane and the ecliptic (full length); v: foreshortened by |nz|.
    const [vx, vy] = horizontal > 1e-9 ? [nx / horizontal, ny / horizontal] : [0, 1];
    const [ux, uy] = [-vy, vx];
    const squash = Math.abs(nz);

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.transform(ux * zoom, uy * zoom, vx * zoom * squash, vy * zoom * squash, 0, 0);
    ctx.globalAlpha = opacity * fade;
    ctx.fillStyle = entry.gradient;
    ctx.beginPath();
    ctx.arc(0, 0, entry.outer, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}

/** Density ripple within a ring, so wide rings read as dusty rather than flat. */
function texture(fraction: number): number {
  const ripple = Math.sin(fraction * 31.4) * 0.08 + Math.sin(fraction * 71.2) * 0.06 + Math.sin(fraction * 17.9) * 0.04;
  const edgeFade = Math.min(fraction * 5, (1 - fraction) * 5, 1);
  return Math.max(0, (0.92 + ripple) * edgeFade);
}

/** Later rings in the list override earlier ones where they overlap (gaps). */
function ringAt(rings: readonly Ring[], radius: number): Ring | null {
  for (let index = rings.length - 1; index >= 0; index--) {
    const ring = rings[index];
    if (radius >= ring.innerRadius && radius < ring.outerRadius) return ring;
  }
  return null;
}

function buildGradient(ctx: CanvasRenderingContext2D, rings: readonly Ring[]): { gradient: CanvasGradient; outer: number } {
  const outer = Math.max(...rings.map((ring) => ring.outerRadius));
  const breakpoints = new Set<number>();
  for (const ring of rings) {
    breakpoints.add(ring.innerRadius);
    breakpoints.add(ring.outerRadius);
    for (let step = 1; step < TEXTURE_SAMPLES_PER_RING; step++) {
      breakpoints.add(ring.innerRadius + ((ring.outerRadius - ring.innerRadius) * step) / TEXTURE_SAMPLES_PER_RING);
    }
  }
  const radii = [...breakpoints].sort((a, b) => a - b);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
  const epsilon = 1e-6;
  const stop = (radius: number, ring: Ring | null) => {
    const offset = Math.min(1, Math.max(0, radius / outer));
    if (!ring || ring.opacity === 0) {
      gradient.addColorStop(offset, "rgba(0,0,0,0)");
      return;
    }
    const [r, g, b] = hexToRgb(ring.color);
    const fraction = (radius - ring.innerRadius) / (ring.outerRadius - ring.innerRadius);
    const alpha = Math.min(1, ring.opacity * texture(Math.min(1, Math.max(0, fraction))));
    gradient.addColorStop(offset, `rgba(${r},${g},${b},${alpha.toFixed(4)})`);
  };

  // Each interval between breakpoints belongs to one ring (or none); stops
  // just inside both ends keep the boundaries sharp.
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  for (let index = 0; index < radii.length - 1; index++) {
    const start = radii[index];
    const end = radii[index + 1];
    const ring = ringAt(rings, (start + end) / 2);
    stop(start + epsilon * outer, ring);
    stop(end - epsilon * outer, ring);
  }
  return { gradient, outer };
}
