/**
 * The Galaxy, stars, and the one liberty this map takes with geometry.
 *
 * The solar system is drawn top-down in the ecliptic; the Galaxy top-down in
 * its own plane. The two planes are 60° apart. So beyond the solar system
 * the display turns into the Galactic plane: a position farther than
 * TWIST_START_KM from the Sun is rotated about the line where the two planes
 * cross (the smallest rotation that lays the ecliptic on the Galactic plane),
 * fully so beyond TWIST_END_KM. Distances from the Sun are preserved
 * everywhere, and relative positions among objects that are all beyond
 * TWIST_END_KM — stars, and spacecraft by the time they near one — are
 * exactly true. Inside TWIST_START_KM (the planets, the Kuiper belt, and the
 * spacecraft's recorded trajectories) nothing changes. The turn is spread
 * over a wide range of distance so that paths through it bend only gently;
 * the nearest star is still more than four times farther out.
 *
 * Galactic frame: IAU 1958 System II as realized in ICRS (Hipparcos
 * Catalogue, Vol. 1, §1.5.3): north Galactic pole at RA 192.85948°,
 * Dec +27.12825°; longitude 0 toward RA 266.40499°, Dec −28.93617°.
 */

import { AU_KM, DEG, J2000 } from "./constants";
import { EQUATORIAL_TO_ECLIPTIC, type Mat3, multiply, transform } from "./rotation";

export const LIGHT_YEAR_KM = 9_460_730_472_580.8;
export const PARSEC_KM = 30_856_775_814_913.673;
/** One AU per Julian year, in km/s: converts proper motion × distance to velocity. */
const KM_S_PER_AU_PER_YEAR = AU_KM / (365.25 * 86_400);

export const TWIST_START_KM = 1_000 * AU_KM;
export const TWIST_END_KM = 60_000 * AU_KM;

