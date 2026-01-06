import { Camera } from './camera';
import { type CelestialBody, getBodyPosition, getOrbitPath, setBodyMap } from '../astronomy/bodies';
import { MIN_DISPLAY_SIZE, type SpacecraftIconType } from '../astronomy/constants';
import { AsteroidBelt } from '../astronomy/asteroidBelt';

// Cached orbit data
interface OrbitCache {
  points: Array<{ x: number; y: number }>;
  julianDate: number;
  numPoints: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;

  // Orbit path cache - recalculate only occasionally
  private orbitCache: Map<string, OrbitCache> = new Map();
  private readonly CACHE_DURATION = 1; // Recalculate every ~1 Julian day

  // Body lookup map for parent occlusion checks
  private bodyMap: Map<string, CelestialBody> = new Map();

  // Currently hovered body name
  private hoveredBodyName: string | null = null;

  private readonly bgColor = '#000000';
  private readonly labelColor = '#cccccc';

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;
  }

  setHoveredBody(name: string | null): void {
    this.hoveredBodyName = name;
  }

  // Brighten a hex color for hover effect
  private brightenColor(hex: string): string {
    // Parse hex
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Brighten by blending toward white
    const factor = 0.4;
    const nr = Math.round(r + (255 - r) * factor);
    const ng = Math.round(g + (255 - g) * factor);
    const nb = Math.round(b + (255 - b) * factor);

    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
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

    // Fade out as body approaches parent's edge (16px for sun, 4px for others)
    const fadeDistance = parent.type === 'star' ? 16 : 4;
    const fadeStart = parentRadiusPixels + fadeDistance;

    if (distance >= fadeStart) return 1; // Fully visible
    if (distance <= parentRadiusPixels) return 0; // Fully hidden

    // Linear fade between fadeStart and parentRadiusPixels
    return (distance - parentRadiusPixels) / fadeDistance;
  }

  // Separate opacity calculation for labels - fades earlier (24px from any parent)
  private getLabelOcclusionOpacity(body: CelestialBody, julianDate: number): number {
    if (body.type === 'star' || body.fixedPosition) return 1;

    const parentName = body.parentName || 'Sun';
    const parent = this.bodyMap.get(parentName);
    if (!parent) return 1;

    const bodyPos = getBodyPosition(body, julianDate);
    const parentPos = getBodyPosition(parent, julianDate);

    const bodyScreen = this.camera.worldToScreen(bodyPos.x, bodyPos.y);
    const parentScreen = this.camera.worldToScreen(parentPos.x, parentPos.y);

    let parentRadiusPixels = this.camera.kmToPixels(parent.radius);
    const parentMinSize = MIN_DISPLAY_SIZE[parent.type];
    parentRadiusPixels = Math.max(parentRadiusPixels, parentMinSize);

    const dx = bodyScreen.x - parentScreen.x;
    const dy = bodyScreen.y - parentScreen.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const fadeEnd = parentRadiusPixels + 32;   // Fully hidden at 32px from edge
    const fadeStart = parentRadiusPixels + 64; // Start fading at 64px from edge

    if (distance >= fadeStart) return 1;
    if (distance <= fadeEnd) return 0;

    return (distance - fadeEnd) / (fadeStart - fadeEnd);
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

    // Check if this body is hovered
    const isHovered = body.name === this.hoveredBodyName;
    const displayColor = isHovered ? this.brightenColor(body.color) : body.color;

    // Draw probe/satellite with special icon based on type
    if (body.type === 'probe') {
      const iconType = body.iconType || 'probe';
      this.renderSpacecraftIcon(screenPos.x, screenPos.y, radiusPixels, displayColor, iconType);
    } else {
      // Draw the body as circle
      this.ctx.beginPath();
      this.ctx.arc(screenPos.x, screenPos.y, radiusPixels, 0, Math.PI * 2);
      this.ctx.fillStyle = displayColor;
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
      const labelOpacity = this.getLabelOcclusionOpacity(body, julianDate);
      this.renderLabel(body.name, screenPos.x, screenPos.y + radiusPixels + 12, labelOpacity);
    }
  }

  // Calculate orbit resolution based on zoom level
  getOrbitResolution(): number {
    const zoom = this.camera.zoom;
    // More points when zoomed in for smoother curves
    if (zoom > 1e-4) return 720;
    if (zoom > 1e-5) return 360;
    if (zoom > 1e-6) return 180;
    if (zoom > 1e-7) return 90;
    return 60;
  }

  private getOrbitPoints(body: CelestialBody, julianDate: number): Array<{ x: number; y: number }> {
    const numPoints = this.getOrbitResolution();
    const cached = this.orbitCache.get(body.name);

    // Use cache if fresh enough and resolution matches
    if (cached &&
        Math.abs(cached.julianDate - julianDate) < this.CACHE_DURATION &&
        cached.numPoints === numPoints) {
      return cached.points;
    }

    // Recalculate and cache
    const points = getOrbitPath(body, julianDate, numPoints);
    this.orbitCache.set(body.name, { points, julianDate, numPoints });
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

  // Render spacecraft icon based on type
  private renderSpacecraftIcon(
    x: number,
    y: number,
    size: number,
    color: string,
    iconType: SpacecraftIconType
  ): void {
    switch (iconType) {
      case 'telescope':
        this.renderTelescopeIcon(x, y, size, color);
        break;
      case 'orbiter':
        this.renderOrbiterIcon(x, y, size, color);
        break;
      case 'rover':
        this.renderRoverIcon(x, y, size, color);
        break;
      case 'probe':
      default:
        this.renderProbeIcon(x, y, size, color);
        break;
    }
  }

  // Draw probe/satellite icon: cylinder with 4 solar panels
  //   [■] [▬] [■]
  //   [■] [▬] [■]
  private renderProbeIcon(x: number, y: number, size: number, color: string): void {
    const s = Math.max(size, 2);

    this.ctx.fillStyle = color;

    // Body (cylinder = rectangle)
    const bodyW = s * 0.5;
    const bodyH = s * 1.4;
    this.ctx.fillRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH);

    // Solar panels
    const panelW = s * 0.6;
    const panelH = s * 0.35;
    const panelGap = s * 0.2;
    const panelX = s * 0.9;  // Distance from center to panel

    // Left panels
    this.ctx.fillRect(x - panelX - panelW / 2, y - panelGap / 2 - panelH, panelW, panelH);
    this.ctx.fillRect(x - panelX - panelW / 2, y + panelGap / 2, panelW, panelH);

    // Right panels
    this.ctx.fillRect(x + panelX - panelW / 2, y - panelGap / 2 - panelH, panelW, panelH);
    this.ctx.fillRect(x + panelX - panelW / 2, y + panelGap / 2, panelW, panelH);

    // Arms (thin lines connecting body to panels)
    this.ctx.fillRect(x - panelX + panelW / 2, y - 0.5, panelX - panelW / 2 - bodyW / 2, 1);
    this.ctx.fillRect(x + bodyW / 2, y - 0.5, panelX - panelW / 2 - bodyW / 2, 1);
  }

  // Draw telescope icon: cylinder with sunshield (hexagonal top)
  // Represents JWST, Hubble, Kepler, etc.
  private renderTelescopeIcon(x: number, y: number, size: number, color: string): void {
    const s = Math.max(size, 2);
    this.ctx.fillStyle = color;

    // Main body (tall cylinder)
    const bodyW = s * 0.4;
    const bodyH = s * 1.6;
    this.ctx.fillRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH);

    // Hexagonal sunshield at top (simplified as triangle)
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - bodyH / 2 - s * 0.5);  // Top point
    this.ctx.lineTo(x - s * 0.6, y - bodyH / 2 + s * 0.2);  // Bottom left
    this.ctx.lineTo(x + s * 0.6, y - bodyH / 2 + s * 0.2);  // Bottom right
    this.ctx.closePath();
    this.ctx.fill();

    // Solar panels (smaller, on sides)
    const panelW = s * 0.4;
    const panelH = s * 0.25;
    this.ctx.fillRect(x - s * 0.7 - panelW / 2, y, panelW, panelH);
    this.ctx.fillRect(x + s * 0.7 - panelW / 2, y, panelW, panelH);

    // Panel arms
    this.ctx.fillRect(x - s * 0.7 + panelW / 2, y + panelH / 2 - 0.5, s * 0.3, 1);
    this.ctx.fillRect(x + bodyW / 2, y + panelH / 2 - 0.5, s * 0.3, 1);
  }

  // Draw orbiter icon: diamond/angular spacecraft shape
  // Represents planetary orbiters (Mars Express, Juno, etc.)
  private renderOrbiterIcon(x: number, y: number, size: number, color: string): void {
    const s = Math.max(size, 2);
    this.ctx.fillStyle = color;

    // Diamond-shaped body
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - s * 0.8);     // Top
    this.ctx.lineTo(x + s * 0.5, y);      // Right
    this.ctx.lineTo(x, y + s * 0.8);      // Bottom
    this.ctx.lineTo(x - s * 0.5, y);      // Left
    this.ctx.closePath();
    this.ctx.fill();

    // Small solar panels
    const panelW = s * 0.5;
    const panelH = s * 0.2;
    this.ctx.fillRect(x - s * 0.9 - panelW / 2, y - panelH / 2, panelW, panelH);
    this.ctx.fillRect(x + s * 0.9 - panelW / 2, y - panelH / 2, panelW, panelH);

    // Panel arms
    this.ctx.fillRect(x - s * 0.9 + panelW / 2, y - 0.5, s * 0.4, 1);
    this.ctx.fillRect(x + s * 0.5, y - 0.5, s * 0.4, 1);
  }

  // Draw rover/lander icon: box with wheels/legs
  // Represents Perseverance, Curiosity, landers
  private renderRoverIcon(x: number, y: number, size: number, color: string): void {
    const s = Math.max(size, 2);
    this.ctx.fillStyle = color;

    // Main body (rectangle)
    const bodyW = s * 1.2;
    const bodyH = s * 0.6;
    this.ctx.fillRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH);

    // "Mast" / antenna on top
    this.ctx.fillRect(x - s * 0.1, y - bodyH / 2 - s * 0.5, s * 0.2, s * 0.5);

    // Wheels/legs (circles at corners)
    const wheelR = s * 0.2;
    this.ctx.beginPath();
    this.ctx.arc(x - bodyW / 2 + wheelR, y + bodyH / 2, wheelR, 0, Math.PI * 2);
    this.ctx.arc(x + bodyW / 2 - wheelR, y + bodyH / 2, wheelR, 0, Math.PI * 2);
    this.ctx.fill();
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
