import {
  type OrbitalElements,
  type ParentCentricElements,
  calculatePosition,
  calculateOrbitPath,
  calculateParentCentricPosition,
  calculateParentCentricOrbitPath,
} from './kepler';
import {
  type BodyType,
  type MoonCategory,
  type SpacecraftType,
  type SpacecraftStatus,
  type SpacecraftIconType,
  PLANET_COLORS,
  BODY_COLORS,
} from './constants';

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
  // For moons/satellites: orbital elements relative to parent (in km)
  parentCentricElements?: ParentCentricElements;
  // For moons: category for filtering (major/medium/named/minor)
  moonCategory?: MoonCategory;

  // Spacecraft-specific fields
  spkid?: number;                    // JPL SPK ID (negative for spacecraft)
  missionType?: SpacecraftType;      // Type of mission
  missionStatus?: SpacecraftStatus;  // Active, ended, or planned
  launchJD?: number;                 // Mission start (Julian date)
  endJD?: number;                    // Mission end (Julian date, optional)
  iconType?: SpacecraftIconType;     // Which icon to render

  // Display options
  hideOrbit?: boolean;               // Don't render orbit path
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

// Body lookup map for hierarchical position resolution
let globalBodyMap: Map<string, CelestialBody> = new Map();

// Set the global body map (called by renderer before position calculations)
export function setBodyMap(bodies: CelestialBody[]): void {
  globalBodyMap = new Map(bodies.map(b => [b.name, b]));
}

// Calculate position of a body at a given Julian date
export function getBodyPosition(
  body: CelestialBody,
  julianDate: number
): { x: number; y: number } {
  if (body.fixedPosition) {
    return body.fixedPosition;
  }

  // Handle parent-centric bodies (moons, satellites)
  if (body.parentCentricElements && body.parentName) {
    const parent = globalBodyMap.get(body.parentName);
    if (parent) {
      const parentPos = getBodyPosition(parent, julianDate);
      const relativePos = calculateParentCentricPosition(body.parentCentricElements, julianDate);
      return {
        x: parentPos.x + relativePos.x,
        y: parentPos.y + relativePos.y,
      };
    }
  }

  // Heliocentric bodies (planets, comets, asteroids)
  const elements = getElementsForDate(body, julianDate);
  if (!elements) {
    return { x: 0, y: 0 };
  }

  return calculatePosition(elements, julianDate);
}

// Calculate orbit path for rendering
// For parent-centric bodies (moons/satellites), returns RELATIVE path centered at (0,0).
// The renderer is responsible for applying the parent's current position offset.
export function getOrbitPath(
  body: CelestialBody,
  julianDate: number,
  numPoints?: number
): Array<{ x: number; y: number }> {
  // Handle parent-centric bodies (moons, satellites)
  // Return relative path - renderer will apply parent position offset
  if (body.parentCentricElements) {
    return calculateParentCentricOrbitPath(body.parentCentricElements, numPoints);
  }

  // Heliocentric bodies
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

// Dwarf planets
// Data from NASA JPL

export const Pluto: CelestialBody = {
  name: 'Pluto',
  type: 'dwarf',
  radius: 1188.3,
  color: '#aa9988', // Tan/brownish
  elements: {
    a: 39.48211675,
    e: 0.24882730,
    i: 17.14001206,
    L: 238.92903833,
    longPeri: 224.06891629,
    longNode: 110.30393684,
    aDot: -0.00031596,
    eDot: 0.00005170,
    iDot: 0.00004818,
    LDot: 145.20780515,
    longPeriDot: -0.04062942,
    longNodeDot: -0.01183482,
  },
};

export const Ceres: CelestialBody = {
  name: 'Ceres',
  type: 'dwarf',
  radius: 473,
  color: '#777777', // Gray
  elements: {
    a: 2.7691651545,
    e: 0.0760090291,
    i: 10.59406704,
    L: 95.98917576,
    longPeri: 73.59769469,  // longitude of perihelion
    longNode: 80.30553156,
    LDot: 78.21926063,      // degrees per century
  },
};

export const Eris: CelestialBody = {
  name: 'Eris',
  type: 'dwarf',
  radius: 1163,
  color: '#dddddd', // Bright gray/white
  elements: {
    a: 67.864,
    e: 0.44068,
    i: 44.040,
    L: 204.16,
    longPeri: 151.639,
    longNode: 35.951,
    LDot: 0.6418,           // Very slow
  },
};

export const Makemake: CelestialBody = {
  name: 'Makemake',
  type: 'dwarf',
  radius: 715,
  color: '#cc9966', // Reddish-brown
  elements: {
    a: 45.430,
    e: 0.16126,
    i: 28.9835,
    L: 165.514,
    longPeri: 297.240,
    longNode: 79.620,
    LDot: 1.1615,
  },
};

export const Haumea: CelestialBody = {
  name: 'Haumea',
  type: 'dwarf',
  radius: 816,               // Mean radius (elongated shape)
  color: '#eeeeee',          // Very bright
  elements: {
    a: 43.182,
    e: 0.19642,
    i: 28.2137,
    L: 218.205,
    longPeri: 240.208,
    longNode: 122.167,
    LDot: 1.2791,
  },
};

export const dwarfPlanets: CelestialBody[] = [
  Pluto, Ceres, Eris, Makemake, Haumea
];

// All bodies (will expand later with dwarf planets, moons, etc.)
export const allBodies: CelestialBody[] = [
  Sun,
  ...planets,
  ...dwarfPlanets,
];
