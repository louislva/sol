/**
 * Stars for the galactic view: every star within 20 parsecs, every star
 * visible to the naked eye (V < 6.5), and every star with an IAU name.
 *
 * Sources:
 *   SIMBAD (CDS, Strasbourg) TAP service — positions (ICRS, epoch J2000),
 *     parallaxes, proper motions, radial velocities, spectral types and
 *     magnitudes, each SIMBAD's adopted value (Gaia DR3 for most stars).
 *     https://simbad.cds.unistra.fr/simbad/sim-tap
 *   IAU Catalog of Star Names (IAU WGSN) — official proper names.
 *     https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt
 *
 * Multiple systems appear in SIMBAD both as a whole and as components; a
 * system is dropped when any of its components is in the catalog. Stars
 * whose parallax is uncertain by more than 20% are left out (their distance
 * is not known well enough to place them). Radial velocities faster than the
 * Galaxy's escape speed are errors and are dropped.
 *
 * Output: public/data/stars.json
 * Run:    node scripts/fetch-stars.ts
 */

import { fetchText, sleep, writeJson } from "./lib/common.ts";

const TAP_URL = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync";
const IAU_NAMES_URL = "https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt";
const MAX_PARALLAX_ERROR = 0.2;
/**
 * The Galaxy's escape speed near the Sun (Piffl et al. 2014, A&A 562, A91:
 * 533 km/s). A disc star cannot move this fast, so a larger radial velocity
 * is a measurement error (GJ 866's "6,825 km/s") and is treated as unknown.
 */
const MAX_RADIAL_VELOCITY = 550;

/** Star-like object types: under SIMBAD's "*" branch, except planets. */
const IS_STAR = "o.path LIKE '*%' AND o.path NOT LIKE '* > Pl%'";
const IN_CATALOG = "(b.plx_value >= 50 OR f.V < 6.5)";

type Row = Record<string, string>;

async function tap(query: string): Promise<Row[]> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(TAP_URL, {
      method: "POST",
      body: new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "csv", QUERY: query }),
    });
    const text = await response.text();
    if (response.ok && !text.startsWith("<?xml")) return parseCsv(text);
    if (attempt >= 5) throw new Error(`SIMBAD TAP failed (${response.status}): ${text.slice(0, 500)}`);
    await sleep(2000 * 2 ** attempt);
  }
}

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.filter((values) => values.length === header.length).map((values) => Object.fromEntries(header.map((key, index) => [key, values[index]])));
}

interface IauName {
  name: string;
  designation: string;
  hip: number | null;
  hd: number | null;
}

/**
 * The IAU-CSN table is fixed-width. Its text columns are left-aligned under
 * the numbered header row; the numeric columns at the end are right-aligned,
 * so those are read from the end of the line instead.
 */
function parseIauNames(text: string): IauName[] {
  const lines = text.split("\n");
  const ruler = lines.find((line) => line.startsWith("#(1)"));
  if (!ruler) throw new Error("IAU-CSN: header not found");
  const starts = [...ruler.matchAll(/\(\d+\)/g)].map((match) => match.index!);
  starts[0] = 0;
  const column = (line: string, index: number) => line.slice(starts[index], starts[index + 1]).trim();
  // mag, band, HIP, HD, RA, Dec, date, optional note mark.
  const tail = /\s(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(\d{4}-\d{2}-\d{2})\s*\*?\s*$/;
  const names: IauName[] = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("$")) continue;
    const match = tail.exec(line);
    if (!match) throw new Error(`IAU-CSN: unexpected row "${line}"`);
    const [, , , hip, hd] = match;
    names.push({
      name: column(line, 0),
      designation: column(line, 2),
      hip: /^\d+$/.test(hip) ? Number(hip) : null,
      hd: /^\d+$/.test(hd) ? Number(hd) : null,
    });
  }
  return names;
}

