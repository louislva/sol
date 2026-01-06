import { deg2rad, J2000, AU_KM } from './constants';

// Orbital elements for a celestial body
export interface OrbitalElements {
  a: number;      // Semi-major axis (AU)
  e: number;      // Eccentricity
  i: number;      // Inclination (degrees)
  L: number;      // Mean longitude (degrees)
  longPeri: number; // Longitude of perihelion (degrees)
  longNode: number; // Longitude of ascending node (degrees)

  // Rates of change per century (for planets)
  aDot?: number;
  eDot?: number;
  iDot?: number;
  LDot?: number;
  longPeriDot?: number;
  longNodeDot?: number;
}

// Solve Kepler's equation: M = E - e*sin(E)
// Returns eccentric anomaly E given mean anomaly M and eccentricity e
function solveKepler(M: number, e: number, tolerance: number = 1e-8): number {
  // For hyperbolic orbits (e > 1), use different formula
  if (e > 1) {
    return solveKeplerHyperbolic(M, e, tolerance);
  }

  // Initial guess
  let E = M;

  // Newton-Raphson iteration
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tolerance) break;
  }

  return E;
}

// Solve hyperbolic Kepler's equation: M = e*sinh(H) - H
function solveKeplerHyperbolic(M: number, e: number, tolerance: number = 1e-8): number {
  // Initial guess
  let H = M;

  // Newton-Raphson iteration
  for (let i = 0; i < 50; i++) {
    const dH = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= dH;
    if (Math.abs(dH) < tolerance) break;
  }

  return H;
}

// Calculate position in the orbital plane
function calculateOrbitalPosition(a: number, e: number, E: number): { x: number; y: number } {
  if (e > 1) {
    // Hyperbolic orbit
    const x = a * (e - Math.cosh(E));
    const y = a * Math.sqrt(e * e - 1) * Math.sinh(E);
    return { x, y };
  } else {
    // Elliptical orbit
    const x = a * (Math.cos(E) - e);
    const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
    return { x, y };
  }
}

// Rotate from orbital plane to ecliptic coordinates (simplified 2D projection)
function rotateToEcliptic(
  pos: { x: number; y: number },
  longPeri: number,
  longNode: number,
  _i: number
): { x: number; y: number } {
  // For top-down view, we project to the ecliptic plane
  // This simplifies the 3D rotation to essentially just rotating by argument of perihelion
  const omega = longPeri - longNode; // Argument of perihelion
  const cosOmega = Math.cos(deg2rad(omega + longNode));
  const sinOmega = Math.sin(deg2rad(omega + longNode));

  // Apply rotation (simplified for 2D top-down view)
  const x = pos.x * cosOmega - pos.y * sinOmega;
  const y = pos.x * sinOmega + pos.y * cosOmega;

  return { x, y };
}

// Calculate heliocentric position for a body at a given Julian date
export function calculatePosition(
  elements: OrbitalElements,
  julianDate: number
): { x: number; y: number } {
  // Centuries since J2000
  const T = (julianDate - J2000) / 36525;

  // Apply secular variations if available
  const a = elements.a + (elements.aDot || 0) * T;
  const e = elements.e + (elements.eDot || 0) * T;
  const i = elements.i + (elements.iDot || 0) * T;
  const L = elements.L + (elements.LDot || 0) * T;
  const longPeri = elements.longPeri + (elements.longPeriDot || 0) * T;
  const longNode = elements.longNode + (elements.longNodeDot || 0) * T;

  // Mean anomaly
  let M = L - longPeri;

  // Normalize to 0-360
  M = ((M % 360) + 360) % 360;
  M = deg2rad(M);

  // Solve Kepler's equation
  const E = solveKepler(M, e);

  // Calculate position in orbital plane (AU)
  const orbitalPos = calculateOrbitalPosition(a, e, E);

  // Rotate to ecliptic coordinates
  const eclipticPos = rotateToEcliptic(orbitalPos, longPeri, longNode, i);

  // Convert from AU to km
  return {
    x: eclipticPos.x * AU_KM,
    y: eclipticPos.y * AU_KM,
  };
}

// Calculate orbit path points for rendering
export function calculateOrbitPath(
  elements: OrbitalElements,
  julianDate: number,
  numPoints: number = 360
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const T = (julianDate - J2000) / 36525;

  // Get current elements
  const a = elements.a + (elements.aDot || 0) * T;
  const e = elements.e + (elements.eDot || 0) * T;
  const i = elements.i + (elements.iDot || 0) * T;
  const longPeri = elements.longPeri + (elements.longPeriDot || 0) * T;
  const longNode = elements.longNode + (elements.longNodeDot || 0) * T;

  // For hyperbolic orbits, only draw the visible portion
  const maxAngle = e > 1 ? Math.acos(-1/e) * 0.95 : Math.PI;

  for (let j = 0; j <= numPoints; j++) {
    // True anomaly from -maxAngle to +maxAngle
    const nu = (j / numPoints) * 2 * maxAngle - maxAngle;

    // Distance from focus
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));

    if (r < 0 || !isFinite(r)) continue;

    // Position in orbital plane
    const orbitalPos = {
      x: r * Math.cos(nu),
      y: r * Math.sin(nu),
    };

    // Rotate to ecliptic
    const eclipticPos = rotateToEcliptic(orbitalPos, longPeri, longNode, i);

    points.push({
      x: eclipticPos.x * AU_KM,
      y: eclipticPos.y * AU_KM,
    });
  }

  return points;
}
