/**
 * Compare the app's computed positions with JPL Horizons.
 *
 * Loads the app's own model code (through Vite, so imports resolve exactly
 * as in the browser), evaluates a set of bodies at a few dates, and prints
 * the error against Horizons vectors — heliocentric for planets and small
 * bodies, planet-relative (with the angular error) for moons and orbiters.
 *
 * Run: npm run verify [-- 2026-09-29 1990-01-01 ...]
 *      TABLES_ONLY=1 npm run verify   (without the runtime ephemerides)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createServer } from "vite";
import { ROOT, fetchText, isoToJulian, sleep } from "./lib/common.ts";

const HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";
const AU_KM = 149_597_870.7;

/** Body name in the app → Horizons command, and (for satellites) the parent to measure against. */
const TARGETS: Array<{ name: string; command: string; parent?: string }> = [
  { name: "Mercury", command: "199" },
  { name: "Earth", command: "399" },
  { name: "Mars", command: "499" },
  { name: "Jupiter", command: "599" },
  { name: "Saturn", command: "699" },
  { name: "Uranus", command: "799" },
  { name: "Neptune", command: "899" },
  { name: "Pluto", command: "999" },
  { name: "Ceres", command: "DES=2000001;" },
  { name: "Halley", command: "DES=1P;CAP;NOFRAG" },
  { name: "Moon", command: "301", parent: "Earth" },
  { name: "Phobos", command: "401", parent: "Mars" },
  { name: "Io", command: "501", parent: "Jupiter" },
  { name: "Callisto", command: "504", parent: "Jupiter" },
  { name: "Titan", command: "606", parent: "Saturn" },
  { name: "Iapetus", command: "608", parent: "Saturn" },
  { name: "Miranda", command: "705", parent: "Uranus" },
  { name: "Triton", command: "801", parent: "Neptune" },
  { name: "Charon", command: "901", parent: "Pluto" },
];

async function horizonsPosition(command: string, jd: number): Promise<number[] | null> {
  const url = new URL(HORIZONS_URL);
  for (const [key, value] of Object.entries({
    format: "text",
    COMMAND: `'${command}'`,
    OBJ_DATA: "NO",
    EPHEM_TYPE: "VECTORS",
    CENTER: "'500@10'",
    REF_PLANE: "ECLIPTIC",
    REF_SYSTEM: "ICRF",
    OUT_UNITS: "KM-S",
    VEC_TABLE: "1",
    CSV_FORMAT: "YES",
    TLIST: `'${jd}'`,
  })) url.searchParams.set(key, value);
  const text = await fetchText(url);
  const row = text.split("$$SOE")[1]?.split("$$EOE")[0]?.trim();
  return row ? row.split(",").slice(2, 5).map(Number) : null;
}

async function main(): Promise<void> {
  const dates = process.argv.slice(2);
  const isoDates = dates.length > 0 ? dates : [new Date().toISOString().slice(0, 10), "2000-01-01", "2045-06-01"];

  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
  try {
    const { World } = await vite.ssrLoadModule("/src/model/world.ts");
    const world = new World();
    // Evaluate what the app shows once its runtime ephemerides have loaded.
    const ephemerides = path.join(ROOT, "public/data/ephemerides.json");
    if (fs.existsSync(ephemerides) && !process.env.TABLES_ONLY) {
      world.catalog.applyEphemerides(JSON.parse(fs.readFileSync(ephemerides, "utf8")));
      const moon = path.join(ROOT, "public/data/moon.json");
      if (fs.existsSync(moon)) world.catalog.applySeries("Moon", JSON.parse(fs.readFileSync(moon, "utf8")).moon);
    }

    for (const iso of isoDates) {
      const jd = isoToJulian(`${iso}T00:00:00Z`);
      world.setTime(jd);
      console.log(`\n${iso} (JD ${jd.toFixed(1)} TDB)`);
      const truth = new Map<string, number[]>();
      for (const target of TARGETS) {
        const position = await horizonsPosition(target.command, jd);
        if (position) truth.set(target.name, position);
        await sleep(150);
      }
      const app = (name: string) => {
        const body = world.catalog.get(name);
        const offset = world.ephemeris.resolve(body);
        return [...world.ephemeris.positions.slice(offset, offset + 3)];
      };

      for (const target of TARGETS) {
        const expected = truth.get(target.name);
        if (!expected) continue;
        const actual = app(target.name);
        const parentTruth = target.parent ? truth.get(target.parent) : undefined;
        if (target.parent && parentTruth) {
          const parentActual = app(target.parent);
          const relExpected = expected.map((value, axis) => value - parentTruth[axis]);
          const relActual = actual.map((value, axis) => value - parentActual[axis]);
          const error = Math.hypot(...relActual.map((value, axis) => value - relExpected[axis]));
          const distance = Math.hypot(...relExpected);
          const degrees = (Math.atan(error / distance) * 180) / Math.PI;
          console.log(`  ${target.name.padEnd(10)} relative to ${target.parent.padEnd(8)} ${error.toFixed(0).padStart(10)} km  (${degrees.toFixed(2)}°)`);
        } else {
          const error = Math.hypot(...actual.map((value, axis) => value - expected[axis]));
          const distance = Math.hypot(...expected);
          const arcsec = (Math.atan(error / distance) * 180 * 3600) / Math.PI;
          console.log(`  ${target.name.padEnd(10)} heliocentric          ${error.toFixed(0).padStart(10)} km  (${arcsec.toFixed(0)}″ at ${(distance / AU_KM).toFixed(2)} AU)`);
        }
      }
    }
  } finally {
    await vite.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