const GREEK: Record<string, string> = {
  alf: "α", bet: "β", gam: "γ", del: "δ", eps: "ε", zet: "ζ", eta: "η", tet: "θ", iot: "ι", kap: "κ", lam: "λ", mu: "μ",
  nu: "ν", ksi: "ξ", omi: "ο", pi: "π", rho: "ρ", sig: "σ", tau: "τ", ups: "υ", phi: "φ", chi: "χ", psi: "ψ", ome: "ω",
};

/**
 * A readable designation from SIMBAD's: "NAME Proxima Centauri" → "Proxima
 * Centauri", "* alf Cen A" → "α Cen A", "* 61 Cyg B" → "61 Cyg B",
 * "V* V645 Cen" → "V645 Cen".
 */
function readable(id: string): string {
  const trimmed = id.replace(/\s+/g, " ").trim();
  if (trimmed.startsWith("NAME ")) return trimmed.slice(5);
  const star = /^(?:\*|V\*) (.*)$/.exec(trimmed);
  if (!star) return trimmed;
  return star[1].replace(/^([a-z]{2,3})(0?\d*)(?= )/, (whole, letter: string, index: string) => {
    const greek = GREEK[letter];
    if (!greek) return whole;
    const superscript = index ? String(Number(index)).replace(/\d/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)]) : "";
    return greek + superscript;
  });
}

const COLUMNS = "b.oid, b.main_id, b.ra, b.dec, b.plx_value, b.plx_err, b.pmra, b.pmdec, b.rvz_radvel, b.rvz_type, b.sp_type, b.otype, f.V, f.G, f.J";
const FROM = "FROM basic AS b JOIN otypedef AS o ON o.otype = b.otype LEFT JOIN allfluxes AS f ON f.oidref = b.oid";

