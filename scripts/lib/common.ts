/**
 * Shared helpers for the data fetch scripts.
 *
 * Every script in this directory downloads orbital or physical data from an
 * authoritative source (JPL, NAIF, IAU, CelesTrak) and writes a JSON file the
 * app loads. Nothing here synthesizes data.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const J2000 = 2451545.0;
export const AU_KM = 149597870.7;
const UNIX_EPOCH_JD = 2440587.5;

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** GET a URL as text, retrying transient failures with backoff. */
export async function fetchText(url: string | URL, attempts = 8): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "sol-data-fetch/2.0" } });
      if (response.ok) return await response.text();
      const retryable = response.status === 429 || response.status === 503 || response.status >= 500;
      if (!retryable || attempt >= attempts) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
    } catch (error) {
      if (attempt >= attempts) throw error;
    }
    await sleep(Math.min(30_000, 1000 * 2 ** attempt));
  }
}

export async function fetchJson<T>(url: string | URL): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

/** Write JSON atomically so an interrupted run never leaves a truncated file. */
export function writeJson(relativePath: string, value: unknown, pretty = false): void {
  const outputPath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value));
  fs.renameSync(temporaryPath, outputPath);
  console.log(`Wrote ${outputPath}`);
}

export function isoToJulian(iso: string): number {
  return Date.parse(iso) / 86_400_000 + UNIX_EPOCH_JD;
}

export function julianToIso(jd: number): string {
  return new Date((jd - UNIX_EPOCH_JD) * 86_400_000).toISOString();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&times;/g, "×")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** Extract the cell text of every row of every <table> in an HTML page. */
export function parseHtmlTables(html: string): string[][][] {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
  return tables.map((table) => (table.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((row) => (
    [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => (
      decodeEntities(cell[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    ))
  )));
}

/** Round to a fixed number of significant digits to keep JSON compact. */
export function sig(value: number, digits = 10): number {
  return Number(value.toPrecision(digits));
}

/** Numeric value of a table cell whose first token is the value ("11.08 0.04 1" → 11.08). */
export function leadingNumber(cell: string | undefined): number | null {
  if (!cell) return null;
  const value = Number.parseFloat(cell.split(" ")[0]);
  return Number.isFinite(value) ? value : null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Horizons reports where an ephemeris's coverage ends, e.g.
 * 'No ephemeris for target "..." after A.D. 2026-MAR-01 01:00:00.0000 TDB'
 * (or "prior to"). Returns the limit as a Julian date, or null.
 */
export function horizonsCoverageLimit(text: string): { side: "before" | "after"; jd: number } | null {
  const match = text.match(/(prior to|after) A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}:\d{2})/);
  if (!match) return null;
  const month = String(MONTHS.indexOf(match[3]) + 1).padStart(2, "0");
  return {
    side: match[1] === "after" ? "after" : "before",
    jd: isoToJulian(`${match[2]}-${month}-${match[4]}T${match[5]}:00Z`),
  };
}
