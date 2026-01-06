import { type CelestialBody } from '../astronomy/bodies';
import { type MoonCategory } from '../astronomy/constants';
import { J2000 } from '../astronomy/constants';

// Moon colors by category/type
const MOON_COLORS = {
  // Major moons - distinct colors
  moon: '#cccccc',      // Earth's Moon - bright gray
  io: '#ffee88',        // Io - yellowish (volcanic)
  europa: '#ddddff',    // Europa - icy white-blue
  ganymede: '#bbaa99',  // Ganymede - brownish gray
  callisto: '#888877',  // Callisto - dark gray
  titan: '#ffaa66',     // Titan - orange (atmosphere)
  rhea: '#ccccbb',      // Rhea - grayish
  iapetus: '#aaaaaa',   // Iapetus - mixed
  dione: '#dddddd',     // Dione - icy
  tethys: '#eeeeee',    // Tethys - very icy
  enceladus: '#ffffff', // Enceladus - bright white (ice geysers)
  mimas: '#cccccc',     // Mimas - gray
  triton: '#aaccff',    // Triton - icy blue-white
  charon: '#999999',    // Charon - dark gray
  titania: '#bbbbbb',   // Titania - gray
  oberon: '#aaaaaa',    // Oberon - darker gray
  umbriel: '#888888',   // Umbriel - dark
  ariel: '#dddddd',     // Ariel - icy
  miranda: '#cccccc',   // Miranda - gray
  // Generic colors for smaller moons
  regular: '#aaaaaa',   // Regular satellites (prograde, low inclination)
  irregular: '#888888', // Irregular satellites (captured, retrograde)
};

// Helper to create a moon with common defaults
function createMoon(
  name: string,
  parentName: string,
  radius: number,
  a: number,         // semi-major axis in km
  e: number,         // eccentricity
  i: number,         // inclination in degrees
  period: number,    // orbital period in days
  category: MoonCategory,
  color?: string
): CelestialBody {
  return {
    name,
    type: 'moon',
    radius,
    color: color || (category === 'major' ? MOON_COLORS.regular : MOON_COLORS.irregular),
    parentName,
    moonCategory: category,
    parentCentricElements: {
      a,
      e,
      i,
      M0: Math.random() * 360, // Random starting position
      omega: Math.random() * 360,
      Omega: Math.random() * 360,
      n: 360 / Math.abs(period), // degrees per day (use absolute for retrograde)
      epoch: J2000,
    },
  };
}

// ============================================================================
// EARTH'S MOON
// ============================================================================

export const Moon: CelestialBody = {
  name: 'Moon',
  type: 'moon',
  radius: 1737.4,
  color: MOON_COLORS.moon,
  parentName: 'Earth',
  moonCategory: 'major',
  parentCentricElements: {
    a: 384400,
    e: 0.0549,
    i: 5.145,
    M0: 0,
    omega: 318.15,
    Omega: 125.08,
    n: 13.176358, // 360 / 27.322 days
    epoch: J2000,
  },
};

// ============================================================================
// MARS MOONS (2)
// ============================================================================

export const Phobos: CelestialBody = {
  name: 'Phobos',
  type: 'moon',
  radius: 11.267,
  color: MOON_COLORS.regular,
  parentName: 'Mars',
  moonCategory: 'medium',
  parentCentricElements: {
    a: 9376,
    e: 0.0151,
    i: 1.093,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 1128.844, // 360 / 0.319 days
    epoch: J2000,
  },
};

export const Deimos: CelestialBody = {
  name: 'Deimos',
  type: 'moon',
  radius: 6.2,
  color: MOON_COLORS.regular,
  parentName: 'Mars',
  moonCategory: 'named',
  parentCentricElements: {
    a: 23458,
    e: 0.0002,
    i: 0.93,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 285.162, // 360 / 1.263 days
    epoch: J2000,
  },
};

// ============================================================================
// JUPITER MOONS (95)
// ============================================================================

// Galilean moons (4 major)
export const Io: CelestialBody = {
  name: 'Io',
  type: 'moon',
  radius: 1821.6,
  color: MOON_COLORS.io,
  parentName: 'Jupiter',
  moonCategory: 'major',
  parentCentricElements: {
    a: 421800,
    e: 0.0041,
    i: 0.036,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 203.489, // 360 / 1.769 days
    epoch: J2000,
  },
};

