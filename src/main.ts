import './style.css';
import { Camera } from './core/camera';
import { Renderer } from './core/renderer';
import { TimeSystem, type SpeedMode } from './core/time';
import { allBodies, type CelestialBody, getBodyPosition } from './astronomy/bodies';
import { allMoons } from './data/moons';
import { allProbes } from './data/probes';
import { allComets } from './data/comets';
import { AsteroidBelt, generateSampleAsteroids } from './astronomy/asteroidBelt';
import { MIN_DISPLAY_SIZE } from './astronomy/constants';

// Get canvas element
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// Initialize systems
const camera = new Camera(canvas);
const renderer = new Renderer(canvas, camera);
const time = new TimeSystem();

// Combine all celestial bodies
const bodies: CelestialBody[] = [
  ...allBodies,   // Sun, planets, dwarf planets
  ...allMoons,    // Moons of planets
  ...allProbes,   // Space probes
  ...allComets,   // Comets
];

// Initialize asteroid belt with sample data
// For production: load from src/data/asteroids.json
const asteroidBelt = new AsteroidBelt(generateSampleAsteroids(10000));
console.log(`Loaded ${asteroidBelt.count} asteroids`);

// UI elements
const dateDisplay = document.getElementById('date-display')!;
const currentSpeedEl = document.getElementById('current-speed')!;
const zoomLevelEl = document.getElementById('zoom-level')!;
const speedButtons = document.querySelectorAll('.speed-option') as NodeListOf<HTMLButtonElement>;

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

// Calculate auto speed based on zoom level
// Interpolates in log-log space between these points:
// zoom 6.4e-5 → 1, zoom 2.7e-6 → 86400, zoom 1.2e-7 → 31536000
function getAutoSpeed(zoom: number): number {
  const logZoom = Math.log(zoom);

  // Control points in log space [logZoom, logSpeed]
  const p1 = { z: -9.66, s: 0 };        // 6.4e-5 → 1
  const p2 = { z: -12.82, s: 11.37 };   // 2.7e-6 → 86400
  const p3 = { z: -15.94, s: 17.27 };   // 1.2e-7 → 31536000

  let logSpeed: number;

  if (logZoom >= p2.z) {
    // At or above p2 - use p1-p2 line (extrapolates beyond p1)
    const t = (logZoom - p1.z) / (p2.z - p1.z);
    logSpeed = p1.s + t * (p2.s - p1.s);
  } else {
    // At or below p2 - use p2-p3 line (extrapolates beyond p3)
    const t = (logZoom - p2.z) / (p3.z - p2.z);
    logSpeed = p2.s + t * (p3.s - p2.s);
  }

  return Math.exp(logSpeed);
}

// Handle window resize
window.addEventListener('resize', () => {
  camera.resize(canvas);
});

// Track mouse position for hover detection
let mouseX = 0;
let mouseY = 0;

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;
});

// Find body under cursor (for zoom centering)
function getHoveredBody(julianDate: number): CelestialBody | null {
  let closest: CelestialBody | null = null;
  let closestDist = Infinity;

  for (const body of bodies) {
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

  return closest;
}

// Main render loop
function animate(): void {
  // Update auto speed based on zoom if in auto mode
  if (time.speedMode === 'auto') {
    time.setTimeScale(getAutoSpeed(camera.zoom));
  }

  // Update time
  time.update();

  // Update hover target for zoom centering and visual feedback
  const hoveredBody = getHoveredBody(time.currentJulian);
  if (hoveredBody) {
    const pos = getBodyPosition(hoveredBody, time.currentJulian);
    camera.setHoverTarget({ x: pos.x, y: pos.y });
    renderer.setHoveredBody(hoveredBody.name);
  } else {
    camera.setHoverTarget(null);
    renderer.setHoveredBody(null);
  }

  // Render all celestial bodies
  renderer.renderAll(bodies, time.currentJulian);

  // Render asteroid belt
  renderer.renderAsteroids(asteroidBelt, time.currentJulian);

  // Update UI
  dateDisplay.textContent = time.formatDate();
  currentSpeedEl.textContent = `speed ${time.timeScale}`;
  zoomLevelEl.textContent = `zoom ${camera.zoom.toExponential(1)}`;

  requestAnimationFrame(animate);
}

// Start the animation
animate();

console.log('Solar System initialized');
console.log('Canvas size:', canvas.width, 'x', canvas.height);
console.log('Camera size:', camera.width, 'x', camera.height);
console.log('Camera zoom:', camera.zoom);
console.log('Controls: Mouse wheel to zoom, drag to pan');
