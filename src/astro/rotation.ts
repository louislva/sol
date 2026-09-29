/**
 * 3×3 rotation matrices (row-major) between the reference frames the data
 * comes in and the frame the app works in.
 *
 * World frame: heliocentric J2000 ecliptic, x toward the vernal equinox,
 * z toward the north ecliptic pole. The app is a top-down view, so screen
 * coordinates are the world x/y.
 */

import { DEG, OBLIQUITY_J2000 } from "./constants";

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function rotationX(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function rotationZ(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      out[row * 3 + column] = a[row * 3] * b[column]
        + a[row * 3 + 1] * b[3 + column]
        + a[row * 3 + 2] * b[6 + column];
    }
  }
  return out as unknown as Mat3;
}

export function transform(m: Mat3, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

/** ICRF (Earth mean equator of J2000) → J2000 ecliptic. */
export const EQUATORIAL_TO_ECLIPTIC: Mat3 = rotationX(-OBLIQUITY_J2000);

/**
 * Frame whose z axis is the pole (RA, Dec) given in ICRF and whose x axis
 * points to that plane's ascending node on the ICRF equator, expressed in
 * the J2000 ecliptic. This is the convention JPL uses for Laplace-plane and
 * planet-equator satellite elements, and the IAU uses for body poles.
 */
export function poleFrameToEcliptic(poleRaDeg: number, poleDecDeg: number): Mat3 {
  const toIcrf = multiply(rotationZ((poleRaDeg + 90) * DEG), rotationX((90 - poleDecDeg) * DEG));
  return multiply(EQUATORIAL_TO_ECLIPTIC, toIcrf);
}

/** Unit vector of the pole (RA, Dec in ICRF, degrees) in the J2000 ecliptic. */
export function poleToEcliptic(poleRaDeg: number, poleDecDeg: number): [number, number, number] {
  const ra = poleRaDeg * DEG;
  const dec = poleDecDeg * DEG;
  return transform(EQUATORIAL_TO_ECLIPTIC, Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
}