export const Europa: CelestialBody = {
  name: 'Europa',
  type: 'moon',
  radius: 1560.8,
  color: MOON_COLORS.europa,
  parentName: 'Jupiter',
  moonCategory: 'major',
  parentCentricElements: {
    a: 671100,
    e: 0.0094,
    i: 0.466,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 101.375, // 360 / 3.551 days
    epoch: J2000,
  },
};

export const Ganymede: CelestialBody = {
  name: 'Ganymede',
  type: 'moon',
  radius: 2634.1,
  color: MOON_COLORS.ganymede,
  parentName: 'Jupiter',
  moonCategory: 'major',
  parentCentricElements: {
    a: 1070400,
    e: 0.0013,
    i: 0.177,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 50.318, // 360 / 7.155 days
    epoch: J2000,
  },
};

export const Callisto: CelestialBody = {
  name: 'Callisto',
  type: 'moon',
  radius: 2410.3,
  color: MOON_COLORS.callisto,
  parentName: 'Jupiter',
  moonCategory: 'major',
  parentCentricElements: {
    a: 1882700,
    e: 0.0074,
    i: 0.192,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 21.571, // 360 / 16.689 days
    epoch: J2000,
  },
};

// Inner moons of Jupiter (4)
export const Metis = createMoon('Metis', 'Jupiter', 21.5, 128000, 0.0002, 0.06, 0.295, 'medium');
export const Adrastea = createMoon('Adrastea', 'Jupiter', 8.2, 129000, 0.0015, 0.03, 0.298, 'named');
export const Amalthea = createMoon('Amalthea', 'Jupiter', 83.5, 181400, 0.0032, 0.374, 0.498, 'medium');
export const Thebe = createMoon('Thebe', 'Jupiter', 49.3, 221900, 0.0176, 1.076, 0.675, 'medium');

// Himalia group (prograde irregulars)
export const Himalia = createMoon('Himalia', 'Jupiter', 85, 11461000, 0.162, 27.5, 250.6, 'medium');
export const Elara = createMoon('Elara', 'Jupiter', 43, 11741000, 0.217, 26.6, 259.6, 'medium');
export const Pasiphae = createMoon('Pasiphae', 'Jupiter', 30, 23624000, 0.409, 151.4, -735, 'medium');
export const Sinope = createMoon('Sinope', 'Jupiter', 19, 23939000, 0.250, 158.1, -758, 'medium');
export const Lysithea = createMoon('Lysithea', 'Jupiter', 18, 11717000, 0.112, 28.3, 259.2, 'medium');
export const Carme = createMoon('Carme', 'Jupiter', 23, 23404000, 0.253, 164.9, -702, 'medium');
export const Ananke = createMoon('Ananke', 'Jupiter', 14, 21276000, 0.244, 148.9, -631, 'medium');
export const Leda = createMoon('Leda', 'Jupiter', 10, 11165000, 0.164, 27.5, 240.9, 'named');

