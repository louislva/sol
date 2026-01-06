/**
 * Two-Line Element (TLE) Parsing for Earth Satellites
 *
 * TLEs are the standard format for satellite orbital elements.
 * This module parses TLE data and provides simplified Keplerian propagation.
 *
 * For accurate satellite positions, consider using a full SGP4 propagator.
 * This implementation uses simplified Keplerian mechanics which is sufficient
 * for visualization purposes.
 */

import { deg2rad } from './constants';

// Raw TLE data structure
export interface TLEData {
  name: string;
  line1: string;
  line2: string;
}

// Parsed satellite orbital elements
export interface SatelliteElements {
  name: string;
  a: number;           // Semi-major axis (km)
  e: number;           // Eccentricity
  i: number;           // Inclination (degrees)
  Omega: number;       // Right Ascension of Ascending Node (degrees)
  omega: number;       // Argument of perigee (degrees)
  M0: number;          // Mean anomaly at epoch (degrees)
  n: number;           // Mean motion (revs/day, will convert to deg/day)
  epoch: number;       // Julian date of epoch
  category?: string;   // Optional category (LEO, GEO, etc.)
}

// Earth constants
const EARTH_MU = 398600.4418;  // km^3/s^2
const EARTH_RADIUS = 6378.137;  // km

// Parse epoch from TLE line 1
// Format: YYDDD.DDDDDDDD
// YY = year (00-56 = 2000-2056, 57-99 = 1957-1999)
// DDD.DDDDDDDD = day of year with fractional day
function parseTLEEpoch(epochStr: string): number {
  const year2digit = parseInt(epochStr.substring(0, 2), 10);
  const year = year2digit < 57 ? 2000 + year2digit : 1900 + year2digit;
  const dayOfYear = parseFloat(epochStr.substring(2));

  // Convert to Julian date
  // JD of Jan 1 of year
  const a = Math.floor((14 - 1) / 12);
  const y = year + 4800 - a;
  const m = 1 + 12 * a - 3;
  const jd0 = 1 + Math.floor((153 * m + 2) / 5) + 365 * y +
              Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

  return jd0 + dayOfYear - 1;  // -1 because day 1 = Jan 1
}

// Parse a TLE into orbital elements
export function parseTLE(tle: TLEData): SatelliteElements {
  const { name, line1, line2 } = tle;

  // Line 1 parsing
  // Col 19-32: Epoch (YYDDD.DDDDDDDD)
  const epochStr = line1.substring(18, 32).trim();
  const epoch = parseTLEEpoch(epochStr);

  // Line 2 parsing
  // Col 9-16: Inclination (degrees)
  const i = parseFloat(line2.substring(8, 16).trim());

  // Col 18-25: Right Ascension of Ascending Node (degrees)
  const Omega = parseFloat(line2.substring(17, 25).trim());

  // Col 27-33: Eccentricity (decimal point assumed)
  const e = parseFloat('0.' + line2.substring(26, 33).trim());

  // Col 35-42: Argument of Perigee (degrees)
  const omega = parseFloat(line2.substring(34, 42).trim());

  // Col 44-51: Mean Anomaly (degrees)
  const M0 = parseFloat(line2.substring(43, 51).trim());

  // Col 53-63: Mean Motion (revs per day)
  const nRevPerDay = parseFloat(line2.substring(52, 63).trim());

  // Convert mean motion to degrees per day
  const n = nRevPerDay * 360;

  // Calculate semi-major axis from mean motion
  // n (rad/s) = sqrt(mu / a^3)
  // a = (mu / n^2)^(1/3)
  const nRadPerSec = (nRevPerDay * 2 * Math.PI) / 86400;
  const a = Math.pow(EARTH_MU / (nRadPerSec * nRadPerSec), 1/3);

  // Determine category based on altitude
  const altitude = a - EARTH_RADIUS;
  let category: string;
  if (altitude < 2000) {
    category = 'LEO';
  } else if (altitude > 35000 && altitude < 37000) {
    category = 'GEO';
  } else if (altitude >= 2000 && altitude < 35000) {
    category = 'MEO';
  } else {
    category = 'OTHER';
  }

  return { name, a, e, i, Omega, omega, M0, n, epoch, category };
}

// Solve Kepler's equation
function solveKepler(M: number, e: number, tolerance: number = 1e-8): number {
  let E = M;
  for (let iter = 0; iter < 50; iter++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tolerance) break;
  }
  return E;
}

// Calculate satellite position relative to Earth (returns km)
export function calculateSatellitePosition(
  elements: SatelliteElements,
  julianDate: number
): { x: number; y: number } {
  const daysSinceEpoch = julianDate - elements.epoch;

  // Mean anomaly at current time
  let M = elements.M0 + elements.n * daysSinceEpoch;
  M = ((M % 360) + 360) % 360;
  M = deg2rad(M);

  // Solve Kepler's equation
  const E = solveKepler(M, elements.e);

  // Position in orbital plane (km)
  const x_orb = elements.a * (Math.cos(E) - elements.e);
  const y_orb = elements.a * Math.sqrt(1 - elements.e * elements.e) * Math.sin(E);

  // Rotate to Earth-centered frame (simplified 2D)
  const angle = deg2rad(elements.omega + elements.Omega);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  return {
    x: x_orb * cosAngle - y_orb * sinAngle,
    y: x_orb * sinAngle + y_orb * cosAngle,
  };
}

// Parse multiple TLEs from text content
export function parseTLEText(text: string): TLEData[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const tles: TLEData[] = [];

  for (let i = 0; i < lines.length - 2; i += 3) {
    // Check if this looks like a TLE set
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
      tles.push({ name, line1, line2 });
    }
  }

  return tles;
}

// Convert SatelliteElements to CelestialBody format
export function satelliteToCelestialBody(sat: SatelliteElements): {
  name: string;
  type: 'moon';  // Using 'moon' type for parent-centric rendering
  radius: number;
  color: string;
  parentName: string;
  parentCentricElements: {
    a: number;
    e: number;
    i: number;
    M0: number;
    omega: number;
    Omega: number;
    n: number;
    epoch: number;
  };
} {
  // Color based on category
  const categoryColors: Record<string, string> = {
    'LEO': '#ff6666',   // Red for LEO
    'GEO': '#66ff66',   // Green for GEO
    'MEO': '#6666ff',   // Blue for MEO
    'OTHER': '#ffff66', // Yellow for others
  };

  return {
    name: sat.name,
    type: 'moon',  // Parent-centric type
    radius: 0.01,  // Very small, will use minimum display size
    color: categoryColors[sat.category || 'OTHER'] || '#ffffff',
    parentName: 'Earth',
    parentCentricElements: {
      a: sat.a,
      e: sat.e,
      i: sat.i,
      M0: sat.M0,
      omega: sat.omega,
      Omega: sat.Omega,
      n: sat.n,
      epoch: sat.epoch,
    },
  };
}
