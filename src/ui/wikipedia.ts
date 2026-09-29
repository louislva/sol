/** Wikipedia article summaries for the info panel. */

export interface WikipediaSummary {
  title: string;
  extract: string;
  content_urls?: { desktop: { page: string } };
}

const cache = new Map<string, Promise<WikipediaSummary | null>>();

/** Article titles that differ from every generic candidate. */

const ARTICLE_TITLES: Record<string, string> = {
  Mercury: "Mercury_(planet)",
  Ceres: "Ceres_(dwarf_planet)",
  Eris: "Eris_(dwarf_planet)",
  Halley: "Halley's_Comet",
  Encke: "Comet_Encke",
  "Hale–Bopp": "Comet_Hale–Bopp",
  NEOWISE: "C/2020_F3_(NEOWISE)",
  Kepler: "Kepler_space_telescope",
  Spitzer: "Spitzer_Space_Telescope",
};

async function fetchSummary(title: string): Promise<WikipediaSummary | null> {
  let pending = cache.get(title);
  if (!pending) {
    pending = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`)
      .then(async (response) => {
        if (!response.ok) return null;
        const summary = await response.json() as WikipediaSummary & { type?: string };
        return summary.type === "disambiguation" ? null : summary;
      })
      .catch(() => null);
    cache.set(title, pending);
  }
  return pending;
}

/** The first article found among the candidate titles, most specific first. */
export async function fetchWikipediaSummary(candidates: readonly string[]): Promise<WikipediaSummary | null> {
  for (const candidate of candidates) {
    const title = ARTICLE_TITLES[candidate] ?? candidate;
    const summary = await fetchSummary(title);
    if (summary) return summary;
  }
  return null;
}
