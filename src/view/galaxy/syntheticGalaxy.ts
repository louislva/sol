/**
 * A synthetic Milky Way, for show.
 *
 * Nobody has seen the Galaxy from outside: its face-on picture is a model.
 * This is that picture drawn in the app's starlight: a few hundred thousand
 * dots, NOT real stars, scattered (with a fixed seed) according to the
 * Galaxy's measured structure —
 *   - an exponential disc (scale length, Bland-Hawthorn & Gerhard 2016),
 *   - the boxy/peanut bulge (exponential scale lengths, Wegg & Gerhard 2013)
 *     and the long bar (half-length and angle, Bland-Hawthorn & Gerhard 2016),
 *   - young stars along the spiral arms (Reid et al. 2019's fits, with
 *     their width–radius relation, continued around the far side).
 * The mix of star colors in each component (blue-white young stars in the
 * arms, amber old stars in the bulge) and the dot sizes are illustrative.
 * These dots are never pickable, named or searchable; the real stars are a
 * separate layer drawn on top.
 */

import { DEG } from "../../astro/constants";
import { armPoint, GALACTIC_TO_FAR, type GalaxyModel, type SpiralArm } from "../../astro/galactic";
import { STAR_CLASS_COLORS } from "../../data/palette";

export interface SyntheticStars {
  count: number;
  /** x, y per star: far-frame offset from the Galactic center, kpc. */
  positions: Float32Array;
  /** r, g, b, alpha per star (0–255). */
  colors: Uint8Array;
  /** Dot diameter, CSS px. */
  sizes: Float32Array;
}

const TOTAL = 320_000;
const SEED = 0x5eed_0f_5a;
/** Share of the dots in each component. */
const SHARES = { bulge: 0.17, bar: 0.06, disc: 0.45, arms: 0.32 };
/** Spectral-class mix per component (illustrative). */
const MIX: Record<keyof typeof SHARES, Array<[string, number]>> = {
  bulge: [["G", 0.15], ["K", 0.55], ["M", 0.3]],
  bar: [["G", 0.2], ["K", 0.55], ["M", 0.25]],
  disc: [["A", 0.05], ["F", 0.15], ["G", 0.25], ["K", 0.35], ["M", 0.2]],
  arms: [["O", 0.03], ["B", 0.27], ["A", 0.25], ["F", 0.15], ["G", 0.12], ["K", 0.12], ["M", 0.06]],
};
/** Dot diameter range per component, CSS px. */
const SIZE: Record<keyof typeof SHARES, [number, number]> = {
  bulge: [0.9, 2],
  bar: [0.9, 1.9],
  disc: [0.8, 1.8],
  arms: [1, 2.6],
};
/** The disc is drawn out to this radius, and arms between these radii (kpc). */
const DISC_EDGE_KPC = 16;
const ARM_RADII_KPC: [number, number] = [3, 16];
/** How far (deg of azimuth) each arm's fit is continued beyond its measured span. */
const ARM_CONTINUATION_DEG = 100;

/** Reid et al. 2019: arm width (Gaussian 1σ, kpc) grows with Galactocentric radius. */
function armWidth(radiusKpc: number): number {
  return Math.max(0.1, 0.336 + 0.036 * (radiusKpc - 8.15));
}

