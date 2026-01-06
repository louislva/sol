# Data Fetch Scripts

Scripts for downloading and processing orbital data for the solar system visualization.

## Prerequisites

```bash
npm install
```

## Scripts

### fetch-asteroids.ts

Downloads asteroid orbital elements from NASA JPL / Minor Planet Center.

```bash
npx ts-node scripts/fetch-asteroids.ts [count]
```

- **Default count**: 10,000 asteroids
- **Output**: `src/data/asteroids.json`
- **Data source**: MPCORB database (https://www.minorplanetcenter.net/iau/MPCORB/)

Note: The full MPCORB.DAT file is ~300MB. The script generates sample data by default.
For real data, download MPCORB.DAT manually and modify the script to parse it.

### fetch-satellites.ts

Downloads satellite TLE data from CelesTrak.

```bash
npx ts-node scripts/fetch-satellites.ts
```

- **Output**: `src/data/satellites.json`
- **Data sources**:
  - Space stations: https://celestrak.org/NORAD/elements/gp.php?GROUP=stations
  - GPS satellites: https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops
  - Geostationary: https://celestrak.org/NORAD/elements/gp.php?GROUP=geo

Note: CelesTrak may rate-limit requests. If downloads fail, sample data is generated.

## Data Formats

### Asteroid Data (asteroids.json)

```json
{
  "name": "Vesta",      // Optional, only for named asteroids
  "a": 2.362,           // Semi-major axis (AU)
  "e": 0.089,           // Eccentricity
  "i": 7.14,            // Inclination (degrees)
  "Omega": 103.8,       // Longitude of ascending node (degrees)
  "omega": 149.8,       // Argument of perihelion (degrees)
  "M0": 20,             // Mean anomaly at epoch (degrees)
  "n": 0.272            // Mean motion (degrees/day)
}
```

### Satellite Data (satellites.json)

```json
{
  "name": "ISS (ZARYA)",
  "a": 6797.0,          // Semi-major axis (km)
  "e": 0.0001,          // Eccentricity
  "i": 51.6,            // Inclination (degrees)
  "Omega": 120.0,       // RAAN (degrees)
  "omega": 0.0,         // Argument of perigee (degrees)
  "M0": 0.0,            // Mean anomaly at epoch (degrees)
  "n": 5693.0,          // Mean motion (degrees/day)
  "epoch": 2460000,     // Julian date of epoch
  "category": "LEO"     // LEO, MEO, GEO, or OTHER
}
```

## Regenerating Data

To update the data files with fresh orbital elements:

```bash
# Update asteroid data
npx ts-node scripts/fetch-asteroids.ts 10000

# Update satellite data
npx ts-node scripts/fetch-satellites.ts
```

## External Data Sources

- **Minor Planet Center**: https://www.minorplanetcenter.net/
- **NASA JPL Horizons**: https://ssd.jpl.nasa.gov/horizons/
- **CelesTrak**: https://celestrak.org/
- **Space-Track**: https://www.space-track.org/ (requires registration)
