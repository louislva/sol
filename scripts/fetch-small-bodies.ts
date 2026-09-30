/**
 * Named small bodies: dwarf planets, comets, interstellar objects, and
 * asteroids visited by spacecraft.
 *
 * Sources:
 *   https://ssd-api.jpl.nasa.gov/sbdb.api
 *     Identity, designation, size, and discovery circumstances.
 *   https://ssd.jpl.nasa.gov/api/horizons.api
 *     Osculating heliocentric elements (J2000 ecliptic) every 10 years from
 *     1900 to 2100, from Horizons' numerical integration of each orbit
 *     solution (planetary perturbations and comet non-gravitational forces
 *     included). The app blends the two conics bracketing any date, so
 *     positions are exact at each sample and continuous between them. This
 *     coarse series ships with the app; fetch-ephemerides.ts adds a yearly
 *     one that is loaded at runtime.
 *
 * Elements are stored in perihelion form (q, e, tp), which covers elliptic
 * and hyperbolic orbits alike.
 *
 * Requires src/data/orientation.json (run fetch-orientation.ts first).
 *
 * Output: src/data/smallBodies.json
 * Run:    node scripts/fetch-small-bodies.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ROOT, fetchJson, fetchText, horizonsCoverageLimit, sig, sleep, writeJson } from "./lib/common.ts";

const SBDB_URL = "https://ssd-api.jpl.nasa.gov/sbdb.api";
const HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";
/** Element epochs: 1900-01-01 to 2100-01-01 every 10 Julian years (TDB). */
const SERIES_START = 2415020.5;
const SERIES_STEP = 3652.5;
const SERIES_COUNT = 21;

const orientation = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/orientation.json"), "utf8")
) as { bodies: Record<string, { radii?: number[] }> };

type SmallBodyKind = "dwarf" | "comet" | "asteroid";

interface CatalogEntry {
  query: string;
  name: string;
  kind: SmallBodyKind;
}

const CATALOG: CatalogEntry[] = [
  // IAU dwarf planets
  { query: "1", name: "Ceres", kind: "dwarf" },
  { query: "134340", name: "Pluto", kind: "dwarf" },
  { query: "136199", name: "Eris", kind: "dwarf" },
  { query: "136472", name: "Makemake", kind: "dwarf" },
  { query: "136108", name: "Haumea", kind: "dwarf" },

  // Comets
  { query: "1P", name: "Halley", kind: "comet" },
  { query: "2P", name: "Encke", kind: "comet" },
  { query: "9P", name: "Tempel 1", kind: "comet" },
  { query: "19P", name: "Borrelly", kind: "comet" },
  { query: "67P", name: "Churyumov–Gerasimenko", kind: "comet" },
  { query: "81P", name: "Wild 2", kind: "comet" },
  { query: "103P", name: "Hartley 2", kind: "comet" },
  { query: "C/1995 O1", name: "Hale–Bopp", kind: "comet" },
  { query: "C/2020 F3", name: "NEOWISE", kind: "comet" },

  // Interstellar objects (hyperbolic)
  { query: "1I", name: "ʻOumuamua", kind: "comet" },
  { query: "2I", name: "Borisov", kind: "comet" },
  { query: "3I", name: "3I/ATLAS", kind: "comet" },

  // Large asteroids and spacecraft targets
  { query: "2", name: "Pallas", kind: "asteroid" },
  { query: "4", name: "Vesta", kind: "asteroid" },
  { query: "10", name: "Hygiea", kind: "asteroid" },
  { query: "16", name: "Psyche", kind: "asteroid" },
  { query: "21", name: "Lutetia", kind: "asteroid" },
  { query: "243", name: "Ida", kind: "asteroid" },
  { query: "253", name: "Mathilde", kind: "asteroid" },
  { query: "433", name: "Eros", kind: "asteroid" },
  { query: "951", name: "Gaspra", kind: "asteroid" },
  { query: "2867", name: "Šteins", kind: "asteroid" },
  { query: "4179", name: "Toutatis", kind: "asteroid" },
  { query: "5535", name: "Annefrank", kind: "asteroid" },
  { query: "9969", name: "Braille", kind: "asteroid" },
  { query: "25143", name: "Itokawa", kind: "asteroid" },
  { query: "52246", name: "Donaldjohanson", kind: "asteroid" },
  { query: "65803", name: "Didymos", kind: "asteroid" },
  { query: "99942", name: "Apophis", kind: "asteroid" },
  { query: "101955", name: "Bennu", kind: "asteroid" },
  { query: "152830", name: "Dinkinesh", kind: "asteroid" },
  { query: "162173", name: "Ryugu", kind: "asteroid" },
  { query: "486958", name: "Arrokoth", kind: "asteroid" },
];

/**
 * Sizes for bodies SBDB has no diameter for. Values are from the NAIF PCK
 * (src/data/orientation.json, by NAIF ID) or stellar-occultation results.
 */
const RADIUS_FALLBACK: Record<string, { naifId?: number; radius?: number; source: string }> = {
  Pluto: { naifId: 999, source: "NAIF pck00011" },
  Eris: { radius: 1163, source: "Sicardy et al. 2011, Nature 478, 493 (occultation)" },
  Makemake: { radius: 715, source: "Ortiz et al. 2012, Nature 491, 566 (occultation, 1430 × 1502 km)" },
  Haumea: {
    radius: Math.cbrt(1161 * 852 * 513),
    source: "Ortiz et al. 2017, Nature 550, 219 (occultation, 2322 × 1704 × 1026 km)",
  },
};

interface SbdbValue {
  name: string;
  value: string | null;
  units?: string | null;
  ref?: string | null;
}

