import { deg2rad, J2000, AU_KM } from './constants';

// Orbital elements for a celestial body (heliocentric, AU-based)
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

// Orbital elements for moons/satellites (parent-centric, km-based)
export interface ParentCentricElements {
  a: number;        // Semi-major axis (km)
  e: number;        // Eccentricity
  i: number;        // Inclination (degrees)
  M0: number;       // Mean anomaly at epoch (degrees)
  omega: number;    // Argument of periapsis (degrees)
  Omega: number;    // Longitude of ascending node (degrees)
  n: number;        // Mean motion (degrees per day)
  epoch: number;    // Epoch as Julian date
}

// Solve Kepler's equation: M = E - e*sin(E)
// Returns eccentric anomaly E given mean anomaly M and eccentricity e
function solveKepler(M: number, e: number, tolerance: number = 1e-8): number {
  // For hyperbolic orbits (e > 1), use different formula
  if (e > 1) {
    return solveKeplerHyperbolic(M, e, tolerance);
  }

  // Use tighter tolerance for high-eccentricity orbits to avoid position glitches
  if (e > 0.9) {
    tolerance = 1e-12;
  }

  // Better initial guess for high-eccentricity orbits
  // Standard: E = M works for low e
  // High e: E = M + e*sin(M)*(1 + e*cos(M)) is much better
  let E: number;
  if (e > 0.8) {
    const sinM = Math.sin(M);
    const cosM = Math.cos(M);
    E = M + e * sinM * (1 + e * cosM);
  } else {
    E = M;
  }

  // Newton-Raphson iteration
  for (let i = 0; i < 100; i++) {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const denom = 1 - e * cosE;

    // Avoid division by zero
    if (Math.abs(denom) < 1e-15) break;

    const dE = (E - e * sinE - M) / denom;
    E -= dE;
    if (Math.abs(dE) < tolerance) break;
  }

  return E;
}

// Solve hyperbolic Kepler's equation: M = e*sinh(H) - H
function solveKeplerHyperbolic(M: number, e: number, tolerance: number = 1e-8): number {
  // Better initial guess for hyperbolic orbits
  // For large |M|, H ≈ sign(M) * ln(2|M|/e) is a good approximation
  // For small |M|, H ≈ M works fine
  let H: number;
  if (Math.abs(M) < 1) {
    H = M;
  } else {
    // Use logarithmic approximation for large M
    H = Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8);
  }

  // Newton-Raphson iteration
  for (let i = 0; i < 50; i++) {
    const sinhH = Math.sinh(H);
    const coshH = Math.cosh(H);
    const dH = (e * sinhH - H - M) / (e * coshH - 1);
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
    // Use Math.max to handle floating-point errors that could make e*e - 1 negative
    const y = a * Math.sqrt(Math.max(0, e * e - 1)) * Math.sinh(E);
    return { x, y };
  } else {
    // Elliptical orbit
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const x = a * (cosE - e);

    // For high eccentricity (e > 0.99), compute semi-minor axis b more carefully
    // b = a * sqrt(1 - e²) can lose precision when e ≈ 1
    // Use: b = a * sqrt((1-e)*(1+e)) for better numerical stability
    let b: number;
    if (e > 0.99) {
      b = a * Math.sqrt((1 - e) * (1 + e));
    } else {
      b = a * Math.sqrt(1 - e * e);
    }

    const y = b * sinE;
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

  // Only normalize for elliptical orbits - hyperbolic orbits need unbounded M
  if (e < 1) {
    M = ((M % 360) + 360) % 360;
  }
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

// Calculate position for a moon/satellite relative to its parent (returns km)
export function calculateParentCentricPosition(
  elements: ParentCentricElements,
  julianDate: number
): { x: number; y: number } {
  // Days since epoch
  const dt = julianDate - elements.epoch;

  // Mean anomaly at current time
  let M = elements.M0 + elements.n * dt;

  // Normalize to 0-360
  M = ((M % 360) + 360) % 360;
  M = deg2rad(M);

  // Solve Kepler's equation
  const E = solveKepler(M, elements.e);

  // Calculate position in orbital plane (km, since a is in km)
  const orbitalPos = calculateOrbitalPosition(elements.a, elements.e, E);

  // Rotate to reference plane (using omega + Omega for 2D projection)
  const angle = deg2rad(elements.omega + elements.Omega);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  return {
    x: orbitalPos.x * cosAngle - orbitalPos.y * sinAngle,
    y: orbitalPos.x * sinAngle + orbitalPos.y * cosAngle,
  };
}

// Calculate orbit path for a moon/satellite relative to its parent (returns km)
export function calculateParentCentricOrbitPath(
  elements: ParentCentricElements,
  numPoints: number = 180
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const e = elements.e;

  // Pre-compute semi-latus rectum p = a * (1 - e²) for numerical stability
  let p: number;
  if (e > 0.99) {
    p = elements.a * (1 - e) * (1 + e);
  } else if (e > 1) {
    p = elements.a * (e * e - 1);
  } else {
    p = elements.a * (1 - e * e);
  }

  // For hyperbolic orbits, only draw the visible portion
  const maxAngle = e > 1 ? Math.acos(-1 / e) * 0.95 : Math.PI;

  // Pre-compute rotation angle
  const angle = deg2rad(elements.omega + elements.Omega);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  for (let j = 0; j <= numPoints; j++) {
    // True anomaly from -maxAngle to +maxAngle
    const nu = (j / numPoints) * 2 * maxAngle - maxAngle;

    // Distance from focus using pre-computed semi-latus rectum
    const cosNu = Math.cos(nu);
    const denom = 1 + e * cosNu;

    // Skip points where denominator is too close to zero
    if (Math.abs(denom) < 1e-10) continue;

    const r = p / denom;

    if (r < 0 || !isFinite(r)) continue;

    // Position in orbital plane (km)
    const orbitalPos = {
      x: r * cosNu,
      y: r * Math.sin(nu),
    };

    points.push({
      x: orbitalPos.x * cosAngle - orbitalPos.y * sinAngle,
      y: orbitalPos.x * sinAngle + orbitalPos.y * cosAngle,
    });
  }

  return points;
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

  // Pre-compute semi-latus rectum p = a * (1 - e²) for numerical stability
  // For high eccentricity, use p = a * (1-e) * (1+e) to avoid catastrophic cancellation
  let p: number;
  if (e > 0.99) {
    p = a * (1 - e) * (1 + e);
  } else if (e > 1) {
    p = a * (e * e - 1); // Hyperbolic: negative a, so p > 0
  } else {
    p = a * (1 - e * e);
  }

  // For hyperbolic orbits, only draw the visible portion
  const maxAngle = e > 1 ? Math.acos(-1/e) * 0.95 : Math.PI;

  for (let j = 0; j <= numPoints; j++) {
    // True anomaly from -maxAngle to +maxAngle
    const nu = (j / numPoints) * 2 * maxAngle - maxAngle;

    // Distance from focus using pre-computed semi-latus rectum
    const cosNu = Math.cos(nu);
    const denom = 1 + e * cosNu;

    // Skip points where denominator is too close to zero (near asymptote)
    if (Math.abs(denom) < 1e-10) continue;

    const r = p / denom;

    if (r < 0 || !isFinite(r)) continue;

    // Position in orbital plane
    const orbitalPos = {
      x: r * cosNu,
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
