/**
 * Moon Data Fetch Script
 *
 * Downloads moon orbital elements from NASA JPL's Horizons API
 * and converts to our format.
 *
 * Usage:
 *   npx ts-node scripts/fetch-moons.ts
 *
 * Output:
 *   src/data/moons.json
 *
 * Data source:
 *   NASA JPL Horizons API: https://ssd.jpl.nasa.gov/api/horizons.api
 *   JPL Satellite Elements: https://ssd.jpl.nasa.gov/sats/elem/
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MoonData {
  name: string;
  parentName: string;
  radius: number;        // km
  a: number;             // Semi-major axis (km)
  e: number;             // Eccentricity
  i: number;             // Inclination (degrees)
  Omega: number;         // Longitude of ascending node (degrees)
  omega: number;         // Argument of perihelion (degrees)
  M0: number;            // Mean anomaly at epoch (degrees)
  period: number;        // Orbital period (days)
  category: 'major' | 'medium' | 'named' | 'minor';
}

// JPL body IDs for moons
// Format: planet_number * 100 + moon_number
const MOON_IDS: { id: number; name: string; parent: string; radius: number }[] = [
  // Earth
  { id: 301, name: 'Moon', parent: 'Earth', radius: 1737.4 },

  // Mars
  { id: 401, name: 'Phobos', parent: 'Mars', radius: 11.267 },
  { id: 402, name: 'Deimos', parent: 'Mars', radius: 6.2 },

  // Jupiter - Galilean and major
  { id: 501, name: 'Io', parent: 'Jupiter', radius: 1821.6 },
  { id: 502, name: 'Europa', parent: 'Jupiter', radius: 1560.8 },
  { id: 503, name: 'Ganymede', parent: 'Jupiter', radius: 2634.1 },
  { id: 504, name: 'Callisto', parent: 'Jupiter', radius: 2410.3 },
  { id: 505, name: 'Amalthea', parent: 'Jupiter', radius: 83.5 },
  { id: 506, name: 'Himalia', parent: 'Jupiter', radius: 85 },
  { id: 507, name: 'Elara', parent: 'Jupiter', radius: 43 },
  { id: 508, name: 'Pasiphae', parent: 'Jupiter', radius: 30 },
  { id: 509, name: 'Sinope', parent: 'Jupiter', radius: 19 },
  { id: 510, name: 'Lysithea', parent: 'Jupiter', radius: 18 },
  { id: 511, name: 'Carme', parent: 'Jupiter', radius: 23 },
  { id: 512, name: 'Ananke', parent: 'Jupiter', radius: 14 },
  { id: 513, name: 'Leda', parent: 'Jupiter', radius: 10 },
  { id: 514, name: 'Thebe', parent: 'Jupiter', radius: 49.3 },
  { id: 515, name: 'Adrastea', parent: 'Jupiter', radius: 8.2 },
  { id: 516, name: 'Metis', parent: 'Jupiter', radius: 21.5 },

  // Saturn - Major moons
  { id: 601, name: 'Mimas', parent: 'Saturn', radius: 198.2 },
  { id: 602, name: 'Enceladus', parent: 'Saturn', radius: 252.1 },
  { id: 603, name: 'Tethys', parent: 'Saturn', radius: 531.1 },
  { id: 604, name: 'Dione', parent: 'Saturn', radius: 561.4 },
  { id: 605, name: 'Rhea', parent: 'Saturn', radius: 764.3 },
  { id: 606, name: 'Titan', parent: 'Saturn', radius: 2574.7 },
  { id: 607, name: 'Hyperion', parent: 'Saturn', radius: 135 },
  { id: 608, name: 'Iapetus', parent: 'Saturn', radius: 735.6 },
  { id: 609, name: 'Phoebe', parent: 'Saturn', radius: 106.5 },
  { id: 610, name: 'Janus', parent: 'Saturn', radius: 89.5 },
  { id: 611, name: 'Epimetheus', parent: 'Saturn', radius: 58.1 },
  { id: 612, name: 'Helene', parent: 'Saturn', radius: 17.6 },
  { id: 613, name: 'Telesto', parent: 'Saturn', radius: 12.4 },
  { id: 614, name: 'Calypso', parent: 'Saturn', radius: 10.7 },
  { id: 615, name: 'Atlas', parent: 'Saturn', radius: 15.1 },
  { id: 616, name: 'Prometheus', parent: 'Saturn', radius: 43.1 },
  { id: 617, name: 'Pandora', parent: 'Saturn', radius: 40.7 },
  { id: 618, name: 'Pan', parent: 'Saturn', radius: 14.1 },

  // Uranus - Major moons
  { id: 701, name: 'Ariel', parent: 'Uranus', radius: 578.9 },
  { id: 702, name: 'Umbriel', parent: 'Uranus', radius: 584.7 },
  { id: 703, name: 'Titania', parent: 'Uranus', radius: 788.9 },
  { id: 704, name: 'Oberon', parent: 'Uranus', radius: 761.4 },
  { id: 705, name: 'Miranda', parent: 'Uranus', radius: 235.8 },
  { id: 706, name: 'Cordelia', parent: 'Uranus', radius: 20.1 },
  { id: 707, name: 'Ophelia', parent: 'Uranus', radius: 21.4 },
  { id: 708, name: 'Bianca', parent: 'Uranus', radius: 25.7 },
  { id: 709, name: 'Cressida', parent: 'Uranus', radius: 39.8 },
  { id: 710, name: 'Desdemona', parent: 'Uranus', radius: 32 },
  { id: 711, name: 'Juliet', parent: 'Uranus', radius: 46.8 },
  { id: 712, name: 'Portia', parent: 'Uranus', radius: 67.6 },
  { id: 713, name: 'Rosalind', parent: 'Uranus', radius: 36 },
  { id: 715, name: 'Puck', parent: 'Uranus', radius: 81 },
  { id: 716, name: 'Caliban', parent: 'Uranus', radius: 36 },
  { id: 717, name: 'Sycorax', parent: 'Uranus', radius: 75 },

  // Neptune
  { id: 801, name: 'Triton', parent: 'Neptune', radius: 1353.4 },
  { id: 802, name: 'Nereid', parent: 'Neptune', radius: 170 },
  { id: 803, name: 'Naiad', parent: 'Neptune', radius: 33 },
  { id: 804, name: 'Thalassa', parent: 'Neptune', radius: 41 },
  { id: 805, name: 'Despina', parent: 'Neptune', radius: 75 },
  { id: 806, name: 'Galatea', parent: 'Neptune', radius: 88 },
  { id: 807, name: 'Larissa', parent: 'Neptune', radius: 97 },
  { id: 808, name: 'Proteus', parent: 'Neptune', radius: 210 },

  // Pluto
  { id: 901, name: 'Charon', parent: 'Pluto', radius: 606 },
  { id: 902, name: 'Nix', parent: 'Pluto', radius: 23 },
  { id: 903, name: 'Hydra', parent: 'Pluto', radius: 30.5 },
  { id: 904, name: 'Kerberos', parent: 'Pluto', radius: 9.5 },
  { id: 905, name: 'Styx', parent: 'Pluto', radius: 5.5 },
];

// Determine category based on radius
function getCategory(radius: number): MoonData['category'] {
  if (radius > 100) return 'major';
  if (radius > 10) return 'medium';
  return 'named';
}

// Fetch data from JPL Horizons API
function fetchHorizonsData(bodyId: number, parentId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Query for orbital elements relative to parent body
    const params = new URLSearchParams({
      format: 'text',
      COMMAND: `'${bodyId}'`,
      OBJ_DATA: 'YES',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'ELEMENTS',
      CENTER: `'500@${parentId}'`,  // Parent body center
      START_TIME: '2000-01-01',
      STOP_TIME: '2000-01-02',
      STEP_SIZE: '1d',
      REF_PLANE: 'ECLIPTIC',
      REF_SYSTEM: 'ICRF',
      OUT_UNITS: 'KM-D',
    });

    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`;

    https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(data));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// Parse Horizons output for orbital elements
function parseHorizonsElements(text: string): Partial<MoonData> | null {
  try {
    const lines = text.split('\n');

    // Find the ephemeris data section (after $$SOE)
    const soeIndex = lines.findIndex(l => l.includes('$$SOE'));
    const eoeIndex = lines.findIndex(l => l.includes('$$EOE'));

    if (soeIndex === -1 || eoeIndex === -1) {
      console.log('Could not find ephemeris data markers');
      return null;
    }

    // Parse orbital elements from the data section
    // Horizons outputs elements in a specific format
    const dataLines = lines.slice(soeIndex + 1, eoeIndex);

    let a: number | undefined;
    let e: number | undefined;
    let i: number | undefined;
    let Omega: number | undefined;
    let omega: number | undefined;
    let M0: number | undefined;
    let period: number | undefined;

    for (const line of dataLines) {
      // Parse each element - format varies but typically includes labels
      if (line.includes(' A =') || line.includes(' A=')) {
        const match = line.match(/A\s*=\s*([\d.E+-]+)/i);
        if (match) a = parseFloat(match[1]);
      }
      if (line.includes(' EC=') || line.includes(' EC =')) {
        const match = line.match(/EC\s*=\s*([\d.E+-]+)/i);
        if (match) e = parseFloat(match[1]);
      }
      if (line.includes(' IN=') || line.includes(' IN =')) {
        const match = line.match(/IN\s*=\s*([\d.E+-]+)/i);
        if (match) i = parseFloat(match[1]);
      }
      if (line.includes(' OM=') || line.includes(' OM =')) {
        const match = line.match(/OM\s*=\s*([\d.E+-]+)/i);
        if (match) Omega = parseFloat(match[1]);
      }
      if (line.includes(' W =') || line.includes(' W=')) {
        const match = line.match(/W\s*=\s*([\d.E+-]+)/i);
        if (match) omega = parseFloat(match[1]);
      }
      if (line.includes(' MA=') || line.includes(' MA =')) {
        const match = line.match(/MA\s*=\s*([\d.E+-]+)/i);
        if (match) M0 = parseFloat(match[1]);
      }
      if (line.includes(' PR=') || line.includes(' PR =')) {
        const match = line.match(/PR\s*=\s*([\d.E+-]+)/i);
        if (match) period = parseFloat(match[1]);
      }
    }

    if (a !== undefined && e !== undefined && i !== undefined) {
      return {
        a,
        e,
        i,
        Omega: Omega || 0,
        omega: omega || 0,
        M0: M0 || 0,
        period: period || 1,
      };
    }

    return null;
  } catch (err) {
    console.error('Error parsing Horizons data:', err);
    return null;
  }
}

// Get parent body ID from name
function getParentId(parentName: string): number {
  const parentIds: Record<string, number> = {
    'Earth': 399,
    'Mars': 499,
    'Jupiter': 599,
    'Saturn': 699,
    'Uranus': 799,
    'Neptune': 899,
    'Pluto': 999,
  };
  return parentIds[parentName] || 10;
}

// Sleep utility for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main function
async function main() {
  const outputPath = path.join(__dirname, '../src/data/moons.json');
  const moons: MoonData[] = [];

  console.log(`Fetching orbital data for ${MOON_IDS.length} moons from JPL Horizons...`);
  console.log('This may take a few minutes due to API rate limiting.\n');

  for (let idx = 0; idx < MOON_IDS.length; idx++) {
    const moon = MOON_IDS[idx];
    const parentId = getParentId(moon.parent);

    process.stdout.write(`[${idx + 1}/${MOON_IDS.length}] Fetching ${moon.name}... `);

    try {
      const response = await fetchHorizonsData(moon.id, parentId);
      const elements = parseHorizonsElements(response);

      if (elements && elements.a && elements.e !== undefined) {
        const moonData: MoonData = {
          name: moon.name,
          parentName: moon.parent,
          radius: moon.radius,
          a: elements.a,
          e: elements.e,
          i: elements.i || 0,
          Omega: elements.Omega || 0,
          omega: elements.omega || 0,
          M0: elements.M0 || 0,
          period: elements.period || 1,
          category: getCategory(moon.radius),
        };
        moons.push(moonData);
        console.log('OK');
      } else {
        console.log('FAILED (could not parse elements)');
        // Save response for debugging
        const debugPath = path.join(__dirname, `../debug_${moon.name}.txt`);
        fs.writeFileSync(debugPath, response);
        console.log(`  Debug output saved to ${debugPath}`);
      }
    } catch (err) {
      console.log(`FAILED: ${err}`);
    }

    // Rate limit: wait 500ms between requests
    await sleep(500);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(moons, null, 2));
  console.log(`\nWrote ${moons.length} moons to ${outputPath}`);

  if (moons.length < MOON_IDS.length) {
    console.log(`Warning: ${MOON_IDS.length - moons.length} moons failed to fetch.`);
  }
}

main().catch(console.error);
