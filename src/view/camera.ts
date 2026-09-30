/**
 * The camera lives in a moving reference frame.
 *
 * Its center is stored as an offset from a frame origin — the current
 * position of the body the view is locked to (the Sun, a planet, a moon, or
 * any followed object). Each frame the app moves the origin to that body's
 * new position, so everything that moves with the body stays still on
 * screen: zoomed in on Earth's satellites, Earth stays put and the
 * satellites circle it. Switching frames re-expresses the offset against
 * the new origin, so the picture never jumps.
 */

import { LIGHT_YEAR_KM } from "../astro/galactic";

/** Pinned point for zooming: stays under the same screen position. */
interface ZoomAnchor {
  screenX: number;
  screenY: number;
  /** Frame-relative world position (km). */
  frameX: number;
  frameY: number;
}

const ZOOM_TIME_CONSTANT_MS = 70;
const MAX_ZOOM = 5_000; // px/km: 0.2 m per pixel, enough for the smallest asteroid targets
/** Farthest view: from the center to the nearest viewport edge, the whole Galaxy. */
const MIN_ZOOM_VIEW_RADIUS_KM = 60_000 * LIGHT_YEAR_KM;

export class Camera {
  width = 1;
  height = 1;
  pixelRatio = 1;

  /** Frame origin: heliocentric position (km) of the frame body this frame. */
  originX = 0;
  originY = 0;
  /** View center relative to the frame origin (km). */
  offsetX = 0;
  offsetY = 0;

  private zoomValue = 1e-6;
  private targetZoom = 1e-6;
  private anchor: ZoomAnchor | null = null;
  private glide: { fromX: number; fromY: number; elapsed: number; duration: number } | null = null;

  /** px per km. */
  get zoom(): number {
    return this.zoomValue;
  }

  get centerX(): number {
    return this.originX + this.offsetX;
  }

  get centerY(): number {
    return this.originY + this.offsetY;
  }

  get minZoom(): number {
    return Math.min(this.width, this.height) / 2 / MIN_ZOOM_VIEW_RADIUS_KM;
  }

  get maxZoom(): number {
    return MAX_ZOOM;
  }

  /** Distance (km) from the view center to a viewport corner. */
  get viewRadius(): number {
    return Math.hypot(this.width, this.height) / 2 / this.zoomValue;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = pixelRatio;
    this.setZoomImmediately(this.zoomValue);
  }

  /** Move the frame origin to the frame body's current position. */
  setOrigin(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
  }

  /** Re-express the view against a new frame origin without moving the picture. */
  changeOrigin(x: number, y: number): void {
    const dx = this.originX - x;
    const dy = this.originY - y;
    this.offsetX += dx;
    this.offsetY += dy;
    if (this.anchor) {
      this.anchor.frameX += dx;
      this.anchor.frameY += dy;
    }
    if (this.glide) {
      this.glide.fromX += dx;
      this.glide.fromY += dy;
    }
    this.originX = x;
    this.originY = y;
  }

  /** Center on the frame origin, easing over `durationMs`. */
  glideToOrigin(durationMs = 450): void {
    this.anchor = null;
    this.glide = { fromX: this.offsetX, fromY: this.offsetY, elapsed: 0, duration: durationMs };
  }

  /** Jump to a view: frame-relative center (km) and zoom. */
  setView(offsetX: number, offsetY: number, zoom: number): void {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.glide = null;
    this.anchor = null;
    this.setZoomImmediately(zoom);
  }

  setZoomImmediately(zoom: number): void {
    const clamped = this.clampZoom(zoom);
    this.zoomValue = clamped;
    this.targetZoom = clamped;
  }

