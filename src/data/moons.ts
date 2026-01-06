import { type CelestialBody } from '../astronomy/bodies';
import { BODY_COLORS, J2000 } from '../astronomy/constants';

// Moon colors - slightly different shades for variety
const MOON_COLORS = {
  moon: '#cccccc',      // Earth's Moon - bright gray
  io: '#ffee88',        // Io - yellowish (volcanic)
  europa: '#ddddff',    // Europa - icy white-blue
  ganymede: '#bbaa99',  // Ganymede - brownish gray
  callisto: '#888877',  // Callisto - dark gray
  titan: '#ffaa66',     // Titan - orange (atmosphere)
  triton: '#aaccff',    // Triton - icy blue-white
  enceladus: '#ffffff', // Enceladus - bright white (ice geysers)
  mimas: '#cccccc',     // Mimas - gray
  charon: '#999999',    // Charon - dark gray
};

// Earth's Moon
// Data from NASA JPL Horizons
export const Moon: CelestialBody = {
  name: 'Moon',
  type: 'moon',
  radius: 1737.4,
  color: MOON_COLORS.moon,
  parentName: 'Earth',
  parentCentricElements: {
    a: 384400,          // km
    e: 0.0549,
    i: 5.145,           // degrees to ecliptic
    M0: 0,              // mean anomaly at epoch (simplified)
    omega: 318.15,      // argument of periapsis
    Omega: 125.08,      // longitude of ascending node
    n: 13.176358,       // degrees per day (360 / 27.322 days)
    epoch: J2000,
  },
};

// Jupiter's Galilean Moons
// Data from NASA JPL

export const Io: CelestialBody = {
  name: 'Io',
  type: 'moon',
  radius: 1821.6,
  color: MOON_COLORS.io,
  parentName: 'Jupiter',
  parentCentricElements: {
    a: 421800,          // km
    e: 0.0041,
    i: 0.036,           // degrees (relative to Jupiter's equator, ~0 in ecliptic frame)
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 203.489,         // degrees per day (360 / 1.769 days)
    epoch: J2000,
  },
};

export const Europa: CelestialBody = {
  name: 'Europa',
  type: 'moon',
  radius: 1560.8,
  color: MOON_COLORS.europa,
  parentName: 'Jupiter',
  parentCentricElements: {
    a: 671100,          // km
    e: 0.0094,
    i: 0.466,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 101.375,         // degrees per day (360 / 3.551 days)
    epoch: J2000,
  },
};

export const Ganymede: CelestialBody = {
  name: 'Ganymede',
  type: 'moon',
  radius: 2634.1,
  color: MOON_COLORS.ganymede,
  parentName: 'Jupiter',
  parentCentricElements: {
    a: 1070400,         // km
    e: 0.0013,
    i: 0.177,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 50.318,          // degrees per day (360 / 7.155 days)
    epoch: J2000,
  },
};

export const Callisto: CelestialBody = {
  name: 'Callisto',
  type: 'moon',
  radius: 2410.3,
  color: MOON_COLORS.callisto,
  parentName: 'Jupiter',
  parentCentricElements: {
    a: 1882700,         // km
    e: 0.0074,
    i: 0.192,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 21.571,          // degrees per day (360 / 16.689 days)
    epoch: J2000,
  },
};

// Saturn's major moons

export const Titan: CelestialBody = {
  name: 'Titan',
  type: 'moon',
  radius: 2574.7,
  color: MOON_COLORS.titan,
  parentName: 'Saturn',
  parentCentricElements: {
    a: 1221870,         // km
    e: 0.0288,
    i: 0.348,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 22.577,          // degrees per day (360 / 15.945 days)
    epoch: J2000,
  },
};

export const Enceladus: CelestialBody = {
  name: 'Enceladus',
  type: 'moon',
  radius: 252.1,
  color: MOON_COLORS.enceladus,
  parentName: 'Saturn',
  parentCentricElements: {
    a: 238020,          // km
    e: 0.0047,
    i: 0.009,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 262.732,         // degrees per day (360 / 1.370 days)
    epoch: J2000,
  },
};