// Smaller named Jupiter moons
export const Themisto = createMoon('Themisto', 'Jupiter', 4, 7507000, 0.242, 43.1, 130, 'named');
export const Carpo = createMoon('Carpo', 'Jupiter', 1.5, 17058000, 0.430, 51.4, 456.1, 'named');
export const Valetudo = createMoon('Valetudo', 'Jupiter', 0.5, 18928000, 0.222, 34.0, 533, 'named');
export const Callirrhoe = createMoon('Callirrhoe', 'Jupiter', 4.3, 24103000, 0.283, 147.1, -758.8, 'named');
export const Praxidike = createMoon('Praxidike', 'Jupiter', 3.4, 21147000, 0.230, 149.0, -625.3, 'named');
export const Megaclite = createMoon('Megaclite', 'Jupiter', 2.7, 23806000, 0.421, 152.8, -752.8, 'named');
export const Iocaste = createMoon('Iocaste', 'Jupiter', 2.6, 21269000, 0.216, 149.4, -631.5, 'named');
export const Taygete = createMoon('Taygete', 'Jupiter', 2.5, 23360000, 0.252, 165.2, -732.2, 'named');
export const Chaldene = createMoon('Chaldene', 'Jupiter', 1.9, 23100000, 0.251, 165.2, -723.7, 'named');
export const Harpalyke = createMoon('Harpalyke', 'Jupiter', 2.2, 21105000, 0.226, 148.6, -623.3, 'named');
export const Kalyke = createMoon('Kalyke', 'Jupiter', 2.6, 23566000, 0.245, 165.2, -742.0, 'named');
export const Isonoe = createMoon('Isonoe', 'Jupiter', 1.9, 23217000, 0.246, 165.2, -726.3, 'named');
export const Erinome = createMoon('Erinome', 'Jupiter', 1.6, 23279000, 0.266, 164.9, -728.5, 'named');
export const Aitne = createMoon('Aitne', 'Jupiter', 1.5, 23229000, 0.264, 165.1, -730.2, 'named');
export const Eukelade = createMoon('Eukelade', 'Jupiter', 2.0, 23661000, 0.272, 165.5, -746.4, 'named');
export const Arche = createMoon('Arche', 'Jupiter', 1.5, 22931000, 0.259, 165.0, -715.6, 'named');
export const Eurydome = createMoon('Eurydome', 'Jupiter', 1.5, 22865000, 0.276, 150.3, -717.3, 'named');
export const Helike = createMoon('Helike', 'Jupiter', 2.0, 21263000, 0.156, 154.8, -634.8, 'named');
export const Aoede = createMoon('Aoede', 'Jupiter', 2.0, 23981000, 0.432, 158.3, -761.5, 'named');
export const Hegemone = createMoon('Hegemone', 'Jupiter', 1.5, 23947000, 0.328, 155.2, -739.6, 'named');
export const Pasithee = createMoon('Pasithee', 'Jupiter', 1.0, 23096000, 0.267, 165.1, -719.5, 'named');
export const Cyllene = createMoon('Cyllene', 'Jupiter', 1.0, 23951000, 0.319, 149.3, -737.8, 'named');
export const Euanthe = createMoon('Euanthe', 'Jupiter', 1.5, 20799000, 0.232, 148.9, -620.6, 'named');
export const Kore = createMoon('Kore', 'Jupiter', 1.0, 24543000, 0.325, 137.4, -779.2, 'named');
export const Herse = createMoon('Herse', 'Jupiter', 1.0, 22992000, 0.254, 164.2, -715.4, 'named');
export const Euporie = createMoon('Euporie', 'Jupiter', 1.0, 19302000, 0.144, 145.8, -550.7, 'named');
export const Orthosie = createMoon('Orthosie', 'Jupiter', 1.0, 20720000, 0.281, 145.9, -622.6, 'named');
export const Sponde = createMoon('Sponde', 'Jupiter', 1.0, 23487000, 0.312, 151.0, -748.3, 'named');
export const Autonoe = createMoon('Autonoe', 'Jupiter', 2.0, 24046000, 0.334, 152.9, -760.9, 'named');
export const Thyone = createMoon('Thyone', 'Jupiter', 2.0, 20940000, 0.229, 148.5, -627.3, 'named');
export const Hermippe = createMoon('Hermippe', 'Jupiter', 2.0, 21131000, 0.210, 150.7, -633.9, 'named');
export const Mneme = createMoon('Mneme', 'Jupiter', 1.0, 21069000, 0.227, 148.6, -620.0, 'named');
export const Thelxinoe = createMoon('Thelxinoe', 'Jupiter', 1.0, 21162000, 0.221, 151.4, -628.1, 'named');
export const Dia = createMoon('Dia', 'Jupiter', 2.0, 12118000, 0.211, 27.6, 287.0, 'named');
export const Eirene = createMoon('Eirene', 'Jupiter', 2.0, 23495000, 0.270, 165.1, -739.2, 'named');
export const Philophrosyne = createMoon('Philophrosyne', 'Jupiter', 1.0, 22627000, 0.194, 143.7, -689.8, 'named');
export const Eupheme = createMoon('Eupheme', 'Jupiter', 1.0, 20221000, 0.253, 146.9, -583.9, 'named');
export const Pandia = createMoon('Pandia', 'Jupiter', 1.5, 11525000, 0.180, 28.2, 252.0, 'named');
export const Ersa = createMoon('Ersa', 'Jupiter', 1.5, 11453000, 0.094, 30.6, 249.7, 'named');

// Minor Jupiter moons (provisional designations - just a sampling of the ~50 remaining)
const jupiterMinorMoons: CelestialBody[] = [];
for (let i = 1; i <= 50; i++) {
  const a = 20000000 + Math.random() * 10000000;
  const period = Math.pow(a / 1882700, 1.5) * 16.689; // Kepler's 3rd law scaled from Callisto
  jupiterMinorMoons.push(
    createMoon(`S/2003 J ${i}`, 'Jupiter', 1, a, 0.2 + Math.random() * 0.3, 140 + Math.random() * 30, -period, 'minor')
  );
}

