/**
 * Satellite Data Fetch Script
 *
 * Downloads TLE data from CelesTrak and converts to our format.
 *
 * Usage:
 *   npx ts-node scripts/fetch-satellites.ts
 *
 * Output:
 *   src/data/satellites.json
 *
 * Data sources:
 *   https://celestrak.org/NORAD/elements/
 */

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SatelliteData {
  name: string;
  a: number;           // Semi-major axis (km)
  e: number;           // Eccentricity
  i: number;           // Inclination (degrees)
  Omega: number;       // RAAN (degrees)
  omega: number;       // Argument of perigee (degrees)
  M0: number;          // Mean anomaly at epoch (degrees)
  n: number;           // Mean motion (degrees/day)
  epoch: number;       // Julian date of epoch
  category: string;    // LEO, GEO, MEO, etc.
}

// Earth constants
const EARTH_MU = 398600.4418;  // km^3/s^2
const EARTH_RADIUS = 6378.137;  // km

// TLE URLs from CelesTrak
const TLE_SOURCES = {
  stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  geostationary: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle',
  // Note: Starlink is very large, we'll sample it
  starlink: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
  gps: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle',
  galileo: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle',
};

// Parse TLE epoch
function parseTLEEpoch(epochStr: string): number {
  const year2digit = parseInt(epochStr.substring(0, 2), 10);
  const year = year2digit < 57 ? 2000 + year2digit : 1900 + year2digit;
  const dayOfYear = parseFloat(epochStr.substring(2));

  const a = Math.floor((14 - 1) / 12);
  const y = year + 4800 - a;
  const m = 1 + 12 * a - 3;
  const jd0 = 1 + Math.floor((153 * m + 2) / 5) + 365 * y +
              Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

  return jd0 + dayOfYear - 1;
}

// Parse a single TLE set
function parseTLE(name: string, line1: string, line2: string): SatelliteData | null {
  try {
    // Line 1 parsing
    const epochStr = line1.substring(18, 32).trim();
    const epoch = parseTLEEpoch(epochStr);

    // Line 2 parsing
    const i = parseFloat(line2.substring(8, 16).trim());
    const Omega = parseFloat(line2.substring(17, 25).trim());
    const e = parseFloat('0.' + line2.substring(26, 33).trim());
    const omega = parseFloat(line2.substring(34, 42).trim());
    const M0 = parseFloat(line2.substring(43, 51).trim());
    const nRevPerDay = parseFloat(line2.substring(52, 63).trim());

    // Convert and calculate
    const n = nRevPerDay * 360;  // degrees per day
    const nRadPerSec = (nRevPerDay * 2 * Math.PI) / 86400;
    const a = Math.pow(EARTH_MU / (nRadPerSec * nRadPerSec), 1/3);

    // Determine category
    const altitude = a - EARTH_RADIUS;
    let category: string;
    if (altitude < 2000) {
      category = 'LEO';
    } else if (altitude > 35000 && altitude < 37000) {
      category = 'GEO';
    } else if (altitude >= 2000 && altitude < 35000) {
      category = 'MEO';
    } else {
      category = 'OTHER';
    }

    return { name: name.trim(), a, e, i, Omega, omega, M0, n, epoch, category };
  } catch {
    return null;
  }
}

// Parse TLE text into satellite data
function parseTLEText(text: string): SatelliteData[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const satellites: SatelliteData[] = [];

  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    if (line1 && line1.startsWith('1 ') && line2 && line2.startsWith('2 ')) {
      const sat = parseTLE(name, line1, line2);
      if (sat) satellites.push(sat);
    }
  }

  return satellites;
}

