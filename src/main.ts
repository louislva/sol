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
const UI_UPDATE_INTERVAL_MS = 100;
let lastUIUpdateMs = Number.NEGATIVE_INFINITY;

function setTextIfChanged(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

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
let isPointerOverCanvas = false;
let hoverNeedsUpdate = false;
let lastHoverUpdateMs = 0;
const HOVER_REFRESH_INTERVAL_MS = 100;

// Track mouse down position to detect drag vs click
let mouseDownX = 0;
let mouseDownY = 0;
const DRAG_THRESHOLD = 5; // pixels

canvas.addEventListener('mousedown', (e) => {
  mouseDownX = e.offsetX;
  mouseDownY = e.offsetY;
});

canvas.addEventListener('mouseenter', (e) => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;
  isPointerOverCanvas = true;
  hoverNeedsUpdate = true;
});

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;
  isPointerOverCanvas = true;
  hoverNeedsUpdate = true;
});

canvas.addEventListener('wheel', () => {
  hoverNeedsUpdate = true;
}, { passive: true });

canvas.addEventListener('mouseleave', () => {
  isPointerOverCanvas = false;
  hoverNeedsUpdate = false;
  camera.setHoverTarget(null);
  renderer.setHoveredBody(null);
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
    if (body.hideOrbit) continue;
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

function updateHoverState(julianDate: number): void {
  const hoverResult = getHoveredBody(julianDate);
  if (hoverResult) {
    // Only center zoom on direct body hits, not orbit hits.
    if (hoverResult.isDirectHit) {
      const pos = getBodyPosition(hoverResult.body, julianDate);
      camera.setHoverTarget({ x: pos.x, y: pos.y });
    } else {
      camera.setHoverTarget(null);
    }
    renderer.setHoveredBody(hoverResult.body.name);
  } else {
    camera.setHoverTarget(null);
    renderer.setHoveredBody(null);
  }
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

  // Hit testing is expensive, so run it immediately after pointer/camera input
  // and periodically while the pointer rests over moving bodies.
  const now = performance.now();
  if (
    isPointerOverCanvas
    && (hoverNeedsUpdate || now - lastHoverUpdateMs >= HOVER_REFRESH_INTERVAL_MS)
  ) {
    updateHoverState(time.currentJulian);
    hoverNeedsUpdate = false;
    lastHoverUpdateMs = now;
  }

  // Render everything (asteroids first, then orbits, then bodies)
  renderer.renderAll(bodies, time.currentJulian, asteroidBelt);

  // Text does not need animation-frame cadence. Avoid layout work when the
  // formatted values have not changed.
  if (now - lastUIUpdateMs >= UI_UPDATE_INTERVAL_MS) {
    setTextIfChanged(dateDisplay, time.formatDate());
    setTextIfChanged(currentSpeedEl, `speed ${time.timeScale.toFixed(0)}`);
    setTextIfChanged(zoomLevelEl, `zoom ${camera.zoom.toExponential(1)}`);
    setTextIfChanged(orbitResolutionEl, `${renderer.getOrbitResolution()} pts`);

    if (sidebar.isVisible()) {
      sidebar.update(time.currentJulian);
    }

    lastUIUpdateMs = now;
  }

  requestAnimationFrame(animate);
}

// Start the animation
animate();

// ── Console API ──────────────────────────────────────────────────────
// Expose control functions on window.sol for devtools / MCP automation

const AU_KM_CONST = 149597870.7;

interface SolAPI {
  // Navigation
  goto(bodyName: string): string;
  pan(dx: number, dy: number): string;
  panTo(x: number, y: number): string;
  panToAU(x: number, y: number): string;
  zoom(level: number): string;
  zoomIn(factor?: number): string;
  zoomOut(factor?: number): string;

  // Time
  setDate(dateStr: string): string;
  setSpeed(mode: SpeedMode): string;
  setTimeScale(scale: number): string;
  pause(): string;
  resume(): string;
  getDate(): string;

  // Info
  listBodies(): string[];
  findBody(query: string): string[];
  getBody(name: string): { name: string; type: string; x: number; y: number; xAU: number; yAU: number } | null;
  status(): { date: string; speed: string; zoom: number; center: { x: number; y: number }; centerAU: { x: number; y: number } };

  // Selection
  select(bodyName: string): string;
  deselect(): string;

  help(): void;
}

const sol: SolAPI = {
  // ── Navigation ──

  goto(bodyName: string) {
    const body = bodies.find(b => b.name.toLowerCase() === bodyName.toLowerCase());
    if (!body) return `Body "${bodyName}" not found. Use sol.findBody("${bodyName}") to search.`;
    const pos = getBodyPosition(body, time.currentJulian);
    camera.x = pos.x;
    camera.y = pos.y;
    // Auto-zoom based on body type
    const zoomLevels: Record<string, number> = {
      star: 0.000001,
      planet: 0.00005,
      'dwarf-planet': 0.0001,
      moon: 0.001,
      comet: 0.00005,
      probe: 0.00005,
      satellite: 0.01,
    };
    const targetZoom = zoomLevels[body.type] || 0.00005;
    camera['_zoom'] = targetZoom;
    camera['_targetZoom'] = targetZoom;
    return `Navigated to ${body.name} at (${(pos.x / AU_KM_CONST).toFixed(3)} AU, ${(pos.y / AU_KM_CONST).toFixed(3)} AU)`;
  },

  pan(dx: number, dy: number) {
    camera.x += dx * AU_KM_CONST;
    camera.y += dy * AU_KM_CONST;
    return `Panned by (${dx} AU, ${dy} AU). Center now at (${(camera.x / AU_KM_CONST).toFixed(3)} AU, ${(camera.y / AU_KM_CONST).toFixed(3)} AU)`;
  },

  panTo(x: number, y: number) {
    camera.x = x;
    camera.y = y;
    return `Camera center set to (${x} km, ${y} km)`;
  },

  panToAU(x: number, y: number) {
    camera.x = x * AU_KM_CONST;
    camera.y = y * AU_KM_CONST;
    return `Camera center set to (${x} AU, ${y} AU)`;
  },

  zoom(level: number) {
    camera['_zoom'] = level;
    camera['_targetZoom'] = level;
    return `Zoom set to ${level.toExponential(2)}`;
  },

  zoomIn(factor = 3) {
    const newZoom = Math.min(1, camera.zoom * factor);
    camera['_zoom'] = newZoom;
    camera['_targetZoom'] = newZoom;
    return `Zoomed in to ${newZoom.toExponential(2)}`;
  },

  zoomOut(factor = 3) {
    const newZoom = Math.max(1e-12, camera.zoom / factor);
    camera['_zoom'] = newZoom;
    camera['_targetZoom'] = newZoom;
    return `Zoomed out to ${newZoom.toExponential(2)}`;
  },

  // ── Time ──

  setDate(dateStr: string) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return `Invalid date: "${dateStr}". Use ISO format like "2024-01-15".`;
    time.setDate(date);
    return `Date set to ${time.formatDate()}`;
  },

  setSpeed(mode: SpeedMode) {
    time.setSpeedMode(mode);
    // Update UI button state
    speedButtons.forEach(b => {
      b.classList.toggle('active', b.dataset.speed === mode);
    });
    return `Speed mode set to "${mode}"`;
  },

  setTimeScale(scale: number) {
    time.setTimeScale(scale);
    return `Time scale set to ${scale} (${scale / 86400} days/sec)`;
  },

  pause() {
    time.setTimeScale(0);
    return 'Paused';
  },

  resume() {
    sol.setSpeed('auto');
    return 'Resumed with auto speed';
  },

  getDate() {
    return time.formatDate();
  },

  // ── Info ──

  listBodies() {
    return bodies.map(b => b.name);
  },

  findBody(query: string) {
    const q = query.toLowerCase();
    return bodies.filter(b => b.name.toLowerCase().includes(q)).map(b => `${b.name} (${b.type})`);
  },

  getBody(name: string) {
    const body = bodies.find(b => b.name.toLowerCase() === name.toLowerCase());
    if (!body) return null;
    const pos = getBodyPosition(body, time.currentJulian);
    return {
      name: body.name,
      type: body.type,
      x: pos.x,
      y: pos.y,
      xAU: pos.x / AU_KM_CONST,
      yAU: pos.y / AU_KM_CONST,
    };
  },

  status() {
    return {
      date: time.formatDate(),
      speed: `${time.timeScale.toFixed(0)} sec/sec (${time.speedMode})`,
      zoom: camera.zoom,
      center: { x: camera.x, y: camera.y },
      centerAU: { x: camera.x / AU_KM_CONST, y: camera.y / AU_KM_CONST },
    };
  },

  // ── Selection ──

  select(bodyName: string) {
    const body = bodies.find(b => b.name.toLowerCase() === bodyName.toLowerCase());
    if (!body) return `Body "${bodyName}" not found.`;
    sidebar.show(body, time.currentJulian);
    renderer.setSelectedBody(body.name);
    return `Selected ${body.name}`;
  },

  deselect() {
    sidebar.hide();
    renderer.setSelectedBody(null);
    return 'Deselected';
  },

  // ── Help ──

  help() {
    console.log(`%c🌍 sol — Console API`, 'font-size: 14px; font-weight: bold; color: #4fc3f7');
    console.log(`
Navigation:
  sol.goto("Earth")          Navigate camera to a body (auto-zooms)
  sol.pan(1, 0)              Pan by offset in AU
  sol.panToAU(1, 0)          Pan to absolute position in AU
  sol.zoom(0.0001)           Set zoom level (pixels/km)
  sol.zoomIn(3)              Zoom in by factor (default 3x)
  sol.zoomOut(3)             Zoom out by factor (default 3x)

Time:
  sol.setDate("2024-07-04")  Jump to a specific date
  sol.setSpeed("year")       Set speed: auto|realtime|day|month|year
  sol.setTimeScale(86400)    Set exact time scale (sec/sec)
  sol.pause()                Pause time
  sol.resume()               Resume with auto speed
  sol.getDate()              Get current date

Info:
  sol.listBodies()           List all body names
  sol.findBody("mars")       Search bodies by name
  sol.getBody("Earth")       Get body position and info
  sol.status()               Get camera, time, zoom status

Selection:
  sol.select("Jupiter")      Select a body (opens sidebar)
  sol.deselect()             Clear selection
    `);
  },
};

(window as any).sol = sol;

console.log('Solar System initialized');
console.log('%cType sol.help() for console API', 'color: #4fc3f7; font-weight: bold');
console.log('Canvas size:', canvas.width, 'x', canvas.height);
console.log('Camera size:', camera.width, 'x', camera.height);
console.log('Camera zoom:', camera.zoom);
console.log('Controls: Mouse wheel to zoom, drag to pan');
