# 2D Solar System Tracker

## Vision
Top-down solar system visualization. Clean, elegant, geometric like Mini Metro. Comprehensive object coverage (planets, dwarf planets, moons, asteroids, comets, probes).

## Tech Stack
- **Vanilla TypeScript + Vite** - no framework overhead
- **HTML5 Canvas 2D** - smooth zoom/pan
- **Keplerian orbital mechanics** - calculate positions from orbital elements

## IMPORTANT: Data Integrity
**NEVER generate fake or placeholder data.** All orbital data must come from authoritative sources:
- NASA JPL Horizons / Small-Body Database
- Minor Planet Center
- IAU official sources

If data is not available, either:
1. Write a fetch script to get real data
2. Leave the object out until real data can be obtained

Random/procedural generation of orbital parameters is NOT acceptable.

## Development
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npx tsc --noEmit # Type check
```

## Visual Design
- Background: `#000000` (black)
- Orbits: Body color with low opacity
- Sun: `#ffff00` (yellow)
- Planets: Distinct colors per planet
- Probes: White icon (cylinder + solar panels)

## Architecture
```
src/
├── main.ts                 # Entry point, combines all bodies
├── style.css               # Dark theme
├── core/
│   ├── camera.ts           # Zoom/pan, coordinate transforms
│   ├── renderer.ts         # Canvas drawing, LOD asteroid rendering
│   └── time.ts             # Time simulation, speed controls
├── astronomy/
│   ├── kepler.ts           # Orbital mechanics (heliocentric + parent-centric)
│   ├── bodies.ts           # CelestialBody interface, planets, dwarf planets
│   ├── constants.ts        # AU, colors, min display sizes
│   ├── asteroidBelt.ts     # LOD system for 10,000+ asteroids
│   └── tle.ts              # TLE parsing for satellites
├── data/
│   ├── moons.json          # Moon orbital data from JPL (66 moons)
│   ├── moons.ts            # Moon data loader and filtering
│   ├── probes.ts           # Space probes with segmented orbits (legacy)
│   ├── spacecraft.json     # Spacecraft data from JPL Horizons (29+ missions)
│   ├── spacecraft.ts       # Spacecraft loader with timeline filtering
│   ├── satellites.json     # Earth satellite TLE data from CelesTrak (64 satellites)
│   ├── satellites.ts       # Satellite data loader and filtering
│   └── comets.ts           # Comet orbital data
scripts/
├── fetch-moons.ts          # Download moon data from JPL Horizons
├── fetch-spacecraft.ts     # Download spacecraft data from JPL Horizons
├── fetch-asteroids.ts      # Download MPCORB asteroid data
├── fetch-satellites.ts     # Download TLE satellite data
└── README.md               # Data regeneration docs
```

## Key Design Decisions

### True Scale with Minimum Size
All objects at real size (km), clamped to minimum pixel sizes when zoomed out:
- Sun: 20px min
- Planets: 4px min
- Dwarf planets/moons: 3px min
- Asteroids/comets: 2px min
- Probes: 8px min (custom icon)

### Hierarchical Positioning
- `OrbitalElements` - heliocentric orbits (AU-based, planets/comets/asteroids)
- `ParentCentricElements` - parent-relative orbits (km-based, moons/satellites)
- `parentName` field links child to parent body
- Recursive position resolution in `getBodyPosition()`

### Segmented Orbits
For objects with trajectory changes (gravity assists):
```typescript
segments: [
  { startJD, endJD, elements: OrbitalElements },
  // ... more segments
]
```

### Asteroid Belt LOD
- **Zoomed out (>20 AU)**: Statistical ring overlay
- **Medium zoom**: ~500 sampled asteroids
- **Zoomed in**: Up to 2000 asteroids in viewport

### Satellite LOD
- **Zoomed out**: Satellites hidden for performance
- **Zoomed to Earth (>30px Earth radius)**: 64 satellites visible (LEO, MEO, GEO)
- Satellites use TLE (Two-Line Element) orbital data from CelesTrak
- Categories: LEO (red), MEO (blue), GEO (green)

### Parent Occlusion
Bodies fade out when visually inside their parent's minimum display size.
Labels fade earlier (32-64px from parent edge).

## Current Status (Phase 3 In Progress)
- [x] Canvas with zoom/pan
- [x] 8 planets with real orbital data
- [x] Time simulation with speed controls
- [x] Dwarf planets (Pluto, Ceres, Eris, Makemake, Haumea)
- [x] Major moons (66 moons from JPL Horizons)
- [x] Asteroid belt with LOD (10,000 asteroids)
- [x] Notable comets (Halley, Hale-Bopp, NEOWISE, etc.)
- [x] Space probes from JPL Horizons (29+ missions with real ephemerides)
- [x] Custom spacecraft icons (probe, telescope, orbiter, rover)
- [x] Timeline filtering (spacecraft appear/disappear based on mission dates)
- [x] Data fetch scripts for asteroids, satellites, and spacecraft
- [x] Earth satellites (64 satellites: LEO, MEO, GEO) with LOD visibility

## Future Features
- [ ] Click for object info popups
- [ ] Search & highlight
- [ ] Reverse time
- [ ] Jump to specific date
- [ ] Scale reference overlay

## Data Sources
- **Planets**: NASA JPL Horizons (https://ssd.jpl.nasa.gov/planets/approx_pos.html)
- **Moons**: NASA JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api)
- **Spacecraft**: NASA JPL Horizons API (orbital elements for 29+ missions)
- **Asteroids**: Minor Planet Center MPCORB (https://www.minorplanetcenter.net/)
- **Satellites**: CelesTrak TLE (https://celestrak.org/)
- **Comets**: NASA JPL Small-Body Database

## Regenerating Data
```bash
npx tsx scripts/fetch-moons.ts        # Fetch moon data from JPL Horizons
npx tsx scripts/fetch-spacecraft.ts   # Fetch spacecraft data from JPL Horizons
npx ts-node scripts/fetch-asteroids.ts 10000
npx ts-node scripts/fetch-satellites.ts
```
