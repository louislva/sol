import './style.css';
import { Camera } from './core/camera';
import { Renderer } from './core/renderer';
import { TimeSystem, type SpeedMode } from './core/time';
import { allBodies, type CelestialBody, getBodyPosition, getOrbitPath } from './astronomy/bodies';
import { filterMoons } from './data/moons';
import { allProbes } from './data/probes';
import { allComets } from './data/comets';
import { loadSpacecraftData, getVisibleSpacecraft, hasSpacecraftData } from './data/spacecraft';
import { allSatellites } from './data/satellites';
import { AsteroidBelt, generateSampleAsteroids } from './astronomy/asteroidBelt';
import { MIN_DISPLAY_SIZE, type MoonCategory } from './astronomy/constants';
import * as sidebar from './ui/sidebar';

// Get canvas element
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// Initialize systems
const camera = new Camera(canvas);
const renderer = new Renderer(canvas, camera);
const time = new TimeSystem();

// Set initial view to Sun, zoomed all the way in
// Sun is at (0, 0), radius is ~695,700 km
camera.x = 0;
camera.y = 0;
camera['_zoom'] = 0.002;
camera['_targetZoom'] = 0.002;

// Current moon filter level
let currentMoonFilter: MoonCategory = 'medium';

// Build bodies array based on current moon filter and time
function buildBodies(julianDate?: number): CelestialBody[] {
  const bodies = [
    ...allBodies,                      // Sun, planets, dwarf planets
    ...filterMoons(currentMoonFilter), // Moons filtered by category
    ...allComets,                      // Comets
    ...allSatellites,                  // Earth satellites (parent occlusion handles visibility)
  ];

  // Add spacecraft - prefer JPL Horizons data over legacy manual data
  if (hasSpacecraftData() && julianDate) {
    // Use accurate JPL data with timeline filtering
    bodies.push(...getVisibleSpacecraft(julianDate));
  } else {
    // Fallback to legacy manual probes if JPL data not loaded
    bodies.push(...allProbes);
  }

  return bodies;
}

// Combine all celestial bodies
let bodies: CelestialBody[] = buildBodies();

// Load spacecraft data asynchronously
loadSpacecraftData().then(() => {
  // Rebuild bodies array with spacecraft data
  bodies = buildBodies(time.currentJulian);
});

// Initialize asteroid belt with sample data
// For production: load from src/data/asteroids.json
const asteroidBelt = new AsteroidBelt(generateSampleAsteroids(10000));
console.log(`Loaded ${asteroidBelt.count} asteroids`);

// UI elements
const dateDisplay = document.getElementById('date-display')!;
const currentSpeedEl = document.getElementById('current-speed')!;
const zoomLevelEl = document.getElementById('zoom-level')!;
const orbitResolutionEl = document.getElementById('orbit-resolution')!;
const speedButtons = document.querySelectorAll('.speed-option') as NodeListOf<HTMLButtonElement>;
const moonButtons = document.querySelectorAll('.moon-option') as NodeListOf<HTMLButtonElement>;

// Set up speed selector
speedButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.speed as SpeedMode;
    time.setSpeedMode(mode);

    // Update active state
    speedButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Set up moon filter selector
moonButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const category = btn.dataset.moons as MoonCategory;
    currentMoonFilter = category;
    bodies = buildBodies(time.currentJulian);

    // Update active state
    moonButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    console.log(`Moon filter: ${category} (${filterMoons(category).length} moons)`);
  });
});

// Calculate auto speed based on zoom level
// Interpolates in log-log space between these points:
// zoom 6.4e-5 → 1, zoom 2.7e-6 → 86400, zoom 1.2e-7 → 31536000, zoom 3.8e-12 → 315360000000
function getAutoSpeed(zoom: number): number {
  const logZoom = Math.log(zoom);

  // Control points in log space [logZoom, logSpeed]
  const p1 = { z: -9.66, s: 0 };        // 6.4e-5 → 1
  const p2 = { z: -12.82, s: 11.37 };   // 2.7e-6 → 86400
  const p3 = { z: -15.94, s: 17.27 };   // 1.2e-7 → 31536000
  const p4 = { z: -26.30, s: 26.48 };   // 3.8e-12 → 315360000000

  let logSpeed: number;

  if (logZoom >= p2.z) {
    // At or above p2 - use p1-p2 line (extrapolates beyond p1)
    const t = (logZoom - p1.z) / (p2.z - p1.z);
    logSpeed = p1.s + t * (p2.s - p1.s);
  } else if (logZoom >= p3.z) {
    // Between p2 and p3 - use p2-p3 line
    const t = (logZoom - p2.z) / (p3.z - p2.z);
    logSpeed = p2.s + t * (p3.s - p2.s);
  } else {
    // At or below p3 - use p3-p4 line (extrapolates beyond p4)
    const t = (logZoom - p3.z) / (p4.z - p3.z);
    logSpeed = p3.s + t * (p4.s - p3.s);
  }

  const maxSpeed = 5 * 31536000; // 5 years per second
  const minSpeed = 1; // Minimum 1 second per second (realtime)
  return Math.max(minSpeed, Math.min(Math.exp(logSpeed), maxSpeed));
}