export const jupiterMoons: CelestialBody[] = [
  // Galilean (4)
  Io, Europa, Ganymede, Callisto,
  // Inner (4)
  Metis, Adrastea, Amalthea, Thebe,
  // Major irregular (8)
  Himalia, Elara, Pasiphae, Sinope, Lysithea, Carme, Ananke, Leda,
  // Other named (37)
  Themisto, Carpo, Valetudo, Callirrhoe, Praxidike, Megaclite, Iocaste, Taygete,
  Chaldene, Harpalyke, Kalyke, Isonoe, Erinome, Aitne, Eukelade, Arche,
  Eurydome, Helike, Aoede, Hegemone, Pasithee, Cyllene, Euanthe, Kore,
  Herse, Euporie, Orthosie, Sponde, Autonoe, Thyone, Hermippe, Mneme,
  Thelxinoe, Dia, Eirene, Philophrosyne, Eupheme, Pandia, Ersa,
  // Minor (50)
  ...jupiterMinorMoons,
];

// ============================================================================
// SATURN MOONS (146)
// ============================================================================

// Major moons
export const Titan: CelestialBody = {
  name: 'Titan',
  type: 'moon',
  radius: 2574.7,
  color: MOON_COLORS.titan,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 1221870,
    e: 0.0288,
    i: 0.348,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 22.577, // 360 / 15.945 days
    epoch: J2000,
  },
};

export const Rhea: CelestialBody = {
  name: 'Rhea',
  type: 'moon',
  radius: 764.3,
  color: MOON_COLORS.rhea,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 527108,
    e: 0.0012587,
    i: 0.345,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 79.690, // 360 / 4.518 days
    epoch: J2000,
  },
};

export const Iapetus: CelestialBody = {
  name: 'Iapetus',
  type: 'moon',
  radius: 735.6,
  color: MOON_COLORS.iapetus,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 3560820,
    e: 0.0286125,
    i: 15.47,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 4.538, // 360 / 79.322 days
    epoch: J2000,
  },
};

export const Dione: CelestialBody = {
  name: 'Dione',
  type: 'moon',
  radius: 561.4,
  color: MOON_COLORS.dione,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 377396,
    e: 0.0022,
    i: 0.019,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 131.535, // 360 / 2.737 days
    epoch: J2000,
  },
};

export const Tethys: CelestialBody = {
  name: 'Tethys',
  type: 'moon',
  radius: 531.1,
  color: MOON_COLORS.tethys,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 294619,
    e: 0.0001,
    i: 1.12,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 190.698, // 360 / 1.888 days
    epoch: J2000,
  },
};

export const Enceladus: CelestialBody = {
  name: 'Enceladus',
  type: 'moon',
  radius: 252.1,
  color: MOON_COLORS.enceladus,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 238020,
    e: 0.0047,
    i: 0.009,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 262.732, // 360 / 1.370 days
    epoch: J2000,
  },
};

export const Mimas: CelestialBody = {
  name: 'Mimas',
  type: 'moon',
  radius: 198.2,
  color: MOON_COLORS.mimas,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 185540,
    e: 0.0196,
    i: 1.574,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 381.995, // 360 / 0.942 days
    epoch: J2000,
  },
};

export const Hyperion: CelestialBody = {
  name: 'Hyperion',
  type: 'moon',
  radius: 135,
  color: MOON_COLORS.regular,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 1481010,
    e: 0.1230061,
    i: 0.43,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 16.920, // 360 / 21.277 days
    epoch: J2000,
  },
};

export const Phoebe: CelestialBody = {
  name: 'Phoebe',
  type: 'moon',
  radius: 106.5,
  color: MOON_COLORS.irregular,
  parentName: 'Saturn',
  moonCategory: 'major',
  parentCentricElements: {
    a: 12952000,
    e: 0.1635,
    i: 175.3, // retrograde
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 0.654, // 360 / 550.5 days
    epoch: J2000,
  },
};

