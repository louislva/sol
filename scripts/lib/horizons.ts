/**
 * Minimal JPL Horizons API client for the data scripts.
 * Docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { ROOT, fetchText, horizonsCoverageLimit, sleep } from "./common.ts";

/** Responses are cached on disk so reruns and development don't re-query Horizons. */
const CACHE_DIR = path.join(ROOT, "scripts/.cache/horizons");

const HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";
/** Horizons caps output length; stay well below it per request. */
const MAX_ROWS = 20_000;
const MAX_TLIST = 50; // longer epoch lists make the URL too long (HTTP 414/502)

export class HorizonsError extends Error {
  readonly text: string;
  constructor(text: string) {
    super(text.replace(/\s+/g, " ").slice(0, 300));
    this.text = text;
  }
}

async function query(parameters: Record<string, string>): Promise<string> {
  const url = new URL(HORIZONS_URL);
  url.searchParams.set("format", "text");
  url.searchParams.set("OBJ_DATA", "NO");
  url.searchParams.set("MAKE_EPHEM", "YES");
  url.searchParams.set("REF_SYSTEM", "ICRF");
  url.searchParams.set("CSV_FORMAT", "YES");
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);

  const cacheFile = path.join(CACHE_DIR, `${createHash("sha1").update(url.search).digest("hex")}.txt`);
  let text: string;
  if (fs.existsSync(cacheFile)) {
    text = fs.readFileSync(cacheFile, "utf8");
  } else {
    text = await fetchText(url);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, text);
    await sleep(150);
  }
  if (!text.includes("$$SOE")) throw new HorizonsError(text);
  return text;
}

function rows(text: string): { names: string[]; rows: string[][] } {
  const header = text.match(/^\s*JDTDB,.*$/m)?.[0] ?? "";
  const body = text.split("$$SOE")[1].split("$$EOE")[0].trim();
  return {
    names: header.split(",").map((name) => name.trim()),
    rows: body.length === 0 ? [] : body.split("\n").map((line) => line.split(",").map((value) => value.trim())),
  };
}

export interface StateTable {
  jd: number[];
  /** km, J2000 ecliptic */
  position: number[][];
  /** km/s */
  velocity: number[][];
}

/** State vectors (J2000 ecliptic) of `command` relative to `center` on a uniform grid. */
export async function vectorGrid(command: string, center: string, start: number, stop: number, stepMinutes: number): Promise<StateTable> {
  const table: StateTable = { jd: [], position: [], velocity: [] };
  const stepDays = stepMinutes / 1440;
  for (let chunkStart = start; chunkStart < stop; chunkStart += stepDays * MAX_ROWS) {
    const chunkStop = Math.min(stop, chunkStart + stepDays * (MAX_ROWS - 1));
    const text = await query({
      COMMAND: `'${command}'`,
      CENTER: `'${center}'`,
      EPHEM_TYPE: "VECTORS",
      REF_PLANE: "ECLIPTIC",
      OUT_UNITS: "KM-S",
      VEC_TABLE: "2",
      START_TIME: `'JD${chunkStart.toFixed(6)}'`,
      STOP_TIME: `'JD${chunkStop.toFixed(6)}'`,
      STEP_SIZE: `'${Math.max(1, Math.round(stepMinutes))} m'`,
    });
    for (const row of rows(text).rows) {
      const values = row.map(Number);
      table.jd.push(values[0]);
      table.position.push(values.slice(2, 5));
      table.velocity.push(values.slice(5, 8));
    }
  }
  return table;
}

/** State vectors (J2000 ecliptic) of `command` relative to `center` at the given epochs. */
export async function vectorsAt(command: string, center: string, epochs: readonly number[]): Promise<StateTable> {
  const table: StateTable = { jd: [], position: [], velocity: [] };
  for (let offset = 0; offset < epochs.length; offset += MAX_TLIST) {
    const text = await query({
      COMMAND: `'${command}'`,
      CENTER: `'${center}'`,
      EPHEM_TYPE: "VECTORS",
      REF_PLANE: "ECLIPTIC",
      OUT_UNITS: "KM-S",
      VEC_TABLE: "2",
      TLIST: epochs.slice(offset, offset + MAX_TLIST).map((epoch) => `'${epoch.toFixed(8)}'`).join(" "),
    });
    for (const row of rows(text).rows) {
      const values = row.map(Number);
      table.jd.push(values[0]);
      table.position.push(values.slice(2, 5));
      table.velocity.push(values.slice(5, 8));
    }
  }
  return table;
}

export interface OsculatingElements {
  epoch: number;
  q: number;     // km
  e: number;
  i: number;     // deg
  node: number;  // deg
  argPeri: number; // deg
  M: number;     // deg
  n: number;     // deg/day
}

/** Osculating elements (J2000 ecliptic, relative to `center`) at the given epochs. */
export async function elementsAt(command: string, center: string, epochs: readonly number[]): Promise<OsculatingElements[]> {
  const result: OsculatingElements[] = [];
  for (let offset = 0; offset < epochs.length; offset += MAX_TLIST) {
    const chunk = epochs.slice(offset, offset + MAX_TLIST);
    const text = await query({
      COMMAND: `'${command}'`,
      CENTER: `'${center}'`,
      EPHEM_TYPE: "ELEMENTS",
      REF_PLANE: "ECLIPTIC",
      OUT_UNITS: "KM-D",
      TLIST: chunk.map((epoch) => `'${epoch.toFixed(8)}'`).join(" "),
    });
    const table = rows(text);
    const column = (name: string) => table.names.indexOf(name);
    const indices = ["QR", "EC", "IN", "OM", "W", "MA", "N"].map(column);
    for (const row of table.rows) {
      const [q, e, i, node, argPeri, M, n] = indices.map((index) => Number(row[index]));
      result.push({ epoch: Number(row[0]), q, e, i, node, argPeri, M, n });
    }
  }
  return result;
}

/**
 * The time span Horizons has an ephemeris for, found by asking for a date
 * outside it on each side and reading the limit from the error.
 */
export async function coverage(command: string, center: string, guessStart: number, guessEnd: number): Promise<[number, number]> {
  const probe = async (jd: number): Promise<{ side: "before" | "after"; jd: number } | null> => {
    try {
      await query({ COMMAND: `'${command}'`, CENTER: `'${center}'`, EPHEM_TYPE: "VECTORS", TLIST: `'${jd}'`, VEC_TABLE: "1" });
      return null;
    } catch (error) {
      if (!(error instanceof HorizonsError)) throw error;
      const limit = horizonsCoverageLimit(error.text);
      if (!limit) throw error;
      return limit;
    }
  };
  const before = await probe(guessStart);
  const after = await probe(guessEnd);
  return [before?.jd ?? guessStart, after?.jd ?? guessEnd];
}