// Handle window resize
window.addEventListener('resize', () => {
  camera.resize(canvas);
});

// Track mouse position for hover detection
let mouseX = 0;
let mouseY = 0;

// Track mouse down position to detect drag vs click
let mouseDownX = 0;
let mouseDownY = 0;
const DRAG_THRESHOLD = 5; // pixels

canvas.addEventListener('mousedown', (e) => {
  mouseDownX = e.offsetX;
  mouseDownY = e.offsetY;
});

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;
});

// Handle click to select body
canvas.addEventListener('click', (e) => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;

  // Calculate distance from mousedown to click
  const dx = mouseX - mouseDownX;
  const dy = mouseY - mouseDownY;
  const dragDistance = Math.sqrt(dx * dx + dy * dy);

  // Ignore if this was a drag (mouse moved significantly)
  if (dragDistance > DRAG_THRESHOLD) {
    return;
  }

  const hoverResult = getHoveredBody(time.currentJulian);
  if (hoverResult) {
    sidebar.show(hoverResult.body, time.currentJulian);
    renderer.setSelectedBody(hoverResult.body.name);
  } else {
    sidebar.hide();
    renderer.setSelectedBody(null);
  }
});

// Handle sidebar close
sidebar.setOnClose(() => {
  renderer.setSelectedBody(null);
});

// Calculate distance from point to line segment
function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    // Segment is a point
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }

  // Project point onto line, clamped to segment
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

// Check if a body is occluded by its parent (hidden inside parent's display radius)
function isOccludedByParent(body: CelestialBody, julianDate: number, bodyMap: Map<string, CelestialBody>): boolean {
  if (body.type === 'star' || body.fixedPosition) return false;

  const parentName = body.parentName || 'Sun';
  const parent = bodyMap.get(parentName);
  if (!parent) return false;

  const bodyPos = getBodyPosition(body, julianDate);
  const parentPos = getBodyPosition(parent, julianDate);

  const bodyScreen = camera.worldToScreen(bodyPos.x, bodyPos.y);
  const parentScreen = camera.worldToScreen(parentPos.x, parentPos.y);

  // Get parent's display radius (clamped to minimum)
  let parentRadiusPixels = camera.kmToPixels(parent.radius);
  const parentMinSize = MIN_DISPLAY_SIZE[parent.type];
  parentRadiusPixels = Math.max(parentRadiusPixels, parentMinSize);

  // Calculate distance from body to parent center in screen space
  const dx = bodyScreen.x - parentScreen.x;
  const dy = bodyScreen.y - parentScreen.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Body is occluded if it's inside the parent's display radius
  return distance <= parentRadiusPixels;
}

// Result type for hover detection
interface HoverResult {
  body: CelestialBody;
  isDirectHit: boolean; // true if hovering over the body itself, false if over orbit
}