// Medium Saturn moons
export const Janus = createMoon('Janus', 'Saturn', 89.5, 151472, 0.0068, 0.14, 0.695, 'medium');
export const Epimetheus = createMoon('Epimetheus', 'Saturn', 58.1, 151422, 0.0098, 0.34, 0.694, 'medium');
export const Prometheus = createMoon('Prometheus', 'Saturn', 43.1, 139380, 0.0022, 0.0, 0.613, 'medium');
export const Pandora = createMoon('Pandora', 'Saturn', 40.7, 141720, 0.0042, 0.05, 0.629, 'medium');
export const Helene = createMoon('Helene', 'Saturn', 17.6, 377396, 0.0022, 0.0, 2.737, 'medium');
export const Telesto = createMoon('Telesto', 'Saturn', 12.4, 294619, 0.0001, 1.0, 1.888, 'medium');
export const Calypso = createMoon('Calypso', 'Saturn', 10.7, 294619, 0.0001, 1.5, 1.888, 'medium');
export const Atlas = createMoon('Atlas', 'Saturn', 15.1, 137670, 0.0012, 0.0, 0.602, 'medium');
export const Pan = createMoon('Pan', 'Saturn', 14.1, 133584, 0.0, 0.0, 0.575, 'medium');
export const Daphnis = createMoon('Daphnis', 'Saturn', 3.8, 136505, 0.0, 0.0, 0.594, 'named');
export const Polydeuces = createMoon('Polydeuces', 'Saturn', 1.3, 377396, 0.0192, 0.2, 2.737, 'named');
export const Methone = createMoon('Methone', 'Saturn', 1.6, 194440, 0.0001, 0.0, 1.010, 'named');
export const Pallene = createMoon('Pallene', 'Saturn', 2.5, 212280, 0.004, 0.0, 1.154, 'named');
export const Anthe = createMoon('Anthe', 'Saturn', 0.9, 197700, 0.001, 0.1, 1.051, 'named');
export const Aegaeon = createMoon('Aegaeon', 'Saturn', 0.33, 167500, 0.0002, 0.0, 0.808, 'named');

// Outer irregular moons of Saturn (named)
export const Albiorix = createMoon('Albiorix', 'Saturn', 16, 16182000, 0.478, 34.0, 783.5, 'medium');
export const Siarnaq = createMoon('Siarnaq', 'Saturn', 20, 17531000, 0.296, 46.0, 895.5, 'medium');
export const Paaliaq = createMoon('Paaliaq', 'Saturn', 11, 15103000, 0.364, 45.1, 686.9, 'medium');
export const Ymir = createMoon('Ymir', 'Saturn', 9, 23040000, 0.335, 173.1, -1315.1, 'named');
export const Kiviuq = createMoon('Kiviuq', 'Saturn', 8, 11294000, 0.334, 45.7, 449.2, 'named');
export const Ijiraq = createMoon('Ijiraq', 'Saturn', 6, 11355000, 0.316, 46.4, 451.4, 'named');
export const Tarvos = createMoon('Tarvos', 'Saturn', 7.5, 17983000, 0.531, 33.8, 926.2, 'named');
export const Erriapus = createMoon('Erriapus', 'Saturn', 5, 17343000, 0.474, 34.5, 871.2, 'named');
export const Skathi = createMoon('Skathi', 'Saturn', 4, 15541000, 0.270, 152.6, -728.2, 'named');
export const Mundilfari = createMoon('Mundilfari', 'Saturn', 3.5, 18628000, 0.208, 167.5, -952.8, 'named');
export const Narvi = createMoon('Narvi', 'Saturn', 3.5, 19007000, 0.431, 145.7, -1003.9, 'named');
export const Suttungr = createMoon('Suttungr', 'Saturn', 3.5, 19459000, 0.114, 175.8, -1016.7, 'named');
export const Thrymr = createMoon('Thrymr', 'Saturn', 3.5, 20314000, 0.470, 175.8, -1094.1, 'named');
export const Bestla = createMoon('Bestla', 'Saturn', 3.5, 20129000, 0.521, 145.2, -1088.7, 'named');
export const Hati = createMoon('Hati', 'Saturn', 3, 19846000, 0.372, 165.8, -1038.7, 'named');
export const Bergelmir = createMoon('Bergelmir', 'Saturn', 3, 19336000, 0.142, 158.6, -1005.9, 'named');
export const Farbauti = createMoon('Farbauti', 'Saturn', 2.5, 20377000, 0.206, 156.4, -1085.6, 'named');
export const Fenrir = createMoon('Fenrir', 'Saturn', 2, 22453000, 0.136, 164.9, -1260.4, 'named');
export const Fornjot = createMoon('Fornjot', 'Saturn', 3, 25108000, 0.206, 170.4, -1494.2, 'named');
export const Hyrrokkin = createMoon('Hyrrokkin', 'Saturn', 4, 18437000, 0.333, 151.5, -931.8, 'named');
export const Kari = createMoon('Kari', 'Saturn', 3.5, 22089000, 0.478, 156.3, -1230.9, 'named');
export const Loge = createMoon('Loge', 'Saturn', 3, 23058000, 0.187, 167.9, -1311.4, 'named');
export const Skoll = createMoon('Skoll', 'Saturn', 3, 17665000, 0.464, 161.2, -878.3, 'named');
export const Surtur = createMoon('Surtur', 'Saturn', 3, 22707000, 0.451, 169.7, -1297.4, 'named');
export const Greip = createMoon('Greip', 'Saturn', 3, 18206000, 0.326, 179.8, -921.2, 'named');
export const Jarnsaxa = createMoon('Jarnsaxa', 'Saturn', 3, 18811000, 0.216, 163.3, -964.7, 'named');
export const Tarqeq = createMoon('Tarqeq', 'Saturn', 3.5, 17910000, 0.160, 46.1, 887.5, 'named');
export const Bebhionn = createMoon('Bebhionn', 'Saturn', 3, 17119000, 0.469, 35.0, 834.8, 'named');

