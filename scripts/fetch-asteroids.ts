/**
 * Asteroid population for the background point cloud.
 *
 * Source: JPL Small-Body Database Query API
 *   https://ssd-api.jpl.nasa.gov/sbdb_query.api
 *
 * Downloads the N intrinsically brightest asteroids (lowest absolute
 * magnitude H — a proxy for size), all orbit classes: main belt, NEOs,
 * Jupiter trojans, Centaurs, and trans-Neptunian objects. The list is sorted
 * by H so the app can draw a prefix of it as a level of detail.
 *
 * Output: public/data/asteroids.json, columnar:
 *   { fields: [...], rows: number[][] per field, names: string[] }
 *
 * Run: node scripts/fetch-asteroids.ts [count]   (default 25000)
 */

import { fetchJson, sig, writeJson } from "./lib/common.ts";

const QUERY_URL = "https://ssd-api.jpl.nasa.gov/sbdb_query.api";
const PAGE_SIZE = 5000;

interface QueryResponse {
  fields: string[];
  data: Array<Array<string | null>>;
  count: number;
}

const FIELDS = ["full_name", "epoch", "a", "e", "i", "om", "w", "ma", "n", "H"] as const;

async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? 25000);
  if (!Number.isInteger(count) || count <= 0) throw new Error("count must be a positive integer");

  const rows: Array<Array<string | null>> = [];
  for (let offset = 0; offset < count; offset += PAGE_SIZE) {
    const url = new URL(QUERY_URL);
    url.searchParams.set("fields", FIELDS.join(","));
    url.searchParams.set("sb-kind", "a");
    url.searchParams.set("full-prec", "true");
    url.searchParams.set("sort", "H");
    url.searchParams.set("sb-cdata", JSON.stringify({ AND: ["H|DF", "e|LT|1"] }));
    url.searchParams.set("limit", String(Math.min(PAGE_SIZE, count - offset)));
    url.searchParams.set("limit-from", String(offset));
    const response = await fetchJson<QueryResponse>(url);
    rows.push(...response.data);
    console.log(`  ${rows.length.toLocaleString()} / ${count.toLocaleString()} (catalog has ${response.count.toLocaleString()})`);
    if (response.data.length === 0) break;
  }

  const columns = {
    epoch: [] as number[],
    a: [] as number[],
    e: [] as number[],
    i: [] as number[],
    node: [] as number[],
    argPeri: [] as number[],
    meanAnomaly: [] as number[],
    meanMotion: [] as number[],
    H: [] as number[],
  };
  const names: string[] = [];

  for (const row of rows) {
    const [fullName, ...values] = row;
    const numbers = values.map((value) => Number(value));
    if (!numbers.every(Number.isFinite)) continue;
    const [epoch, a, e, i, om, w, ma, n, H] = numbers;
    columns.epoch.push(epoch);
    columns.a.push(sig(a, 9));
    columns.e.push(sig(e, 8));
    columns.i.push(sig(i, 8));
    columns.node.push(sig(om, 8));
    columns.argPeri.push(sig(w, 8));
    columns.meanAnomaly.push(sig(ma, 8));
    columns.meanMotion.push(sig(n, 9));
    columns.H.push(H);
    // "     4 Vesta (A807 FA)" → "4 Vesta"; "  (2004 MN4)" → "2004 MN4"
    const trimmed = (fullName ?? "").trim();
    names.push(trimmed.replace(/\s*\([^)]*\)$/, "") || trimmed.replace(/^\((.*)\)$/, "$1"));
  }

  writeJson("public/data/asteroids.json", {
    source: QUERY_URL,
    generatedAt: new Date().toISOString(),
    note: "Osculating heliocentric elements, J2000 ecliptic; angles in degrees, a in au, n in deg/day, epoch JD (TDB). Sorted by absolute magnitude H.",
    count: names.length,
    columns,
    names,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
