/**
 * The HTML that tells search engines and link previews what a page is: the
 * head tags, structured data, the About panel's readable text, and the
 * sitemap. Used by the Vite plugin in `vite.config.ts` (build and dev).
 */

import { AUTHOR, HOME, LANDING_PAGES, type Page, pageUrl, REPOSITORY_URL, SITE_NAME, SITE_URL } from "./pages";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON for a `<script>` element: `<` escaped so the text can't close the element. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

const OG_IMAGE = `${SITE_URL}/og.png`;

function structuredData(page: Page): unknown {
  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    alternateName: ["Sol solar system map", "sol.louisarge.com"],
    description: HOME.description,
  };
  const app = {
    "@type": "WebApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    alternateName: "Sol — live solar system & Milky Way map",
    url: `${SITE_URL}/`,
    description: HOME.description,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "Astronomy",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript and HTML5 canvas",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    image: OG_IMAGE,
    screenshot: OG_IMAGE,
    author: { "@type": "Person", name: AUTHOR },
    license: "https://opensource.org/licenses/MIT",
    codeRepository: REPOSITORY_URL,
    keywords: [
      "solar system map", "interactive solar system", "solar system to scale", "live solar system",
      "where are the planets right now", "orrery", "Milky Way map", "where is Voyager 1",
      "spacecraft tracker", "asteroid map", "star map", "scale of the universe",
    ].join(", "),
    about: [
      { "@type": "Thing", name: "Solar System", sameAs: "https://en.wikipedia.org/wiki/Solar_System" },
      { "@type": "Thing", name: "Milky Way", sameAs: "https://en.wikipedia.org/wiki/Milky_Way" },
    ],
  };
  const graph: unknown[] = [website, app];
  if (page.slug) {
    graph.push({
      "@type": "WebPage",
      "@id": `${pageUrl(page)}#webpage`,
      url: pageUrl(page),
      name: page.title,
      headline: page.heading,
      description: page.description,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      mainEntity: { "@id": `${SITE_URL}/#app` },
      about: { "@type": "Thing", name: page.linkText },
      primaryImageOfPage: OG_IMAGE,
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: page.linkText, item: pageUrl(page) },
        ],
      },
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/** Everything in `<head>` that differs per page. */
export function renderHead(page: Page): string {
  const url = pageUrl(page);
  const title = escape(page.title);
  const description = escape(page.description);
  return `<title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${OG_IMAGE}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Sol: a top-down map of the solar system, with planet orbits drawn to scale">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${OG_IMAGE}">
    <script type="application/ld+json">${scriptJson(structuredData(page))}</script>`;
}

const paragraphs = (texts: readonly string[]) => texts.map((text) => `<p>${escape(text)}</p>`).join("\n        ");

/**
 * The About panel's text: the page's own heading and introduction, then
 * what the site is, for every page alike.
 */
export function renderAbout(page: Page): string {
  const links = [HOME, ...LANDING_PAGES]
    .filter((other) => other !== page)
    .map((other) => `<li><a href="/${other.slug}">${escape(other.linkText)}</a></li>`)
    .join("");
  return `<h1 id="about-heading">${escape(page.heading)}</h1>
        ${paragraphs(page.intro)}
        ${page.slug ? paragraphs(HOME.intro) : ""}

        <h2>Solar system, galaxy, universe: what's the difference?</h2>
        <p>The <strong>solar system</strong> is the Sun and everything held by its gravity: eight planets and their moons, dwarf planets like Pluto, and millions of asteroids and comets. Light from the Sun takes about four hours to reach Neptune, the outermost planet.</p>
        <p>A <strong>galaxy</strong> is an enormous collection of stars. Ours, the <strong>Milky Way</strong>, has hundreds of billions of them, and the Sun is just one, about 26,000 light-years from the center. The nearest other star, Proxima Centauri, is 4.2 light-years away: thousands of times farther than Neptune.</p>
        <p>The <strong>universe</strong> is everything: hundreds of billions of galaxies like the Milky Way. Sol's map stops at our own galaxy. Start at Earth and zoom out slowly to see each step of that ladder.</p>

        <h2>What you can explore</h2>
        <ul>
          <li>The Sun, the eight planets, dwarf planets and hundreds of moons</li>
          <li>About 25,000 asteroids, and comets including Halley's Comet and the interstellar comet 3I/ATLAS</li>
          <li>Over 16,000 Earth satellites, including the ISS and Starlink</li>
          <li>45 spacecraft missions, from Pioneer 10 and the Voyagers to the James Webb Space Telescope and Europa Clipper, each replayable from launch</li>
          <li>About 11,000 nearby stars, moving at their measured speeds</li>
          <li>The Milky Way's bar and spiral arms, and Sagittarius A*, the black hole at its center</li>
          <li>Any date from 10 million years ago to 10 million years from now</li>
        </ul>

        <h2>How to use it</h2>
        <p>Drag to pan; scroll or pinch to zoom. Click anything to see what it is, and double-click to follow it. Click the date to jump to another time, and open Missions to fly along with a spacecraft from launch.</p>

        <h2>Where the data comes from</h2>
        <p>Every position is computed from published data: NASA JPL Horizons and the Small-Body Database, NAIF planetary constants, CelesTrak for Earth satellites, SIMBAD and the IAU for stars, and Reid et al. (2019) for the Milky Way's spiral arms. The face-on picture of the Milky Way is the one exception: nobody has seen our galaxy from outside, so it is drawn from its measured structure.</p>
        <p>Sol is free and <a href="${REPOSITORY_URL}">open source on GitHub</a>.</p>

        <h2>Explore</h2>
        <ul class="about-links">${links}</ul>`;
}

/** `sitemap.xml` listing every page. */
export function renderSitemap(lastModified: string): string {
  const urls = [HOME, ...LANDING_PAGES]
    .map((page) => `  <url>\n    <loc>${pageUrl(page)}</loc>\n    <lastmod>${lastModified}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
