# Radioactivity and Measurements

[![CI](https://github.com/OpenPhysics/RadioactivityAndMeasurements/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenPhysics/RadioactivityAndMeasurements/actions/workflows/ci.yml)

A counting-statistics laboratory. Measure radioactive decay — from a simulated
source or from a real **PASCO Wireless Geiger Counter (PS-3238)** over Web
Bluetooth — then see why repeated measurements of an unchanging source never
repeat, and check the result against Poisson and Gaussian theory.

## Features

- **Live counting** — count rate from the most recent interval, with the
  in-progress interval visible as it fills.
- **Real hardware over Web Bluetooth** — connects directly to a PASCO Wireless
  Geiger Counter from Chrome or Edge, with no driver, app, or install.
- **A simulated source with a known λ** — the only way to check the theory
  against an answer known in advance; real sources never tell you theirs.
- **Runs you control** — set the counting interval and how many intervals a run
  collects, then Record / Stop / Clear.
- **Data table and CSV export** — every measurement is legible as text and
  exportable, with the run's conditions and statistics in the file header.
- **Distribution and statistics** — histogram, mean, standard deviation,
  standard deviation of the mean, and √mean side by side.
- **Theory on top of the data** — Poisson prediction, the Gaussian limit with
  σ = √mean, and a Levenberg–Marquardt Gaussian fit reporting reduced χ².
- **Accessible** — full keyboard navigation, screen-reader summaries that stay
  live as data arrives, and charts whose curves are separable by dash pattern as
  well as by colour.
- English, Spanish, and French localization; default and projector color
  profiles; installable as an offline PWA.

## Quick Start

```bash
npm install
npm run icons    # generate PNG icons from public/icons/icon.svg
npm start        # dev server → http://localhost:5173
```

To use a real counter: switch **Source** to *Geiger counter*, press **Connect**,
and pick the device from the browser's Bluetooth dialog. This needs Chrome or
Edge on an HTTPS page (or `localhost`); the sim says so explicitly when the
browser cannot do it, and the simulated source stays available either way.

## Scripts

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest unit tests (protocol, statistics, binning, fit, export, model) |
| `npm run test:fuzz` | Optional Playwright fuzz smoke (`?fuzz&ea`, default 30s) |
| `npm run test:fuzz:quick` | Shorter fuzz smoke (10s) |
| `npm run test:fuzz:long` | Longer fuzz smoke (300s) |
| `npm run check` | TypeScript type check (app, scripts, tests) |
| `npm run lint` | Biome lint check |
| `npm run format` | Auto-format all files |
| `npm run fix` | Lint + auto-fix |
| `npm run icons` | Regenerate PNG icons from `public/icons/icon.svg` |
| `npm run release` | `check && lint && build`, then version patch + push tags |
| `npm run clean` | Remove `dist/` |

Useful query parameters: `?showDiagnostics=true` reveals the counter's raw count
register and GM tube voltage, `?beepEnabled=false` silences the count beep, and
`?tubeVoltage=500` sets the G-M tube bias (see `CLAUDE.md`).

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [SceneryStack](https://scenerystack.org/) | ^3.0.0 | Simulation framework |
| [bamboo](https://scenerystack.org/) | (SceneryStack) | Charting for the histogram and rate chart |
| [Vite](https://vitejs.dev/) | ^8 | Build tool + dev server |
| [TypeScript](https://www.typescriptlang.org/) | ^7 | Type-safe JavaScript |
| [Biome](https://biomejs.dev/) | ^2.5 | Linting + formatting |
| [Vitest](https://vitest.dev/) | ^4 | Unit tests |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | ^1 | PWA + service worker |
| [Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) | — | PASCO Geiger counter transport (Chromium only) |

## License

AGPL-3.0-or-later. See the [org-wide license](https://github.com/OpenPhysics/.github/blob/main/LICENSE).

## Contributing

See the [org-wide contributing guide](https://github.com/OpenPhysics/.github/blob/main/CONTRIBUTING.md).
