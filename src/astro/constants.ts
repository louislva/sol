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

/** Mean Gregorian year in days: years far from now are counted in these. */
const GREGORIAN_YEAR_DAYS = 365.2425;
/** JavaScript dates reach ±8.64e15 ms from 1970, about ±273,000 years; stay well inside. */
const CALENDAR_LIMIT_YEARS = 200_000;

/** Astronomical year number (… −1, 0, 1 …) with fraction; exact enough for deep time. */
export function julianYear(jd: number): number {
  return 2000 + (jd - J2000) / GREGORIAN_YEAR_DAYS;
}

/** Julian date (TDB) at the start of an astronomical year, for years beyond the calendar. */
export function yearToJulian(year: number): number {
  return J2000 + (year - 2000) * GREGORIAN_YEAR_DAYS;
}

/** Whether a Julian date is within the range calendar dates (JavaScript Dates) cover. */
export function withinCalendar(jd: number): boolean {
  return Math.abs(julianYear(jd) - 2000) < CALENDAR_LIMIT_YEARS;
}

/** "44,250 AD", "1,290,000 AD", "501 BC" (year 0 is 1 BC). */
export function formatYear(jd: number): string {
  const year = Math.floor(withinCalendar(jd) ? julianToDate(jd).getUTCFullYear() : julianYear(jd));
  return year > 0 ? `${year.toLocaleString("en-US")} AD` : `${(1 - year).toLocaleString("en-US")} BC`;
}
