import { Camera } from '../core/camera';
import { deg2rad, J2000, AU_KM } from './constants';

// Compact asteroid data structure (no secular rates needed)
export interface AsteroidData {
  name?: string;       // Only for major asteroids
  a: number;           // Semi-major axis (AU)
  e: number;           // Eccentricity
  i: number;           // Inclination (degrees)
  Omega: number;       // Longitude of ascending node (degrees)
  omega: number;       // Argument of perihelion (degrees)
  M0: number;          // Mean anomaly at epoch (degrees)
  n: number;           // Mean motion (degrees per day)
}

// Position result
interface Position {
  x: number;
  y: number;
}

// Solve Kepler's equation for elliptical orbits
function solveKepler(M: number, e: number, tolerance: number = 1e-6): number {
  let E = M;
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tolerance) break;
  }
  return E;
}

// Calculate asteroid position (returns km from Sun)
function calculateAsteroidPosition(ast: AsteroidData, julianDate: number): Position {
  const daysSinceJ2000 = julianDate - J2000;

  // Mean anomaly at current time
  let M = ast.M0 + ast.n * daysSinceJ2000;
  M = ((M % 360) + 360) % 360;
  M = deg2rad(M);

  // Solve Kepler's equation
  const E = solveKepler(M, ast.e);

  // Position in orbital plane (AU)
  const x_orb = ast.a * (Math.cos(E) - ast.e);
  const y_orb = ast.a * Math.sqrt(1 - ast.e * ast.e) * Math.sin(E);

  // Rotate to ecliptic (simplified 2D)
  const angle = deg2rad(ast.omega + ast.Omega);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  return {
    x: (x_orb * cosAngle - y_orb * sinAngle) * AU_KM,
    y: (x_orb * sinAngle + y_orb * cosAngle) * AU_KM,
  };
}

// Main asteroid belt class (LOD disabled - shows all asteroids)
export class AsteroidBelt {
  private asteroids: AsteroidData[] = [];

  // Belt boundaries (AU)
  private readonly INNER_BELT = 2.1;
  private readonly OUTER_BELT = 3.3;

  // Color for rendering
  readonly color = '#888888';

  constructor(asteroids: AsteroidData[]) {
    this.asteroids = asteroids;
  }

  // Get count of asteroids
  get count(): number {
    return this.asteroids.length;
  }

  // Get visible asteroids (all of them - LOD disabled)
  getVisibleAsteroids(
    _camera: Camera,
    julianDate: number
  ): Position[] {
    return this.getAsteroidPositions(this.asteroids, julianDate);
  }

  // Get positions for specific asteroids
  private getAsteroidPositions(asteroids: AsteroidData[], julianDate: number): Position[] {
    return asteroids.map(ast => calculateAsteroidPosition(ast, julianDate));
  }

  // Should render the statistical belt ring? (disabled - showing all asteroids)
  shouldRenderBeltRing(_camera: Camera): boolean {
    return false;
  }

  // Get belt ring coordinates for rendering
  getBeltRingPath(_camera: Camera, numPoints: number = 120): Array<{inner: Position; outer: Position}> {
    const path: Array<{inner: Position; outer: Position}> = [];

    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      path.push({
        inner: {
          x: this.INNER_BELT * AU_KM * cos,
          y: this.INNER_BELT * AU_KM * sin,
        },
        outer: {
          x: this.OUTER_BELT * AU_KM * cos,
          y: this.OUTER_BELT * AU_KM * sin,
        },
      });
    }

    return path;
  }
}

// Generate sample asteroid data for testing/default
export function generateSampleAsteroids(count: number): AsteroidData[] {
  const asteroids: AsteroidData[] = [];

  // Named major asteroids (real approximate data)
  const majorAsteroids: AsteroidData[] = [
    { name: 'Vesta', a: 2.362, e: 0.089, i: 7.14, Omega: 103.8, omega: 149.8, M0: 20, n: 0.272 },
    { name: 'Pallas', a: 2.772, e: 0.231, i: 34.8, Omega: 173.1, omega: 310.2, M0: 78, n: 0.214 },
    { name: 'Hygiea', a: 3.142, e: 0.117, i: 3.84, Omega: 283.4, omega: 312.3, M0: 156, n: 0.176 },
    { name: 'Interamnia', a: 3.062, e: 0.150, i: 17.3, Omega: 280.3, omega: 95.9, M0: 234, n: 0.183 },
    { name: 'Europa', a: 3.095, e: 0.101, i: 7.47, Omega: 128.6, omega: 343.5, M0: 312, n: 0.180 },
    { name: 'Davida', a: 3.163, e: 0.185, i: 15.9, Omega: 107.6, omega: 339.0, M0: 45, n: 0.174 },
    { name: 'Sylvia', a: 3.485, e: 0.085, i: 10.9, Omega: 73.2, omega: 266.2, M0: 123, n: 0.152 },
    { name: 'Euphrosyne', a: 3.155, e: 0.226, i: 26.3, Omega: 31.1, omega: 61.7, M0: 89, n: 0.175 },
    { name: 'Eunomia', a: 2.644, e: 0.185, i: 11.7, Omega: 293.2, omega: 98.9, M0: 201, n: 0.230 },
    { name: 'Psyche', a: 2.923, e: 0.134, i: 3.10, Omega: 150.3, omega: 228.0, M0: 67, n: 0.199 },
  ];

  asteroids.push(...majorAsteroids);

  // Generate random asteroids in main belt
  for (let i = majorAsteroids.length; i < count; i++) {
    // Semi-major axis: 2.1-3.3 AU (main belt)
    const a = 2.1 + Math.random() * 1.2;

    // Eccentricity: 0.0-0.3 (most are low)
    const e = Math.random() * 0.25;

    // Inclination: mostly low, some higher
    const i = Math.random() < 0.8
      ? Math.random() * 10
      : 10 + Math.random() * 20;

    // Random angles
    const Omega = Math.random() * 360;
    const omega = Math.random() * 360;
    const M0 = Math.random() * 360;

    // Mean motion from semi-major axis (Kepler's 3rd law)
    // n = 360 / (a^1.5 * 365.25) degrees per day
    const n = 360 / (Math.pow(a, 1.5) * 365.25);

    asteroids.push({ a, e, i, Omega, omega, M0, n });
  }

  return asteroids;
}
