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
- For stars and the Galaxy: SIMBAD (CDS), the IAU WGSN, and peer-reviewed papers

If data is not available, either:
1. Write a fetch script to get real data
2. Leave the object out until real data can be obtained

Random/procedural generation of orbital parameters is NOT acceptable.

## Development
```bash
npm run dev        # Start dev server
npm run build      # Type check + production build
npm run typecheck  # Type check app and data scripts
npm run verify     # Compare computed positions with JPL Horizons
npm run data:all   # Regenerate every data file (see scripts/README.md)
npm run data:missions -- "Voyager 2"   # Regenerate one mission's trajectory
```

## Visual Design
- Background: `#000000` (black)
- Orbits: Body color with low opacity
- Sun: `#ffff00` (yellow)
- Planets: Distinct colors per planet (`src/data/palette.ts`)
- Spacecraft: Flat icons (probe, orbiter, telescope)

## Architecture
```
src/
├── main.ts                   # Entry point
├── app.ts                    # Frame loop, reference frame, selection/follow, commands
├── astro/                    # Pure math, no app state
│   ├── constants.ts          # Units, epochs, time scales (UTC ↔ TDB)
│   ├── rotation.ts           # Frame rotations (ICRF, ecliptic, pole frames)
│   ├── galactic.ts           # Galactic frame, the display twist, star states, spiral arms
│   └── kepler.ts             # KeplerOrbit: 3D conics with secular drift, path sampling
├── model/                    # What exists and where it is
│   ├── body.ts               # Body, Motion, MotionSegment (the time-segmented model)
│   ├── catalog.ts            # Builds all bodies from src/data/*.json
│   ├── ephemeris.ts          # Hierarchical position resolution, per-frame cache
│   ├── world.ts              # Catalog + ephemeris + populations; Target type
│   ├── clock.ts              # Simulation time and speed modes
│   ├── asteroidPopulation.ts # 25k asteroids, structure-of-arrays
│   ├── satellitePopulation.ts# All active Earth satellites, J2 drift
│   └── starPopulation.ts     # ~11k stars moving at their measured space velocities
├── view/
│   ├── camera.ts             # Camera in a moving reference frame
│   ├── referenceFrame.ts     # Automatic reference-frame choice
│   ├── input.ts              # Pointer/wheel/touch/gesture → intents
│   ├── renderer.ts           # Frame composition, projection, occlusion
│   ├── picking.ts            # Hit testing against what was drawn
│   └── layers/               # galaxy, stars, orbits, rings, labels, icons, populations, scale bar
├── ui/                       # Controls, info sidebar, console API, Wikipedia
└── data/                     # Generated JSON (+ palette.ts); see scripts/README.md
scripts/                      # Data fetchers (Node ≥ 22.18 runs .ts directly)
public/data/                  # Large datasets loaded at runtime (asteroids, satellites, stars, missions)
```

## Key Design Decisions

### Coordinates and time
Everything is heliocentric J2000 ecliptic, in km, 3D. The view is top-down,
so screen x/y are world x/y: inclined orbits appear as the ellipses you
would see from above (Uranus's moons, Saturn's rings). Simulation time is a
Julian date in TDB; UTC sources (TLEs, the wall clock) are converted.

### Motion timelines
A `Body` has `segments`: each covers a time span, names the parent the
motion is relative to, and a `Motion`: `fixed`, `kepler` (a `KeplerOrbit`,
optionally with secular drift), `keplerSeries` (osculating conics sampled
over time and blended), or `barycentric` (Earth's reflex motion about the
Earth–Moon barycenter). Planets switch JPL element tables at 1800/2050 this
way. A spacecraft can be modeled as launch → cruise → orbit/landing segments
with different parents. `existsFrom`/`existsUntil` bound when a body is in
the scene.

### Beyond the solar system
Zooming out continues past the planets to the stars and the whole Milky Way.
The ecliptic and the Galactic plane are 60° apart, and both are drawn
top-down: positions about the Sun beyond 1,000 AU turn smoothly (by distance)
into the Galactic plane, fully so beyond 60,000 AU (`astro/galactic.ts`
`twist`). Distances from the Sun are kept, and stars and far-out spacecraft
share one frame, so Voyager meets its stars where the map shows them. Stars
are drawn within a slab around the height of whatever is framed. The clock
spans ±250,000 years; outside 3000 BC – 3000 AD the planets' positions are
extrapolations (the status line says so), and Earth satellites show only
near their element epochs.