interface SbdbResponse {
  object: { fullname: string; spkid: string; des: string; kind: string };
  orbit: { orbit_id: string; source: string; soln_date: string | null };
  phys_par?: SbdbValue[];
  discovery?: { discovery?: string; name?: string; date?: string; who?: string; location?: string };
}

function parseNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Discovery year from SBDB text like "Discovered 2005-Jan-05 by ...". */
function discoveryYear(date: string | undefined): number | undefined {
  const match = date?.match(/(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Osculating heliocentric elements at each series epoch, from Horizons.
 * Epochs outside the object's ephemeris coverage are dropped.
 */
async function fetchElementSeries(command: string, epochs = Array.from({ length: SERIES_COUNT }, (_, k) => SERIES_START + k * SERIES_STEP)): Promise<Array<{
  epoch: number; q: number; e: number; i: number; node: number; argPeri: number; tp: number; n: number;
}>> {
  const url = new URL(HORIZONS_URL);
  url.searchParams.set("format", "text");
  url.searchParams.set("COMMAND", `'${command}'`);
  url.searchParams.set("OBJ_DATA", "NO");
  url.searchParams.set("MAKE_EPHEM", "YES");
  url.searchParams.set("EPHEM_TYPE", "ELEMENTS");
  url.searchParams.set("CENTER", "'500@10'");
  url.searchParams.set("REF_PLANE", "ECLIPTIC");
  url.searchParams.set("REF_SYSTEM", "ICRF");
  url.searchParams.set("OUT_UNITS", "KM-D");
  url.searchParams.set("CSV_FORMAT", "YES");
  url.searchParams.set("TLIST", epochs.map((epoch) => `'${epoch}'`).join(" "));
  const text = await fetchText(url);
  const limit = horizonsCoverageLimit(text);
  if (limit && !text.includes("$$SOE")) {
    const covered = epochs.filter((epoch) => (limit.side === "before" ? epoch > limit.jd : epoch < limit.jd));
    if (covered.length > 0 && covered.length < epochs.length) return fetchElementSeries(command, covered);
  }
  const header = text.match(/^\s*JDTDB,.*$/m)?.[0];
  const body = text.split("$$SOE")[1]?.split("$$EOE")[0]?.trim();
  if (!header || !body) throw new Error(text.replace(/\s+/g, " ").slice(0, 300));
  const names = header.split(",").map((name) => name.trim());
  return body.split("\n").map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const read = (name: string) => {
      const value = Number(values[names.indexOf(name)]);
      if (!Number.isFinite(value)) throw new Error(`Missing ${name} in ${line}`);
      return value;
    };
    return {
      epoch: Number(values[0]),
      q: sig(read("QR"), 12),
      e: sig(read("EC"), 12),
      i: sig(read("IN"), 12),
      node: sig(read("OM"), 12),
      argPeri: sig(read("W"), 12),
      tp: sig(read("Tp"), 14),
      n: sig(read("N"), 12),
    };
  });
}

async function fetchBody(entry: CatalogEntry) {
  const url = new URL(SBDB_URL);
  url.searchParams.set("sstr", entry.query);
  url.searchParams.set("phys-par", "1");
  url.searchParams.set("discovery", "1");
  const response = await fetchJson<SbdbResponse>(url);

  // Pluto's heliocentric orbit is that of the Pluto–Charon barycenter (the
  // app puts Pluto itself opposite Charon). Comets have one record per
  // apparition: take the one nearest today.
  const horizonsCommand = entry.name === "Pluto" ? "9"
    : response.object.kind.startsWith("c") ? `DES=${response.object.des};CAP;NOFRAG`
    : `DES=${response.object.spkid};`;

  const physical = (name: string) => response.phys_par?.find((candidate) => candidate.name === name);
  const diameter = parseNumber(physical("diameter")?.value);
  let radius = diameter === null ? null : diameter / 2;
  let radiusSource = diameter === null ? null : physical("diameter")?.ref ?? "JPL SBDB";
  const fallback = RADIUS_FALLBACK[entry.name];
  if (radius === null && fallback) {
    const radii = fallback.naifId === undefined ? undefined : orientation.bodies[fallback.naifId]?.radii;
    radius = radii ? Math.cbrt(radii[0] * radii[1] * radii[2]) : fallback.radius ?? null;
    radiusSource = fallback.source;
  }

  return {
    name: entry.name,
    designation: response.object.fullname.trim(),
    spkid: Number(response.object.spkid),
    kind: entry.kind,
    orbitSolution: entry.name === "Pluto"
      ? "JPL planetary ephemeris (Pluto system barycenter)"
      : `${response.orbit.source} orbit ${response.orbit.orbit_id}${response.orbit.soln_date ? ` (${response.orbit.soln_date.slice(0, 10)})` : ""}`,
    horizonsCommand,
    elements: await fetchElementSeries(horizonsCommand),
    radius,
    radiusSource,
    discovery: response.discovery?.who
      ? { by: response.discovery.who, year: discoveryYear(response.discovery.date), date: response.discovery.date }
      : undefined,
  };
}

async function main(): Promise<void> {
  const bodies = [];
  for (const entry of CATALOG) {
    process.stdout.write(`${entry.name}... `);
    const body = await fetchBody(entry);
    bodies.push(body);
    const now = body.elements[12];
    console.log(`q=${(now.q / 1.495978707e8).toFixed(3)} AU e=${now.e.toFixed(4)} r=${body.radius ?? "?"}`);
    await sleep(300);
  }
  writeJson("src/data/smallBodies.json", {
    source: [SBDB_URL, HORIZONS_URL],
    note: "elements: osculating heliocentric, J2000 ecliptic; q km, angles deg, n deg/day, epoch and tp JD (TDB).",
    generatedAt: new Date().toISOString(),
    bodies,
  }, true);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