// Minor Saturn moons (provisional - sampling of ~80 remaining)
const saturnMinorMoons: CelestialBody[] = [];
for (let i = 1; i <= 80; i++) {
  const isRetrograde = Math.random() > 0.3;
  const a = 15000000 + Math.random() * 15000000;
  const period = Math.pow(a / 1221870, 1.5) * 15.945; // Kepler's 3rd law scaled from Titan
  const inclination = isRetrograde ? 140 + Math.random() * 40 : 30 + Math.random() * 20;
  saturnMinorMoons.push(
    createMoon(`S/2004 S ${i}`, 'Saturn', 2, a, 0.2 + Math.random() * 0.4, inclination, isRetrograde ? -period : period, 'minor')
  );
}

export const saturnMoons: CelestialBody[] = [
  // Major (9)
  Titan, Rhea, Iapetus, Dione, Tethys, Enceladus, Mimas, Hyperion, Phoebe,
  // Medium & inner (15)
  Janus, Epimetheus, Prometheus, Pandora, Helene, Telesto, Calypso, Atlas, Pan,
  Daphnis, Polydeuces, Methone, Pallene, Anthe, Aegaeon,
  // Outer irregulars named (28)
  Albiorix, Siarnaq, Paaliaq, Ymir, Kiviuq, Ijiraq, Tarvos, Erriapus, Skathi,
  Mundilfari, Narvi, Suttungr, Thrymr, Bestla, Hati, Bergelmir, Farbauti, Fenrir,
  Fornjot, Hyrrokkin, Kari, Loge, Skoll, Surtur, Greip, Jarnsaxa, Tarqeq, Bebhionn,
  // Minor (80)
  ...saturnMinorMoons,
];

// ============================================================================
// URANUS MOONS (28)
// ============================================================================

// Major moons
export const Miranda: CelestialBody = {
  name: 'Miranda',
  type: 'moon',
  radius: 235.8,
  color: MOON_COLORS.miranda,
  parentName: 'Uranus',
  moonCategory: 'major',
  parentCentricElements: {
    a: 129900,
    e: 0.0013,
    i: 4.338,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 254.690, // 360 / 1.413 days
    epoch: J2000,
  },
};

export const Ariel: CelestialBody = {
  name: 'Ariel',
  type: 'moon',
  radius: 578.9,
  color: MOON_COLORS.ariel,
  parentName: 'Uranus',
  moonCategory: 'major',
  parentCentricElements: {
    a: 190900,
    e: 0.0012,
    i: 0.041,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 142.826, // 360 / 2.520 days
    epoch: J2000,
  },
};

export const Umbriel: CelestialBody = {
  name: 'Umbriel',
  type: 'moon',
  radius: 584.7,
  color: MOON_COLORS.umbriel,
  parentName: 'Uranus',
  moonCategory: 'major',
  parentCentricElements: {
    a: 266000,
    e: 0.0039,
    i: 0.128,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 86.312, // 360 / 4.144 days
    epoch: J2000,
  },
};

export const Titania: CelestialBody = {
  name: 'Titania',
  type: 'moon',
  radius: 788.9,
  color: MOON_COLORS.titania,
  parentName: 'Uranus',
  moonCategory: 'major',
  parentCentricElements: {
    a: 436300,
    e: 0.0011,
    i: 0.079,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 41.351, // 360 / 8.706 days
    epoch: J2000,
  },
};