// Download file
function downloadFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(data));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// Generate sample satellite data (for offline use)
function generateSampleData(): SatelliteData[] {
  console.log('Generating sample satellite data...');

  // Sample well-known satellites
  const satellites: SatelliteData[] = [
    // ISS
    {
      name: 'ISS (ZARYA)',
      a: 6797.0,
      e: 0.0001,
      i: 51.6,
      Omega: 120.0,
      omega: 0.0,
      M0: 0.0,
      n: 5693.0,  // ~93 min orbit
      epoch: 2460000,
      category: 'LEO',
    },
    // Hubble
    {
      name: 'HST (Hubble)',
      a: 6914.0,
      e: 0.0003,
      i: 28.5,
      Omega: 200.0,
      omega: 90.0,
      M0: 180.0,
      n: 5544.0,  // ~96 min orbit
      epoch: 2460000,
      category: 'LEO',
    },
    // Tiangong
    {
      name: 'TIANGONG',
      a: 6770.0,
      e: 0.0001,
      i: 41.5,
      Omega: 300.0,
      omega: 45.0,
      M0: 90.0,
      n: 5728.0,
      epoch: 2460000,
      category: 'LEO',
    },
  ];

  // Add sample GEO satellites
  for (let i = 0; i < 36; i++) {
    satellites.push({
      name: `GEO-${i + 1}`,
      a: 42164.0,  // GEO altitude
      e: 0.0001,
      i: 0.1,
      Omega: i * 10,  // Spread around the equator
      omega: 0,
      M0: Math.random() * 360,
      n: 360.985,  // ~24 hour orbit
      epoch: 2460000,
      category: 'GEO',
    });
  }

  // Add sample LEO satellites (like Starlink distribution)
  for (let shell = 0; shell < 3; shell++) {
    const altitude = 340 + shell * 100;  // 340, 440, 540 km
    const a = EARTH_RADIUS + altitude;
    const nRadPerSec = Math.sqrt(EARTH_MU / Math.pow(a, 3));
    const n = (nRadPerSec * 86400 / (2 * Math.PI)) * 360;

    for (let plane = 0; plane < 6; plane++) {
      const inclination = 53 + shell * 10;
      const Omega = plane * 60;

      for (let sat = 0; sat < 10; sat++) {
        satellites.push({
          name: `LEO-${shell}-${plane}-${sat}`,
          a,
          e: 0.0001,
          i: inclination,
          Omega,
          omega: 0,
          M0: sat * 36,  // Spread in plane
          n,
          epoch: 2460000,
          category: 'LEO',
        });
      }
    }
  }

  return satellites;
}

// Main function
async function main() {
  const outputPath = path.join(__dirname, '../src/data/satellites.json');
  let satellites: SatelliteData[] = [];

  try {
    // Try to download from CelesTrak
    console.log('Attempting to fetch satellite data from CelesTrak...');
    console.log('Note: This may fail due to rate limiting or network issues.');
    console.log('In that case, sample data will be generated.\n');

    // Fetch space stations (small, high priority)
    try {
      const stationsData = await downloadFile(TLE_SOURCES.stations);
      satellites.push(...parseTLEText(stationsData));
      console.log(`Fetched ${satellites.length} space stations`);
    } catch (err) {
      console.log('Could not fetch stations:', err);
    }

    // Fetch GPS satellites
    try {
      const gpsData = await downloadFile(TLE_SOURCES.gps);
      const gpsSats = parseTLEText(gpsData);
      satellites.push(...gpsSats);
      console.log(`Fetched ${gpsSats.length} GPS satellites`);
    } catch (err) {
      console.log('Could not fetch GPS:', err);
    }

    // If we got nothing, use sample data
    if (satellites.length === 0) {
      console.log('\nNo satellites fetched, generating sample data...');
      satellites = generateSampleData();
    }
  } catch (error) {
    console.error('Error fetching data, using generated sample:', error);
    satellites = generateSampleData();
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(satellites, null, 2));
  console.log(`\nWrote ${satellites.length} satellites to ${outputPath}`);

  // Summary
  const categories = satellites.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nCategory breakdown:');
  for (const [cat, count] of Object.entries(categories)) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch(console.error);

// Export for use as module
export { SatelliteData, parseTLE, parseTLEText, generateSampleData };
