/**
 * Planet mean orbital elements and radii from JPL.
 *
 * Sources:
 *   https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *     "Keplerian Elements for Approximate Positions of the Major Planets"
 *     (E M Standish). Both tables: Table 1 (1800–2050, most accurate there)
 *     and Table 2a/2b (3000 BC – 3000 AD, with extra mean-anomaly terms
 *     b, c, s, f for Jupiter through Neptune). Elements are heliocentric,
 *     J2000 ecliptic; "EM Bary" is the Earth–Moon barycenter.
 *   https://ssd.jpl.nasa.gov/planets/phys_par.html
 *     Mean radii.
 *
 * Output: src/data/planets.json
 * Run:    node scripts/fetch-planets.ts
 */

import { fetchText, leadingNumber, parseHtmlTables, writeJson } from "./lib/common.ts";

const ELEMENTS_URL = "https://ssd.jpl.nasa.gov/planets/approx_pos.html";
const PHYSICAL_URL = "https://ssd.jpl.nasa.gov/planets/phys_par.html";

interface PlanetElements {
  name: string;
  /** a (au), e, I (deg), L (deg), long. peri (deg), long. node (deg) at J2000. */
  elements: [number, number, number, number, number, number];
  /** Rates of the above per Julian century. */
  rates: [number, number, number, number, number, number];
  /** Additional mean anomaly terms: M += b T² + c cos(f T) + s sin(f T) (deg). */
  extraTerms?: { b: number; c: number; s: number; f: number };
}

function preBlocks(html: string): string[] {
  return [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map((match) => match[1].replace(/&[a-z]+;/g, " "));
}

function parseElementTable(block: string): PlanetElements[] {
  const lines = block.split("\n");
  const planets: PlanetElements[] = [];
  for (let index = 0; index < lines.length - 1; index++) {
    const match = lines[index].match(/^(Mercury|Venus|EM Bary|Mars|Jupiter|Saturn|Uranus|Neptune)\s+([-\d.\s]+)$/);
    if (!match) continue;
    const values = match[2].trim().split(/\s+/).map(Number);
    const rates = lines[index + 1].trim().split(/\s+/).map(Number);
    if (values.length !== 6 || rates.length !== 6 || ![...values, ...rates].every(Number.isFinite)) {
      throw new Error(`Malformed element rows for ${match[1]}`);
    }
    planets.push({
      name: match[1],
      elements: values as PlanetElements["elements"],
      rates: rates as PlanetElements["rates"],
    });
  }
  return planets;
}

async function main(): Promise<void> {
  const [elementsHtml, physicalHtml] = await Promise.all([fetchText(ELEMENTS_URL), fetchText(PHYSICAL_URL)]);
  const blocks = preBlocks(elementsHtml);

  // The page lists Table 1 (1800–2050), Table 2a (3000 BC – 3000 AD), then
  // Table 2b (extra terms). Identify them by content rather than position.
  const elementTables = blocks.filter((block) => block.includes("EM Bary"));
  const extraBlock = blocks.find((block) => /\bb\s+c\s+s\s+f\b/.test(block));
  if (elementTables.length < 2 || !extraBlock) throw new Error("Unexpected approx_pos.html layout");
  const modern = parseElementTable(elementTables[0]);
  const planets = parseElementTable(elementTables[1]);

  for (const line of extraBlock.split("\n")) {
    const match = line.match(/^(Jupiter|Saturn|Uranus|Neptune)\s+(.*)$/);
    if (!match) continue;
    const [b, c, s, f] = match[2].trim().split(/\s+/).map(Number);
    const planet = planets.find((candidate) => candidate.name === match[1]);
    if (!planet || ![b, c, s, f].every(Number.isFinite)) throw new Error(`Bad extra terms for ${match[1]}`);
    planet.extraTerms = { b, c, s, f };
  }

  const physicalRows = parseHtmlTables(physicalHtml)[0];
  const meanRadius = new Map<string, number>();
  for (const row of physicalRows) {
    const radius = leadingNumber(row[2]);
    if (radius !== null) meanRadius.set(row[0], radius);
  }

  const describe = (table: PlanetElements[]) => table.map((planet) => ({
    ...planet,
    name: planet.name === "EM Bary" ? "Earth-Moon Barycenter" : planet.name,
    meanRadiusKm: meanRadius.get(planet.name === "EM Bary" ? "Earth" : planet.name),
  }));
  writeJson("src/data/planets.json", {
    source: [ELEMENTS_URL, PHYSICAL_URL],
    generatedAt: new Date().toISOString(),
    tables: [
      // Validity spans as Julian dates (TDB): 1800-01-01 → 2050-12-31.
      { name: "Table 1 (1800 – 2050)", validFrom: 2378496.5, validTo: 2470171.5, planets: describe(modern) },
      { name: "Table 2 (3000 BC – 3000 AD)", validFrom: 625673.5, validTo: 2817152.5, planets: describe(planets) },
    ],
  }, true);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
