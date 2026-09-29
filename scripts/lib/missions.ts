/**
 * Spacecraft missions modeled from their full JPL Horizons trajectories.
 *
 * `targets` lists bodies (beyond the Sun, planets and Moon, which are always
 * considered) that the spacecraft may come under — asteroids it orbited or
 * landed on, moons it flew close to. Names must exist in the app catalog.
 *
 * `landsOn` marks missions whose trajectory ends at rest on a body; the
 * touchdown time and site are read from the ephemeris itself.
 *
 * NAIF IDs: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html
 * (each is verified against the name Horizons reports).
 */

export type MissionType = "deep_space" | "planetary_orbiter" | "lander";
export type MissionIcon = "probe" | "orbiter" | "telescope" | "lander";

export interface MissionConfig {
  name: string;
  spkid: number;
  /** Horizons' name for the target when it differs from ours. */
  horizonsName?: string;
  type: MissionType;
  icon: MissionIcon;
  status: "active" | "ended";
  targets?: string[];
  landsOn?: string;
  /** What happened at the end of the ephemeris, for the info panel. */
  fate?: string;
  /**
   * Published end of the mission (ISO UTC), where Horizons' ephemeris runs on
   * past it — e.g. an impactor whose solution continues along the target.
   */
  endsAt?: string;
}

const GALILEAN = ["Io", "Europa", "Ganymede", "Callisto"];
const SATURN_MAJOR = ["Titan", "Enceladus", "Rhea", "Dione", "Tethys", "Iapetus"];

