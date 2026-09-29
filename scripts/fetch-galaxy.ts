/**
 * The Milky Way's spiral structure and the Sun's place and motion in it.
 *
 * Source: Reid, M. J. et al. 2019, "Trigonometric Parallaxes of High-mass
 * Star-forming Regions: Our View of the Milky Way", ApJ 885, 131
 * (arXiv:1910.03357). Read from the paper's LaTeX source:
 *   Table 2 ("Spiral Arm Characteristics") — log-periodic spiral fits to
 *     maser parallaxes, with a kink: ln(R/R_kink) = −(β − β_kink) tan ψ,
 *     β the Galactocentric azimuth, 0 toward the Sun, increasing with
 *     Galactic rotation; ψ = ψ< for β ≤ β_kink, ψ> beyond.
 *   Table 3 ("Bayesian Fitting Results"), fit A5 (the paper's adopted
 *     model) — R0, the solar motion (U, V, W) and Θ0.
 *   Z⊙ = 5.5 pc, the Sun's height above the Galactic plane (Section 5).
 *
 * Output: src/data/galaxy.json
 * Run:    node scripts/fetch-galaxy.ts
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeJson } from "./lib/common.ts";

const SOURCE_URL = "https://arxiv.org/e-print/1910.03357";
const ADOPTED_FIT = "A5";

/** "$-4.2\pm3.8$" → −4.2; "$15\rightarrow\p18$" → [15, 18]; "..." → null. */
function value(cell: string): number | null {
  const match = /(-?\d+(?:\.\d+)?)/.exec(cell.replace(/\\p/g, "").replace(/\$-\$/g, "-"));
  return match ? Number(match[1]) : null;
}

function range(cell: string): [number, number] {
  const match = /(-?\d+)\\rightarrow\\?p?(-?\d+)/.exec(cell.replace(/\s/g, ""));
  if (!match) throw new Error(`Unexpected azimuth range "${cell}"`);
  return [Number(match[1]), Number(match[2])];
}

/** Data rows (cells) of the deluxetable with the given caption. */
function table(tex: string, caption: string): string[][] {
  const start = tex.indexOf(`\\tablecaption{${caption}}`);
  if (start < 0) throw new Error(`Table "${caption}" not found`);
  const body = tex.slice(tex.indexOf("\\startdata", start), tex.indexOf("\\enddata", start));
  return body
    .split("\\\\")
    .map((row) => row.replace(/\\startdata|\\cutinhead\{[^}]*\}/g, "").trim())
    .filter((row) => row.includes("&"))
    .map((row) => row.split("&").map((cell) => cell.trim()));
}

async function main(): Promise<void> {
  console.log(`Downloading ${SOURCE_URL}...`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`arXiv: HTTP ${response.status}`);
  const directory = mkdtempSync(path.join(tmpdir(), "reid2019-"));
  const archive = path.join(directory, "source.tar.gz");
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  execFileSync("tar", ["xzf", archive, "-C", directory]);
  const tex = readFileSync(path.join(directory, "Reid_arXiv.tex"), "utf8");

  const arms = table(tex, "Spiral Arm Characteristics").map((cells) => {
    const [name, , , betaRange, betaKink, rKink, pitchInner, pitchOuter, width] = cells;
    const [betaMin, betaMax] = range(betaRange);
    return {
      name: name.replace("Sct-Cen", "Scutum-Centaurus").replace("Sgr-Car", "Sagittarius-Carina").replace("3-kpc(N)", "3-kpc"),
      betaMin,
      betaMax,
      betaKink: value(betaKink)!,
      rKink: value(rKink)!,
      pitchInner: value(pitchInner)!,
      pitchOuter: value(pitchOuter)!,
      width: value(width)!,
    };
  });

  const fits = table(tex, "Bayesian Fitting Results");
  const header = /\\tablecaption\{Bayesian Fitting Results\}[\s\S]*?\\tablehead\s*\{([\s\S]*?)\}\s*\\startdata/.exec(tex)![1];
  const fitNames = [...header.matchAll(/\\colhead\{([^}]*)\}/g)].map((match) => match[1]);
  const column = fitNames.indexOf(ADOPTED_FIT);
  if (column < 0) throw new Error(`Fit ${ADOPTED_FIT} not found`);
  const fit = (label: RegExp) => {
    const row = fits.find((cells) => label.test(cells[0]));
    if (!row) throw new Error(`Row ${label} not found`);
    return value(row[column])!;
  };

  const zSun = /\\Zsun=(\d+(?:\.\d+)?)\\pm/.exec(tex);
  if (!zSun) throw new Error("Z_sun not found");

  writeJson("src/data/galaxy.json", {
    source: "Reid et al. 2019, ApJ 885, 131 (arXiv:1910.03357): Table 2 and fit A5 of Table 3",
    generatedAt: new Date().toISOString(),
    note: "Distances kpc, angles deg, velocities km/s. Arm azimuths β from the Galactic center, 0 toward the Sun, increasing with Galactic rotation; width is the Gaussian 1σ at R_kink.",
    r0: fit(/^\\Ro/),
    zSun: Number(zSun[1]) / 1000,
    theta0: fit(/^\\To/),
    solarMotion: { u: fit(/^\\U~/), v: fit(/^\\V~/), w: fit(/^\\W~/) },
    arms,
  }, true);
  console.log(`Wrote ${arms.length} arms`);
}

await main();
