/**
 * The path a spacecraft has flown, drawn in the reference frame of the body
 * it is near (the frame the camera would choose there).
 *
 * Each point is the spacecraft's position minus the frame body's position at
 * that same moment, so the trail shows the motion you would see riding
 * along with the frame: in the Sun's frame, Voyager's heliocentric path with
 * its kinks at each planet; in Jupiter's frame, the flyby hyperbola itself.
 *
 * Points are spaced adaptively (a fixed fraction of distance / speed
 * relative to the frame), walking back from "now" up to a point budget, and
 * the trail is extended forward incrementally as time runs.
 */

import type { Body } from "../../model/body";
import { sameTarget, type Target, type World } from "../../model/world";
import type { Camera } from "../camera";

const POINT_BUDGET = 3000;
/** Angular resolution: step = this fraction of (distance / speed) relative to the frame. */
const RESOLUTION = 0.02;
const MIN_STEP_DAYS = 1 / 1440;
const MAX_STEP_DAYS = 20;
const SCREEN_MARGIN = 4000;

interface Trail {
  frame: Target;
  /** Oldest first. */
  times: number[];
  /** Frame-relative x, y (km) per time. */
  xs: number[];
  ys: number[];
  step: number;
}

export class TrailLayer {
  private readonly trails = new Map<Body, Trail>();
  private readonly craft = new Float64Array(3);
  private readonly frameBody = new Float64Array(3);

  /** Forget trails that are no longer shown. */
  retain(bodies: ReadonlySet<Body>): void {
    for (const body of this.trails.keys()) if (!bodies.has(body)) this.trails.delete(body);
  }

  draw(ctx: CanvasRenderingContext2D, world: World, camera: Camera, body: Body, frame: Target, alpha: number): void {
    const t = world.time;
    let trail = this.trails.get(body);
    // Running backward, the trail is cut back to now; it is rebuilt only
    // once nothing of it is left.
    if (trail) this.truncate(trail, t);
    if (!trail || !sameTarget(trail.frame, frame) || trail.times.length < 2) {
      trail = this.build(world, body, frame, t);
      this.trails.set(body, trail);
    } else {
      this.extend(world, body, trail, t);
    }

    // The live position closes the gap between the last sample and now.
    this.relative(world, body, frame, t);
    const liveX = this.craft[0];
    const liveY = this.craft[1];

    // Trail points are relative to the frame body; place them around its
    // current position.
    world.position(frame, this.frameBody);
    const zoom = camera.zoom;
    const offsetX = camera.width / 2 + (this.frameBody[0] - camera.centerX) * zoom;
    const offsetY = camera.height / 2 + (this.frameBody[1] - camera.centerY) * zoom;
    const inside = (x: number, y: number) => x > -SCREEN_MARGIN && x < camera.width + SCREEN_MARGIN
      && y > -SCREEN_MARGIN && y < camera.height + SCREEN_MARGIN;

    ctx.beginPath();
    let penDown = false;
    const count = trail.times.length;
    for (let index = 0; index <= count; index++) {
      const x = (index < count ? trail.xs[index] : liveX) * zoom + offsetX;
      const y = (index < count ? trail.ys[index] : liveY) * zoom + offsetY;
      if (!inside(x, y)) {
        if (penDown) ctx.lineTo(x, y);
        penDown = false;
        continue;
      }
      if (penDown) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      penDown = true;
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = body.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Spacecraft position relative to the frame body at time t, into this.craft. */
  private relative(world: World, body: Body, frame: Target, t: number): void {
    world.positionAt({ type: "body", body }, t, this.craft);
    world.positionAt(frame, t, this.frameBody);
    this.craft[0] -= this.frameBody[0];
    this.craft[1] -= this.frameBody[1];
    this.craft[2] -= this.frameBody[2];
  }

  /** Next step (days) after moving from (x0, y0) to (x1, y1) over dt. */
  private nextStep(x0: number, y0: number, x1: number, y1: number, dt: number, previous: number): number {
    const speed = Math.hypot(x1 - x0, y1 - y0) / dt;
    const distance = Math.max(1, Math.hypot(x1, y1));
    const ideal = speed > 0 ? (RESOLUTION * distance) / speed : MAX_STEP_DAYS;
    return Math.max(MIN_STEP_DAYS, Math.min(MAX_STEP_DAYS, ideal, 2 * previous));
  }

  private build(world: World, body: Body, frame: Target, t: number): Trail {
    const times: number[] = [t];
    this.relative(world, body, frame, t);
    const xs = [this.craft[0]];
    const ys = [this.craft[1]];
    let step = MIN_STEP_DAYS;
    let time = t;
    while (times.length < POINT_BUDGET && time > body.existsFrom) {
      const next = Math.max(body.existsFrom, time - step);
      this.relative(world, body, frame, next);
      const x = this.craft[0];
      const y = this.craft[1];
      step = this.nextStep(xs[xs.length - 1], ys[ys.length - 1], x, y, time - next, step);
      times.push(next);
      xs.push(x);
      ys.push(y);
      time = next;
    }
    times.reverse();
    xs.reverse();
    ys.reverse();
    return { frame, times, xs, ys, step: MIN_STEP_DAYS };
  }

  private truncate(trail: Trail, t: number): void {
    const { times } = trail;
    let keep = times.length;
    while (keep > 0 && times[keep - 1] > t) keep--;
    if (keep === times.length) return;
    times.length = keep;
    trail.xs.length = keep;
    trail.ys.length = keep;
  }

  private extend(world: World, body: Body, trail: Trail, t: number): void {
    const { times, xs, ys } = trail;
    let time = times[times.length - 1];
    let added = 0;
    while (time + trail.step <= t && added < POINT_BUDGET) {
      const next = time + trail.step;
      this.relative(world, body, trail.frame, next);
      trail.step = this.nextStep(xs[xs.length - 1], ys[ys.length - 1], this.craft[0], this.craft[1], trail.step, trail.step);
      times.push(next);
      xs.push(this.craft[0]);
      ys.push(this.craft[1]);
      time = next;
      added++;
    }
    const excess = times.length - POINT_BUDGET;
    if (excess > 0) {
      times.splice(0, excess);
      xs.splice(0, excess);
      ys.splice(0, excess);
    }
  }
}
