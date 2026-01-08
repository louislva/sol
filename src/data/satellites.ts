/**
 * Satellite Data
 *
 * All orbital data sourced from CelesTrak TLE feeds.
 * Regenerate with: npx tsx scripts/fetch-satellites.ts
 *
 * DO NOT add fake/generated data here. All data must come from authoritative sources.
 */

import { type CelestialBody } from "../astronomy/bodies";
import satelliteData from "./satellites.json";

// Satellite colors by category
const SATELLITE_COLORS: Record<string, string> = {
  LEO: "#ff6666", // Red for Low Earth Orbit
  MEO: "#6666ff", // Blue for Medium Earth Orbit
  GEO: "#66ff66", // Green for Geostationary
  OTHER: "#ffff66", // Yellow for others
};

// Convert JSON satellite data to CelestialBody format
function convertSatelliteData(data: (typeof satelliteData)[0]): CelestialBody {
  return {
    name: data.name,
    type: "satellite",
    radius: 0.01, // Very small, will use minimum display size (2px)
    color: SATELLITE_COLORS[data.category] || "#ffffff",
    parentName: "Earth",
    hideOrbit: true, // Don't show orbit paths for satellites
    parentCentricElements: {
      a: data.a,
      e: data.e,
      i: data.i,
      M0: data.M0,
      omega: data.omega,
      Omega: data.Omega,
      n: data.n,
      epoch: data.epoch,
    },
  };
}

// All satellites from TLE data
export const allSatellites: CelestialBody[] = satelliteData.map(
  convertSatelliteData
);

// Filter satellites by category
export function filterSatellitesByCategory(
  ...categories: string[]
): CelestialBody[] {
  const categorySet = new Set(categories);
  return allSatellites.filter((sat) => {
    // Find the original satellite data to get its category
    const original = satelliteData.find((s) => s.name === sat.name);
    return original && categorySet.has(original.category);
  });
}

// Convenience exports for different orbits
export const leoSatellites = filterSatellitesByCategory("LEO");
export const meoSatellites = filterSatellitesByCategory("MEO");
export const geoSatellites = filterSatellitesByCategory("GEO");

// Notable satellites for direct access
export const ISS = allSatellites.find((s) => s.name.includes("ISS (ZARYA)"));
export const Tiangong = allSatellites.find((s) => s.name.includes("CSS (TIANHE)"));
