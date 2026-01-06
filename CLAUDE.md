# 2D Solar System Tracker

## Vision
Top-down solar system visualization. Clean, elegant, geometric like Mini Metro. Comprehensive object coverage (planets, dwarf planets, moons, asteroids, comets, probes).

## Tech Stack
- **Vanilla TypeScript + Vite** - no framework overhead
- **HTML5 Canvas 2D** - smooth zoom/pan
- **Keplerian orbital mechanics** - calculate positions from orbital elements

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
│   ├── moons.ts            # Moon orbital data (20 moons)
│   ├── probes.ts           # Space probes with segmented orbits
│   └── comets.ts           # Comet orbital data
scripts/
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

### Parent Occlusion
Bodies fade out when visually inside their parent's minimum display size.
Labels fade earlier (32-64px from parent edge).

## Current Status (Phase 2 Complete)
- [x] Canvas with zoom/pan
- [x] 8 planets with real orbital data
- [x] Time simulation with speed controls
- [x] Dwarf planets (Pluto, Ceres, Eris, Makemake, Haumea)
- [x] Major moons (20 moons: Moon, Galilean, Titan, Triton, etc.)
- [x] Asteroid belt with LOD (10,000 asteroids)
- [x] Notable comets (Halley, Hale-Bopp, NEOWISE, etc.)
- [x] Space probes (Voyager 1&2, New Horizons, Pioneer 10&11)
- [x] Custom probe icon (white cylinder + solar panels)
- [x] Data fetch scripts for asteroids and satellites

## Future Features
- [ ] Earth satellites (LEO, GEO) visible when zoomed to Earth
- [ ] Click for object info popups
- [ ] Search & highlight
- [ ] Reverse time
- [ ] Jump to specific date
- [ ] Scale reference overlay

## Data Sources
- **Planets**: NASA JPL Horizons (https://ssd.jpl.nasa.gov/planets/approx_pos.html)
- **Asteroids**: Minor Planet Center MPCORB (https://www.minorplanetcenter.net/)
- **Satellites**: CelesTrak TLE (https://celestrak.org/)
- **Comets**: NASA JPL Small-Body Database

## Regenerating Data
```bash
npx ts-node scripts/fetch-asteroids.ts 10000
npx ts-node scripts/fetch-satellites.ts
```
