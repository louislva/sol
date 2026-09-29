/**
 * Stars as dots: color by spectral class, size by luminosity (absolute
 * magnitude) — a map of what the stars are, not how bright they look from
 * Earth. Named stars are labeled, the most luminous first.
 *
 * Like any map of a disc seen from above, the view is a slab: stars far
 * above or below the Galactic plane (relative to the size of the view) would
 * otherwise crowd in among the near ones. The slab is centered on the height
 * of whatever the view is framing (the Sun, or a followed spacecraft or
 * star): stars within SLAB_NEAR view radii of it are drawn in full; out to
 * SLAB_FAR, faintly; beyond, not at all.
 */

import { LIGHT_YEAR_KM } from "../../astro/galactic";
import type { StarPopulation } from "../../model/starPopulation";
import type { Camera } from "../camera";
import type { LabelLayer } from "./labels";
import type { PickBuffer } from "../picking";

/** Dot radius (px) for a Sun-like star, and the limits either side. */
const SUN_LIKE_RADIUS = 1.8;
const MIN_RADIUS = 1;
const MAX_RADIUS = 4.5;
/** Absolute magnitude of the Sun (V). */
const SUN_ABSOLUTE_MAGNITUDE = 4.83;
/** Unnamed stars are labeled only in views smaller than this. */
const DESIGNATION_LABEL_VIEW_RADIUS_KM = 25 * LIGHT_YEAR_KM;
const SLAB_NEAR = 0.75;
const SLAB_FAR = 1.5;
const FAR_ALPHA = 0.35;
/**
 * Dot scale by view radius, interpolated in log space: larger among a few
 * neighbors, smaller (at least MIN_DISTANT_RADIUS px) where thousands of
 * stars should read as a cloud.
 */
const DOT_SCALE: Array<[number, number]> = [
  [10 * LIGHT_YEAR_KM, 1.8],
  [100 * LIGHT_YEAR_KM, 1],
  [3_000 * LIGHT_YEAR_KM, 0.4],
];
const MIN_DISTANT_RADIUS = 0.6;

function dotScale(viewRadius: number): number {
  if (viewRadius <= DOT_SCALE[0][0]) return DOT_SCALE[0][1];
  for (let index = 1; index < DOT_SCALE.length; index++) {
    const [r1, s1] = DOT_SCALE[index];
    if (viewRadius <= r1) {
      const [r0, s0] = DOT_SCALE[index - 1];
      return s0 + ((s1 - s0) * Math.log(viewRadius / r0)) / Math.log(r1 / r0);
    }
  }
  return DOT_SCALE[DOT_SCALE.length - 1][1];
}
/** Label priorities sort after the solar system's bodies. */
const LABEL_PRIORITY_BASE = 1e9;

export class StarLayer {
  private radii: Float32Array | null = null;

  /** Dot radius per star: grows with luminosity, as the sixth root (L ∝ 10^(−0.4 M)). */
  private radiiFor(stars: StarPopulation): Float32Array {
    if (this.radii?.length === stars.count) return this.radii;
    const radii = new Float32Array(stars.count);
    for (let index = 0; index < stars.count; index++) {
      const magnitude = stars.absoluteMagnitude[index];
      const radius = Number.isNaN(magnitude)
        ? MIN_RADIUS
        : SUN_LIKE_RADIUS * 10 ** (-0.4 * (magnitude - SUN_ABSOLUTE_MAGNITUDE) / 6);
      radii[index] = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius));
    }
    this.radii = radii;
    return radii;
  }

  /**
   * @param sliceZ height (km, display frame) the slab is centered on
   * @param highlight index drawn emphasized (hovered/selected), or −1
   */
  draw(
    ctx: CanvasRenderingContext2D,
    stars: StarPopulation,
    camera: Camera,
    t: number,
    picks: PickBuffer,
    labels: LabelLayer,
    sliceZ: number,
    highlight: number,
    alpha: number
  ): void {
    stars.update(t);
    const radii = this.radiiFor(stars);
    const { x: xs, y: ys, z: zs } = stars;
    const near = SLAB_NEAR * camera.viewRadius;
    const far = SLAB_FAR * camera.viewRadius;
    const zoom = camera.zoom;
    const offsetX = camera.width / 2 - camera.centerX * zoom;
    const offsetY = camera.height / 2 - camera.centerY * zoom;
    const width = camera.width;
    const viewHeight = camera.height;
    const labelDesignations = camera.viewRadius < DESIGNATION_LABEL_VIEW_RADIUS_KM;
    const scale = dotScale(camera.viewRadius);

    const nearPaths = stars.colors.map(() => new Path2D());
    const farPaths = stars.colors.map(() => new Path2D());
    for (let index = 0; index < stars.count; index++) {
      const height = Math.abs(zs[index] - sliceZ);
      if (height > far) continue;
      const x = xs[index] * zoom + offsetX;
      const y = ys[index] * zoom + offsetY;
      const radius = Math.max(Math.min(radii[index], MIN_DISTANT_RADIUS), radii[index] * scale);
      if (x < -radius || x > width + radius || y < -radius || y > viewHeight + radius) continue;
      const inSlab = height <= near;
      const path = (inSlab ? nearPaths : farPaths)[stars.colorIndex[index]];
      path.moveTo(x + radius, y);
      path.arc(x, y, radius, 0, Math.PI * 2);
      if (!inSlab) continue;
      picks.addDot("star", index, x, y);
      if (stars.iauNames[index] || labelDesignations) {
        // Luminous and named stars first.
        const priority = LABEL_PRIORITY_BASE - radius * 1e6 + (stars.iauNames[index] ? 0 : 1e7) + index;
        labels.add(stars.names[index], x, y + radius + 3, priority, alpha);
      }
    }
    stars.colors.forEach((color, colorIndex) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * FAR_ALPHA;
      ctx.fill(farPaths[colorIndex]);
      ctx.globalAlpha = alpha;
      ctx.fill(nearPaths[colorIndex]);
    });

    if (highlight >= 0) {
      const x = xs[highlight] * zoom + offsetX;
      const y = ys[highlight] * zoom + offsetY;
      ctx.strokeStyle = stars.colorOf(highlight);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radii[highlight] + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
