import { type CelestialBody } from '../astronomy/bodies';
import { BODY_COLORS } from '../astronomy/constants';

// Notable comets with orbital elements
// Data primarily from NASA JPL Small-Body Database

// Halley's Comet - most famous periodic comet
// Orbital period: ~76 years
// Next perihelion: July 28, 2061
export const HalleysComet: CelestialBody = {
  name: "Halley's Comet",
  type: 'comet',
  radius: 5.5,  // Approximate mean radius (irregular nucleus)
  color: BODY_COLORS.comet,
  elements: {
    a: 17.834,          // AU - very elongated
    e: 0.96714,         // High eccentricity
    i: 162.262,         // Retrograde orbit!
    L: 111.33,          // Mean longitude at epoch
    longPeri: 111.33,   // Longitude of perihelion
    longNode: 58.42,    // Longitude of ascending node
    LDot: 4.73,         // degrees per century (76 year period)
  },
};

// Comet Hale-Bopp (C/1995 O1)
// One of the brightest comets of the 20th century
// Orbital period: ~2,533 years
export const HaleBopp: CelestialBody = {
  name: 'Hale-Bopp',
  type: 'comet',
  radius: 30,           // Very large nucleus
  color: '#88ddff',     // Bright blue-white
  elements: {
    a: 186.0,           // AU - extremely long orbit
    e: 0.995,           // Nearly parabolic
    i: 89.4,            // Nearly perpendicular to ecliptic
    L: 130.6,
    longPeri: 130.6,
    longNode: 282.5,
    LDot: 0.142,        // Very slow
  },
};

// Comet Encke (2P/Encke)
// Shortest orbital period of any known comet: 3.3 years
export const Encke: CelestialBody = {
  name: 'Encke',
  type: 'comet',
  radius: 2.4,
  color: BODY_COLORS.comet,
  elements: {
    a: 2.215,           // AU - relatively small orbit
    e: 0.8483,
    i: 11.78,
    L: 186.5,
    longPeri: 186.5,
    longNode: 334.6,
    LDot: 109.1,        // degrees per century (3.3 year period)
  },
};

// Comet Tempel 1 (9P/Tempel)
// Target of Deep Impact mission
export const Tempel1: CelestialBody = {
  name: 'Tempel 1',
  type: 'comet',
  radius: 3.0,
  color: BODY_COLORS.comet,
  elements: {
    a: 3.126,
    e: 0.5091,
    i: 10.47,
    L: 68.9,
    longPeri: 68.9,
    longNode: 68.9,
    LDot: 65.1,         // ~5.5 year period
  },
};

// Comet 67P/Churyumov-Gerasimenko
// Rosetta mission target
export const ChuryumovGerasimenko: CelestialBody = {
  name: '67P/C-G',
  type: 'comet',
  radius: 2.0,          // Bilobed nucleus
  color: BODY_COLORS.comet,
  elements: {
    a: 3.464,
    e: 0.6405,
    i: 7.04,
    L: 50.1,
    longPeri: 12.8,
    longNode: 50.1,
    LDot: 55.3,         // ~6.5 year period
  },
};

// Comet NEOWISE (C/2020 F3)
// Bright comet visible in 2020
// Long period comet
export const NEOWISE: CelestialBody = {
  name: 'NEOWISE',
  type: 'comet',
  radius: 2.5,
  color: '#aaeeff',
  elements: {
    a: 364.0,           // Very long period (~6800 years)
    e: 0.9992,
    i: 128.9,           // Retrograde
    L: 61.0,
    longPeri: 61.0,
    longNode: 61.0,
    LDot: 0.053,
  },
};

// Comet Wild 2 (81P/Wild)
// Stardust mission target
export const Wild2: CelestialBody = {
  name: 'Wild 2',
  type: 'comet',
  radius: 2.0,
  color: BODY_COLORS.comet,
  elements: {
    a: 3.449,
    e: 0.5389,
    i: 3.24,
    L: 41.7,
    longPeri: 41.7,
    longNode: 136.0,
    LDot: 56.2,         // ~6.4 year period
  },
};

// Comet Borrelly (19P/Borrelly)
// Deep Space 1 flyby target
export const Borrelly: CelestialBody = {
  name: 'Borrelly',
  type: 'comet',
  radius: 4.0,
  color: BODY_COLORS.comet,
  elements: {
    a: 3.611,
    e: 0.6238,
    i: 30.32,
    L: 353.3,
    longPeri: 353.3,
    longNode: 75.3,
    LDot: 52.5,         // ~6.9 year period
  },
};

// Export all comets
export const allComets: CelestialBody[] = [
  HalleysComet,
  HaleBopp,
  Encke,
  Tempel1,
  ChuryumovGerasimenko,
  NEOWISE,
  Wild2,
  Borrelly,
];
