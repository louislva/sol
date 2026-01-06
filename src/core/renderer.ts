import { Camera } from './camera';
import { type CelestialBody, getBodyPosition, getOrbitPath } from '../astronomy/bodies';
import { MIN_DISPLAY_SIZE } from '../astronomy/constants';

// Cached orbit data
interface OrbitCache {
  points: Array<{ x: number; y: number }>;
  julianDate: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;

  // Orbit path cache - recalculate only occasionally
  private orbitCache: Map<string, OrbitCache> = new Map();
  private readonly CACHE_DURATION = 1; // Recalculate every ~1 Julian day

  // Parchment colors
  private readonly bgColor = '#f4e4c1';
  private readonly orbitColor = 'rgba(61, 61, 61, 0.3)';
  private readonly labelColor = '#2c2c2c';

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;
  }

  clear(): void {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.camera.width, this.camera.height);
  }

  renderBody(body: CelestialBody, julianDate: number): void {
    const pos = getBodyPosition(body, julianDate);
    const screenPos = this.camera.worldToScreen(pos.x, pos.y);

    // Calculate size in pixels
    let radiusPixels = this.camera.kmToPixels(body.radius);

    // Apply minimum size threshold
    const minSize = MIN_DISPLAY_SIZE[body.type];
    radiusPixels = Math.max(radiusPixels, minSize);

    // Don't render if off screen (with some margin)
    const margin = radiusPixels + 50;
    if (
      screenPos.x < -margin ||
      screenPos.x > this.camera.width + margin ||
      screenPos.y < -margin ||
      screenPos.y > this.camera.height + margin
    ) {
      return;
    }

    // Draw the body
    this.ctx.beginPath();
    this.ctx.arc(screenPos.x, screenPos.y, radiusPixels, 0, Math.PI * 2);
    this.ctx.fillStyle = body.color;
    this.ctx.fill();

    // Add a subtle stroke for definition
    if (body.type !== 'star') {
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      this.ctx.lineWidth = 0.5;
      this.ctx.stroke();
    }

    // Draw label if body is at minimum size (contextual visibility)
    if (radiusPixels <= minSize * 1.5) {
      this.renderLabel(body.name, screenPos.x, screenPos.y + radiusPixels + 12);
    }
  }

  private getOrbitPoints(body: CelestialBody, julianDate: number): Array<{ x: number; y: number }> {
    const cached = this.orbitCache.get(body.name);

    // Use cache if fresh enough
    if (cached && Math.abs(cached.julianDate - julianDate) < this.CACHE_DURATION) {
      return cached.points;
    }

    // Recalculate and cache
    const points = getOrbitPath(body, julianDate, 180);
    this.orbitCache.set(body.name, { points, julianDate });
    return points;
  }

  renderOrbit(body: CelestialBody, julianDate: number): void {
    if (body.type === 'star') return;

    const orbitPoints = this.getOrbitPoints(body, julianDate);
    if (orbitPoints.length < 2) return;

    // Quick bounds check - skip if entire orbit is off screen
    const screenPoints: Array<{ x: number; y: number; visible: boolean }> = [];
    let anyVisible = false;

    for (const point of orbitPoints) {
      const screen = this.camera.worldToScreen(point.x, point.y);
      const visible =
        screen.x >= -1000 && screen.x <= this.camera.width + 1000 &&
        screen.y >= -1000 && screen.y <= this.camera.height + 1000;
      screenPoints.push({ ...screen, visible });
      if (visible) anyVisible = true;
    }

    // Skip entirely if nothing visible
    if (!anyVisible) return;

    // Draw the orbit, but only move/line to visible segments
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.orbitColor;
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);

    let needsMove = true;
    for (let i = 0; i < screenPoints.length; i++) {
      const point = screenPoints[i];
      const prevVisible = i > 0 && screenPoints[i - 1].visible;
      const nextVisible = i < screenPoints.length - 1 && screenPoints[i + 1].visible;

      // Draw this point if it's visible or adjacent to a visible point
      if (point.visible || prevVisible || nextVisible) {
        if (needsMove) {
          this.ctx.moveTo(point.x, point.y);
          needsMove = false;
        } else {
          this.ctx.lineTo(point.x, point.y);
        }
      } else {
        needsMove = true;
      }
    }

    // Close the orbit for elliptical paths
    if (body.elements && body.elements.e < 1 && !needsMove) {
      const first = screenPoints[0];
      if (first.visible || screenPoints[screenPoints.length - 1].visible) {
        this.ctx.lineTo(first.x, first.y);
      }
    }

    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  renderLabel(text: string, x: number, y: number): void {
    this.ctx.font = '12px "Crimson Text", Georgia, serif';
    this.ctx.fillStyle = this.labelColor;
    this.ctx.textAlign = 'center';
    this.ctx.globalAlpha = 0.7;
    this.ctx.fillText(text, x, y);
    this.ctx.globalAlpha = 1;
  }

  renderAll(bodies: CelestialBody[], julianDate: number): void {
    this.clear();

    // Draw orbits first (behind bodies)
    for (const body of bodies) {
      this.renderOrbit(body, julianDate);
    }

    // Draw bodies
    for (const body of bodies) {
      this.renderBody(body, julianDate);
    }
  }
}
