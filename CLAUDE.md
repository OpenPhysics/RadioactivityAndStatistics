# CLAUDE.md — Radioactivity and Measurements

Sim-specific context for AI assistants. General SceneryStack guidance:
[OpenPhysics/.github/CLAUDE.md](https://github.com/OpenPhysics/.github/blob/main/CLAUDE.md).

## What this sim is

A counting-statistics laboratory. Measure radioactive decay — simulated, or from
a real **PASCO Wireless Geiger Counter (PS-3238)** over Web Bluetooth — and
compare the resulting distribution against Poisson and Gaussian theory.

The physics is in [`doc/model.md`](doc/model.md); the architecture, the PASCO
protocol, and the traps are in
[`doc/implementation-notes.md`](doc/implementation-notes.md). Read those before
changing the acquisition or hardware layers.

## Key files

| File | Purpose |
|---|---|
| `src/common/model/RadioactivityModel.ts` | The shared acquisition model — sources, counting cycle, run, derived statistics. Both screens compose it |
| `src/common/model/CountSource.ts` | The `TCountSource` contract: a monotonic running total. The reason hardware and simulated data share one code path |
| `src/common/model/SimulatedCountSource.ts` | Poisson event generator (the default source, and the only one with a known λ) |
| `src/common/model/GeigerCountSource.ts` | Hardware source: connection lifecycle, polling loop, register interpretation |
| `src/common/hardware/PascoProtocol.ts` | Pure wire-format encode/decode for the PASCO BLE protocol |
| `src/common/hardware/GeigerCounterDevice.ts` | The **only** file touching `navigator.bluetooth` |
| `src/common/model/Statistics.ts` | Welford statistics, log-gamma, Poisson and Gaussian distributions |
| `src/common/model/Histogram.ts` | Integer binning, bin-width choice, per-bin expected frequencies |
| `src/common/model/GaussianFit.ts` | Levenberg–Marquardt fit with Poisson weighting |
| `src/common/view/HistogramNode.ts` | Lab centrepiece: bars plus the three model curves |
| `src/common/view/CountRateChartNode.ts` | Intro strip chart: rate against time, with the mean |
| `src/RadioactivityAndMeasurementsColors.ts` | All `ProfileColorProperty` instances, including the validated chart palette |
| `src/RadioactivityAndMeasurementsConstants.ts` | Layout, chart sizes, acquisition ranges, timing guards |

## Things that will bite

**Web Bluetooth needs the user gesture.** `requestDevice` only opens its picker
during a real user gesture, and `GeigerCounterDevice.connect()` runs
synchronously up to that call. Do not put an `await` before it in a button
listener, and do not wrap the listener in anything that defers.

**`GeigerCountSource.step()` is empty on purpose.** A real source must keep
counting while the sim clock is paused — the decays do not stop.

**Never add an `AxisLine` to these charts.** It anchors to model coordinate 0.
Both charts autoscale away from zero, so the line renders far outside the plot,
inflates the node's bounds, and shoves the chart under a control panel.
`ChartRectangle` already strokes the border.

**Chart position is owned by an `AlignBox`.** Chart bounds change as axes
rescale; do not replace it with a one-off `centerX`.

**`minContentWidth` on a `GridBox` is per cell**, not a total. Use
`preferredWidth` to size a panel's grid.

**The histogram bars are not a categorical hue.** They are a neutral fill so the
three model curves (a validated categorical trio) read against them. A
four-colour set fails colour-vision separation in both profiles. Each curve also
carries a dash pattern; keep it if you touch the colours.

**The `CountRate` register interpretation is unverified against hardware.** See
`GeigerCountSource`'s class comment. Both plausible modes are implemented and
user-selectable, and the raw register is exposed for diagnosis. If someone
confirms the real behaviour on a device, collapse this to the correct mode and
delete the other — do not leave a guess baked in silently.

## Query parameters

| Parameter | Effect |
|---|---|
| `?showDiagnostics=true` | Show the raw count register and GM tube voltage in the source panel |
| `?registerMode=cumulative\|perSampleWindow` | How the raw count register becomes a running total |

Also surfaced in Preferences → Simulation.

## Hardware testing

Requires a PASCO Wireless Geiger Counter, powered on, and Chrome or Edge on
HTTPS or `localhost`. There is no way to exercise the Bluetooth path in CI or in
a headless environment — `tests/common/hardware/PascoProtocol.test.ts` covers the
wire format, and everything above the transport is exercised through the
simulated source.

To check the register mode on a real device: connect, enable diagnostics, and
watch the raw register. Climbing monotonically → `cumulative`. Hovering near a
small value → `perSampleWindow`.

## Testing

Fleet-standard Vitest layout; unit tests live in root `tests/`, mirroring `src/`.

```bash
npm run lint && npm run check && npm run build && npm test
```

`npm run release` skips `npm test` by default — append `&& npm test` before the
version bump if cutting a release from this repo.

## Compliance carve-outs

None. Standard screen layout, root `*Colors.ts` / `*Constants.ts` /
`*Namespace.ts`, six-section README, full a11y wiring.

### `package.json` overrides

JSON cannot carry comments, so the rationale for forced transitive pins lives
here. Dependabot ignores these three names (see `.github/dependabot.yml`).

| Override | Pin | Why |
|---|---|---|
| `lodash` | `~4.18.1` | SceneryStack declares `~4.17.12`. Bump clears advisories patched in 4.18.x (GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh). |
| `three` | `~0.125.2` | SceneryStack declares `^0.104.0`. Floor is 0.125.0 for GHSA-fq6p-x6j3-cmmq. **0.125.x still has open CVEs** (XSS GHSA-7vvq-7r29-5vg3, fixed only in ≥0.137.0). Remove if SceneryStack drops `three` or pins a patched line. |
| `brace-expansion` | `~5.0.9` | Transitive via `vite-plugin-pwa` / Workbox. Clears npm audit (GHSA-mh99-v99m-4gvg; keep ≥5.0.9 for GHSA-rgw5-rvv9-x895). |

`@types/web-bluetooth` is a devDependency and must stay in the `types` array of
**both** `tsconfig.json` and `tsconfig.test.json` — the tests import `src`
modules that reference the Web Bluetooth globals.

## PWA

After `npm run build`, the sim is installable offline via Workbox
(`dist/manifest.webmanifest`).
