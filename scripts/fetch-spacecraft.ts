/**
 * Spacecraft osculating orbital elements from JPL Horizons.
 *
 * Source: https://ssd.jpl.nasa.gov/api/horizons.api
 *   Docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
 *
 * One osculating element set per spacecraft, relative to the body it orbits
 * (the Sun for cruise/heliocentric missions, the planet for orbiters),
 * J2000 ecliptic, km and days. Active missions are sampled at the time the
 * script runs; ended missions shortly before their end date.
 *
 * Output: src/data/spacecraft.json
 * Run:    node scripts/fetch-spacecraft.ts
 */

import { fetchText, horizonsCoverageLimit, isoToJulian, julianToIso, sleep, writeJson } from "./lib/common.ts";

const HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";

type MissionType = "deep_space" | "earth_orbiter" | "planetary_orbiter";
type MissionStatus = "active" | "ended";
type IconType = "probe" | "orbiter" | "telescope";

/** Horizons center codes for the bodies spacecraft orbit. */
const CENTERS: Record<string, string> = {
  Sun: "500@10",
  Mercury: "500@199",
  Venus: "500@299",
  Earth: "500@399",
  Moon: "500@301",
  Mars: "500@499",
  Jupiter: "500@599",
  Saturn: "500@699",
};

interface CatalogEntry {
  spkid: number;
  name: string;
  type: MissionType;
  status: MissionStatus;
  icon: IconType;
  launch: string;
  end?: string;
  center: keyof typeof CENTERS;
  /** Horizons' name for the target when it differs from ours. */
  horizonsName?: string;
}