async function main(): Promise<void> {
  console.log("IAU star names...");
  const iauNames = parseIauNames(await fetchText(IAU_NAMES_URL));
  console.log(`  ${iauNames.length} names`);

  console.log("SIMBAD: stars within 20 pc or brighter than V = 6.5...");
  const rows = await tap(`SELECT ${COLUMNS} ${FROM} WHERE ${IS_STAR} AND b.plx_value > 0 AND ${IN_CATALOG}`);
  console.log(`  ${rows.length} objects`);

  // IAU-named stars, found by their catalog numbers.
  console.log("SIMBAD: IAU-named stars...");
  const ids = new Set<string>();
  for (const star of iauNames) {
    if (star.hip) ids.add(`HIP ${star.hip}`);
    if (star.hd) ids.add(`HD ${star.hd}`);
    if (!star.hip && !star.hd && star.designation !== "_") ids.add(star.designation);
  }
  const quoted = [...ids].map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  const namedIdents = await tap(`SELECT i.oidref, i.id FROM ident AS i WHERE i.id IN (${quoted})`);
  const namedOids = [...new Set(namedIdents.map((row) => row.oidref))];
  const known = new Set(rows.map((row) => row.oid));
  const missing = namedOids.filter((oid) => !known.has(oid));
  for (let offset = 0; offset < missing.length; offset += 400) {
    const chunk = missing.slice(offset, offset + 400).join(",");
    rows.push(...await tap(`SELECT ${COLUMNS} ${FROM} WHERE ${IS_STAR} AND b.plx_value > 0 AND b.oid IN (${chunk})`));
  }
  console.log(`  ${missing.length} more named stars beyond the main selection`);

  const oids = new Set(rows.map((row) => row.oid));

  // Systems whose components are listed separately.
  console.log("SIMBAD: multiple-system hierarchy...");
  const links = await tap(
    "SELECT h.parent, h.child FROM h_link AS h JOIN basic AS p ON p.oid = h.parent JOIN basic AS c ON c.oid = h.child "
    + "JOIN otypedef AS o ON o.otype = p.otype WHERE o.path LIKE '*%' AND p.plx_value > 0 AND c.plx_value > 0"
  );
  const systems = new Set(links.filter((link) => oids.has(link.parent) && oids.has(link.child)).map((link) => link.parent));
  console.log(`  ${systems.size} systems replaced by their components`);

  // Identifiers for naming: IAU names by HIP/HD/designation, and Gliese numbers.
  console.log("SIMBAD: identifiers...");
  const identRows: Row[] = [];
  const all = [...oids];
  for (let offset = 0; offset < all.length; offset += 2000) {
    const chunk = all.slice(offset, offset + 2000).join(",");
    identRows.push(...await tap(
      `SELECT i.oidref, i.id FROM ident AS i WHERE i.oidref IN (${chunk}) `
      + "AND (i.id LIKE 'HIP %' OR i.id LIKE 'HD %' OR i.id LIKE 'GJ %' OR i.id LIKE 'NAME %' OR i.id LIKE 'Ross %' OR i.id LIKE 'Wolf %')"
    ));
  }
  const idsOf = new Map<string, string[]>();
  for (const row of identRows) {
    const list = idsOf.get(row.oidref) ?? [];
    list.push(row.id.replace(/\s+/g, " ").trim());
    idsOf.set(row.oidref, list);
  }
  const iauById = new Map<string, string>();
  for (const star of iauNames) {
    if (star.hip) iauById.set(`HIP ${star.hip}`, star.name);
    if (star.hd) iauById.set(`HD ${star.hd}`, star.name);
    if (star.designation !== "_") iauById.set(star.designation, star.name);
  }

  let dropped = 0;
  const stars: (string | number | null)[][] = [];
  for (const row of rows) {
    if (systems.has(row.oid)) continue;
    const parallax = Number(row.plx_value);
    const parallaxError = Number(row.plx_err);
    if (!(parallax > 0) || !(parallaxError / parallax <= MAX_PARALLAX_ERROR) || row.pmra === "" || row.pmdec === "") {
      dropped++;
      continue;
    }
    const identifiers = idsOf.get(row.oid) ?? [];
    const iau = identifiers.map((id) => iauById.get(id)).find((name) => name !== undefined) ?? null;
    const mainId = row.main_id.replace(/\s+/g, " ").trim();
    // Prefer a proper name or Bayer/Flamsteed designation, then the classic
    // nearby-star catalogs (Ross 248, Wolf 359, Gliese), then SIMBAD's main identifier.
    const classic = identifiers.find((id) => /^(Ross|Wolf) /.test(id)) ?? identifiers.find((id) => id.startsWith("GJ "));
    const designation = /^(NAME|\*) /.test(mainId) || !classic ? readable(mainId) : classic;
    const [magnitude, band] = row.V !== "" ? [row.V, "V"] : row.G !== "" ? [row.G, "G"] : row.J !== "" ? [row.J, "J"] : ["", ""];
    stars.push([
      iau,
      designation,
      Number(Number(row.ra).toFixed(7)),
      Number(Number(row.dec).toFixed(7)),
      parallax,
      Number(row.pmra),
      Number(row.pmdec),
      row.rvz_radvel !== "" && row.rvz_type !== "z" && Math.abs(Number(row.rvz_radvel)) < MAX_RADIAL_VELOCITY
        ? Number(row.rvz_radvel)
        : null,
      row.sp_type || null,
      magnitude !== "" ? Number(magnitude) : null,
      band || null,
    ]);
  }
  // Nearest first, so that a level of detail can take a prefix.
  stars.sort((a, b) => (b[4] as number) - (a[4] as number));
  console.log(`  ${dropped} left out for uncertain parallax or missing proper motion`);

  writeJson("public/data/stars.json", {
    source: "SIMBAD (CDS) via TAP; names from the IAU Catalog of Star Names (WGSN)",
    generatedAt: new Date().toISOString(),
    note: "Positions ICRS at epoch J2000; plx mas; pm mas/yr (pmra includes cos dec); rv km/s (null if unknown).",
    columns: ["iauName", "designation", "ra", "dec", "plx", "pmra", "pmdec", "rv", "spType", "mag", "band"],
    stars,
  });
  console.log(`Wrote ${stars.length} stars (${stars.filter((star) => star[0]).length} with IAU names)`);
}

await main();
