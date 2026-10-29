/**
 * The site's pages as search engines see them: the home page and a landing
 * page per popular object ("Where is Voyager 1 right now?").
 *
 * Every page is the same app; a landing page opens focused on its object.
 * At build time `vite.config.ts` writes one HTML file per page with its own
 * title, description and readable text (in the About panel), plus
 * `sitemap.xml`. Keep the text factual: it is shown to people, not just
 * crawlers, and nothing here may contradict the data.
 */

export const SITE_URL = "https://sol.louisarge.com";
export const SITE_NAME = "Sol";
export const REPOSITORY_URL = "https://github.com/louislva/sol";
export const AUTHOR = "Louis Arge";

/** How a landing page frames its object when the app opens. */
export type Framing =
  /** The object and the Sun together, centered between them. */
  | "withSun"
  /** The object at its usual close-up zoom. */
  | "close"
  /** The object at the center, with the Sun at the edge of the view. */
  | "aroundSun";

export interface Page {
  /** URL path segment, "" for the home page. */
  slug: string;
  /** `<title>`: what the search result's headline says. */
  title: string;
  /** Meta description: the search result's snippet. */
  description: string;
  /** The page's `<h1>`, shown at the top of the About panel. */
  heading: string;
  /** Paragraphs introducing the page (plain text). */
  intro: string[];
  /** Short name used in links between pages. */
  linkText: string;
  /** The object to open on, as `World.find` resolves it. */
  target?: string;
  framing?: Framing;
}

const planetDescription = (name: string) =>
  `See where ${name} is right now, and where Earth is, on a live, to-scale map of the solar system. Jump to any date, past or future.`;

export const HOME: Page = {
  slug: "",
  title: "Sol — Live Interactive Solar System & Milky Way Map",
  description:
    "A Google Maps for space. See where the planets, moons, asteroids, comets and spacecraft are right now, to scale, then zoom out past the stars to the whole Milky Way.",
  heading: "A live map of the solar system and the Milky Way, to scale",
  intro: [
    "Sol is a Google Maps for space. It shows where everything in the solar system is right now (planets, moons, dwarf planets, asteroids, comets, Earth satellites and spacecraft), seen from above and drawn to scale. Keep zooming out and the map carries on past the planets to the nearby stars and the whole Milky Way.",
  ],
  linkText: "Home",
};