### Reference frames
The camera stores its center as an offset from a frame body that moves with
it. Automatically, the frame is the deepest body whose region (Hill sphere,
widened to cover its moons) contains the view center while the view is not
much larger than that region — Earth when looking at satellites, Jupiter for
the Galilean moons, the Sun for the planets. `Follow` (sidebar button,
double-click, or `sol.follow`) locks the frame to any object; Esc releases.

### Spacecraft missions
Each spacecraft's full Horizons trajectory (`scripts/fetch-missions.ts`,
loaded at runtime from `public/data/missions/`) is a timeline of segments
relative to the body it is near: Earth at launch, the Sun in cruise, a planet
or moon during a flyby, an asteroid in proximity operations. Segments use
`keplerSeries` (element-space interpolation) where gravity dominates, `hermite`
states near small bodies, and `surface` once landed (site from the ephemeris,
rotating with the IAU model; a small figure stands beside the lander).
Focused spacecraft draw their flown path in the frame of the body they are
near — Voyager's hyperbola around Jupiter, not a heliocentric smear. "Watch
from launch" (sidebar, Missions menu, `sol.watch`) rewinds and follows, with
auto speed pacing the spacecraft's motion (slow motion at flybys).

### True scale with minimum size
Bodies are drawn at true size, clamped to a minimum on-screen radius per kind
(Sun 20px, planets 4px, dwarfs/moons 3px, asteroids/comets 2px, spacecraft
8px icons). Bodies with no published radius are drawn at the minimum.

### Occlusion
When a parent's disc is resolved, a moon or satellite is hidden only while it
is behind the parent. When the parent is drawn at its minimum size, children
fade out as they merge into it; labels fade earlier. Satellite systems whose
whole orbit is inside the parent's disc are not even propagated.

### Level of detail
- Orbit paths: point count from on-screen size (sub-pixel chord error),
  sampled in eccentric anomaly; huge orbits sample only the arc near the view.
- Asteroid cloud: sorted by size (H), draws the largest N for the current
  scale; positions refreshed only when they could have moved ¼ px.
- Satellites appear once Earth's satellite system spans a few pixels.
- Moons: filter by category (major/medium/named/all).
- Labels: placed by priority, never overlapping.

## Browser Debugging

When using the browser (DevTools MCP) to interact with the app, always set speed to realtime first (`sol.setSpeed("realtime")`) so that bodies stop moving and you can navigate precisely.

## Console API (`window.sol`)

The app exposes a `window.sol` object for programmatic control via the browser console or DevTools MCP. Type `sol.help()` for a quick reference.

### Navigation
```js
sol.goto("Earth")          // Center camera on a body or star (auto-zooms by type)
sol.follow("ISS (ZARYA)")  // Lock the camera frame to an object
sol.unfollow()             // Back to the automatic reference frame
sol.watch("Voyager 2")     // Rewind to a mission's launch and follow it
sol.pan(1, 0)              // Pan by offset in AU
sol.panToAU(1, 0)          // Pan to absolute position in AU
sol.panTo(x, y)            // Pan to absolute position in km
sol.zoom(0.0001)           // Set zoom level directly (pixels/km)
sol.zoomIn(3)              // Zoom in by factor (default 3x)
sol.zoomOut(3)             // Zoom out by factor (default 3x)
```

### Time
```js
sol.setDate("2024-07-04")  // Jump to a specific date (ISO format)
sol.setSpeed("year")       // Set speed mode: auto|realtime|day|month|year
sol.setTimeScale(86400)    // Set exact time scale (simulated sec per real sec; negative runs backward)
sol.pause()                // Pause time
sol.resume()               // Resume forward with auto speed
sol.reverse()              // Flip the direction of time
sol.setDate("40000-01-01") // Deep time works too (±250,000 years)
sol.getDate()              // Get current simulation date string
```

### Info
```js
sol.listBodies()           // List all body names (string[])
sol.findBody("mars")       // Search bodies by name substring
sol.getBody("Earth")       // Get body name, type, position (km and AU)
sol.perf()                 // Mean ms per frame for each rendering phase
sol.status()               // Camera center, zoom, date, speed, reference frame
```

### Selection
```js
sol.select("Jupiter")      // Select a body (opens info sidebar)
sol.deselect()             // Clear selection
```

## Data Sources
See `scripts/README.md`. In short: NAIF PCK/GM kernels, JPL approximate
planet elements, JPL Horizons (moons, small bodies, spacecraft), JPL SBDB
(asteroids), CelesTrak (Earth satellites), SIMBAD and the IAU WGSN (stars),
Reid et al. 2019 (the Galaxy's spiral arms and the Sun's motion).