export const Mimas: CelestialBody = {
  name: 'Mimas',
  type: 'moon',
  radius: 198.2,
  color: MOON_COLORS.mimas,
  parentName: 'Saturn',
  parentCentricElements: {
    a: 185540,          // km
    e: 0.0196,
    i: 1.574,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 381.995,         // degrees per day (360 / 0.942 days)
    epoch: J2000,
  },
};

// Neptune's moon

export const Triton: CelestialBody = {
  name: 'Triton',
  type: 'moon',
  radius: 1353.4,
  color: MOON_COLORS.triton,
  parentName: 'Neptune',
  parentCentricElements: {
    a: 354759,          // km
    e: 0.000016,        // Nearly circular
    i: 156.865,         // Retrograde orbit!
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 61.258,          // degrees per day (360 / 5.877 days) - retrograde so negative motion
    epoch: J2000,
  },
};

// Pluto's moon (if Pluto is added as dwarf planet)

export const Charon: CelestialBody = {
  name: 'Charon',
  type: 'moon',
  radius: 606,
  color: MOON_COLORS.charon,
  parentName: 'Pluto',
  parentCentricElements: {
    a: 19591,           // km
    e: 0.0002,
    i: 0.001,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 56.363,          // degrees per day (360 / 6.387 days)
    epoch: J2000,
  },
};

// Mars moons

export const Phobos: CelestialBody = {
  name: 'Phobos',
  type: 'moon',
  radius: 11.267,       // Mean radius (irregular shape)
  color: BODY_COLORS.moon,
  parentName: 'Mars',
  parentCentricElements: {
    a: 9376,            // km
    e: 0.0151,
    i: 1.093,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 1128.844,        // degrees per day (360 / 0.319 days)
    epoch: J2000,
  },
};

export const Deimos: CelestialBody = {
  name: 'Deimos',
  type: 'moon',
  radius: 6.2,          // Mean radius (irregular shape)
  color: BODY_COLORS.moon,
  parentName: 'Mars',
  parentCentricElements: {
    a: 23458,           // km
    e: 0.0002,
    i: 0.93,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 285.162,         // degrees per day (360 / 1.263 days)
    epoch: J2000,
  },
};

// Uranus moons

export const Miranda: CelestialBody = {
  name: 'Miranda',
  type: 'moon',
  radius: 235.8,
  color: BODY_COLORS.moon,
  parentName: 'Uranus',
  parentCentricElements: {
    a: 129900,          // km
    e: 0.0013,
    i: 4.338,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 254.690,         // degrees per day (360 / 1.413 days)
    epoch: J2000,
  },
};

export const Ariel: CelestialBody = {
  name: 'Ariel',
  type: 'moon',
  radius: 578.9,
  color: BODY_COLORS.moon,
  parentName: 'Uranus',
  parentCentricElements: {
    a: 190900,          // km
    e: 0.0012,
    i: 0.041,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 142.826,         // degrees per day (360 / 2.520 days)
    epoch: J2000,
  },
};

export const Titania: CelestialBody = {
  name: 'Titania',
  type: 'moon',
  radius: 788.9,
  color: BODY_COLORS.moon,
  parentName: 'Uranus',
  parentCentricElements: {
    a: 436300,          // km
    e: 0.0011,
    i: 0.079,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 41.351,          // degrees per day (360 / 8.706 days)
    epoch: J2000,
  },
};

// Export all moons
export const allMoons: CelestialBody[] = [
  // Earth
  Moon,
  // Mars
  Phobos,
  Deimos,
  // Jupiter (Galilean)
  Io,
  Europa,
  Ganymede,
  Callisto,
  // Saturn
  Titan,
  Enceladus,
  Mimas,
  // Uranus
  Miranda,
  Ariel,
  Titania,
  // Neptune
  Triton,
  // Pluto
  Charon,
];