// Find body under cursor (for zoom centering and click detection)
function getHoveredBody(julianDate: number): HoverResult | null {
  let closest: CelestialBody | null = null;
  let closestDist = Infinity;

  // Build body map for parent lookup
  const bodyMap = new Map(bodies.map(b => [b.name, b]));

  // First pass: check direct body hits (higher priority)
  for (const body of bodies) {
    // Skip bodies that are occluded by their parent
    if (isOccludedByParent(body, julianDate, bodyMap)) {
      continue;
    }

    const pos = getBodyPosition(body, julianDate);
    const screenPos = camera.worldToScreen(pos.x, pos.y);

    // Get display radius (clamped to minimum)
    let radiusPixels = camera.kmToPixels(body.radius);
    const minSize = MIN_DISPLAY_SIZE[body.type];
    radiusPixels = Math.max(radiusPixels, minSize);

    // Check if mouse is within the body's radius (with some padding for small objects)
    const hitRadius = Math.max(radiusPixels, 8);
    const dx = mouseX - screenPos.x;
    const dy = mouseY - screenPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= hitRadius && dist < closestDist) {
      closest = body;
      closestDist = dist;
    }
  }

  // If we found a direct body hit, return it with isDirectHit = true
  if (closest) {
    return { body: closest, isDirectHit: true };
  }

  // Second pass: check orbit hits
  const ORBIT_HIT_THRESHOLD = 8; // pixels
  let closestOrbitBody: CelestialBody | null = null;
  let closestOrbitDist = Infinity;

  for (const body of bodies) {
    // Skip stars (no orbit) and occluded bodies
    if (body.type === 'star' || body.fixedPosition) continue;
    if (isOccludedByParent(body, julianDate, bodyMap)) continue;

    // Get orbit path (use fewer points for performance)
    const orbitPath = getOrbitPath(body, julianDate, 60);
    if (orbitPath.length < 2) continue;

    // Check distance to each orbit segment
    for (let i = 0; i < orbitPath.length; i++) {
      const p1 = orbitPath[i];
      const p2 = orbitPath[(i + 1) % orbitPath.length];

      const screen1 = camera.worldToScreen(p1.x, p1.y);
      const screen2 = camera.worldToScreen(p2.x, p2.y);

      const dist = pointToSegmentDistance(mouseX, mouseY, screen1.x, screen1.y, screen2.x, screen2.y);

      if (dist <= ORBIT_HIT_THRESHOLD && dist < closestOrbitDist) {
        closestOrbitBody = body;
        closestOrbitDist = dist;
      }
    }
  }

  // Return orbit hit with isDirectHit = false
  if (closestOrbitBody) {
    return { body: closestOrbitBody, isDirectHit: false };
  }

  return null;
}

// Track last time we rebuilt bodies for timeline filtering
let lastBodiesRebuildJD = 0;
const BODIES_REBUILD_INTERVAL = 1; // Rebuild every ~1 Julian day

// Main render loop
function animate(): void {
  // Update auto speed based on zoom if in auto mode
  if (time.speedMode === 'auto') {
    time.setTimeScale(getAutoSpeed(camera.zoom));
  }

  // Update time
  time.update();

  // Rebuild bodies periodically for spacecraft timeline filtering
  if (hasSpacecraftData() && Math.abs(time.currentJulian - lastBodiesRebuildJD) > BODIES_REBUILD_INTERVAL) {
    bodies = buildBodies(time.currentJulian);
    lastBodiesRebuildJD = time.currentJulian;
  }

  // Update hover target for zoom centering and visual feedback
  const hoverResult = getHoveredBody(time.currentJulian);
  if (hoverResult) {
    // Only set hover target for zoom centering if directly hovering over the body (not orbit)
    if (hoverResult.isDirectHit) {
      const pos = getBodyPosition(hoverResult.body, time.currentJulian);
      camera.setHoverTarget({ x: pos.x, y: pos.y });
    } else {
      camera.setHoverTarget(null);
    }
    // Always show visual hover feedback for both body and orbit
    renderer.setHoveredBody(hoverResult.body.name);
  } else {
    camera.setHoverTarget(null);
    renderer.setHoveredBody(null);
  }

  // Render everything (asteroids first, then orbits, then bodies)
  renderer.renderAll(bodies, time.currentJulian, asteroidBelt);

  // Update UI
  dateDisplay.textContent = time.formatDate();
  currentSpeedEl.textContent = `speed ${time.timeScale.toFixed(0)}`;
  zoomLevelEl.textContent = `zoom ${camera.zoom.toExponential(1)}`;
  orbitResolutionEl.textContent = `${renderer.getOrbitResolution()} pts`;

  // Update sidebar if visible
  if (sidebar.isVisible()) {
    sidebar.update(time.currentJulian);
  }

  requestAnimationFrame(animate);
}

// Start the animation
animate();

console.log('Solar System initialized');
console.log('Canvas size:', canvas.width, 'x', canvas.height);
console.log('Camera size:', camera.width, 'x', camera.height);
console.log('Camera zoom:', camera.zoom);
console.log('Controls: Mouse wheel to zoom, drag to pan');