export const MISSIONS: MissionConfig[] = [
  // Outer solar system
  { name: "Voyager 1", spkid: -31, type: "deep_space", icon: "probe", status: "active", targets: ["Io", "Ganymede", "Callisto", "Titan"] },
  { name: "Voyager 2", spkid: -32, type: "deep_space", icon: "probe", status: "active", targets: [...GALILEAN, "Titan", "Miranda", "Triton"] },
  { name: "Pioneer 10", spkid: -23, type: "deep_space", icon: "probe", status: "ended", fate: "Contact lost 2003; coasting out of the solar system" },
  { name: "Pioneer 11", spkid: -24, type: "deep_space", icon: "probe", status: "ended", targets: ["Titan"], fate: "Contact lost 1995; coasting out of the solar system" },
  { name: "New Horizons", spkid: -98, type: "deep_space", icon: "probe", status: "active", targets: ["Charon", "Arrokoth"] },
  { name: "Galileo", spkid: -77, type: "planetary_orbiter", icon: "orbiter", status: "ended", targets: [...GALILEAN, "Gaspra", "Ida"], fate: "Deliberately entered Jupiter's atmosphere, 2003" },
  { name: "Juno", spkid: -61, type: "planetary_orbiter", icon: "orbiter", status: "active", targets: GALILEAN },
  { name: "Cassini", spkid: -82, type: "planetary_orbiter", icon: "orbiter", status: "ended", targets: SATURN_MAJOR, fate: "Deliberately entered Saturn's atmosphere, 2017" },
  { name: "Huygens", spkid: -150, horizonsName: "Huygens", type: "lander", icon: "lander", status: "ended", targets: ["Titan"], landsOn: "Titan", fate: "Landed on Titan, 14 Jan 2005 (Horizons: pre-landing predicted descent)" },
  { name: "Ulysses", spkid: -55, type: "deep_space", icon: "probe", status: "ended", fate: "Switched off 2009; still orbiting the Sun" },
  { name: "Europa Clipper", spkid: -159, type: "deep_space", icon: "probe", status: "active" },
  { name: "JUICE", spkid: -28, type: "deep_space", icon: "probe", status: "active" },

  // Inner solar system and the Sun
  { name: "MESSENGER", spkid: -236, type: "planetary_orbiter", icon: "orbiter", status: "ended", fate: "Impacted Mercury, 30 Apr 2015" },
  { name: "BepiColombo", spkid: -121, type: "deep_space", icon: "probe", status: "active" },
  { name: "Parker Solar Probe", spkid: -96, type: "deep_space", icon: "probe", status: "active" },
  { name: "Solar Orbiter", spkid: -144, type: "deep_space", icon: "probe", status: "active" },
  { name: "STEREO-A", spkid: -234, type: "deep_space", icon: "probe", status: "active" },
  { name: "Genesis", spkid: -47, type: "deep_space", icon: "probe", status: "ended", fate: "Sample capsule returned to Earth, 2004" },

  // Small bodies
  { name: "NEAR Shoemaker", spkid: -93, horizonsName: "NEAR", type: "deep_space", icon: "probe", status: "ended", targets: ["Eros", "Mathilde"], landsOn: "Eros", fate: "Landed on Eros, 12 Feb 2001 — the first landing on an asteroid" },
  { name: "Rosetta", spkid: -226, type: "deep_space", icon: "probe", status: "ended", targets: ["Churyumov–Gerasimenko", "Šteins", "Lutetia"], landsOn: "Churyumov–Gerasimenko", fate: "Set down on comet 67P, 30 Sep 2016" },
  { name: "Dawn", spkid: -203, type: "deep_space", icon: "probe", status: "ended", targets: ["Vesta", "Ceres"], fate: "Out of fuel 2018; left in orbit around Ceres" },
  { name: "Hayabusa", spkid: -130, type: "deep_space", icon: "probe", status: "ended", targets: ["Itokawa"], fate: "Returned samples of Itokawa to Earth, 2010" },
  { name: "Hayabusa2", spkid: -37, type: "deep_space", icon: "probe", status: "active", targets: ["Ryugu"] },
  { name: "OSIRIS-REx", spkid: -64, type: "deep_space", icon: "probe", status: "active", targets: ["Bennu"] },
  { name: "Deep Impact", spkid: -140, type: "deep_space", icon: "probe", status: "ended", targets: ["Tempel 1", "Hartley 2"], fate: "Contact lost 2013" },
  { name: "Stardust", spkid: -29, type: "deep_space", icon: "probe", status: "ended", targets: ["Wild 2", "Annefrank", "Tempel 1"], fate: "Returned comet dust to Earth 2006; retired 2011" },
  { name: "DART", spkid: -135, type: "deep_space", icon: "probe", status: "ended", targets: ["Didymos"], fate: "Impacted Dimorphos, moon of Didymos, 26 Sep 2022", endsAt: "2022-09-26T23:14:24Z" },
  { name: "Lucy", spkid: -49, type: "deep_space", icon: "probe", status: "active", targets: ["Dinkinesh", "Donaldjohanson"] },
  { name: "Psyche (spacecraft)", spkid: -255, horizonsName: "Psyche", type: "deep_space", icon: "probe", status: "active", targets: ["Psyche"] },

  // Mars
  { name: "Mars Reconnaissance Orbiter", spkid: -74, type: "planetary_orbiter", icon: "orbiter", status: "active" },
  { name: "Mars Odyssey", spkid: -53, type: "planetary_orbiter", icon: "orbiter", status: "active" },
  { name: "MAVEN", spkid: -202, type: "planetary_orbiter", icon: "orbiter", status: "active" },
  { name: "Mars Express", spkid: -41, type: "planetary_orbiter", icon: "orbiter", status: "active" },
  { name: "ExoMars TGO", spkid: -143, type: "planetary_orbiter", icon: "orbiter", status: "active" },
  { name: "Curiosity", spkid: -76, horizonsName: "MSL", type: "lander", icon: "lander", status: "active", landsOn: "Mars" },
  { name: "Perseverance", spkid: -168, horizonsName: "Mars 2020", type: "lander", icon: "lander", status: "active", landsOn: "Mars" },
  { name: "InSight", spkid: -189, type: "lander", icon: "lander", status: "ended", landsOn: "Mars", fate: "Landed on Mars, 26 Nov 2018; mission ended 2022" },
  { name: "Phoenix", spkid: -84, type: "lander", icon: "lander", status: "ended", landsOn: "Mars", fate: "Landed near Mars's north pole, 25 May 2008" },
  { name: "Spirit", spkid: -254, type: "lander", icon: "lander", status: "ended", landsOn: "Mars", fate: "Landed on Mars, 4 Jan 2004; last contact 2010" },
  { name: "Opportunity", spkid: -253, type: "lander", icon: "lander", status: "ended", landsOn: "Mars", fate: "Landed on Mars, 25 Jan 2004; last contact 2018" },

  // Earth and Moon neighbourhood
  { name: "Lunar Reconnaissance Orbiter", spkid: -85, horizonsName: "LRO", type: "planetary_orbiter", icon: "orbiter", status: "active" },
  { name: "JWST", spkid: -170, horizonsName: "James Webb", type: "deep_space", icon: "telescope", status: "active" },
  { name: "DSCOVR", spkid: -78, type: "deep_space", icon: "probe", status: "active" },
  { name: "Kepler", spkid: -227, type: "deep_space", icon: "telescope", status: "ended", fate: "Retired 2018; trailing Earth around the Sun" },
  { name: "Spitzer", spkid: -79, type: "deep_space", icon: "telescope", status: "ended", fate: "Retired 2020; trailing Earth around the Sun" },
];