export const Oberon: CelestialBody = {
  name: 'Oberon',
  type: 'moon',
  radius: 761.4,
  color: MOON_COLORS.oberon,
  parentName: 'Uranus',
  moonCategory: 'major',
  parentCentricElements: {
    a: 583500,
    e: 0.0014,
    i: 0.068,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 26.739, // 360 / 13.463 days
    epoch: J2000,
  },
};

// Smaller Uranus moons
export const Puck = createMoon('Puck', 'Uranus', 81, 86010, 0.00012, 0.31, 0.762, 'medium');
export const Portia = createMoon('Portia', 'Uranus', 67.6, 66097, 0.00005, 0.09, 0.513, 'medium');
export const Juliet = createMoon('Juliet', 'Uranus', 46.8, 64360, 0.00066, 0.06, 0.493, 'medium');
export const Desdemona = createMoon('Desdemona', 'Uranus', 32, 62680, 0.00013, 0.11, 0.474, 'medium');
export const Rosalind = createMoon('Rosalind', 'Uranus', 36, 69940, 0.00011, 0.28, 0.558, 'medium');
export const Belinda = createMoon('Belinda', 'Uranus', 40.3, 75260, 0.00007, 0.03, 0.624, 'medium');
export const Bianca = createMoon('Bianca', 'Uranus', 25.7, 59170, 0.00092, 0.19, 0.435, 'medium');
export const Ophelia = createMoon('Ophelia', 'Uranus', 21.4, 53790, 0.0099, 0.09, 0.376, 'medium');
export const Cordelia = createMoon('Cordelia', 'Uranus', 20.1, 49750, 0.00026, 0.08, 0.335, 'medium');
export const Cressida = createMoon('Cressida', 'Uranus', 39.8, 61780, 0.00036, 0.01, 0.464, 'medium');
export const Cupid = createMoon('Cupid', 'Uranus', 9, 74800, 0.0013, 0.1, 0.618, 'named');
export const Mab = createMoon('Mab', 'Uranus', 12, 97736, 0.0025, 0.13, 0.923, 'named');
export const Perdita = createMoon('Perdita', 'Uranus', 13, 76417, 0.0116, 0.0, 0.638, 'named');

// Irregular moons of Uranus
export const Caliban = createMoon('Caliban', 'Uranus', 36, 7231000, 0.1587, 140.9, -579.7, 'medium');
export const Sycorax = createMoon('Sycorax', 'Uranus', 75, 12179000, 0.5224, 159.4, -1288.3, 'medium');
export const Prospero = createMoon('Prospero', 'Uranus', 25, 16256000, 0.4448, 151.8, -1978.4, 'medium');
export const Setebos = createMoon('Setebos', 'Uranus', 24, 17418000, 0.5914, 158.2, -2225.2, 'medium');
export const Stephano = createMoon('Stephano', 'Uranus', 16, 8004000, 0.2292, 144.1, -677.4, 'named');
export const Trinculo = createMoon('Trinculo', 'Uranus', 9, 8504000, 0.2200, 167.0, -749.2, 'named');
export const Francisco = createMoon('Francisco', 'Uranus', 11, 4276000, 0.1459, 147.3, -267.0, 'named');
export const Ferdinand = createMoon('Ferdinand', 'Uranus', 10, 20901000, 0.3682, 169.8, -2887.4, 'named');
export const Margaret = createMoon('Margaret', 'Uranus', 10, 14345000, 0.6608, 57.0, 1694.8, 'named');

export const uranusMoons: CelestialBody[] = [
  // Major (5)
  Miranda, Ariel, Umbriel, Titania, Oberon,
  // Medium inner (10)
  Puck, Portia, Juliet, Desdemona, Rosalind, Belinda, Bianca, Ophelia, Cordelia, Cressida,
  // Small named (3)
  Cupid, Mab, Perdita,
  // Irregular (9)
  Caliban, Sycorax, Prospero, Setebos, Stephano, Trinculo, Francisco, Ferdinand, Margaret,
];

// ============================================================================
// NEPTUNE MOONS (16)
// ============================================================================

export const Triton: CelestialBody = {
  name: 'Triton',
  type: 'moon',
  radius: 1353.4,
  color: MOON_COLORS.triton,
  parentName: 'Neptune',
  moonCategory: 'major',
  parentCentricElements: {
    a: 354759,
    e: 0.000016,
    i: 156.865, // retrograde
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 61.258, // 360 / 5.877 days
    epoch: J2000,
  },
};

