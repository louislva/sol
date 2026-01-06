// Astronomical constants
export const AU_KM = 149597870.7; // 1 AU in kilometers
export const SUN_RADIUS_KM = 696340; // Sun's radius in km

// Julian date reference: J2000.0 epoch (January 1, 2000, 12:00 TT)
export const J2000 = 2451545.0;

// Convert a JavaScript Date to Julian Date
export function dateToJulian(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

// Convert Julian Date to JavaScript Date
export function julianToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

// Degrees to radians
export function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Radians to degrees
export function rad2deg(rad: number): number {
  return rad * (180 / Math.PI);
}

// Body type for rendering
export type BodyType = 'star' | 'planet' | 'dwarf' | 'moon' | 'asteroid' | 'comet' | 'probe';

// Minimum display sizes in pixels per body type
export const MIN_DISPLAY_SIZE: Record<BodyType, number> = {
  star: 20,
  planet: 4,
  dwarf: 3,
  moon: 3,
  asteroid: 2,
  comet: 2,
  probe: 2,
};

// Colors for the parchment aesthetic
export const BODY_COLORS: Record<BodyType, string> = {
  star: '#d4a574',
  planet: '#6b5b4f',
  dwarf: '#7a6a5e',
  moon: '#8b7b6f',
  asteroid: '#5a5048',
  comet: '#4a6b7c',
  probe: '#8b4513',
};

// Specific planet colors (muted earth tones)
export const PLANET_COLORS: Record<string, string> = {
  mercury: '#9a8b7a',
  venus: '#c9b896',
  earth: '#6b8e7a',
  mars: '#a67b5b',
  jupiter: '#b8a082',
  saturn: '#c9b896',
  uranus: '#7a9b9a',
  neptune: '#5a7b8a',
};
