/**
 * Automatic choice of the camera's reference frame.
 *
 * The frame is the deepest object whose region of dominance contains the
 * view center, provided the view is not much larger than that region:
 *   - bodies, through the hierarchy (Sun → planet → moon): a body's region
 *     is its Hill sphere widened to cover its moons, or for Sagittarius A*
 *     its sphere of influence. Zoomed in on the ISS, the frame is Earth;
 *     framing the Galilean moons, Jupiter; the inner planets, the Sun.
 *   - out among the stars, the nearest star, whose region is STAR_REGION_KM:
 *     zoom in on Proxima and the view moves with Proxima, however fast time
 *     runs. A star with a system of its own (planets, one day) would be its
 *     frame just the same.
 * Hysteresis keeps the choice stable at the boundaries.
 */

import { LIGHT_YEAR_KM } from "../astro/galactic";
import type { Body } from "../model/body";
import { existsAt } from "../model/body";
import { type Target, type World } from "../model/world";
import type { Camera } from "./camera";

/** An object can be the frame while the view radius is below this multiple of its region. */
const VIEW_TO_REGION_LIMIT = 3;
/** Margin by which the current frame's limits are relaxed before it is dropped. */
const HYSTERESIS = 1.3;
/**
 * A star's region as a frame. Stars are light-years apart; half a light-year
 * is well inside the reach of a star's own gravity (the Sun's extends about
 * three light-years against the Galaxy's tide) yet keeps neighbors apart.
 */
const STAR_REGION_KM = 0.5 * LIGHT_YEAR_KM;

export class ReferenceFrameSelector {
  private readonly candidates: Body[];

  constructor(world: World) {
    this.candidates = world.bodies.filter((body) => body.frameRadius > 0 && Number.isFinite(body.frameRadius));
  }

  choose(world: World, camera: Camera, current: Target): Target {
    const viewRadius = camera.viewRadius;
    const t = world.time;
    const centerX = camera.centerX;
    const centerY = camera.centerY;
    let best = world.sun;

    const currentBody = current.type === "body" ? current.body : null;
    for (const body of this.candidates) {
      const slack = body === currentBody ? HYSTERESIS : 1;
      if (viewRadius > VIEW_TO_REGION_LIMIT * body.frameRadius * slack) continue;
      if (body.depth <= best.depth || !existsAt(body, t)) continue;
      const distance = Math.hypot(world.ephemeris.x(body) - centerX, world.ephemeris.y(body) - centerY);
      if (distance <= body.frameRadius * slack) best = body;
    }
    if (best !== world.sun) return { type: "body", body: best };

    const star = this.nearbyStar(world, viewRadius, centerX, centerY, current);
    return star ?? { type: "body", body: world.sun };
  }

  /** The star whose region holds the view center, when the view is small enough to be about it. */
  private nearbyStar(world: World, viewRadius: number, centerX: number, centerY: number, current: Target): Target | null {
    const stars = world.stars;
    if (!stars || viewRadius > VIEW_TO_REGION_LIMIT * STAR_REGION_KM * HYSTERESIS) return null;
    stars.update(world.time);
    const currentStar = current.type === "star" ? current.index : -1;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < stars.count; index++) {
      const distance = Math.hypot(stars.x[index] - centerX, stars.y[index] - centerY);
      // The current star wins ties within its relaxed region.
      const effective = index === currentStar ? distance / HYSTERESIS : distance;
      if (effective < bestDistance) {
        best = index;
        bestDistance = effective;
      }
    }
    const slack = best === currentStar ? HYSTERESIS : 1;
    if (best < 0 || bestDistance > STAR_REGION_KM || viewRadius > VIEW_TO_REGION_LIMIT * STAR_REGION_KM * slack) return null;
    return { type: "star", index: best };
  }
}
