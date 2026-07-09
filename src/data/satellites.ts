/**
 * Active Earth satellites and constellation shell bands.
 *
 * The catalog lives in public/data so thousands of orbital records do not
 * inflate the JavaScript bundle. Regenerate it with:
 *   node scripts/fetch-satellites.ts
 */

import { type CelestialBody } from "../astronomy/bodies";

export type SatelliteCategory = "LEO" | "MEO" | "GEO" | "OTHER";

interface SatelliteData {
  noradId: number;
  name: string;
  a: number;
  e: number;
  i: number;
  Omega: number;
  omega: number;
  M0: number;
  n: number;
  epoch: number;
  category: SatelliteCategory;
}

export interface ConstellationBand {
  innerRadiusKm: number;
  outerRadiusKm: number;
  meanRadiusKm: number;
  count: number;
}

export interface SatelliteConstellation {
  name: string;
  group: string;
  color: string;
  count: number;
  bands: ConstellationBand[];
}

interface SatelliteCatalog {
  generatedAt: string;
  source: string;
  activeSatelliteCount: number;
  individualSatelliteCount: number;
  satellites: SatelliteData[];
  constellations: SatelliteConstellation[];
}

const SATELLITE_COLORS: Record<SatelliteCategory, string> = {
  LEO: "#ff6666",
  MEO: "#6666ff",
  GEO: "#66ff66",
  OTHER: "#ffff66",
};

export let allSatellites: CelestialBody[] = [];
let satelliteConstellations: SatelliteConstellation[] = [];
let loadPromise: Promise<void> | null = null;

function convertSatelliteData(data: SatelliteData): CelestialBody {
  return {
    name: data.name,
    type: "satellite",
    radius: 0.01,
    color: SATELLITE_COLORS[data.category],
    parentName: "Earth",
    hideOrbit: true,
    hideLabel: true,
    noradId: data.noradId,
    satelliteCategory: data.category,
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

function isSatelliteCatalog(value: unknown): value is SatelliteCatalog {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<SatelliteCatalog>;
  return Array.isArray(catalog.satellites)
    && Array.isArray(catalog.constellations)
    && typeof catalog.generatedAt === "string";
}

export function loadSatelliteData(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = fetch("/data/satellites.json")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const catalog: unknown = await response.json();
      if (!isSatelliteCatalog(catalog)) {
        throw new Error("invalid catalog shape");
      }

      allSatellites = catalog.satellites.map(convertSatelliteData);
      satelliteConstellations = catalog.constellations;
      console.log(
        `Loaded ${allSatellites.length.toLocaleString()} individual satellites and `
        + `${satelliteConstellations.length} constellation groups`
      );
    })
    .catch((error: unknown) => {
      console.error("Failed to load satellite catalog:", error);
    });

  return loadPromise;
}

export function getSatelliteConstellations(): readonly SatelliteConstellation[] {
  return satelliteConstellations;
}

export function filterSatellitesByCategory(
  ...categories: SatelliteCategory[]
): CelestialBody[] {
  const categorySet = new Set(categories);
  return allSatellites.filter((satellite) => (
    satellite.satelliteCategory !== undefined
    && categorySet.has(satellite.satelliteCategory)
  ));
}
