# Data scripts

Every data file the app uses is generated here from an authoritative source.
Nothing is synthesized: if a value has not been published (for example the
radius of many small irregular moons), it is left out and the app shows it as
unknown.

Scripts run directly with Node ≥ 22.18 (native TypeScript type stripping), no
build step:

```bash
npm run data:all          # everything, in dependency order
npm run data:moons        # or any single dataset
```

| Script | Output | Source |
| --- | --- | --- |
| `fetch-orientation.ts` | `src/data/orientation.json` | NAIF `pck00011.tpc` (IAU 2015 poles, rotation, radii) and `gm_de440.tpc` (GM) |
| `fetch-planets.ts` | `src/data/planets.json` | JPL *Approximate Positions of the Planets*, Tables 1 and 2; JPL planetary physical parameters |
| `fetch-moons.ts` | `src/data/moons.json` | JPL satellite list and reference planes (`sats/elem`), physical parameters (`sats/phys_par`), Horizons state vectors |
| `fetch-small-bodies.ts` | `src/data/smallBodies.json` | JPL SBDB (identity, size, discovery) and Horizons osculating elements, 1900–2100 |
| `fetch-asteroids.ts` | `public/data/asteroids.json` | JPL SBDB Query API: the 25,000 brightest asteroids by H |
| `fetch-spacecraft.ts` | `src/data/spacecraft.json` | Horizons osculating elements for each mission (a quick stand-in until full trajectories load) |
| `fetch-missions.ts` | `src/data/missions.json`, `public/data/missions/*.json` | Full Horizons trajectories, split by the body each spacecraft is near, and landing sites |
| `fetch-ephemerides.ts` | `public/data/ephemerides.json` | Horizons osculating elements for planets (30-day) and named small bodies (yearly), 1900–2100 |
| `fetch-satellites.ts` | `public/data/satellites.json` | CelesTrak GP (OMM) elements, active satellites and constellation groups |

`fetch-orientation.ts` must run before `fetch-moons.ts` and
`fetch-small-bodies.ts`, which read planet poles, GMs and radii from it.

## How each dataset is modeled

- **Planets** — at runtime, Horizons osculating elements every 30 days for
  1900–2100 (`fetch-ephemerides.ts`), blended between samples: tens to
  hundreds of km from DE440. Bundled fallback and outside that span:
  Standish's mean elements, Table 1 where valid (1800–2050), Table 2
  (3000 BC – 3000 AD, with the extra outer-planet terms) beyond. Earth moves about the Earth–Moon
  barycenter opposite the Moon.
- **Moons** — for each satellite, a precessing Keplerian orbit (constant
  a, e, i; linearly advancing mean longitude, periapsis and node) is
  least-squares fitted to Horizons positions in the satellite's reference
  plane (Laplace plane, planet equator, or ecliptic, as JPL defines it), over
  ±25 years about 2025 — or ±8 / ±3 years for strongly perturbed irregular
  moons, keeping them accurate near the present. The fit error is stored with
  each moon.
- **Small bodies** — osculating elements every 10 years from Horizons'
  numerical integration. The app blends the two conics bracketing a date:
  exact at every sample, continuous between them.
- **Asteroid cloud** — osculating elements at the SBDB epoch (two-body).
  Sorted by absolute magnitude so the app can draw the largest N as a level
  of detail.
- **Spacecraft** — full trajectories (`fetch-missions.ts`). The mission is
  split into segments by the body the spacecraft is near: the deepest body
  whose region (Laplace sphere of influence, at least 20 radii — 100 for small
  bodies) contains it, with encounters shorter than the daily sampling found
  by refining any interval the spacecraft could have crossed a region in.
  Each segment is sampled adaptively relative to its body: osculating
  elements where that body's gravity dominates (interpolated in element
  space), Hermite states near small bodies. Landers end in a surface segment:
  touchdown is the moment after which the body-fixed position (IAU rotation)
  stops changing, and the site is read from the ephemeris. The index ships
  with the app; trajectories load at runtime. Horizons responses are cached
  in `scripts/.cache/` (gitignored), so reruns are quick.
- **Earth satellites** — CelesTrak elements propagated with Keplerian motion
  plus J2 secular drift of the node and perigee.

## Verifying positions

Positions can be spot-checked against Horizons vectors: in the browser
console, `sol.pause(); sol.setDate("2026-01-01"); sol.getBody("Titan")`
gives heliocentric J2000-ecliptic km to compare with a Horizons `VECTORS`
query (`CENTER='500@10'`, `REF_PLANE=ECLIPTIC`).
