# 2D Solar System Tracker

## Vision
Top-down solar system visualization with a dusty parchment/LEMMINO aesthetic. Clean, elegant, geometric like Mini Metro. Comprehensive object coverage (planets, dwarf planets, asteroids, comets, probes like Voyager).

## Tech Stack
- **Vanilla TypeScript + Vite** - no framework overhead
- **HTML5 Canvas 2D** - smooth zoom/pan, fits the aesthetic
- **Keplerian orbital mechanics** - calculate positions from orbital elements

## Development
- Run `npm run typecheck` to check for TypeScript errors before committing

## Visual Design
- Background: `#f4e4c1` (aged parchment)
- Orbits: `#3d3d3d` with low opacity, thin dashed lines
- Sun: `#d4a574` (muted gold)
- Planets: Muted earth tones, simple circles, no gradients
- Typography: Crimson Text serif font

## Architecture
```
src/
├── main.ts                 # Entry point
├── style.css               # Parchment theme
├── core/
│   ├── camera.ts           # Zoom/pan, coordinate transforms
│   ├── renderer.ts         # Canvas drawing
│   └── time.ts             # Time simulation, speed controls
├── astronomy/
│   ├── kepler.ts           # Orbital mechanics (Kepler equation solver)
│   ├── bodies.ts           # CelestialBody definitions + planet data
│   └── constants.ts        # AU, colors, min display sizes
```

## Key Design Decisions

### True Scale with Minimum Size
All objects at real size (km), but clamped to minimum pixel sizes when zoomed out:
- Sun: 20px min
- Planets: 4px min
- Dwarf planets/moons: 3px min
- Asteroids/probes: 2px min

### Orbital Mechanics
- Standard Keplerian elements from NASA JPL
- Supports elliptical (e<1), parabolic (e=1), hyperbolic (e>1) orbits
- **Segmented orbits** for objects with trajectory changes (gravity assists, Oumuamua-style anomalies)

### Zoom
- Exponential zoom with smooth interpolation
- Zooms toward cursor position
- Sensitivity: `deltaY * 0.0035`

## Current Status (Phase 1 Complete)
- [x] Canvas with zoom/pan
- [x] 8 planets with real orbital data
- [x] Time simulation with speed controls
- [x] Parchment aesthetic

## Next Steps (Phase 2)
- [ ] Dwarf planets (Pluto, Ceres, Eris, Makemake, Haumea)
- [ ] Major moons (Earth's Moon, Galilean moons, Titan, etc.)
- [ ] Asteroid belt sample (~1000 objects from NASA JPL)
- [ ] Notable comets (Halley, etc.)
- [ ] Space probes with segmented orbits (Voyager 1&2, New Horizons, Pioneer)

## Future Features
- Click for object info popups
- Search & highlight
- Reverse time
- Jump to specific date
- Scale reference overlay
