# sol

A Google Maps for the galaxy: the solar system and the Milky Way in 2D, to
scale, with a flat design. Every planet, moon, asteroid and comet, almost every
spacecraft, and the stars around us.

**[sol.louisarge.com](https://sol.louisarge.com)**

## Running it

```bash
npm install
npm run dev
```

The data files are checked in. To regenerate them from their sources, see
[`scripts/README.md`](scripts/README.md).

## Data

Every position comes from published data:

- NASA JPL Horizons and the Small-Body Database
- NAIF planetary constants
- CelesTrak (Earth satellites)
- SIMBAD (CDS) and the IAU WGSN (stars)
- Reid et al. 2019 (the Milky Way's spiral arms)

The face-on Milky Way is the one exception: it is drawn for show, from its
published structure.

## License

[MIT](LICENSE)
