import { Camera } from './camera';
import { type CelestialBody, getBodyPosition, getOrbitPath } from '../astronomy/bodies';
import { MIN_DISPLAY_SIZE } from '../astronomy/constants';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;

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

  renderOrbit(body: CelestialBody, julianDate: number): void {
    if (body.type === 'star') return;

    const orbitPoints = getOrbitPath(body, julianDate, 180);
    if (orbitPoints.length < 2) return;

    this.ctx.beginPath();
    this.ctx.strokeStyle = this.orbitColor;
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);

    const firstPoint = this.camera.worldToScreen(orbitPoints[0].x, orbitPoints[0].y);
    this.ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < orbitPoints.length; i++) {
      const point = this.camera.worldToScreen(orbitPoints[i].x, orbitPoints[i].y);
      this.ctx.lineTo(point.x, point.y);
    }

    // Close the orbit for elliptical paths
    if (body.elements && body.elements.e < 1) {
      this.ctx.closePath();
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
