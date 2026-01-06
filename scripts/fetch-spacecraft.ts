/**
 * Spacecraft Data Fetch Script
 *
 * Downloads orbital elements from NASA JPL Horizons API.
 *
 * Usage:
 *   npx ts-node scripts/fetch-spacecraft.ts
 *
 * Output:
 *   src/data/spacecraft.json
 *
 * Data source:
 *   https://ssd.jpl.nasa.gov/api/horizons.api
 *   Documentation: https://ssd-api.jpl.nasa.gov/doc/horizons.html
 *
 * IMPORTANT: This script fetches REAL data from NASA JPL.
 * No fake or procedurally generated orbital data is used.
 */

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Spacecraft types
type SpacecraftType = 'deep_space' | 'earth_orbiter' | 'planetary_orbiter' | 'lander';
type SpacecraftStatus = 'active' | 'ended' | 'planned';
type IconType = 'probe' | 'orbiter' | 'telescope' | 'rover';

// Output data structure
interface SpacecraftData {
  name: string;
  spkid: number;
  missionType: SpacecraftType;
  status: SpacecraftStatus;
  iconType: IconType;
  launchJD: number;
  endJD?: number;
  parentName?: string;  // For planetary orbiters

  // Heliocentric orbital elements (AU-based)
  elements?: {
    a: number;      // Semi-major axis (AU)
    e: number;      // Eccentricity
    i: number;      // Inclination (degrees)
    L: number;      // Mean longitude (degrees)
    longPeri: number;  // Longitude of perihelion (degrees)
    longNode: number;  // Longitude of ascending node (degrees)
    LDot: number;      // Mean longitude rate (degrees/century)
  };

  // Parent-centric elements (km-based, for planetary orbiters)
  parentCentricElements?: {
    a: number;      // Semi-major axis (km)
    e: number;      // Eccentricity
    i: number;      // Inclination (degrees)
    M0: number;     // Mean anomaly at epoch (degrees)
    omega: number;  // Argument of periapsis (degrees)
    Omega: number;  // Longitude of ascending node (degrees)
    n: number;      // Mean motion (degrees/day)
    epoch: number;  // Epoch as Julian date
  };
}

// Julian date constants
const J2000 = 2451545.0;

