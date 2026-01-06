import './style.css';
import { Camera } from './core/camera';
import { Renderer } from './core/renderer';
import { TimeSystem } from './core/time';
import { allBodies, type CelestialBody } from './astronomy/bodies';
import { allMoons } from './data/moons';
import { allProbes } from './data/probes';
import { allComets } from './data/comets';
import { AsteroidBelt, generateSampleAsteroids } from './astronomy/asteroidBelt';

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

// Main render loop
function animate(): void {
  // Update time
  time.update();

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
