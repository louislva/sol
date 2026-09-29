/**
 * High-resolution heliocentric ephemerides, loaded by the app at runtime.
 *
 * Source: https://ssd.jpl.nasa.gov/api/horizons.api (DE440 planets and
 * Horizons' integrated small-body orbits).
 *
 * Osculating heliocentric elements (J2000 ecliptic) sampled from 1900 to
 * 2100: every 30 days for the planets (Earth as the Earth–Moon barycenter)
 * and yearly for the named small bodies in src/data/smallBodies.json. The app
 * blends the two conics bracketing a date. This puts the planets where the
 * spacecraft ephemerides expect them (to tens of km) instead of the
 * thousands to millions of km of the approximate-element tables, which
 * remain the fallback outside this span and until this file loads.
 *
 * Requires src/data/smallBodies.json (run fetch-small-bodies.ts first).
 *
 * Output: public/data/ephemerides.json
 *   { start, planets | smallBodies: { [name]: { step, start, rows } } }
 *   rows: [q (km), e, i, node, argPeri, M (deg), n (deg/day)] per epoch.
 *
 * Run: node scripts/fetch-ephemerides.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ROOT, fetchText, horizonsCoverageLimit, sig, sleep, writeJson } from "./lib/common.ts";

const HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";
const START = 2415020.5; // 1900-01-01 TDB
const END = 2488069.5;   // 2100-01-01 TDB
const PLANET_STEP = 30;
const SMALL_BODY_STEP = 365;

const PLANETS: Record<string, string> = {
  Mercury: "199",
  Venus: "299",
  "Earth-Moon Barycenter": "3",
  Mars: "499",
  Jupiter: "599",
  Saturn: "699",
  Uranus: "799",
  Neptune: "899",
};

interface Series {
  start: number;
  step: number;
  rows: number[][];
}

async function fetchSeries(command: string, start: number, end: number, step: number): Promise<Series> {
  const url = new URL(HORIZONS_URL);
  for (const [key, value] of Object.entries({
    format: "text",
    COMMAND: `'${command}'`,
    OBJ_DATA: "NO",
    MAKE_EPHEM: "YES",
    EPHEM_TYPE: "ELEMENTS",
    CENTER: "'500@10'",
    REF_PLANE: "ECLIPTIC",
    REF_SYSTEM: "ICRF",
    OUT_UNITS: "KM-D",
    CSV_FORMAT: "YES",
    START_TIME: `'JD${start}'`,
    STOP_TIME: `'JD${end}'`,
    STEP_SIZE: `'${step} d'`,
  })) url.searchParams.set(key, value);
  const text = await fetchText(url);

  const limit = horizonsCoverageLimit(text);
  if (limit && !text.includes("$$SOE")) {
    // Trim to whole steps inside the object's ephemeris coverage.
    if (limit.side === "before") return fetchSeries(command, start + Math.ceil((limit.jd - start) / step) * step, end, step);
    return fetchSeries(command, start, start + Math.floor((limit.jd - start) / step) * step, step);
  }

  const header = text.match(/^\s*JDTDB,.*$/m)?.[0];
  const body = text.split("$$SOE")[1]?.split("$$EOE")[0]?.trim();
  if (!header || !body) throw new Error(text.replace(/\s+/g, " ").slice(0, 300));
  const names = header.split(",").map((name) => name.trim());
  const column = (name: string) => names.indexOf(name);
  const columns = ["QR", "EC", "IN", "OM", "W", "MA", "N"].map(column);
  if (columns.some((index) => index < 0)) throw new Error(`Unexpected columns: ${header}`);

  const lines = body.split("\n");
  const firstEpoch = Number(lines[0].split(",")[0]);
  const rows = lines.map((line) => {
    const values = line.split(",").map((value) => Number(value.trim()));
    const [q, e, i, node, argPeri, M, n] = columns.map((index) => values[index]);
    if (![q, e, i, node, argPeri, M, n].every(Number.isFinite)) throw new Error(`Bad row: ${line}`);
    return [sig(q, 11), sig(e, 10), sig(i, 10), sig(node, 11), sig(argPeri, 11), sig(M, 11), sig(n, 11)];
  });
  return { start: firstEpoch, step, rows };
}

async function main(): Promise<void> {
  const smallBodies = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/smallBodies.json"), "utf8")
  ) as { bodies: Array<{ name: string; horizonsCommand: string }> };

  const planets: Record<string, Series> = {};
  for (const [name, command] of Object.entries(PLANETS)) {
    planets[name] = await fetchSeries(command, START, END, PLANET_STEP);
    console.log(`${name}: ${planets[name].rows.length} epochs`);
    await sleep(300);
  }

  const small: Record<string, Series> = {};
  for (const body of smallBodies.bodies) {
    small[body.name] = await fetchSeries(body.horizonsCommand, START, END, SMALL_BODY_STEP);
    console.log(`${body.name}: ${small[body.name].rows.length} epochs`);
    await sleep(300);
  }

  writeJson("public/data/ephemerides.json", {
    source: HORIZONS_URL,
    generatedAt: new Date().toISOString(),
    note: "Osculating heliocentric elements, J2000 ecliptic. rows: [q km, e, i deg, node deg, argPeri deg, M deg, n deg/day] at start + k·step (JD TDB).",
    planets,
    smallBodies: small,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
