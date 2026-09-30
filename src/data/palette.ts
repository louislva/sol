/** Presentation colors. Clean, flat colors on black. */

export const SUN_COLOR = "#ffff00";

export const PLANET_COLORS: Record<string, string> = {
  Mercury: "#999999",
  Venus: "#ffcc66",
  Earth: "#3399ff",
  Mars: "#ff4444",
  Jupiter: "#ffaa66",
  Saturn: "#ffdd88",
  Uranus: "#66ffff",
  Neptune: "#4466ff",
};

export const DWARF_COLORS: Record<string, string> = {
  Pluto: "#aa9988",
  Ceres: "#777777",
  Eris: "#dddddd",
  Makemake: "#cc9966",
  Haumea: "#eeeeee",
};
export const DEFAULT_DWARF_COLOR = "#888888";

export const MOON_COLORS: Record<string, string> = {
  Moon: "#cccccc",
  Phobos: "#aaaaaa",
  Deimos: "#999999",
  Io: "#ffee88",
  Europa: "#ddddff",
  Ganymede: "#bbaa99",
  Callisto: "#888877",
  Titan: "#ffaa66",
  Rhea: "#ccccbb",
  Iapetus: "#aaaaaa",
  Dione: "#dddddd",
  Tethys: "#eeeeee",
  Enceladus: "#ffffff",
  Mimas: "#cccccc",
  Hyperion: "#bbbbaa",
  Phoebe: "#666666",
  Titania: "#bbbbbb",
  Oberon: "#aaaaaa",
  Umbriel: "#888888",
  Ariel: "#dddddd",
  Miranda: "#cccccc",
  Triton: "#aaccff",
  Proteus: "#999999",
  Nereid: "#888888",
  Charon: "#999999",
};
export const DEFAULT_MOON_COLOR = "#aaaaaa";

export const COMET_COLOR = "#66ccff";
export const ASTEROID_COLOR = "#999999";
export const ASTEROID_POPULATION_COLOR = "#888888";

export const SPACECRAFT_STATUS_COLORS = {
  active: "#66ff66",
  ended: "#888888",
} as const;

export const SATELLITE_CATEGORY_COLORS = {
  LEO: "#ff6666",
  MEO: "#6666ff",
  GEO: "#66ff66",
  OTHER: "#ffff66",
} as const;

/**
 * Star colors by spectral class: the apparent colors of blackbodies at each
 * class's typical temperature (after Mitchell Charity, "What color are the
 * stars?"), with brown dwarfs (L, T, Y) a deepening red and white dwarfs (D)
 * blue-white.
 */
export const STAR_CLASS_COLORS: Record<string, string> = {
  O: "#9bb0ff",
  B: "#aabfff",
  A: "#cad7ff",
  F: "#f8f7ff",
  G: "#fff4ea",
  K: "#ffd2a1",
  M: "#ffb56c",
  L: "#ff8a4c",
  T: "#e0603c",
  Y: "#b8402c",
  D: "#dfe6ff",
};
export const DEFAULT_STAR_COLOR = "#dddddd";

/** Sagittarius A*: black, with a faint rim so it reads against empty space too. */
export const BLACK_HOLE_COLOR = "#000000";
export const BLACK_HOLE_RIM_COLOR = "#6b5a44";
