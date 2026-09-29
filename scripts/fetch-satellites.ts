/**
 * Build the satellite catalog used by the Earth view.
 *
 * Every active satellite is kept as an individual object; members of the
 * large constellations (Starlink, OneWeb, GPS, ...) are tagged with theirs.
 *
 * Source: CelesTrak GP data in OMM JSON format.
 * Output: public/data/satellites.json
 *
 * Run with Node 22.18+ (which supports erasable TypeScript syntax):
 *   node scripts/fetch-satellites.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../public/data/satellites.json");
const CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php";

const EARTH_MU = 398600.4418; // km^3/s^2
const EARTH_RADIUS = 6378.137; // km
const MILLIS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JULIAN_DATE = 2440587.5;
const REQUEST_DELAY_MS = 600;

type SatelliteCategory = "LEO" | "MEO" | "GEO" | "OTHER";

interface OmmRecord {
  OBJECT_NAME?: string;
  NORAD_CAT_ID?: string | number;
  EPOCH?: string;
  MEAN_MOTION?: string | number;
  ECCENTRICITY?: string | number;
  INCLINATION?: string | number;
  RA_OF_ASC_NODE?: string | number;
  ARG_OF_PERICENTER?: string | number;
  MEAN_ANOMALY?: string | number;
}

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
  /** Index into the catalog's constellations, or −1. */
  constellation?: number;
}

interface ConstellationSource {
  name: string;
  group: string;
  color: string;
}

interface ConstellationDefinition extends ConstellationSource {
  namePatterns: RegExp[];
}

interface ConstellationData extends ConstellationSource {
  count: number;
}

/** Row layout of `satellites` (a compact table: ~16k rows). */
const COLUMNS = ["noradId", "name", "a", "e", "i", "Omega", "omega", "M0", "n", "epoch", "category", "constellation"] as const;

interface SatelliteCatalog {
  generatedAt: string;
  source: string;
  columns: typeof COLUMNS;
  satellites: (string | number)[][];
  constellations: ConstellationData[];
}

// Large groups, colored together. Navigation systems count as constellations too.
const CONSTELLATION_SOURCES: ConstellationDefinition[] = [
  { name: "Starlink", group: "starlink", color: "#c8d2e0", namePatterns: [/^STARLINK-/i] },
  { name: "OneWeb", group: "oneweb", color: "#83d6ff", namePatterns: [/^ONEWEB-/i] },
  { name: "Qianfan", group: "qianfan", color: "#ff9f72", namePatterns: [/^QIANFAN-/i] },
  { name: "Hulianwang", group: "hulianwang", color: "#ffcf6e", namePatterns: [/^HULIANWANG/i] },
  { name: "Kuiper", group: "kuiper", color: "#ca8cff", namePatterns: [/^KUIPER/i] },
  { name: "Iridium NEXT", group: "iridium-NEXT", color: "#62e6c5", namePatterns: [/^IRIDIUM /i] },
  { name: "Orbcomm", group: "orbcomm", color: "#64c98a", namePatterns: [/^ORBCOMM/i] },
  { name: "Globalstar", group: "globalstar", color: "#8edc65", namePatterns: [/^GLOBALSTAR/i] },
  {
    name: "Planet",
    group: "planet",
    color: "#ff7fa6",
    namePatterns: [/^FLOCK /i, /^SKYSAT-/i, /^PELICAN-/i, /^TANAGER-/i, /^DOVE/i],
  },
  { name: "Spire", group: "spire", color: "#e698ff", namePatterns: [/^LEMUR-/i] },
  { name: "GPS", group: "gps-ops", color: "#7272ff", namePatterns: [/^NAVSTAR /i] },
  { name: "GLONASS", group: "glo-ops", color: "#ff6f6f", namePatterns: [/\[GLONASS-[^\]]+\]/i] },
  { name: "Galileo", group: "galileo", color: "#65c7ff", namePatterns: [/^GSAT\d/i] },
  { name: "BeiDou", group: "beidou", color: "#ffd166", namePatterns: [/^BEIDOU-/i] },
];

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchGroup(group: string): Promise<OmmRecord[]> {
  const url = new URL(CELESTRAK_GP_URL);
  url.searchParams.set("GROUP", group);
  url.searchParams.set("FORMAT", "json");

  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "sol-satellite-catalog/1.0",
      },
    });

    if (response.ok) {
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error(`CelesTrak returned non-array JSON for ${group}`);
      }
      return payload as OmmRecord[];
    }

    const retryable = response.status === 403
      || response.status === 429
      || response.status >= 500;
    if (!retryable || attempt === 5) {
      throw new Error(`CelesTrak ${group} request failed: HTTP ${response.status}`);
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
    const waitMilliseconds = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : attempt * 5000;
    console.warn(`  HTTP ${response.status}; retrying ${group} in ${waitMilliseconds / 1000}s`);
    await sleep(waitMilliseconds);
  }

  throw new Error(`CelesTrak ${group} request exhausted its retries`);
}