  /** Smoothly zoom by `factor`, keeping the given screen point fixed. */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    this.anchorAt(screenX, screenY);
    this.targetZoom = this.clampZoom(this.targetZoom * factor);
  }

  /** Smoothly zoom by `factor`, keeping a frame-relative world point pinned where it is on screen. */
  zoomToward(factor: number, frameX: number, frameY: number): void {
    this.anchor = {
      frameX,
      frameY,
      screenX: (frameX - this.offsetX) * this.zoomValue + this.width / 2,
      screenY: (frameY - this.offsetY) * this.zoomValue + this.height / 2,
    };
    this.targetZoom = this.clampZoom(this.targetZoom * factor);
  }

  /** Whether an anchored zoom is in progress. */
  get zooming(): boolean {
    return this.anchor !== null;
  }

  /** Move the point an anchored zoom is pinned to (frame-relative km), e.g. to follow a moving object. */
  retargetAnchor(frameX: number, frameY: number): void {
    if (!this.anchor) return;
    this.anchor.frameX = frameX;
    this.anchor.frameY = frameY;
  }

  /** Immediately scale the zoom about a screen point (pinch gestures). */
  pinch(factor: number, fromX: number, fromY: number, toX: number, toY: number): void {
    const frameX = (fromX - this.width / 2) / this.zoomValue + this.offsetX;
    const frameY = (fromY - this.height / 2) / this.zoomValue + this.offsetY;
    this.setZoomImmediately(this.zoomValue * factor);
    this.offsetX = frameX - (toX - this.width / 2) / this.zoomValue;
    this.offsetY = frameY - (toY - this.height / 2) / this.zoomValue;
  }

  panByPixels(dx: number, dy: number): void {
    this.glide = null;
    this.offsetX -= dx / this.zoomValue;
    this.offsetY -= dy / this.zoomValue;
    if (this.anchor) {
      this.anchor.screenX += dx;
      this.anchor.screenY += dy;
    }
  }

  /** Advance zoom smoothing and center glides. */
  update(dtMs: number): void {
    if (this.glide) {
      this.glide.elapsed += dtMs;
      const progress = Math.min(1, this.glide.elapsed / this.glide.duration);
      const eased = 1 - (1 - progress) ** 3;
      this.offsetX = this.glide.fromX * (1 - eased);
      this.offsetY = this.glide.fromY * (1 - eased);
      if (progress >= 1) this.glide = null;
    }

    if (this.zoomValue === this.targetZoom) return;
    // Exponential approach in log space: frame-rate independent and uniform
    // at every scale.
    const blend = 1 - Math.exp(-dtMs / ZOOM_TIME_CONSTANT_MS);
    const logZoom = Math.log(this.zoomValue);
    const logTarget = Math.log(this.targetZoom);
    const next = Math.abs(logTarget - logZoom) < 1e-4
      ? this.targetZoom
      : Math.exp(logZoom + (logTarget - logZoom) * blend);
    this.zoomValue = next;
    if (this.anchor) {
      this.offsetX = this.anchor.frameX - (this.anchor.screenX - this.width / 2) / next;
      this.offsetY = this.anchor.frameY - (this.anchor.screenY - this.height / 2) / next;
    }
    if (next === this.targetZoom) this.anchor = null;
  }

  worldToScreenX(x: number): number {
    return (x - this.originX - this.offsetX) * this.zoomValue + this.width / 2;
  }

  worldToScreenY(y: number): number {
    return (y - this.originY - this.offsetY) * this.zoomValue + this.height / 2;
  }

  screenToWorldX(x: number): number {
    return (x - this.width / 2) / this.zoomValue + this.originX + this.offsetX;
  }

  screenToWorldY(y: number): number {
    return (y - this.height / 2) / this.zoomValue + this.originY + this.offsetY;
  }

  private anchorAt(screenX: number, screenY: number): void {
    this.anchor = {
      screenX,
      screenY,
      frameX: (screenX - this.width / 2) / this.zoomValue + this.offsetX,
      frameY: (screenY - this.height / 2) / this.zoomValue + this.offsetY,
    };
  }

  private clampZoom(zoom: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
  }
}