/** Deterministic PRNG (mulberry32), so the Galaxy looks the same every time. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function sampleGalaxy(model: GalaxyModel): SyntheticStars {
  const rand = random(SEED);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  /** Two-sided exponential with scale s. */
  const laplace = (s: number) => (rand() < 0.5 ? -1 : 1) * -s * Math.log(1 - rand());

  const positions = new Float32Array(TOTAL * 2);
  const colors = new Uint8Array(TOTAL * 4);
  const sizes = new Float32Array(TOTAL);
  const rgb = Object.fromEntries(Object.entries(STAR_CLASS_COLORS).map(([key, hex]) => [
    key,
    [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)),
  ])) as Record<string, number[]>;

  // Galactic axes about the center: x toward the center as seen from the
  // Sun, y toward l = 90°. The bar's near end points toward the Sun, rotated
  // toward positive longitude.
  const barAngle = model.bar.angle * DEG;
  const along = [-Math.cos(barAngle), Math.sin(barAngle)];
  const across = [Math.sin(barAngle), Math.cos(barAngle)];
  const [bulgeAlong, bulgeAcross] = model.bulge.scaleLengths;
  const arms = continuedArms(model.arms);
  const armLengths = arms.map((arm) => arm.length);
  const totalArmLength = armLengths.reduce((sum, length) => sum + length, 0);

  let index = 0;
  const emit = (component: keyof typeof SHARES, x: number, y: number) => {
    const far = GALACTIC_TO_FAR;
    positions[index * 2] = far[0] * x + far[1] * y;
    positions[index * 2 + 1] = far[3] * x + far[4] * y;
    const mix = MIX[component];
    let pick = rand();
    let letter = mix[mix.length - 1][0];
    for (const [candidate, share] of mix) {
      if (pick < share) {
        letter = candidate;
        break;
      }
      pick -= share;
    }
    const [r, g, b] = rgb[letter];
    colors[index * 4] = r;
    colors[index * 4 + 1] = g;
    colors[index * 4 + 2] = b;
    // Most stars faint, a few bright.
    const brightness = rand();
    colors[index * 4 + 3] = Math.round(255 * (0.25 + 0.75 * brightness * brightness));
    const [small, large] = SIZE[component];
    sizes[index] = small + (large - small) * brightness * brightness;
    index++;
  };

  const counts = Object.fromEntries(Object.entries(SHARES).map(([key, share]) => [key, Math.round(share * TOTAL)])) as Record<keyof typeof SHARES, number>;
  counts.arms = TOTAL - counts.bulge - counts.bar - counts.disc;

  for (let n = 0; n < counts.bulge; n++) {
    const a = laplace(bulgeAlong);
    const c = laplace(bulgeAcross);
    emit("bulge", a * along[0] + c * across[0], a * along[1] + c * across[1]);
  }
  for (let n = 0; n < counts.bar; n++) {
    // Along the long bar, thinning toward its ends (triangular profile) and narrowing.
    const a = (rand() < 0.5 ? -1 : 1) * model.bar.halfLength * (1 - Math.sqrt(rand()));
    const c = laplace(bulgeAcross * (1 - 0.6 * Math.abs(a) / model.bar.halfLength));
    emit("bar", a * along[0] + c * across[0], a * along[1] + c * across[1]);
  }
  for (let n = 0; n < counts.disc; n++) {
    // Surface density ∝ exp(−R/h): R follows a gamma(2, h) distribution.
    const radius = -model.disc.scaleLength * Math.log((1 - rand()) * (1 - rand()));
    if (radius > DISC_EDGE_KPC) {
      n--;
      continue;
    }
    const angle = rand() * 2 * Math.PI;
    emit("disc", radius * Math.cos(angle), radius * Math.sin(angle));
  }
  for (let n = 0; n < counts.arms; n++) {
    // An arm in proportion to its length, then a point along it, spread
    // across the arm by its width.
    let pick = rand() * totalArmLength;
    let armIndex = 0;
    while (armIndex < arms.length - 1 && pick > armLengths[armIndex]) pick -= armLengths[armIndex++];
    const arm = arms[armIndex];
    const [x, y, nx, ny, radius] = arm.at(pick);
    const offset = gaussian() * armWidth(radius);
    const lengthwise = gaussian() * 0.15;
    emit("arms", x + nx * offset - ny * lengthwise, y + ny * offset + nx * lengthwise);
  }

  return { count: TOTAL, positions, colors, sizes };
}

interface ContinuedArm {
  length: number;
  /** Point at arc length s: x, y (kpc, Galactic axes about the center), unit normal, radius. */
  at(s: number): [number, number, number, number, number];
}

/** Each arm's fit, continued ARM_CONTINUATION_DEG beyond its measured span, within ARM_RADII_KPC. */
function continuedArms(arms: SpiralArm[]): ContinuedArm[] {
  return arms.map((arm) => {
    const points: Array<[number, number]> = [];
    for (let beta = arm.betaMin - ARM_CONTINUATION_DEG; beta <= arm.betaMax + ARM_CONTINUATION_DEG; beta += 0.5) {
      const [x, y] = armPoint(arm, beta);
      const radius = Math.hypot(x, y);
      if (radius >= ARM_RADII_KPC[0] && radius <= ARM_RADII_KPC[1]) points.push([x, y]);
    }
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
      // A gap (the arm left the radius range and came back) is not a segment.
      const step = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      lengths.push(lengths[i - 1] + (step < 1 ? step : 0));
    }
    const length = lengths[lengths.length - 1];
    return {
      length,
      at(s: number) {
        let i = 1;
        while (i < lengths.length - 1 && lengths[i] < s) i++;
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        const span = lengths[i] - lengths[i - 1] || 1;
        const t = Math.min(1, (s - lengths[i - 1]) / span);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const norm = Math.hypot(dx, dy) || 1;
        const x = x0 + dx * t;
        const y = y0 + dy * t;
        return [x, y, -dy / norm, dx / norm, Math.hypot(x, y)];
      },
    };
  });
}