// NAIF spacecraft IDs: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html
const CATALOG: CatalogEntry[] = [
  { spkid: -31, name: "Voyager 1", type: "deep_space", status: "active", icon: "probe", launch: "1977-09-05", center: "Sun" },
  { spkid: -32, name: "Voyager 2", type: "deep_space", status: "active", icon: "probe", launch: "1977-08-20", center: "Sun" },
  { spkid: -98, name: "New Horizons", type: "deep_space", status: "active", icon: "probe", launch: "2006-01-19", center: "Sun" },
  { spkid: -170, name: "JWST", type: "deep_space", status: "active", icon: "telescope", launch: "2021-12-25", center: "Sun", horizonsName: "James Webb" },
  { spkid: -96, name: "Parker Solar Probe", type: "deep_space", status: "active", icon: "probe", launch: "2018-08-12", center: "Sun" },
  { spkid: -144, name: "Solar Orbiter", type: "deep_space", status: "active", icon: "probe", launch: "2020-02-10", center: "Sun" },
  { spkid: -234, name: "STEREO-A", type: "deep_space", status: "active", icon: "probe", launch: "2006-10-26", center: "Sun" },
  { spkid: -74, name: "Mars Reconnaissance Orbiter", type: "planetary_orbiter", status: "active", icon: "orbiter", launch: "2005-08-12", center: "Mars" },
  { spkid: -53, name: "Mars Odyssey", type: "planetary_orbiter", status: "active", icon: "orbiter", launch: "2001-04-07", center: "Mars" },
  { spkid: -202, name: "MAVEN", type: "planetary_orbiter", status: "active", icon: "orbiter", launch: "2013-11-18", center: "Mars" },
  { spkid: -41, name: "Mars Express", type: "planetary_orbiter", status: "active", icon: "orbiter", launch: "2003-06-02", center: "Mars" },
  { spkid: -143, name: "ExoMars TGO", type: "planetary_orbiter", status: "active", icon: "orbiter", launch: "2016-03-14", center: "Mars" },
  { spkid: -61, name: "Juno", type: "planetary_orbiter", status: "active", icon: "orbiter", launch: "2011-08-05", center: "Jupiter" },
  { spkid: -49, name: "Lucy", type: "deep_space", status: "active", icon: "probe", launch: "2021-10-16", center: "Sun" },
  { spkid: -255, name: "Psyche (spacecraft)", horizonsName: "Psyche", type: "deep_space", status: "active", icon: "probe", launch: "2023-10-13", center: "Sun" },
  { spkid: -85, name: "Lunar Reconnaissance Orbiter", type: "planetary_orbiter", status: "active", icon: "orbiter", launch: "2009-06-18", center: "Moon", horizonsName: "LRO" },
  { spkid: -78, name: "DSCOVR", type: "deep_space", status: "active", icon: "probe", launch: "2015-02-11", center: "Sun" },
  { spkid: -23, name: "Pioneer 10", type: "deep_space", status: "ended", icon: "probe", launch: "1972-03-03", end: "2003-01-23", center: "Sun" },
  { spkid: -24, name: "Pioneer 11", type: "deep_space", status: "ended", icon: "probe", launch: "1973-04-06", end: "1995-11-24", center: "Sun" },
  { spkid: -82, name: "Cassini", type: "planetary_orbiter", status: "ended", icon: "orbiter", launch: "1997-10-15", end: "2017-09-15", center: "Saturn" },
  { spkid: -77, name: "Galileo", type: "planetary_orbiter", status: "ended", icon: "orbiter", launch: "1989-10-18", end: "2003-09-21", center: "Jupiter" },
  { spkid: -55, name: "Ulysses", type: "deep_space", status: "ended", icon: "probe", launch: "1990-10-06", end: "2009-06-30", center: "Sun" },
  { spkid: -236, name: "MESSENGER", type: "planetary_orbiter", status: "ended", icon: "orbiter", launch: "2004-08-03", end: "2015-04-30", center: "Mercury" },
  { spkid: -203, name: "Dawn", type: "deep_space", status: "ended", icon: "probe", launch: "2007-09-27", end: "2018-11-01", center: "Sun" },
  { spkid: -226, name: "Rosetta", type: "deep_space", status: "ended", icon: "probe", launch: "2004-03-02", end: "2016-09-30", center: "Sun" },
  { spkid: -140, name: "Deep Impact", type: "deep_space", status: "ended", icon: "probe", launch: "2005-01-12", end: "2013-08-08", center: "Sun" },
  { spkid: -29, name: "Stardust", type: "deep_space", status: "ended", icon: "probe", launch: "1999-02-07", end: "2011-03-24", center: "Sun" },
  { spkid: -93, name: "NEAR Shoemaker", type: "deep_space", status: "ended", icon: "probe", launch: "1996-02-17", end: "2001-02-12", center: "Sun" },
  { spkid: -47, name: "Genesis", type: "deep_space", status: "ended", icon: "probe", launch: "2001-08-08", end: "2004-09-08", center: "Sun" },
  { spkid: -130, name: "Hayabusa", type: "deep_space", status: "ended", icon: "probe", launch: "2003-05-09", end: "2010-06-13", center: "Sun" },
  { spkid: -37, name: "Hayabusa2", type: "deep_space", status: "active", icon: "probe", launch: "2014-12-03", center: "Sun" },
  { spkid: -64, name: "OSIRIS-REx", type: "deep_space", status: "active", icon: "probe", launch: "2016-09-08", center: "Sun" },
  { spkid: -121, name: "BepiColombo", type: "deep_space", status: "active", icon: "probe", launch: "2018-10-20", center: "Sun" },
  { spkid: -28, name: "JUICE", type: "deep_space", status: "active", icon: "probe", launch: "2023-04-14", center: "Sun" },
  { spkid: -159, name: "Europa Clipper", type: "deep_space", status: "active", icon: "probe", launch: "2024-10-14", center: "Sun" },
  { spkid: -227, name: "Kepler", type: "deep_space", status: "ended", icon: "telescope", launch: "2009-03-07", end: "2018-10-30", center: "Sun" },
  { spkid: -79, name: "Spitzer", type: "deep_space", status: "ended", icon: "telescope", launch: "2003-08-25", end: "2020-01-30", center: "Sun" },
];

const COLUMNS = ["EC", "QR", "IN", "OM", "W", "Tp", "N"] as const;

/** Loose name match so a wrong NAIF ID cannot silently return another mission. */
function sameMission(expected: string, horizonsName: string): boolean {
  const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const target = normalize(horizonsName);
  return expected.split(/[\s-]+/).some((word) => word.length > 2 && target.includes(normalize(word)));
}

