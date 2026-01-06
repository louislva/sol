import { type CelestialBody } from '../astronomy/bodies';
import { BODY_COLORS } from '../astronomy/constants';

// Space probes with segmented orbits for gravity assists
// Note: These are simplified trajectories. For accurate positions,
// use JPL Horizons ephemerides.

// Voyager 1 - launched Sept 5, 1977
// Jupiter flyby: March 5, 1979
// Saturn flyby: November 12, 1980
// Currently heading toward interstellar space
export const Voyager1: CelestialBody = {
  name: 'Voyager 1',
  type: 'probe',
  radius: 0.002,  // ~2m, will render at minimum size
  color: BODY_COLORS.probe,
  segments: [
    {
      // Earth to Jupiter (1977-1979)
      startJD: 2443391.5,   // Sept 5, 1977
      endJD: 2443945.5,     // March 5, 1979
      elements: {
        a: 3.5,
        e: 0.72,
        i: 1.0,
        L: 0,
        longPeri: 0,
        longNode: 0,
        LDot: 60,           // Approximate
      },
    },
    {
      // Jupiter to Saturn (1979-1980)
      startJD: 2443945.5,
      endJD: 2444545.5,     // Nov 12, 1980
      elements: {
        a: 7.5,
        e: 0.68,
        i: 2.5,
        L: 60,
        longPeri: 45,
        longNode: 0,
        LDot: 30,
      },
    },
    {
      // Post-Saturn, leaving solar system (hyperbolic)
      startJD: 2444545.5,
      endJD: 2500000.0,     // Far future
      elements: {
        a: -50,             // Negative for hyperbolic
        e: 1.2,             // Hyperbolic trajectory
        i: 35.0,            // High inclination
        L: 260,
        longPeri: 180,
        longNode: 0,
        LDot: 3,            // Very slow movement
      },
    },
  ],
};

// Voyager 2 - launched Aug 20, 1977
// Jupiter: July 9, 1979
// Saturn: August 26, 1981
// Uranus: January 24, 1986
// Neptune: August 25, 1989
export const Voyager2: CelestialBody = {
  name: 'Voyager 2',
  type: 'probe',
  radius: 0.002,
  color: BODY_COLORS.probe,
  segments: [
    {
      // Earth to Jupiter
      startJD: 2443375.5,   // Aug 20, 1977
      endJD: 2444068.5,     // July 9, 1979
      elements: {
        a: 3.8,
        e: 0.75,
        i: 1.0,
        L: 0,
        longPeri: 0,
        longNode: 0,
        LDot: 55,
      },
    },
    {
      // Jupiter to Saturn
      startJD: 2444068.5,
      endJD: 2444838.5,     // Aug 26, 1981
      elements: {
        a: 7.0,
        e: 0.65,
        i: 2.0,
        L: 80,
        longPeri: 50,
        longNode: 10,
        LDot: 25,
      },
    },
    {
      // Saturn to Uranus
      startJD: 2444838.5,
      endJD: 2446448.5,     // Jan 24, 1986
      elements: {
        a: 13.0,
        e: 0.55,
        i: 2.5,
        L: 110,
        longPeri: 70,
        longNode: 20,
        LDot: 12,
      },
    },
    {
      // Uranus to Neptune
      startJD: 2446448.5,
      endJD: 2447768.5,     // Aug 25, 1989
      elements: {
        a: 22.0,
        e: 0.45,
        i: 2.3,
        L: 180,
        longPeri: 100,
        longNode: 30,
        LDot: 6,
      },
    },
    {
      // Post-Neptune, leaving solar system
      startJD: 2447768.5,
      endJD: 2500000.0,
      elements: {
        a: -40,
        e: 1.15,
        i: -48.0,           // South of ecliptic
        L: 290,
        longPeri: 200,
        longNode: 0,
        LDot: 2.5,
      },
    },
  ],
};

// New Horizons - launched Jan 19, 2006
// Jupiter flyby: Feb 28, 2007
// Pluto flyby: July 14, 2015
export const NewHorizons: CelestialBody = {
  name: 'New Horizons',
  type: 'probe',
  radius: 0.001,
  color: BODY_COLORS.probe,
  segments: [
    {
      // Earth to Jupiter
      startJD: 2453754.5,   // Jan 19, 2006
      endJD: 2454159.5,     // Feb 28, 2007
      elements: {
        a: 3.2,
        e: 0.70,
        i: 1.5,
        L: 30,
        longPeri: 20,
        longNode: 0,
        LDot: 80,
      },
    },
    {
      // Jupiter to Pluto
      startJD: 2454159.5,
      endJD: 2457217.5,     // July 14, 2015
      elements: {
        a: 25.0,
        e: 0.50,
        i: 2.5,
        L: 100,
        longPeri: 60,
        longNode: 0,
        LDot: 4,
      },
    },
    {
      // Post-Pluto, into Kuiper Belt
      startJD: 2457217.5,
      endJD: 2500000.0,
      elements: {
        a: -35,
        e: 1.10,
        i: 2.5,
        L: 280,
        longPeri: 120,
        longNode: 0,
        LDot: 1.8,
      },
    },
  ],
};

// Pioneer 10 - launched March 3, 1972
// First to cross asteroid belt and reach Jupiter
export const Pioneer10: CelestialBody = {
  name: 'Pioneer 10',
  type: 'probe',
  radius: 0.001,
  color: '#ff9966',  // Orange-ish
  segments: [
    {
      // Earth to Jupiter
      startJD: 2441379.5,   // March 3, 1972
      endJD: 2442022.5,     // Dec 3, 1973 (Jupiter flyby)
      elements: {
        a: 3.0,
        e: 0.70,
        i: 1.0,
        L: 0,
        longPeri: 0,
        longNode: 0,
        LDot: 70,
      },
    },
    {
      // Post-Jupiter
      startJD: 2442022.5,
      endJD: 2500000.0,
      elements: {
        a: -45,
        e: 1.18,
        i: 3.0,
        L: 80,
        longPeri: 50,
        longNode: 0,
        LDot: 2.8,
      },
    },
  ],
};

// Pioneer 11 - launched April 6, 1973
// Jupiter flyby: Dec 4, 1974
// Saturn flyby: Sept 1, 1979
export const Pioneer11: CelestialBody = {
  name: 'Pioneer 11',
  type: 'probe',
  radius: 0.001,
  color: '#ff9966',
  segments: [
    {
      // Earth to Jupiter
      startJD: 2441779.5,   // April 6, 1973
      endJD: 2442385.5,     // Dec 4, 1974
      elements: {
        a: 3.1,
        e: 0.72,
        i: 1.5,
        L: 10,
        longPeri: 5,
        longNode: 0,
        LDot: 65,
      },
    },
    {
      // Jupiter to Saturn
      startJD: 2442385.5,
      endJD: 2444113.5,     // Sept 1, 1979
      elements: {
        a: 7.2,
        e: 0.60,
        i: 3.0,
        L: 70,
        longPeri: 40,
        longNode: 0,
        LDot: 22,
      },
    },
    {
      // Post-Saturn
      startJD: 2444113.5,
      endJD: 2500000.0,
      elements: {
        a: -50,
        e: 1.22,
        i: 17.0,
        L: 120,
        longPeri: 80,
        longNode: 0,
        LDot: 2.2,
      },
    },
  ],
};

// Export all probes
export const allProbes: CelestialBody[] = [
  Voyager1,
  Voyager2,
  NewHorizons,
  Pioneer10,
  Pioneer11,
];
