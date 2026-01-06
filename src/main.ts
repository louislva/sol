import './style.css';
import { Camera } from './core/camera';
import { Renderer } from './core/renderer';
import { TimeSystem, type SpeedMode, SPEED_VALUES } from './core/time';
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
const speedIndicator = document.getElementById('speed-indicator')!;
const speedButtons = document.querySelectorAll('.speed-option') as NodeListOf<HTMLButtonElement>;

// Format time scale for display
function formatSpeed(scale: number): string {
  if (scale < 60) return `${scale}x`;
  if (scale < 3600) return `${Math.round(scale / 60)} min/s`;
  if (scale < 86400) return `${Math.round(scale / 3600)} hr/s`;
  if (scale < 604800) return `${Math.round(scale / 86400)} day/s`;
  if (scale < 2592000) return `${Math.round(scale / 604800)} wk/s`;
  if (scale < 31536000) return `${Math.round(scale / 2592000)} mo/s`;
  return `${Math.round(scale / 31536000)} yr/s`;
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

// Calculate auto speed based on zoom level
function getAutoSpeed(zoom: number): number {
  // At very high zoom (close to planets), slow down
  // At low zoom (seeing whole system), speed up
  // zoom is pixels per km

  if (zoom > 0.001) {
    // Very zoomed in - realtime to see moons/probes move
    return SPEED_VALUES.realtime;
  } else if (zoom > 0.0000001) {
    // Medium zoom - 1 day per second
    return SPEED_VALUES.day;
  } else if (zoom > 0.00000001) {
    // Zoomed out - 1 month per second
    return SPEED_VALUES.month;
  } else {
    // Very zoomed out - 1 year per second
    return SPEED_VALUES.year;
  }
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
  speedIndicator.textContent = formatSpeed(time.timeScale);

  requestAnimationFrame(animate);
}

// Start the animation
animate();

console.log('Solar System initialized');
console.log('Canvas size:', canvas.width, 'x', canvas.height);
console.log('Camera size:', camera.width, 'x', camera.height);
console.log('Camera zoom:', camera.zoom);
console.log('Controls: Mouse wheel to zoom, drag to pan');
