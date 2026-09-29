/** Astronomical constants and unit conversions. Distances are km, times are days. */

export const AU_KM = 149_597_870.7;
export const LIGHT_SECOND_KM = 299_792.458;

/** J2000.0 epoch, Julian date (TDB). */
export const J2000 = 2_451_545.0;
export const DAYS_PER_CENTURY = 36_525;
export const SECONDS_PER_DAY = 86_400;

export const DEG = Math.PI / 180;
export const TWO_PI = Math.PI * 2;

/** Obliquity of the ecliptic at J2000 (IAU 2006: 84381.406″). */
export const OBLIQUITY_J2000 = (84_381.406 / 3600) * DEG;

/** Heliocentric gravitational parameter (km³/s², DE440). */
export const GM_SUN = 132_712_440_041.279_42;

/** Earth's J2 zonal harmonic and equatorial radius (WGS-72, as used by SGP4). */
export const EARTH_J2 = 1.082_616e-3;
export const EARTH_EQUATORIAL_RADIUS_KM = 6_378.135;

/**
 * TT − UTC in seconds: 32.184 s + 37 leap seconds (constant since 2017).
 * Ephemerides use TDB (≈ TT); clocks and TLE epochs use UTC.
 */
const TT_MINUS_UTC_SECONDS = 69.184;
const UNIX_EPOCH_JD = 2_440_587.5;

/** Julian date (TDB) for a UTC instant. */
export function dateToJulian(date: Date): number {
  return date.getTime() / 86_400_000 + UNIX_EPOCH_JD + TT_MINUS_UTC_SECONDS / SECONDS_PER_DAY;
}

/** UTC instant for a Julian date (TDB). */
export function julianToDate(jd: number): Date {
  return new Date((jd - UNIX_EPOCH_JD - TT_MINUS_UTC_SECONDS / SECONDS_PER_DAY) * 86_400_000);
}

/** Convert a UTC-based Julian date (e.g. a TLE epoch) to TDB. */
export function utcJulianToTdb(jdUtc: number): number {
  return jdUtc + TT_MINUS_UTC_SECONDS / SECONDS_PER_DAY;
}

/** Wrap an angle to [0, 2π). */
export function wrapAngle(radians: number): number {
  const wrapped = radians % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}
