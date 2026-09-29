/**
 * Automatic choice of the camera's reference frame.
 *
 * The frame is the deepest body in the hierarchy (Sun → planet → moon)
 * whose region of dominance — its Hill sphere, widened to cover its moons —
 * contains the view center, provided the view is not much larger than that
 * region. Zoomed in on the ISS, that is Earth; framing the Galilean moons,
 * Jupiter; looking at the inner planets, the Sun. Hysteresis keeps the
 * choice stable at the boundaries.
 */

import type { Body } from "../model/body";
import { existsAt } from "../model/body";
import type { World } from "../model/world";
import type { Camera } from "./camera";

/** A body can be the frame while the view radius is below this multiple of its region. */
const VIEW_TO_REGION_LIMIT = 3;
/** Margin by which the current frame's limits are relaxed before it is dropped. */
const HYSTERESIS = 1.3;

export class ReferenceFrameSelector {
  private readonly candidates: Body[];
  private readonly isShown: (body: Body) => boolean;

  constructor(world: World, isShown: (body: Body) => boolean) {
    this.isShown = isShown;
    this.candidates = world.bodies.filter((body) => body.frameRadius > 0 && Number.isFinite(body.frameRadius));
  }

  choose(world: World, camera: Camera, current: Body): Body {
    const viewRadius = camera.viewRadius;
    const t = world.time;
    const centerX = camera.centerX;
    const centerY = camera.centerY;
    let best = world.sun;

    for (const body of this.candidates) {
      const slack = body === current ? HYSTERESIS : 1;
      if (viewRadius > VIEW_TO_REGION_LIMIT * body.frameRadius * slack) continue;
      if (body.depth <= best.depth || !this.isShown(body) || !existsAt(body, t)) continue;
      const distance = Math.hypot(world.ephemeris.x(body) - centerX, world.ephemeris.y(body) - centerY);
      if (distance <= body.frameRadius * slack) best = body;
    }
    return best;
  }
}
