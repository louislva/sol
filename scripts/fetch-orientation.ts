/**
 * Body orientation, shape, and gravity constants from NAIF.
 *
 * Sources:
 *   https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc
 *     IAU WGCCRE 2015 pole orientation (RA/Dec of the north pole), prime
 *     meridian rotation (W), and triaxial radii.
 *   https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc
 *     GM values consistent with the DE440 planetary ephemeris.
 *
 * Only the secular (polynomial) orientation terms are kept; the small
 * periodic nutation/libration terms are omitted.
 *
 * Output: src/data/orientation.json
 * Run:    node scripts/fetch-orientation.ts
 */

import { fetchText, writeJson } from "./lib/common.ts";

const PCK_URL = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc";
const GM_URL = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc";

interface OrientationRecord {
  /** Pole right ascension (deg) at J2000 and its rate (deg per Julian century). */
  poleRa?: [number, number];
  /** Pole declination (deg) at J2000 and its rate (deg per Julian century). */
  poleDec?: [number, number];
  /** Prime meridian angle W (deg) at J2000 and its rate (deg per day). */
  primeMeridian?: [number, number];
  /** Triaxial radii (km). */
  radii?: [number, number, number];
  /** Gravitational parameter (km^3/s^2). */
  gm?: number;
}

/** Parse the assignments inside \begindata blocks of a NAIF text kernel. */
function parseTextKernel(text: string): Map<string, number[]> {
  const assignments = new Map<string, number[]>();
  const dataBlocks = text.split("\\begindata").slice(1).map((block) => block.split("\\begintext")[0]);

  for (const block of dataBlocks) {
    for (const match of block.matchAll(/([A-Z0-9_]+)\s*=\s*(\([^)]*\)|[^\s(]+)/g)) {
      const values = match[2]
        .replace(/[()]/g, " ")
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((token) => Number(token.replace(/D/i, "E")));
      if (values.every(Number.isFinite)) assignments.set(match[1], values);
    }
  }
  return assignments;
}

async function main(): Promise<void> {
  const [pck, gm] = await Promise.all([fetchText(PCK_URL), fetchText(GM_URL)]);
  const assignments = new Map([...parseTextKernel(pck), ...parseTextKernel(gm)]);
  const bodies: Record<string, OrientationRecord> = {};

  const record = (id: string): OrientationRecord => (bodies[id] ??= {});

  for (const [key, values] of assignments) {
    const match = key.match(/^BODY(\d+)_(POLE_RA|POLE_DEC|PM|RADII|GM)$/);
    if (!match) continue;
    const [, id, field] = match;
    switch (field) {
      case "POLE_RA": record(id).poleRa = [values[0], values[1] ?? 0]; break;
      case "POLE_DEC": record(id).poleDec = [values[0], values[1] ?? 0]; break;
      case "PM": record(id).primeMeridian = [values[0], values[1] ?? 0]; break;
      case "RADII": record(id).radii = [values[0], values[1], values[2]]; break;
      case "GM": record(id).gm = values[0]; break;
    }
  }

  writeJson("src/data/orientation.json", {
    source: [PCK_URL, GM_URL],
    generatedAt: new Date().toISOString(),
    bodies,
  }, true);
  console.log(`${Object.keys(bodies).length} bodies`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
