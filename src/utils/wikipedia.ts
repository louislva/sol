/**
 * Wikipedia API utilities for fetching article summaries
 */

interface WikipediaSummary {
  title: string;
  extract: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  content_urls?: {
    desktop: {
      page: string;
    };
  };
}

interface WikipediaError {
  error: string;
}

// Cache to avoid re-fetching the same article
const summaryCache = new Map<string, WikipediaSummary | null>();

/**
 * Fetch Wikipedia summary for a given topic
 * @param name - The name/title to search for
 * @returns Wikipedia summary or null if not found
 */
export async function fetchWikipediaSummary(name: string): Promise<WikipediaSummary | null> {
  // Check cache first
  if (summaryCache.has(name)) {
    return summaryCache.get(name) || null;
  }

  // Clean up the name for Wikipedia search
  const searchName = cleanNameForWikipedia(name);

  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`;
    const response = await fetch(url);

    if (!response.ok) {
      // Article not found or other error
      summaryCache.set(name, null);
      return null;
    }

    const data = (await response.json()) as WikipediaSummary | WikipediaError;

    if ('error' in data) {
      summaryCache.set(name, null);
      return null;
    }

    summaryCache.set(name, data);
    return data;
  } catch (error) {
    console.warn(`Failed to fetch Wikipedia summary for "${name}":`, error);
    summaryCache.set(name, null);
    return null;
  }
}

/**
 * Clean up celestial body names for Wikipedia searches
 */
function cleanNameForWikipedia(name: string): string {
  // Remove any parenthetical notes (e.g., "Io (moon)" -> "Io")
  let cleaned = name.replace(/\s*\([^)]*\)/g, '');

  // Special cases for better Wikipedia matches
  const specialCases: Record<string, string> = {
    'Sun': 'Sun',
    'Mercury': 'Mercury_(planet)',
    'Venus': 'Venus',
    'Earth': 'Earth',
    'Mars': 'Mars',
    'Jupiter': 'Jupiter',
    'Saturn': 'Saturn',
    'Uranus': 'Uranus',
    'Neptune': 'Neptune',
    'Pluto': 'Pluto',
    'Ceres': 'Ceres_(dwarf_planet)',
    'Eris': 'Eris_(dwarf_planet)',
    'Makemake': 'Makemake',
    'Haumea': 'Haumea',
    'Moon': 'Moon',
    'Io': 'Io_(moon)',
    'Europa': 'Europa_(moon)',
    'Ganymede': 'Ganymede_(moon)',
    'Callisto': 'Callisto_(moon)',
    'Titan': 'Titan_(moon)',
    'Enceladus': 'Enceladus',
    'Mimas': 'Mimas_(moon)',
    'Phobos': 'Phobos_(moon)',
    'Deimos': 'Deimos_(moon)',
    'Triton': 'Triton_(moon)',
  };

  return specialCases[cleaned] || cleaned;
}

/**
 * Clear the summary cache
 */
export function clearWikipediaCache(): void {
  summaryCache.clear();
}