/** Osculating elements at one instant, from Horizons' CSV element table. */
async function fetchElements(spkid: number, center: string, jd: number, expectedName: string): Promise<{
  epoch: number; q: number; e: number; i: number; node: number; argPeri: number; tp: number; n: number;
}> {
  const url = new URL(HORIZONS_URL);
  url.searchParams.set("format", "text");
  url.searchParams.set("COMMAND", `'${spkid}'`);
  url.searchParams.set("OBJ_DATA", "NO");
  url.searchParams.set("MAKE_EPHEM", "YES");
  url.searchParams.set("EPHEM_TYPE", "ELEMENTS");
  url.searchParams.set("CENTER", `'${center}'`);
  url.searchParams.set("TLIST", `'${jd}'`);
  url.searchParams.set("REF_PLANE", "ECLIPTIC");
  url.searchParams.set("REF_SYSTEM", "ICRF");
  url.searchParams.set("OUT_UNITS", "KM-D");
  url.searchParams.set("CSV_FORMAT", "YES");
  const text = await fetchText(url);

  const limit = horizonsCoverageLimit(text);
  if (limit?.side === "after" && limit.jd < jd) {
    return fetchElements(spkid, center, Math.floor(limit.jd - 1) + 0.5, expectedName);
  }

  const target = text.match(/Target body name:\s*(.+?)\s*\(-?\d+\)/)?.[1];
  if (!target || !sameMission(expectedName, target)) {
    throw new Error(`NAIF ID ${spkid} resolves to "${target ?? "?"}", not ${expectedName}`);
  }

  const header = text.match(/^\s*JDTDB,.*$/m)?.[0];
  const body = text.split("$$SOE")[1]?.split("$$EOE")[0]?.trim();
  if (!header || !body) throw new Error(text.replace(/\s+/g, " ").slice(0, 300));
  const names = header.split(",").map((name) => name.trim());
  const values = body.split("\n")[0].split(",").map((value) => value.trim());
  const read = (name: string) => {
    const value = Number(values[names.indexOf(name)]);
    if (!Number.isFinite(value)) throw new Error(`Missing ${name}`);
    return value;
  };
  const [e, q, i, node, argPeri, tp, n] = COLUMNS.map(read);
  return { epoch: Number(values[0]), q, e, i, node, argPeri, tp, n };
}

async function main(): Promise<void> {
  const nowJd = isoToJulian(new Date().toISOString());
  const spacecraft = [];

  for (const craft of CATALOG) {
    const endJd = craft.end ? isoToJulian(`${craft.end}T00:00:00Z`) : null;
    const sampleJd = Math.floor(Math.min(nowJd, endJd === null ? nowJd : endJd - 2)) + 0.5;
    process.stdout.write(`${craft.name} (${craft.spkid}) about ${craft.center} at ${julianToIso(sampleJd).slice(0, 10)}... `);
    try {
      const elements = await fetchElements(craft.spkid, CENTERS[craft.center], sampleJd, craft.horizonsName ?? craft.name);
      spacecraft.push({
        name: craft.name,
        spkid: craft.spkid,
        missionType: craft.type,
        status: craft.status,
        iconType: craft.icon,
        launchJD: isoToJulian(`${craft.launch}T00:00:00Z`),
        endJD: endJd ?? undefined,
        center: craft.center,
        elements,
      });
      console.log(`q=${elements.q.toExponential(3)} km e=${elements.e.toFixed(4)} epoch ${julianToIso(elements.epoch).slice(0, 10)}`);
    } catch (error) {
      console.log(`FAILED: ${String(error).slice(0, 200)}`);
    }
    await sleep(400);
  }

  writeJson("src/data/spacecraft.json", {
    source: HORIZONS_URL,
    generatedAt: new Date().toISOString(),
    note: "Osculating elements relative to `center`, J2000 ecliptic. q in km, n in deg/day, tp and epoch JD (TDB).",
    spacecraft,
  }, true);
  console.log(`${spacecraft.length}/${CATALOG.length} spacecraft`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
