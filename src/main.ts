import './style.css';
import { Camera } from './core/camera';
import { Renderer } from './core/renderer';
import { TimeSystem } from './core/time';
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
const speedDisplay = document.getElementById('speed-display')!;
const pauseBtn = document.getElementById('pause')!;
const fasterBtn = document.getElementById('faster')!;
const slowerBtn = document.getElementById('slower')!;

// Set up controls
pauseBtn.addEventListener('click', () => {
  time.togglePause();
  pauseBtn.textContent = time.paused ? '▶' : '⏸';
});

fasterBtn.addEventListener('click', () => {
  time.faster();
});

slowerBtn.addEventListener('click', () => {
  time.slower();
});

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
  speedDisplay.textContent = time.getSpeedLabel();

  requestAnimationFrame(animate);
}

// Start the animation
animate();

console.log('Solar System initialized');
console.log('Canvas size:', canvas.width, 'x', canvas.height);
console.log('Camera size:', camera.width, 'x', camera.height);
console.log('Camera zoom:', camera.zoom);
console.log('Controls: Mouse wheel to zoom, drag to pan');
