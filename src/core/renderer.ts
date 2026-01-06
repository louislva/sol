import { Camera } from './camera';
import { type CelestialBody, getBodyPosition, getOrbitPath, setBodyMap } from '../astronomy/bodies';
import { MIN_DISPLAY_SIZE } from '../astronomy/constants';
import { AsteroidBelt } from '../astronomy/asteroidBelt';

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

  // Body lookup map for parent occlusion checks
  private bodyMap: Map<string, CelestialBody> = new Map();

  private readonly bgColor = '#000000';
  private readonly labelColor = '#cccccc';

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;
  }

  // Check visibility of a body relative to its parent's minimum display size
  // Returns opacity: 0 = fully hidden, 1 = fully visible
  private getParentOcclusionOpacity(body: CelestialBody, julianDate: number): number {
    // Stars have no parent
    if (body.type === 'star' || body.fixedPosition) return 1;

    // Get parent body (default to Sun for planets)
    const parentName = body.parentName || 'Sun';
    const parent = this.bodyMap.get(parentName);
    if (!parent) return 1;

    // Get positions in screen space
    const bodyPos = getBodyPosition(body, julianDate);
    const parentPos = getBodyPosition(parent, julianDate);

    const bodyScreen = this.camera.worldToScreen(bodyPos.x, bodyPos.y);
    const parentScreen = this.camera.worldToScreen(parentPos.x, parentPos.y);

    // Calculate parent's display radius (clamped to minimum)
    let parentRadiusPixels = this.camera.kmToPixels(parent.radius);
    const parentMinSize = MIN_DISPLAY_SIZE[parent.type];
    parentRadiusPixels = Math.max(parentRadiusPixels, parentMinSize);

    // Calculate distance from body to parent center in screen space
    const dx = bodyScreen.x - parentScreen.x;
    const dy = bodyScreen.y - parentScreen.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Fade out over 4px as body approaches parent's edge
    const fadeDistance = 4;
    const fadeStart = parentRadiusPixels + fadeDistance;

    if (distance >= fadeStart) return 1; // Fully visible
    if (distance <= parentRadiusPixels) return 0; // Fully hidden

    // Linear fade between fadeStart and parentRadiusPixels
    return (distance - parentRadiusPixels) / fadeDistance;
  }

  clear(): void {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.camera.width, this.camera.height);
  }

  renderBody(body: CelestialBody, julianDate: number): void {
    // Get opacity based on parent occlusion (fade out near parent)
    const occlusionOpacity = this.getParentOcclusionOpacity(body, julianDate);
    if (occlusionOpacity <= 0) return;

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

    // Apply occlusion opacity
    this.ctx.globalAlpha = occlusionOpacity;

    // Draw probe/satellite with special icon
    if (body.type === 'probe') {
      this.renderProbeIcon(screenPos.x, screenPos.y, radiusPixels, body.color);
    } else {
      // Draw the body as circle
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
    }

    // Reset alpha
    this.ctx.globalAlpha = 1;

    // Draw label if body is at minimum size (contextual visibility)
    if (radiusPixels <= minSize * 1.5) {
      this.renderLabel(body.name, screenPos.x, screenPos.y + radiusPixels + 12, occlusionOpacity);
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

    // Get opacity based on parent occlusion (fade out near parent)
    const occlusionOpacity = this.getParentOcclusionOpacity(body, julianDate);
    if (occlusionOpacity <= 0) return;

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

    // Apply occlusion opacity to the orbit color (muted version of body color)
    const baseOpacity = 0.35;
    this.ctx.globalAlpha = baseOpacity * occlusionOpacity;

    // Draw the orbit with a muted version of the body's color
    this.ctx.beginPath();
    this.ctx.strokeStyle = body.color;
    this.ctx.lineWidth = 2;

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
    const eccentricity = body.elements?.e ?? body.parentCentricElements?.e ?? 1;
    if (eccentricity < 1 && !needsMove) {
      const first = screenPoints[0];
      if (first.visible || screenPoints[screenPoints.length - 1].visible) {
        this.ctx.lineTo(first.x, first.y);
      }
    }

    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }

  renderLabel(text: string, x: number, y: number, opacity: number = 1): void {
    this.ctx.font = '11px "Space Mono", monospace';
    this.ctx.fillStyle = this.labelColor;
    this.ctx.textAlign = 'center';
    this.ctx.globalAlpha = 0.7 * opacity;
    this.ctx.fillText(text, x, y);
    this.ctx.globalAlpha = 1;
  }

  // Draw probe/satellite icon: cylinder body with solar panels
  //   [■]─[▬▬]─[■]
  //   [■]─[▬▬]─[■]
  private renderProbeIcon(x: number, y: number, size: number, color: string): void {
    // Scale based on size (minimum 2px)
    const s = Math.max(size, 2);

    // Body dimensions
    const bodyW = s * 0.8;
    const bodyH = s * 1.2;

    // Solar panel dimensions
    const panelW = s * 0.5;
    const panelH = s * 0.3;
    const panelGap = s * 0.15;  // Gap between panels
    const armLen = s * 0.3;

    // Draw body (rounded rectangle / cylinder)
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.roundRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH, s * 0.15);
    this.ctx.fill();

    // Solar panel color (darker blue)
    const panelColor = '#3366aa';

    // Left solar panels (two separate panels)
    const leftX = x - bodyW / 2 - armLen - panelW;

    // Left arm
    this.ctx.fillStyle = '#888888';
    this.ctx.fillRect(x - bodyW / 2 - armLen, y - 0.5, armLen, 1);

    // Left top panel
    this.ctx.fillStyle = panelColor;
    this.ctx.fillRect(leftX, y - panelH - panelGap / 2, panelW, panelH);

    // Left bottom panel
    this.ctx.fillRect(leftX, y + panelGap / 2, panelW, panelH);

    // Right solar panels (two separate panels)
    const rightX = x + bodyW / 2 + armLen;

    // Right arm
    this.ctx.fillStyle = '#888888';
    this.ctx.fillRect(x + bodyW / 2, y - 0.5, armLen, 1);

    // Right top panel
    this.ctx.fillStyle = panelColor;
    this.ctx.fillRect(rightX, y - panelH - panelGap / 2, panelW, panelH);

    // Right bottom panel
    this.ctx.fillRect(rightX, y + panelGap / 2, panelW, panelH);

    // Add subtle highlight to body
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 0.5;
    this.ctx.beginPath();
    this.ctx.roundRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH, s * 0.15);
    this.ctx.stroke();
  }

  renderAll(bodies: CelestialBody[], julianDate: number): void {
    this.clear();

    // Build body map for parent lookup in occlusion checks
    this.bodyMap.clear();
    for (const body of bodies) {
      this.bodyMap.set(body.name, body);
    }

    // Set global body map for hierarchical position calculations
    setBodyMap(bodies);

    // Draw orbits first (behind bodies)
    for (const body of bodies) {
      this.renderOrbit(body, julianDate);
    }

    // Draw bodies
    for (const body of bodies) {
      this.renderBody(body, julianDate);
    }
  }

  // Render asteroid belt with LOD
  renderAsteroids(asteroidBelt: AsteroidBelt, julianDate: number): void {
    // Render belt ring when zoomed out
    if (asteroidBelt.shouldRenderBeltRing(this.camera)) {
      this.renderAsteroidBeltRing(asteroidBelt);
    }

    // Render individual asteroids based on zoom level
    const asteroids = asteroidBelt.getVisibleAsteroids(this.camera, julianDate);
    if (asteroids.length === 0) return;

    // Batch render all asteroids as small dots
    this.ctx.fillStyle = asteroidBelt.color;
    this.ctx.globalAlpha = 0.6;
    this.ctx.beginPath();

    for (const pos of asteroids) {
      const screen = this.camera.worldToScreen(pos.x, pos.y);

      // Skip if off screen
      if (
        screen.x < -10 ||
        screen.x > this.camera.width + 10 ||
        screen.y < -10 ||
        screen.y > this.camera.height + 10
      ) {
        continue;
      }

      // Draw as tiny dot (1.5px radius)
      this.ctx.moveTo(screen.x + 1.5, screen.y);
      this.ctx.arc(screen.x, screen.y, 1.5, 0, Math.PI * 2);
    }

    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  // Render statistical asteroid belt ring
  private renderAsteroidBeltRing(asteroidBelt: AsteroidBelt): void {
    const path = asteroidBelt.getBeltRingPath(this.camera, 120);

    // Draw as a filled ring
    this.ctx.globalAlpha = 0.15;
    this.ctx.fillStyle = asteroidBelt.color;
    this.ctx.beginPath();

    // Outer edge
    for (let i = 0; i < path.length; i++) {
      const screen = this.camera.worldToScreen(path[i].outer.x, path[i].outer.y);
      if (i === 0) {
        this.ctx.moveTo(screen.x, screen.y);
      } else {
        this.ctx.lineTo(screen.x, screen.y);
      }
    }

    // Inner edge (reverse direction to create hole)
    for (let i = path.length - 1; i >= 0; i--) {
      const screen = this.camera.worldToScreen(path[i].inner.x, path[i].inner.y);
      this.ctx.lineTo(screen.x, screen.y);
    }

    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }
}
