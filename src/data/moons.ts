/**
 * Moon Data
 *
 * All orbital data sourced from NASA JPL Horizons API.
 * Regenerate with: npx tsx scripts/fetch-moons.ts
 *
 * DO NOT add fake/generated data here. All data must come from authoritative sources.
 */

import { type CelestialBody } from "../astronomy/bodies";
import { type MoonCategory, J2000 } from "../astronomy/constants";
import moonData from "./moons.json";

// Moon colors by name (for distinctive major moons)
const MOON_COLORS: Record<string, string> = {
  // Earth
  Moon: "#cccccc",
  // Mars
  Phobos: "#aaaaaa",
  Deimos: "#999999",
  // Jupiter - Galilean
  Io: "#ffee88", // yellowish (volcanic)
  Europa: "#ddddff", // icy white-blue
  Ganymede: "#bbaa99", // brownish gray
  Callisto: "#888877", // dark gray
  // Saturn
  Titan: "#ffaa66", // orange (atmosphere)
  Rhea: "#ccccbb",
  Iapetus: "#aaaaaa",
  Dione: "#dddddd",
  Tethys: "#eeeeee",
  Enceladus: "#ffffff", // bright white (ice geysers)
  Mimas: "#cccccc",
  Hyperion: "#bbbbaa",
  Phoebe: "#666666",
  // Uranus
  Titania: "#bbbbbb",
  Oberon: "#aaaaaa",
  Umbriel: "#888888",
  Ariel: "#dddddd",
  Miranda: "#cccccc",
  // Neptune
  Triton: "#aaccff", // icy blue-white
  Proteus: "#999999",
  Nereid: "#888888",
  // Pluto
  Charon: "#999999",
};

// Default color for moons not in the list
const DEFAULT_MOON_COLOR = "#aaaaaa";

// Convert JSON moon data to CelestialBody format
function convertMoonData(data: (typeof moonData)[0]): CelestialBody {
  const body: CelestialBody = {
    name: data.name,
    type: "moon",
    radius: data.radius,
    color: MOON_COLORS[data.name] || DEFAULT_MOON_COLOR,
    parentName: data.parentName,
    moonCategory: data.category as MoonCategory,
    parentCentricElements: {
      a: data.a,
      e: data.e,
      i: data.i,
      M0: data.M0,
      omega: data.omega,
      Omega: data.Omega,
      n: 360 / data.period, // Convert period to mean motion (degrees/day)
      epoch: J2000,
    },
  };

  // Add discovery data if present
  if (data.discovery) {
    body.discovery = data.discovery as { by?: string; year?: number; date?: string };
  }

  return body;
}

// All moons from JPL data
export const allMoons: CelestialBody[] = moonData.map(convertMoonData);

// Filter moons by minimum category level
// 'major' = only major moons (radius > 100km)
// 'medium' = major + medium (radius > 10km)
// 'named' = major + medium + named (radius <= 10km with official name)
// 'minor' = all moons including provisional designations
export function filterMoons(minCategory: MoonCategory): CelestialBody[] {
  const categoryOrder: MoonCategory[] = ["major", "medium", "named", "minor"];
  const minIndex = categoryOrder.indexOf(minCategory);

  return allMoons.filter((moon) => {
    const moonIndex = categoryOrder.indexOf(moon.moonCategory || "minor");
    return moonIndex <= minIndex;
  });
}

// Convenience exports for different detail levels
export const majorMoons = filterMoons("major");
export const mediumMoons = filterMoons("medium");
export const namedMoons = filterMoons("named");

// Export individual moons for direct access
export const Moon = allMoons.find((m) => m.name === "Moon")!;
export const Io = allMoons.find((m) => m.name === "Io")!;
export const Europa = allMoons.find((m) => m.name === "Europa")!;
export const Ganymede = allMoons.find((m) => m.name === "Ganymede")!;
export const Callisto = allMoons.find((m) => m.name === "Callisto")!;
export const Titan = allMoons.find((m) => m.name === "Titan")!;
export const Triton = allMoons.find((m) => m.name === "Triton")!;
export const Charon = allMoons.find((m) => m.name === "Charon")!;