export const LANDING_PAGES: Page[] = [
  {
    slug: "voyager-1",
    target: "Voyager 1",
    framing: "withSun",
    linkText: "Voyager 1",
    title: "Where Is Voyager 1 Right Now? Live Map · Sol",
    description:
      "See where Voyager 1 is right now on a live, to-scale map of the solar system and the nearby stars, and replay its whole journey since 1977.",
    heading: "Where is Voyager 1 right now?",
    intro: [
      "Voyager 1 launched on 5 September 1977, flew past Jupiter and Saturn, and in 2012 became the first spacecraft to reach interstellar space. It is the most distant human-made object: its radio signals take about a day to reach Earth.",
      "The map shows where it is at this moment, computed from NASA JPL's trajectory. Press “Watch from launch” to fly the whole journey.",
    ],
  },
  {
    slug: "voyager-2",
    target: "Voyager 2",
    framing: "withSun",
    linkText: "Voyager 2",
    title: "Where Is Voyager 2 Right Now? Live Map · Sol",
    description:
      "See where Voyager 2 is right now on a live, to-scale map of the solar system, and replay its Grand Tour of Jupiter, Saturn, Uranus and Neptune.",
    heading: "Where is Voyager 2 right now?",
    intro: [
      "Voyager 2 launched on 20 August 1977 and is the only spacecraft to have visited Uranus (1986) and Neptune (1989), after flying past Jupiter and Saturn. In 2018 it followed Voyager 1 into interstellar space.",
      "The map shows where it is at this moment, computed from NASA JPL's trajectory. Press “Watch from launch” to follow the Grand Tour, flyby by flyby.",
    ],
  },
  {
    slug: "new-horizons",
    target: "New Horizons",
    framing: "withSun",
    linkText: "New Horizons",
    title: "Where Is New Horizons Now? Live Map · Sol",
    description:
      "See where New Horizons is right now on a live, to-scale map of the solar system, and replay its flights past Jupiter, Pluto and Arrokoth.",
    heading: "Where is New Horizons right now?",
    intro: [
      "New Horizons launched on 19 January 2006, flew past Pluto on 14 July 2015 and past the Kuiper belt object Arrokoth on 1 January 2019. It is now heading out of the solar system through the Kuiper belt.",
      "The map shows where it is at this moment, computed from NASA JPL's trajectory. Press “Watch from launch” to fly the whole journey.",
    ],
  },
  {
    slug: "parker-solar-probe",
    target: "Parker Solar Probe",
    framing: "withSun",
    linkText: "Parker Solar Probe",
    title: "Where Is Parker Solar Probe Now? Live Map · Sol",
    description:
      "See where Parker Solar Probe is right now on a live, to-scale map of the inner solar system, and watch it dive past the Sun.",
    heading: "Where is Parker Solar Probe right now?",
    intro: [
      "Parker Solar Probe launched on 12 August 2018. Using flybys of Venus to tighten its orbit, it flies closer to the Sun than any spacecraft before it, and faster than any other human-made object.",
      "The map shows where it is at this moment, computed from NASA JPL's trajectory. Speed up time to watch its passes by the Sun.",
    ],
  },
  {
    slug: "james-webb-space-telescope",
    target: "JWST",
    framing: "close",
    linkText: "James Webb Space Telescope",
    title: "Where Is the James Webb Space Telescope Now? Live Map · Sol",
    description:
      "See where the James Webb Space Telescope is right now: a live, to-scale map of its orbit around the Sun–Earth L2 point, beyond the Moon.",
    heading: "Where is the James Webb Space Telescope right now?",
    intro: [
      "The James Webb Space Telescope launched on 25 December 2021. It orbits the Sun–Earth L2 point, about 1.5 million km from Earth on the side away from the Sun, and travels around the Sun along with Earth.",
      "The map shows where it is at this moment, computed from NASA JPL's trajectory. Zoom in on Earth to see its loop around L2.",
    ],
  },
  {
    slug: "milky-way",
    target: "Sagittarius A*",
    framing: "aroundSun",
    linkText: "The Milky Way",
    title: "Map of the Milky Way: Where Is the Sun in Our Galaxy? · Sol",
    description:
      "An interactive map of the Milky Way showing where the Sun and solar system sit in our galaxy, with its spiral arms, its central bar and Sagittarius A*.",
    heading: "Where is the solar system in the Milky Way?",
    intro: [
      "The Sun is one of hundreds of billions of stars in the Milky Way, about 26,000 light-years from its center, in a minor spiral arm called the Local Arm, between the larger Sagittarius and Perseus arms.",
      "This map shows the Galaxy face-on: real positions for about 11,000 nearby stars, the spiral arms as measured by Reid et al. (2019), and Sagittarius A*, the black hole at the center. Nobody has seen the Milky Way from outside, so the glow of its disc is drawn from its measured structure. Zoom in on the Sun to get back to the planets.",
    ],
  },
  {
    slug: "nearest-stars",
    target: "Proxima Centauri",
    framing: "withSun",
    linkText: "Nearest stars",
    title: "Map of the Nearest Stars to the Sun · Sol",
    description:
      "An interactive, to-scale map of the stars around the Sun, from Proxima Centauri outward, moving at their measured speeds. Zoom in to the planets or out to the Milky Way.",
    heading: "Map of the stars nearest the Sun",
    intro: [
      "The nearest star to the Sun is Proxima Centauri, 4.2 light-years away, part of the Alpha Centauri system. That is thousands of times farther than Neptune.",
      "The map places about 11,000 nearby stars at their measured positions and moves them at their measured velocities, so you can run time forward or back and watch the neighborhood change.",
    ],
  },
  {
    slug: "halleys-comet",
    target: "Halley",
    framing: "withSun",
    linkText: "Halley's Comet",
    title: "Where Is Halley's Comet Now? Live Map · Sol",
    description:
      "See where Halley's Comet is right now on a live, to-scale map of the solar system, and fast-forward to its return in 2061.",
    heading: "Where is Halley's Comet right now?",
    intro: [
      "Halley's Comet comes back to the inner solar system about every 76 years. It last passed the Sun in 1986, reached its farthest point, beyond the orbit of Neptune, in December 2023, and is now falling back toward its next visit in 2061.",
      "The map shows where it is at this moment. Click the date and type 2061 to see it return.",
    ],
  },
  {
    slug: "3i-atlas",
    target: "3I/ATLAS",
    framing: "withSun",
    linkText: "3I/ATLAS",
    title: "Where Is 3I/ATLAS Now? Interstellar Comet Live Map · Sol",
    description:
      "See where the interstellar comet 3I/ATLAS is right now on a live, to-scale map of the solar system, and replay its path past the Sun.",
    heading: "Where is the interstellar comet 3I/ATLAS right now?",
    intro: [
      "3I/ATLAS was discovered on 1 July 2025. It is only the third object known to have come from another star system, after 1I/ʻOumuamua and 2I/Borisov. It passed closest to the Sun in late October 2025 on a hyperbolic path and is leaving the solar system for good.",
      "The map shows where it is at this moment. Rewind time to watch it pass the planets.",
    ],
  },
  {
    slug: "mercury",
    target: "Mercury",
    framing: "withSun",
    linkText: "Mercury",
    title: "Where Is Mercury Right Now? Live Solar System Map · Sol",
    description: planetDescription("Mercury"),
    heading: "Where is Mercury right now?",
    intro: ["Mercury, the smallest planet and the closest to the Sun, circles it every 88 days. The map shows where it is at this moment, together with the rest of the solar system."],
  },
  {
    slug: "venus",
    target: "Venus",
    framing: "withSun",
    linkText: "Venus",
    title: "Where Is Venus Right Now? Live Solar System Map · Sol",
    description: planetDescription("Venus"),
    heading: "Where is Venus right now?",
    intro: ["Venus circles the Sun every 225 days and comes closer to Earth than any other planet. The map shows where it is at this moment, together with the rest of the solar system."],
  },
  {
    slug: "mars",
    target: "Mars",
    framing: "withSun",
    linkText: "Mars",
    title: "Where Is Mars Right Now? Live Solar System Map · Sol",
    description: planetDescription("Mars"),
    heading: "Where is Mars right now?",
    intro: [
      "Mars takes 687 days to circle the Sun. As Earth laps it, the distance between the two planets swings between about 55 and 400 million km.",
      "The map shows where Mars is at this moment. Zoom in to find its moons Phobos and Deimos, the orbiters around it, and the rovers where they landed.",
    ],
  },
  {
    slug: "jupiter",
    target: "Jupiter",
    framing: "withSun",
    linkText: "Jupiter",
    title: "Where Is Jupiter Right Now? Live Solar System Map · Sol",
    description: planetDescription("Jupiter"),
    heading: "Where is Jupiter right now?",
    intro: [
      "Jupiter, the largest planet, takes almost 12 years to orbit the Sun.",
      "The map shows where it is at this moment. Zoom in to watch its four large moons, Io, Europa, Ganymede and Callisto, circle it.",
    ],
  },
  {
    slug: "saturn",
    target: "Saturn",
    framing: "withSun",
    linkText: "Saturn",
    title: "Where Is Saturn Right Now? Live Solar System Map · Sol",
    description: planetDescription("Saturn"),
    heading: "Where is Saturn right now?",
    intro: [
      "Saturn takes about 29 years to orbit the Sun.",
      "The map shows where it is at this moment. Zoom in to see its rings and its largest moon, Titan.",
    ],
  },
  {
    slug: "uranus",
    target: "Uranus",
    framing: "withSun",
    linkText: "Uranus",
    title: "Where Is Uranus Right Now? Live Solar System Map · Sol",
    description: planetDescription("Uranus"),
    heading: "Where is Uranus right now?",
    intro: ["Uranus takes about 84 years to orbit the Sun, spinning tipped on its side. Voyager 2, in 1986, is the only spacecraft to have visited it. The map shows where it is at this moment; zoom in to see its moons."],
  },
  {
    slug: "neptune",
    target: "Neptune",
    framing: "withSun",
    linkText: "Neptune",
    title: "Where Is Neptune Right Now? Live Solar System Map · Sol",
    description: planetDescription("Neptune"),
    heading: "Where is Neptune right now?",
    intro: ["Neptune, the farthest planet from the Sun, takes about 165 years to orbit it. Voyager 2 flew past in 1989. The map shows where it is at this moment; zoom in to see its large moon Triton."],
  },
  {
    slug: "pluto",
    target: "Pluto",
    framing: "withSun",
    linkText: "Pluto",
    title: "Where Is Pluto Right Now? Live Solar System Map · Sol",
    description: planetDescription("Pluto"),
    heading: "Where is Pluto right now?",
    intro: ["Pluto, a dwarf planet in the Kuiper belt, takes about 248 years to orbit the Sun. New Horizons flew past it in July 2015. The map shows where it is at this moment; zoom in to see its large moon Charon."],
  },
];

export const PAGES: Page[] = [HOME, ...LANDING_PAGES];

export const pageUrl = (page: Page) => (page.slug ? `${SITE_URL}/${page.slug}` : `${SITE_URL}/`);

/** The landing page for a URL path such as "/voyager-1" or "/voyager-1/". */
export function pageForPath(path: string): Page | undefined {
  const slug = path.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "");
  return LANDING_PAGES.find((page) => page.slug === slug);
}