function unitVector(raDeg: number, decDeg: number): [number, number, number] {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

const NGP_ICRS = unitVector(192.85948, 27.12825);
const CENTER_ICRS = unitVector(266.40499, -28.93617);
const Y_ICRS: [number, number, number] = [
  NGP_ICRS[1] * CENTER_ICRS[2] - NGP_ICRS[2] * CENTER_ICRS[1],
  NGP_ICRS[2] * CENTER_ICRS[0] - NGP_ICRS[0] * CENTER_ICRS[2],
  NGP_ICRS[0] * CENTER_ICRS[1] - NGP_ICRS[1] * CENTER_ICRS[0],
];

/** Galactic (x toward the center, y toward l = 90°, z toward the NGP) → ICRS. */
const GALACTIC_TO_ICRS: Mat3 = [
  CENTER_ICRS[0], Y_ICRS[0], NGP_ICRS[0],
  CENTER_ICRS[1], Y_ICRS[1], NGP_ICRS[1],
  CENTER_ICRS[2], Y_ICRS[2], NGP_ICRS[2],
];

// The twist: rotation about the ecliptic–Galactic node that carries the
// north Galactic pole onto the north ecliptic pole.
const NGP_ECLIPTIC = transform(EQUATORIAL_TO_ECLIPTIC, ...NGP_ICRS);
const TWIST_ANGLE = Math.acos(NGP_ECLIPTIC[2]);
const nodeLength = Math.hypot(NGP_ECLIPTIC[0], NGP_ECLIPTIC[1]);
/** Unit axis NGP × ẑ, in the ecliptic plane. */
const AXIS_X = NGP_ECLIPTIC[1] / nodeLength;
const AXIS_Y = -NGP_ECLIPTIC[0] / nodeLength;

/** Rotation by `angle` about the twist axis (Rodrigues). */
function twistRotation(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const x = AXIS_X;
  const y = AXIS_Y;
  return [
    c + t * x * x, t * x * y, s * y,
    t * x * y, c + t * y * y, -s * x,
    -s * y, s * x, c,
  ];
}

/** Ecliptic → the far display frame, in which the Galactic plane is the plane of the screen. */
export const ECLIPTIC_TO_FAR: Mat3 = twistRotation(TWIST_ANGLE);
export const ICRS_TO_FAR: Mat3 = multiply(ECLIPTIC_TO_FAR, EQUATORIAL_TO_ECLIPTIC);
export const GALACTIC_TO_FAR: Mat3 = multiply(ICRS_TO_FAR, GALACTIC_TO_ICRS);

const LOG_TWIST_START = Math.log(TWIST_START_KM);
const LOG_TWIST_SPAN = Math.log(TWIST_END_KM) - LOG_TWIST_START;

/**
 * Heliocentric ecliptic position → display position, in place: unchanged
 * within TWIST_START_KM, rotated into the Galactic plane beyond TWIST_END_KM,
 * and turned smoothly (in log distance) between.
 */
export function twist(position: Float64Array | number[]): void {
  const x = position[0];
  const y = position[1];
  const z = position[2];
  const r2 = x * x + y * y + z * z;
  if (r2 <= TWIST_START_KM * TWIST_START_KM) return;
  const m = r2 >= TWIST_END_KM * TWIST_END_KM
    ? ECLIPTIC_TO_FAR
    : twistRotation(TWIST_ANGLE * smoothstep((0.5 * Math.log(r2) - LOG_TWIST_START) / LOG_TWIST_SPAN));
  position[0] = m[0] * x + m[1] * y + m[2] * z;
  position[1] = m[3] * x + m[4] * y + m[5] * z;
  position[2] = m[6] * x + m[7] * y + m[8] * z;
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * A star's heliocentric position (km) at J2000 and velocity (km/day), in the
 * far display frame, from its astrometry: ICRS position at epoch J2000
 * (degrees), parallax (mas), proper motion (mas/yr, μα* including cos δ) and
 * radial velocity (km/s; unknown counts as zero).
 */
export function starState(
  raDeg: number,
  decDeg: number,
  parallaxMas: number,
  pmRaMasYr: number,
  pmDecMasYr: number,
  radialKmS: number,
  position: Float64Array | number[],
  velocity: Float64Array | number[]
): void {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const [ux, uy, uz] = unitVector(raDeg, decDeg);
  const distanceKm = PARSEC_KM * (1000 / parallaxMas);
  const distancePc = 1000 / parallaxMas;
  // Tangential velocity: km/s per (arcsec/yr × pc) is one AU per year.
  const vRa = (pmRaMasYr / 1000) * distancePc * KM_S_PER_AU_PER_YEAR;
  const vDec = (pmDecMasYr / 1000) * distancePc * KM_S_PER_AU_PER_YEAR;
  const sinRa = Math.sin(ra);
  const cosRa = Math.cos(ra);
  const sinDec = Math.sin(dec);
  const vx = radialKmS * ux - vRa * sinRa - vDec * sinDec * cosRa;
  const vy = radialKmS * uy + vRa * cosRa - vDec * sinDec * sinRa;
  const vz = radialKmS * uz + vDec * Math.cos(dec);
  const p = transform(ICRS_TO_FAR, ux * distanceKm, uy * distanceKm, uz * distanceKm);
  const v = transform(ICRS_TO_FAR, vx * 86_400, vy * 86_400, vz * 86_400);
  position[0] = p[0];
  position[1] = p[1];
  position[2] = p[2];
  velocity[0] = v[0];
  velocity[1] = v[1];
  velocity[2] = v[2];
}

export interface GalaxyModel {
  /** Sun–Galactic center distance, kpc. */
  r0: number;
  /** Sun's height above the Galactic plane, kpc. */
  zSun: number;
  /** Circular rotation speed at the Sun, km/s. */
  theta0: number;
  /** Sun's peculiar motion (toward the center, with rotation, toward the NGP), km/s. */
  solarMotion: { u: number; v: number; w: number };
  /** Thin disc: exponential scale length and height, kpc. */
  disc: { scaleLength: number; scaleHeight: number };
  /** Long bar: half-length (kpc) and angle to the Sun–center line (deg, near end at positive longitude). */
  bar: { halfLength: number; angle: number };
  /** Boxy/peanut bulge: exponential scale lengths along the bar, across it, and vertically (kpc). */
  bulge: { scaleLengths: number[] };
  /** Mass of the central black hole, solar masses. */
  sagittariusAStarMass: number;
  arms: SpiralArm[];
}

export interface SpiralArm {
  name: string;
  /** Galactocentric azimuths (deg) the arm was measured over. */
  betaMin: number;
  betaMax: number;
  betaKink: number;
  /** kpc */
  rKink: number;
  /** Pitch angles (deg) inside and beyond the kink. */
  pitchInner: number;
  pitchOuter: number;
  /** Gaussian 1σ width, kpc. */
  width: number;
}

/**
 * The Galactic center's position relative to the Sun at time t (km, far
 * display frame). The Sun circles the center at Θ0 plus its peculiar
 * motion; over the ±250,000 years the clock spans, that orbit (one turn
 * per ~210 million years) is straight to within a fraction of a parsec.
 */
export function galacticCenterAt(model: GalaxyModel, t: number, out: Float64Array | number[]): void {
  const years = (t - J2000) / 365.25;
  const kmPerYear = 365.25 * 86_400;
  const { u, v, w } = model.solarMotion;
  const x = model.r0 * 1000 * PARSEC_KM - u * kmPerYear * years;
  const y = -(model.theta0 + v) * kmPerYear * years;
  const z = -model.zSun * 1000 * PARSEC_KM - w * kmPerYear * years;
  const p = transform(GALACTIC_TO_FAR, x, y, z);
  out[0] = p[0];
  out[1] = p[1];
  out[2] = p[2];
}

/**
 * A point on a spiral arm, relative to the Galactic center (kpc, Galactic
 * axes: x toward the center as seen from the Sun, y toward l = 90°).
 * Azimuth β is measured at the center from the direction of the Sun,
 * increasing with Galactic rotation (toward +y at the Sun).
 */
export function armPoint(arm: SpiralArm, betaDeg: number): [number, number] {
  const pitch = (betaDeg <= arm.betaKink ? arm.pitchInner : arm.pitchOuter) * DEG;
  const radius = arm.rKink * Math.exp(-(betaDeg - arm.betaKink) * DEG * Math.tan(pitch));
  const beta = betaDeg * DEG;
  return [-radius * Math.cos(beta), radius * Math.sin(beta)];
}
