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

// Spacecraft-specific types
export type SpacecraftType = 'deep_space' | 'earth_orbiter' | 'planetary_orbiter' | 'lander';
export type SpacecraftStatus = 'active' | 'ended' | 'planned';
export type SpacecraftIconType = 'probe' | 'orbiter' | 'telescope' | 'rover';

// Moon category for filtering (based on size/significance)
// major: radius > 100km (scientifically significant moons)
// medium: radius > 10km (smaller named moons)
// named: has official IAU name but radius <= 10km
// minor: provisional designation only (tiny captured asteroids)
export type MoonCategory = 'major' | 'medium' | 'named' | 'minor';

// Minimum display sizes in pixels per body type
export const MIN_DISPLAY_SIZE: Record<BodyType, number> = {
  star: 20,
  planet: 4,
  dwarf: 3,
  moon: 3,
  asteroid: 2,
  comet: 2,
  probe: 8,
};

// Simple colors on black
export const BODY_COLORS: Record<BodyType, string> = {
  star: '#ffff00',
  planet: '#ffffff',
  dwarf: '#888888',
  moon: '#aaaaaa',
  asteroid: '#666666',
  comet: '#66ccff',
  probe: '#ff6666',
};

// Simple planet colors
export const PLANET_COLORS: Record<string, string> = {
  mercury: '#999999',
  venus: '#ffcc66',
  earth: '#3399ff',
  mars: '#ff4444',
  jupiter: '#ffaa66',
  saturn: '#ffdd88',
  uranus: '#66ffff',
  neptune: '#4466ff',
};

// Spacecraft colors by status
export const SPACECRAFT_STATUS_COLORS: Record<SpacecraftStatus, string> = {
  active: '#66ff66',   // Green for active missions
  ended: '#888888',    // Gray for ended missions
  planned: '#6666ff',  // Blue for planned/future
};

// Spacecraft colors by icon type
export const SPACECRAFT_ICON_COLORS: Record<SpacecraftIconType, string> = {
  probe: '#ffffff',      // White (deep space probes)
  orbiter: '#66ccff',    // Light blue (planetary orbiters)
  telescope: '#ff66ff',  // Magenta (space telescopes)
  rover: '#ffaa66',      // Orange (surface rovers/landers)
};
