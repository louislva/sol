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
 * The full IAU model is kept: polynomial terms plus the nutation /
 * precession series (for Mars these include ~1.6° of pole offset, for the
 * Moon several degrees of libration). Angles for each system are stored once
 * under `systems`.
 *
 * Output: src/data/orientation.json
 * Run:    node scripts/fetch-orientation.ts
 */

import { fetchText, writeJson } from "./lib/common.ts";

const PCK_URL = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc";
const GM_URL = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc";

interface OrientationRecord {
  /** Pole right ascension (deg): polynomial in Julian centuries from J2000. */
  poleRa?: number[];
  /** Pole declination (deg): polynomial in Julian centuries from J2000. */
  poleDec?: number[];
  /** Prime meridian angle W (deg): polynomial in days from J2000. */
  primeMeridian?: number[];
  /** Nutation/precession coefficients: RA += Σ ra[i]·sin θi, Dec += Σ dec[i]·cos θi, W += Σ pm[i]·sin θi. */
  nutPrecRa?: number[];
  nutPrecDec?: number[];
  nutPrecPm?: number[];
  /** Barycenter whose angles θi apply (e.g. 4 for Mars). */
  system?: number;
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
    const match = key.match(/^BODY(\d+)_(POLE_RA|POLE_DEC|PM|NUT_PREC_RA|NUT_PREC_DEC|NUT_PREC_PM|RADII|GM)$/);
    if (!match) continue;
    const [, id, field] = match;
    switch (field) {
      case "POLE_RA": record(id).poleRa = values; break;
      case "POLE_DEC": record(id).poleDec = values; break;
      case "PM": record(id).primeMeridian = values; break;
      case "NUT_PREC_RA": record(id).nutPrecRa = values; break;
      case "NUT_PREC_DEC": record(id).nutPrecDec = values; break;
      case "NUT_PREC_PM": record(id).nutPrecPm = values; break;
      case "RADII": record(id).radii = [values[0], values[1], values[2]]; break;
      case "GM": record(id).gm = values[0]; break;
    }
  }

  // Angle series per system barycenter: θi = Σk c[i][k]·T^k (deg, T in centuries).
  const systems: Record<string, number[][]> = {};
  for (const [key, values] of assignments) {
    const match = key.match(/^BODY(\d+)_NUT_PREC_ANGLES$/);
    if (!match) continue;
    const degree = assignments.get(`BODY${match[1]}_MAX_PHASE_DEGREE`)?.[0] ?? 1;
    const stride = degree + 1;
    const angles: number[][] = [];
    for (let index = 0; index + stride <= values.length; index += stride) angles.push(values.slice(index, index + stride));
    systems[match[1]] = angles;
  }
  for (const [id, body] of Object.entries(bodies)) {
    if (!body.nutPrecRa && !body.nutPrecDec && !body.nutPrecPm) continue;
    const numeric = Number(id);
    const system = numeric < 1000 ? Math.floor(numeric / 100) : numeric;
    if (systems[system]) body.system = system;
  }

  writeJson("src/data/orientation.json", {
    source: [PCK_URL, GM_URL],
    generatedAt: new Date().toISOString(),
    systems,
    bodies,
  }, true);
  console.log(`${Object.keys(bodies).length} bodies`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
