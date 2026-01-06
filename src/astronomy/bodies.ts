import { type OrbitalElements, calculatePosition, calculateOrbitPath } from './kepler';
import { type BodyType, PLANET_COLORS, BODY_COLORS } from './constants';

export interface CelestialBody {
  name: string;
  type: BodyType;
  radius: number; // km
  color: string;
  elements?: OrbitalElements;
  // For bodies with segmented orbits (probes, interstellar objects)
  segments?: Array<{
    startJD: number;
    endJD: number;
    elements: OrbitalElements;
  }>;
  // Fixed position for the Sun
  fixedPosition?: { x: number; y: number };
  // Parent body name (e.g., 'Sun' for planets, 'Earth' for Moon)
  // If not specified, defaults to 'Sun' for orbiting bodies
  parentName?: string;
}

// Get orbital elements for a given date (handles segmented orbits)
function getElementsForDate(body: CelestialBody, julianDate: number): OrbitalElements | null {
  if (body.elements) {
    return body.elements;
  }

  if (body.segments) {
    for (const segment of body.segments) {
      if (julianDate >= segment.startJD && julianDate < segment.endJD) {
        return segment.elements;
      }
    }
    // If before first segment or after last, use closest
    if (body.segments.length > 0) {
      if (julianDate < body.segments[0].startJD) {
        return body.segments[0].elements;
      }
      return body.segments[body.segments.length - 1].elements;
    }
  }

  return null;
}

// Calculate position of a body at a given Julian date
export function getBodyPosition(
  body: CelestialBody,
  julianDate: number
): { x: number; y: number } {
  if (body.fixedPosition) {
    return body.fixedPosition;
  }

  const elements = getElementsForDate(body, julianDate);
  if (!elements) {
    return { x: 0, y: 0 };
  }

  return calculatePosition(elements, julianDate);
}

// Calculate orbit path for rendering
export function getOrbitPath(
  body: CelestialBody,
  julianDate: number,
  numPoints?: number
): Array<{ x: number; y: number }> {
  const elements = getElementsForDate(body, julianDate);
  if (!elements) {
    return [];
  }

  return calculateOrbitPath(elements, julianDate, numPoints);
}

// The Sun
export const Sun: CelestialBody = {
  name: 'Sun',
  type: 'star',
  radius: 696340,
  color: BODY_COLORS.star,
  fixedPosition: { x: 0, y: 0 },
};

// Planets with orbital elements from NASA JPL
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
// Elements are for J2000 with secular rates per century

export const Mercury: CelestialBody = {
  name: 'Mercury',
  type: 'planet',
  radius: 2439.7,
  color: PLANET_COLORS.mercury,
  elements: {
    a: 0.38709927,
    e: 0.20563593,
    i: 7.00497902,
    L: 252.25032350,
    longPeri: 77.45779628,
    longNode: 48.33076593,
    aDot: 0.00000037,
    eDot: 0.00001906,
    iDot: -0.00594749,
    LDot: 149472.67411175,
    longPeriDot: 0.16047689,
    longNodeDot: -0.12534081,
  },
};

export const Venus: CelestialBody = {
  name: 'Venus',
  type: 'planet',
  radius: 6051.8,
  color: PLANET_COLORS.venus,
  elements: {
    a: 0.72333566,
    e: 0.00677672,
    i: 3.39467605,
    L: 181.97909950,
    longPeri: 131.60246718,
    longNode: 76.67984255,
    aDot: 0.00000390,
    eDot: -0.00004107,
    iDot: -0.00078890,
    LDot: 58517.81538729,
    longPeriDot: 0.00268329,
    longNodeDot: -0.27769418,
  },
};

export const Earth: CelestialBody = {
  name: 'Earth',
  type: 'planet',
  radius: 6371,
  color: PLANET_COLORS.earth,
  elements: {
    a: 1.00000261,
    e: 0.01671123,
    i: -0.00001531,
    L: 100.46457166,
    longPeri: 102.93768193,
    longNode: 0.0,
    aDot: 0.00000562,
    eDot: -0.00004392,
    iDot: -0.01294668,
    LDot: 35999.37244981,
    longPeriDot: 0.32327364,
    longNodeDot: 0.0,
  },
};

export const Mars: CelestialBody = {
  name: 'Mars',
  type: 'planet',
  radius: 3389.5,
  color: PLANET_COLORS.mars,
  elements: {
    a: 1.52371034,
    e: 0.09339410,
    i: 1.84969142,
    L: -4.55343205,
    longPeri: -23.94362959,
    longNode: 49.55953891,
    aDot: 0.00001847,
    eDot: 0.00007882,
    iDot: -0.00813131,
    LDot: 19140.30268499,
    longPeriDot: 0.44441088,
    longNodeDot: -0.29257343,
  },
};

export const Jupiter: CelestialBody = {
  name: 'Jupiter',
  type: 'planet',
  radius: 69911,
  color: PLANET_COLORS.jupiter,
  elements: {
    a: 5.20288700,
    e: 0.04838624,
    i: 1.30439695,
    L: 34.39644051,
    longPeri: 14.72847983,
    longNode: 100.47390909,
    aDot: -0.00011607,
    eDot: -0.00013253,
    iDot: -0.00183714,
    LDot: 3034.74612775,
    longPeriDot: 0.21252668,
    longNodeDot: 0.20469106,
  },
};

export const Saturn: CelestialBody = {
  name: 'Saturn',
  type: 'planet',
  radius: 58232,
  color: PLANET_COLORS.saturn,
  elements: {
    a: 9.53667594,
    e: 0.05386179,
    i: 2.48599187,
    L: 49.95424423,
    longPeri: 92.59887831,
    longNode: 113.66242448,
    aDot: -0.00125060,
    eDot: -0.00050991,
    iDot: 0.00193609,
    LDot: 1222.49362201,
    longPeriDot: -0.41897216,
    longNodeDot: -0.28867794,
  },
};

export const Uranus: CelestialBody = {
  name: 'Uranus',
  type: 'planet',
  radius: 25362,
  color: PLANET_COLORS.uranus,
  elements: {
    a: 19.18916464,
    e: 0.04725744,
    i: 0.77263783,
    L: 313.23810451,
    longPeri: 170.95427630,
    longNode: 74.01692503,
    aDot: -0.00196176,
    eDot: -0.00004397,
    iDot: -0.00242939,
    LDot: 428.48202785,
    longPeriDot: 0.40805281,
    longNodeDot: 0.04240589,
  },
};

export const Neptune: CelestialBody = {
  name: 'Neptune',
  type: 'planet',
  radius: 24622,
  color: PLANET_COLORS.neptune,
  elements: {
    a: 30.06992276,
    e: 0.00859048,
    i: 1.77004347,
    L: -55.12002969,
    longPeri: 44.96476227,
    longNode: 131.78422574,
    aDot: 0.00026291,
    eDot: 0.00005105,
    iDot: 0.00035372,
    LDot: 218.45945325,
    longPeriDot: -0.32241464,
    longNodeDot: -0.00508664,
  },
};

// All planets
export const planets: CelestialBody[] = [
  Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
];

// All bodies (will expand later with dwarf planets, moons, etc.)
export const allBodies: CelestialBody[] = [
  Sun,
  ...planets,
];