// Convert date string to Julian date
function dateToJD(dateStr: string): number {
  const date = new Date(dateStr);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;

  return day + Math.floor((153 * m + 2) / 5) + 365 * y +
         Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

// Comprehensive list of spacecraft with real SPK IDs
// Source: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html
const SPACECRAFT_CATALOG: Array<{
  spkid: number;
  name: string;
  type: SpacecraftType;
  status: SpacecraftStatus;
  iconType: IconType;
  launchDate: string;
  endDate?: string;
  parentName?: string;
  center: string;  // Horizons center code for queries
}> = [
  // === ACTIVE DEEP SPACE MISSIONS ===

  // Voyager Program (still active, transmitting from interstellar space)
  { spkid: -31, name: 'Voyager 1', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '1977-09-05', center: '500@10' },
  { spkid: -32, name: 'Voyager 2', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '1977-08-20', center: '500@10' },

  // New Horizons (Pluto flyby, now in Kuiper Belt)
  { spkid: -98, name: 'New Horizons', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2006-01-19', center: '500@10' },

  // James Webb Space Telescope (at L2)
  { spkid: -170, name: 'JWST', type: 'deep_space', status: 'active', iconType: 'telescope',
    launchDate: '2021-12-25', center: '500@10' },

  // Parker Solar Probe
  { spkid: -96, name: 'Parker Solar Probe', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2018-08-12', center: '500@10' },

  // Solar Orbiter (ESA/NASA)
  { spkid: -144, name: 'Solar Orbiter', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2020-02-10', center: '500@10' },

  // STEREO (Solar observation)
  { spkid: -234, name: 'STEREO-A', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2006-10-26', center: '500@10' },

  // === MARS MISSIONS ===

  // Mars Reconnaissance Orbiter
  { spkid: -74, name: 'Mars Reconnaissance Orbiter', type: 'planetary_orbiter', status: 'active', iconType: 'orbiter',
    launchDate: '2005-08-12', parentName: 'Mars', center: '500@499' },

  // Mars Odyssey (longest-serving spacecraft at Mars)
  { spkid: -53, name: 'Mars Odyssey', type: 'planetary_orbiter', status: 'active', iconType: 'orbiter',
    launchDate: '2001-04-07', parentName: 'Mars', center: '500@499' },

  // MAVEN (Mars atmosphere study)
  { spkid: -202, name: 'MAVEN', type: 'planetary_orbiter', status: 'active', iconType: 'orbiter',
    launchDate: '2013-11-18', parentName: 'Mars', center: '500@499' },

  // Mars Express (ESA)
  { spkid: -41, name: 'Mars Express', type: 'planetary_orbiter', status: 'active', iconType: 'orbiter',
    launchDate: '2003-06-02', parentName: 'Mars', center: '500@499' },

  // ExoMars TGO (ESA)
  { spkid: -143, name: 'ExoMars TGO', type: 'planetary_orbiter', status: 'active', iconType: 'orbiter',
    launchDate: '2016-03-14', parentName: 'Mars', center: '500@499' },

  // === OUTER PLANET MISSIONS ===

  // Juno (Jupiter orbiter)
  { spkid: -61, name: 'Juno', type: 'planetary_orbiter', status: 'active', iconType: 'orbiter',
    launchDate: '2011-08-05', parentName: 'Jupiter', center: '500@599' },

  // === ASTEROID/COMET MISSIONS ===

  // Lucy (Trojan asteroid mission)
  { spkid: -49, name: 'Lucy', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2021-10-16', center: '500@10' },

  // Psyche (asteroid mission)
  { spkid: -255, name: 'Psyche', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2023-10-13', center: '500@10' },

  // === LUNAR MISSIONS ===

  // Lunar Reconnaissance Orbiter
  { spkid: -85, name: 'Lunar Reconnaissance Orbiter', type: 'planetary_orbiter', status: 'active', iconType: 'orbiter',
    launchDate: '2009-06-18', parentName: 'Moon', center: '500@301' },

  // === EARTH OBSERVATION (Heliocentric transfer/distant) ===

  // DSCOVR (at L1)
  { spkid: -135, name: 'DSCOVR', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2015-02-11', center: '500@10' },

  // === HISTORICAL MISSIONS (ENDED) ===

  // Pioneer Program (still traveling on escape trajectories, just lost contact)
  { spkid: -23, name: 'Pioneer 10', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '1972-03-03', center: '500@10' },
  { spkid: -24, name: 'Pioneer 11', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '1973-04-06', center: '500@10' },

  // Cassini-Huygens (Saturn)
  { spkid: -82, name: 'Cassini', type: 'planetary_orbiter', status: 'ended', iconType: 'orbiter',
    launchDate: '1997-10-15', endDate: '2017-09-15', parentName: 'Saturn', center: '500@10' },

  // Galileo (Jupiter)
  { spkid: -77, name: 'Galileo', type: 'planetary_orbiter', status: 'ended', iconType: 'orbiter',
    launchDate: '1989-10-18', endDate: '2003-09-21', parentName: 'Jupiter', center: '500@10' },

  // Ulysses (Solar polar mission)
  { spkid: -55, name: 'Ulysses', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '1990-10-06', endDate: '2009-06-30', center: '500@10' },

  // MESSENGER (Mercury)
  { spkid: -236, name: 'MESSENGER', type: 'planetary_orbiter', status: 'ended', iconType: 'orbiter',
    launchDate: '2004-08-03', endDate: '2015-04-30', parentName: 'Mercury', center: '500@10' },

  // Dawn (Vesta/Ceres)
  { spkid: -203, name: 'Dawn', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '2007-09-27', endDate: '2018-11-01', center: '500@10' },

  // Rosetta (Comet 67P)
  { spkid: -226, name: 'Rosetta', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '2004-03-02', endDate: '2016-09-30', center: '500@10' },

  // Deep Impact/EPOXI
  { spkid: -140, name: 'Deep Impact', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '2005-01-12', endDate: '2013-08-08', center: '500@10' },

  // Stardust
  { spkid: -29, name: 'Stardust', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '1999-02-07', endDate: '2011-03-24', center: '500@10' },

  // NEAR Shoemaker
  { spkid: -93, name: 'NEAR Shoemaker', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '1996-02-17', endDate: '2001-02-28', center: '500@10' },

  // Genesis
  { spkid: -47, name: 'Genesis', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '2001-08-08', endDate: '2004-09-08', center: '500@10' },

  // Hayabusa (original)
  { spkid: -37, name: 'Hayabusa', type: 'deep_space', status: 'ended', iconType: 'probe',
    launchDate: '2003-05-09', endDate: '2010-06-13', center: '500@10' },

  // Hayabusa2
  { spkid: -164, name: 'Hayabusa2', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2014-12-03', center: '500@10' },

  // OSIRIS-REx (now OSIRIS-APEX)
  { spkid: -64, name: 'OSIRIS-REx', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2016-09-08', center: '500@10' },

  // BepiColombo (en route to Mercury)
  { spkid: -121, name: 'BepiColombo', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2018-10-20', center: '500@10' },

  // JUICE (en route to Jupiter)
  { spkid: -28, name: 'JUICE', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2023-04-14', center: '500@10' },

  // Europa Clipper (launched Oct 2024)
  { spkid: -159, name: 'Europa Clipper', type: 'deep_space', status: 'active', iconType: 'probe',
    launchDate: '2024-10-14', center: '500@10' },

  // Kepler Space Telescope
  { spkid: -227, name: 'Kepler', type: 'deep_space', status: 'ended', iconType: 'telescope',
    launchDate: '2009-03-07', endDate: '2018-10-30', center: '500@10' },

  // Spitzer Space Telescope
  { spkid: -79, name: 'Spitzer', type: 'deep_space', status: 'ended', iconType: 'telescope',
    launchDate: '2003-08-25', endDate: '2020-01-30', center: '500@10' },

  // WISE/NEOWISE
  { spkid: -163, name: 'NEOWISE', type: 'earth_orbiter', status: 'ended', iconType: 'telescope',
    launchDate: '2009-12-14', endDate: '2024-08-08', center: '500@10' },

  // Akatsuki (Venus)
  { spkid: -248, name: 'Akatsuki', type: 'planetary_orbiter', status: 'active', iconType: 'orbiter',
    launchDate: '2010-05-20', parentName: 'Venus', center: '500@299' },

  // Chandrayaan-3 (Moon)
  { spkid: -156, name: 'Chandrayaan-3', type: 'planetary_orbiter', status: 'ended', iconType: 'lander',
    launchDate: '2023-07-14', endDate: '2023-09-02', parentName: 'Moon', center: '500@301' },
];

// Parse Horizons API text response to extract orbital elements
// Format (after $$SOE):
// JDTDB date line
//  EC= eccentricity  QR= perihelion  IN= inclination
//  OM= RAAN  W= arg perihelion  Tp= time of perihelion
//  N= mean motion  MA= mean anomaly  TA= true anomaly
//  A= semi-major axis  AD= aphelion  PR= period
function parseHorizonsElements(text: string): {
  a: number;
  e: number;
  i: number;
  Omega: number;
  omega: number;
  M: number;
  n: number;
} | null {
  try {
    // Find the SOE (Start Of Ephemeris) marker
    const soeIndex = text.indexOf('$$SOE');
    const eoeIndex = text.indexOf('$$EOE');

    if (soeIndex === -1 || eoeIndex === -1) {
      console.error('Could not find ephemeris markers in response');
      return null;
    }

    const ephemerisData = text.substring(soeIndex + 5, eoeIndex).trim();

    // Parse labeled values from the ephemeris data
    // Format: EC= value QR= value IN= value etc.
    const parseValue = (pattern: RegExp): number => {
      const match = ephemerisData.match(pattern);
      return match ? parseFloat(match[1]) : NaN;
    };

    const e = parseValue(/EC=\s*([-\d.E+]+)/);
    const i = parseValue(/IN=\s*([-\d.E+]+)/);
    const Omega = parseValue(/OM=\s*([-\d.E+]+)/);
    const omega = parseValue(/W\s*=\s*([-\d.E+]+)/);
    const M = parseValue(/MA=\s*([-\d.E+]+)/);
    const a = parseValue(/\sA\s*=\s*([-\d.E+]+)/);  // Space before A to avoid matching MA=
    const n = parseValue(/\sN\s*=\s*([-\d.E+]+)/);  // Space before N to avoid matching IN=
    // Note: N is already in deg/day when using AU-D output units

    // Validate we got the minimum required elements
    if (isNaN(a) || isNaN(e)) {
      console.error('Could not parse orbital elements');
      console.error('  a:', a, 'e:', e, 'i:', i);
      return null;
    }

    // Convert semi-major axis from km to AU for heliocentric (if > 1e6 km, assume km)
    // The API returns in km when using km-d units
    const AU_KM = 149597870.7;
    const aAU = Math.abs(a) > 1e6 ? a / AU_KM : a;

    return {
      a: aAU,
      e: isNaN(e) ? 0 : e,
      i: isNaN(i) ? 0 : i,
      Omega: isNaN(Omega) ? 0 : Omega,
      omega: isNaN(omega) ? 0 : omega,
      M: isNaN(M) ? 0 : M,
      n: isNaN(n) ? 0 : n,
    };
  } catch (err) {
    console.error('Error parsing Horizons response:', err);
    return null;
  }
}

// Make HTTPS request with URL encoding
function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`  Fetching: ${url.substring(0, 100)}...`);

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          httpsGet(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(data));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// Convert Julian Date to calendar date string
function jdToDateStr(jd: number): string {
  const z = Math.floor(jd + 0.5);
  const A = Math.floor((z - 1867216.25) / 36524.25);
  const B = z + 1 + A - Math.floor(A / 4);
  const C = B + 1524;
  const D = Math.floor((C - 122.1) / 365.25);
  const E = Math.floor(365.25 * D);
  const G = Math.floor((C - E) / 30.6001);

  const day = C - E - Math.floor(30.6001 * G);
  const month = G < 14 ? G - 1 : G - 13;
  const year = month > 2 ? D - 4716 : D - 4715;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Fetch orbital elements from JPL Horizons API
async function fetchFromHorizons(
  spkid: number,
  center: string,
  epochJD: number
): Promise<{
  a: number;
  e: number;
  i: number;
  Omega: number;
  omega: number;
  M: number;
  n: number;
} | null> {
  // Convert JD to calendar date for the API
  const startDate = jdToDateStr(epochJD);
  const stopDate = jdToDateStr(epochJD + 2);  // Two days later

  // Build Horizons API URL
  // Use AU-D units for heliocentric, KM-S for planet-centric
  const isHeliocentric = center === '500@10';
  const params = new URLSearchParams({
    'format': 'text',
    'COMMAND': `'${spkid}'`,
    'EPHEM_TYPE': 'ELEMENTS',
    'CENTER': center,
    'START_TIME': startDate,
    'STOP_TIME': stopDate,
    'STEP_SIZE': '1d',
    'REF_PLANE': 'ECLIPTIC',
    'REF_SYSTEM': 'ICRF',
    'OUT_UNITS': isHeliocentric ? 'AU-D' : 'KM-S',
    'ELM_LABELS': 'YES',
    'CSV_FORMAT': 'NO',
  });

  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`;

  try {
    const response = await httpsGet(url);
    return parseHorizonsElements(response);
  } catch (err) {
    console.error(`  Failed to fetch ${spkid}: ${err}`);
    return null;
  }
}

// Rate limiter to avoid overwhelming the API
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main function
async function main() {
  const outputPath = path.join(__dirname, '../src/data/spacecraft.json');
  const epochJD = J2000 + (new Date().getTime() / 86400000 - 10957.5);  // Current date as JD

  console.log('=== JPL Horizons Spacecraft Fetch ===');
  console.log(`Epoch: JD ${epochJD.toFixed(1)} (${new Date().toISOString().split('T')[0]})`);
  console.log(`Fetching ${SPACECRAFT_CATALOG.length} spacecraft...\n`);

  const spacecraft: SpacecraftData[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const craft of SPACECRAFT_CATALOG) {
    console.log(`[${successCount + failCount + 1}/${SPACECRAFT_CATALOG.length}] ${craft.name} (SPK ${craft.spkid})`);

    // Fetch orbital elements
    const elements = await fetchFromHorizons(craft.spkid, craft.center, epochJD);

    if (elements) {
      const data: SpacecraftData = {
        name: craft.name,
        spkid: craft.spkid,
        missionType: craft.type,
        status: craft.status,
        iconType: craft.iconType,
        launchJD: dateToJD(craft.launchDate),
        endJD: craft.endDate ? dateToJD(craft.endDate) : undefined,
        parentName: craft.parentName,
      };

      // Convert elements to our format
      if (craft.parentName && craft.center !== '500@10') {
        // Parent-centric (km-based)
        data.parentCentricElements = {
          a: elements.a,
          e: elements.e,
          i: elements.i,
          M0: elements.M,
          omega: elements.omega,
          Omega: elements.Omega,
          n: elements.n,
          epoch: epochJD,
        };
      } else {
        // Heliocentric (AU-based)
        // Convert from omega/Omega/M to L/longPeri/longNode format
        const longNode = elements.Omega;
        const longPeri = elements.Omega + elements.omega;

        // Mean motion: convert from deg/day to deg/century
        const LDot = elements.n * 36525;

        // L at query epoch
        const L_at_epoch = longPeri + elements.M;

        // Back-calculate L to J2000 reference frame
        // kepler.ts calculates position as: L + LDot * T where T = (julianDate - J2000) / 36525
        // So we need L at J2000, not at query epoch
        const T_epoch = (epochJD - J2000) / 36525;  // Centuries from J2000 to query epoch
        const L = L_at_epoch - LDot * T_epoch;

        data.elements = {
          a: elements.a,
          e: elements.e,
          i: elements.i,
          L: L,
          longPeri: longPeri,
          longNode: longNode,
          LDot: LDot,
        };
      }

      spacecraft.push(data);
      successCount++;
      console.log(`  ✓ a=${elements.a.toFixed(4)} e=${elements.e.toFixed(4)}`);
    } else {
      failCount++;
      console.log(`  ✗ Failed to fetch`);
    }

    // Rate limit: 500ms between requests
    await delay(500);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  const output = {
    generatedAt: new Date().toISOString(),
    epochJD: epochJD,
    source: 'NASA JPL Horizons API',
    spacecraft: spacecraft,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n=== Complete ===`);
  console.log(`Success: ${successCount}/${SPACECRAFT_CATALOG.length}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Output: ${outputPath}`);

  // Summary by type
  const byType = spacecraft.reduce((acc, s) => {
    acc[s.missionType] = (acc[s.missionType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nBy mission type:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  const byStatus = spacecraft.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nBy status:');
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }
}

main().catch(console.error);

// Export types for use as module
export type { SpacecraftData };
export { SPACECRAFT_CATALOG };