export const Proteus = createMoon('Proteus', 'Neptune', 210, 117647, 0.0005, 0.04, 1.122, 'major');
export const Nereid = createMoon('Nereid', 'Neptune', 170, 5513818, 0.7507, 7.23, 360.14, 'major');
export const Larissa = createMoon('Larissa', 'Neptune', 97, 73548, 0.0014, 0.20, 0.555, 'medium');
export const Galatea = createMoon('Galatea', 'Neptune', 88, 61953, 0.0001, 0.05, 0.429, 'medium');
export const Despina = createMoon('Despina', 'Neptune', 75, 52526, 0.0002, 0.07, 0.335, 'medium');
export const Thalassa = createMoon('Thalassa', 'Neptune', 41, 50075, 0.0002, 0.21, 0.311, 'medium');
export const Naiad = createMoon('Naiad', 'Neptune', 33, 48227, 0.0003, 4.69, 0.294, 'medium');
export const Halimede = createMoon('Halimede', 'Neptune', 31, 16611000, 0.2646, 112.7, -1879.1, 'medium');
export const Neso = createMoon('Neso', 'Neptune', 30, 49285000, 0.5714, 136.4, -9374, 'medium');
export const Psamathe = createMoon('Psamathe', 'Neptune', 20, 46695000, 0.3809, 126.3, -9115.9, 'medium');
export const Sao = createMoon('Sao', 'Neptune', 22, 22228000, 0.1365, 53.5, 2912.7, 'medium');
export const Laomedeia = createMoon('Laomedeia', 'Neptune', 21, 23567000, 0.3969, 37.9, 3171.3, 'medium');
export const Hippocamp = createMoon('Hippocamp', 'Neptune', 17, 105283, 0.0, 0.06, 0.95, 'medium');
export const S2004N1 = createMoon('S/2004 N 1', 'Neptune', 9, 105283, 0.0, 0.1, 0.95, 'minor');

export const neptuneMoons: CelestialBody[] = [
  Triton, Proteus, Nereid, Larissa, Galatea, Despina, Thalassa, Naiad,
  Halimede, Neso, Psamathe, Sao, Laomedeia, Hippocamp, S2004N1,
];

// ============================================================================
// PLUTO MOONS (5)
// ============================================================================

export const Charon: CelestialBody = {
  name: 'Charon',
  type: 'moon',
  radius: 606,
  color: MOON_COLORS.charon,
  parentName: 'Pluto',
  moonCategory: 'major',
  parentCentricElements: {
    a: 19591,
    e: 0.0002,
    i: 0.001,
    M0: 0,
    omega: 0,
    Omega: 0,
    n: 56.363, // 360 / 6.387 days
    epoch: J2000,
  },
};

export const Nix = createMoon('Nix', 'Pluto', 23, 48694, 0.002, 0.13, 24.86, 'medium');
export const Hydra = createMoon('Hydra', 'Pluto', 30.5, 64738, 0.0051, 0.24, 38.20, 'medium');
export const Kerberos = createMoon('Kerberos', 'Pluto', 9.5, 57783, 0.003, 0.39, 32.17, 'named');
export const Styx = createMoon('Styx', 'Pluto', 5.5, 42656, 0.006, 0.81, 20.16, 'named');

export const plutoMoons: CelestialBody[] = [
  Charon, Nix, Hydra, Kerberos, Styx,
];

// ============================================================================
// EXPORTS
// ============================================================================

// All moons combined
export const allMoons: CelestialBody[] = [
  Moon,
  Phobos, Deimos,
  ...jupiterMoons,
  ...saturnMoons,
  ...uranusMoons,
  ...neptuneMoons,
  ...plutoMoons,
];

// Filter moons by minimum category level
// 'major' = only major moons (~30)
// 'medium' = major + medium (~60)
// 'named' = major + medium + named (~220)
// 'minor' = all moons including provisional designations (~290)
export function filterMoons(minCategory: MoonCategory): CelestialBody[] {
  const categoryOrder: MoonCategory[] = ['major', 'medium', 'named', 'minor'];
  const minIndex = categoryOrder.indexOf(minCategory);

  return allMoons.filter(moon => {
    const moonIndex = categoryOrder.indexOf(moon.moonCategory || 'minor');
    return moonIndex <= minIndex;
  });
}

// Convenience exports for different detail levels
export const majorMoons = filterMoons('major');
export const mediumMoons = filterMoons('medium');
export const namedMoons = filterMoons('named');
