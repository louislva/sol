/**
 * IAU body orientation (WGCCRE 2015, as distributed in NAIF pck00011):
 * pole right ascension and declination, and the prime meridian angle W,
 * each a polynomial plus a nutation/precession series.
 *
 * Self-contained (no imports) so the data scripts can use exactly the same
 * model as the app.
 */

export interface OrientationModel {
  /** Pole RA (deg), polynomial in Julian centuries from J2000. */
  poleRa: number[];
  /** Pole Dec (deg), polynomial in Julian centuries from J2000. */
  poleDec: number[];
  /** Prime meridian W (deg), polynomial in days from J2000. */
  primeMeridian: number[];
  nutPrecRa?: number[];
  nutPrecDec?: number[];
  nutPrecPm?: number[];
  /** Nutation/precession angles θi (deg), each a polynomial in centuries. */
  angles?: number[][];
}

const J2000 = 2_451_545.0;
const DEG = Math.PI / 180;
const OBLIQUITY = (84_381.406 / 3600) * DEG;

function polynomial(coefficients: readonly number[], x: number): number {
  let value = 0;
  for (let power = coefficients.length - 1; power >= 0; power--) value = value * x + coefficients[power];
  return value;
}

/** Pole RA/Dec and prime meridian W in degrees at Julian date (TDB) `jd`. */
export function orientationAt(model: OrientationModel, jd: number): { ra: number; dec: number; w: number } {
  const days = jd - J2000;
  const centuries = days / 36_525;
  let ra = polynomial(model.poleRa, centuries);
  let dec = polynomial(model.poleDec, centuries);
  let w = polynomial(model.primeMeridian, days);
  const angles = model.angles;
  if (angles) {
    for (let index = 0; index < angles.length; index++) {
      const a = model.nutPrecRa?.[index] ?? 0;
      const d = model.nutPrecDec?.[index] ?? 0;
      const p = model.nutPrecPm?.[index] ?? 0;
      if (a === 0 && d === 0 && p === 0) continue;
      const theta = polynomial(angles[index], centuries) * DEG;
      const sin = Math.sin(theta);
      ra += a * sin;
      dec += d * Math.cos(theta);
      w += p * sin;
    }
  }
  return { ra, dec, w };
}

/**
 * Rotation (row-major 3×3) from the body-fixed frame (x through the prime
 * meridian on the equator, z through the north pole) to the J2000 ecliptic.
 */
export function bodyFixedToEcliptic(model: OrientationModel, jd: number): number[] {
  const { ra, dec, w } = orientationAt(model, jd);
  const a = ra * DEG;
  const d = dec * DEG;
  const W = w * DEG;
  // Body axes in ICRF: z the pole, n the equator's node on the ICRF equator.
  const z = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const n = [-Math.sin(a), Math.cos(a), 0];
  const m = [z[1] * n[2] - z[2] * n[1], z[2] * n[0] - z[0] * n[2], z[0] * n[1] - z[1] * n[0]];
  const cosW = Math.cos(W);
  const sinW = Math.sin(W);
  const x = [0, 1, 2].map((axis) => cosW * n[axis] + sinW * m[axis]);
  const y = [0, 1, 2].map((axis) => -sinW * n[axis] + cosW * m[axis]);
  // Columns are the body axes; then rotate ICRF → ecliptic about x by −ε.
  const cosE = Math.cos(OBLIQUITY);
  const sinE = Math.sin(OBLIQUITY);
  const toEcliptic = (v: number[]) => [v[0], cosE * v[1] + sinE * v[2], -sinE * v[1] + cosE * v[2]];
  const [xe, ye, ze] = [toEcliptic(x), toEcliptic(y), toEcliptic(z)];
  return [xe[0], ye[0], ze[0], xe[1], ye[1], ze[1], xe[2], ye[2], ze[2]];
}

/** Unit vector of the north pole in the J2000 ecliptic. */
export function poleInEcliptic(model: OrientationModel, jd: number): [number, number, number] {
  const { ra, dec } = orientationAt(model, jd);
  const a = ra * DEG;
  const d = dec * DEG;
  const x = Math.cos(d) * Math.cos(a);
  const y = Math.cos(d) * Math.sin(a);
  const z = Math.sin(d);
  return [x, Math.cos(OBLIQUITY) * y + Math.sin(OBLIQUITY) * z, -Math.sin(OBLIQUITY) * y + Math.cos(OBLIQUITY) * z];
}