function finiteNumber(value: string | number | undefined): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseOmmRecord(record: OmmRecord): SatelliteData | null {
  const noradId = finiteNumber(record.NORAD_CAT_ID);
  const meanMotionRevolutionsPerDay = finiteNumber(record.MEAN_MOTION);
  const e = finiteNumber(record.ECCENTRICITY);
  const i = finiteNumber(record.INCLINATION);
  const Omega = finiteNumber(record.RA_OF_ASC_NODE);
  const omega = finiteNumber(record.ARG_OF_PERICENTER);
  const M0 = finiteNumber(record.MEAN_ANOMALY);
  const epochDate = record.EPOCH ? new Date(record.EPOCH) : null;
  const name = record.OBJECT_NAME?.trim();

  if (
    noradId === null
    || meanMotionRevolutionsPerDay === null
    || meanMotionRevolutionsPerDay <= 0
    || e === null
    || e < 0
    || e >= 1
    || i === null
    || Omega === null
    || omega === null
    || M0 === null
    || !epochDate
    || !Number.isFinite(epochDate.getTime())
    || !name
  ) {
    return null;
  }

  const meanMotionRadiansPerSecond = meanMotionRevolutionsPerDay * Math.PI * 2 / 86400;
  const a = Math.cbrt(EARTH_MU / meanMotionRadiansPerSecond ** 2);
  const altitude = a - EARTH_RADIUS;

  let category: SatelliteCategory;
  if (altitude < 2000) category = "LEO";
  else if (altitude >= 35_000 && altitude < 37_000) category = "GEO";
  else if (altitude < 35_000) category = "MEO";
  else category = "OTHER";

  return {
    noradId,
    name,
    a,
    e,
    i,
    Omega,
    omega,
    M0,
    n: meanMotionRevolutionsPerDay * 360,
    epoch: epochDate.getTime() / MILLIS_PER_DAY + UNIX_EPOCH_JULIAN_DATE,
    category,
  };
}

function parseGroup(records: OmmRecord[], group: string): SatelliteData[] {
  const satellites: SatelliteData[] = [];
  const rejectedNames: string[] = [];

  for (const record of records) {
    const satellite = parseOmmRecord(record);
    if (satellite) satellites.push(satellite);
    else rejectedNames.push(record.OBJECT_NAME ?? "unknown object");
  }

  if (rejectedNames.length > 0) {
    const sample = rejectedNames.slice(0, 5).join(", ");
    console.warn(`  Rejected ${rejectedNames.length} malformed ${group} records (${sample})`);
  }

  return satellites;
}

function deduplicateByNoradId(satellites: SatelliteData[]): SatelliteData[] {
  const byNoradId = new Map<number, SatelliteData>();
  for (const satellite of satellites) {
    byNoradId.set(satellite.noradId, satellite);
  }
  return [...byNoradId.values()];
}

async function main(): Promise<void> {
  console.log("Fetching the active satellite catalog from CelesTrak...");
  const localActivePath = process.env.ACTIVE_CATALOG_PATH;
  const namesOnly = process.env.CONSTELLATION_NAMES_ONLY === "1";
  const activeRecords = localActivePath
    ? JSON.parse(fs.readFileSync(localActivePath, "utf8")) as OmmRecord[]
    : await fetchGroup("active");
  const activeSatellites = deduplicateByNoradId(parseGroup(activeRecords, "active"));
  const activeByNoradId = new Map(activeSatellites.map((satellite) => [satellite.noradId, satellite]));
  const constellationIds = new Set<number>();
  const constellations: ConstellationData[] = [];

  console.log(`  ${activeSatellites.length.toLocaleString()} active satellites`);

  for (const definition of CONSTELLATION_SOURCES) {
    const { namePatterns, ...source } = definition;
    console.log(`Fetching ${source.name}...`);
    let groupSatellites = namesOnly
      ? []
      : deduplicateByNoradId(parseGroup(
        await (sleep(REQUEST_DELAY_MS).then(() => fetchGroup(source.group))),
        source.group
      ))
      .map((satellite) => activeByNoradId.get(satellite.noradId))
      .filter((satellite): satellite is SatelliteData => satellite !== undefined);

    // Group feeds can briefly lag newly launched members. Standardized names
    // close that gap while the group intersection prevents broad false matches.
    const nameMatches = activeSatellites.filter((satellite) => (
      namePatterns.some((pattern) => pattern.test(satellite.name))
    ));
    groupSatellites = deduplicateByNoradId([...groupSatellites, ...nameMatches])
      .filter((satellite) => !constellationIds.has(satellite.noradId));

    for (const satellite of groupSatellites) {
      constellationIds.add(satellite.noradId);
      satellite.constellation = constellations.length;
    }

    constellations.push({ ...source, count: groupSatellites.length });
    console.log(`  ${groupSatellites.length.toLocaleString()} active members`);
  }

  const satellites = activeSatellites.sort((left, right) => left.noradId - right.noradId);
  const round = (value: number, digits: number) => Number(value.toFixed(digits));

  const catalog: SatelliteCatalog = {
    generatedAt: new Date().toISOString(),
    source: "https://celestrak.org/NORAD/elements/",
    columns: COLUMNS,
    // OMM elements carry ~4 decimals in angles and ~8 in mean motion.
    satellites: satellites.map((satellite) => [
      satellite.noradId,
      satellite.name,
      round(satellite.a, 2),
      round(satellite.e, 7),
      round(satellite.i, 4),
      round(satellite.Omega, 4),
      round(satellite.omega, 4),
      round(satellite.M0, 4),
      round(satellite.n, 6),
      round(satellite.epoch, 8),
      satellite.category,
      satellite.constellation ?? -1,
    ]),
    constellations,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(catalog));
  fs.renameSync(temporaryPath, OUTPUT_PATH);

  console.log(`\nWrote ${satellites.length.toLocaleString()} satellites (${constellationIds.size.toLocaleString()} in ${constellations.length} constellations)`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

export { parseOmmRecord };
