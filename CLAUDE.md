# CLAUDE.md — Radioactivity and Statistics

Sim-specific context for AI assistants. General SceneryStack guidance:
[OpenPhysics/.github/CLAUDE.md](https://github.com/OpenPhysics/.github/blob/main/CLAUDE.md).

## What this sim is

A counting-statistics laboratory. Measure radioactive decay — simulated, or from
a real **PASCO Wireless Geiger Counter (PS-3238)** over Web Bluetooth or a USB
cable — and compare the resulting distribution against Poisson and Gaussian
theory.

The physics is in [`doc/model.md`](doc/model.md); the architecture, the PASCO
protocol, and the traps are in
[`doc/implementation-notes.md`](doc/implementation-notes.md). Read those before
changing the acquisition or hardware layers.

## Key files

| File | Purpose |
|---|---|
| `src/common/model/RadioactivityModel.ts` | The shared acquisition model — sources, counting cycle, run, derived statistics. Each screen's model locks it to one fixed source |
| `src/common/model/RadioactivityScreenModel.ts` | Composes `RadioactivityModel` with the screen-level display state (chart view, curve visibility) both screens share; `SimulationModel`/`DeviceModel` just fix the source and the default chart |
| `src/common/model/CountSource.ts` | The `TCountSource` contract: a monotonic running total. The reason hardware and simulated data share one code path |
| `src/common/model/SimulatedCountSource.ts` | Poisson event generator (the default source, and the only one with a known λ) |
| `src/common/model/GeigerCountSource.ts` | Hardware source: connection lifecycle, polling loop, register interpretation |
| `src/common/hardware/PascoProtocol.ts` | Pure wire-format encode/decode for the PASCO protocol |
| `src/common/hardware/GeigerTransport.ts` | The `TGeigerTransport` contract: opaque PASCO packets over one wire. The reason Bluetooth and USB share every layer above the wire |
| `src/common/hardware/GeigerCounterDevice.ts` | The counter itself, independent of wire: commands, response matching, read timeout |
| `src/common/hardware/BluetoothGeigerTransport.ts` | The **only** file touching `navigator.bluetooth` |
| `src/common/hardware/UsbGeigerTransport.ts` | The **only** file touching `navigator.usb`. Reaches the counter but its data path is still closed — see below |
| `src/common/hardware/transportSupport.ts` | Per-wire feature detection, so the panel can say which wire is missing and why |
| `src/common/model/Statistics.ts` | Welford statistics, log-gamma, Poisson and Gaussian distributions |
| `src/common/model/Histogram.ts` | Integer binning, bin-width choice, per-bin expected frequencies |
| `src/common/model/GaussianFit.ts` | Levenberg–Marquardt fit with Poisson weighting |
| `src/common/view/HistogramNode.ts` | The histogram view: bars plus the three model curves |
| `src/common/view/CountRateChartNode.ts` | The count-rate view: rate against time, with the mean |
| `src/common/view/RadioactivityScreenView.ts` | The view shared by both screens; a chart-view switch chooses which of the above two is shown |
| `src/RadioactivityAndStatisticsColors.ts` | All `ProfileColorProperty` instances, including the validated chart palette |
| `src/RadioactivityAndStatisticsConstants.ts` | Layout, chart sizes, acquisition ranges, timing guards |

## Things that will bite

**Every device picker needs the user gesture.** Web Bluetooth's `requestDevice`
and WebUSB's both open their picker only during a real user gesture, and a
gesture does not survive an `await`. `GeigerCountSource.connect()` →
`GeigerCounterDevice.connect()` → the transport runs synchronously up to that
call. Do not put an `await` before it in a button listener, and do not wrap the
listener in anything that defers.

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

**PASCO answers on a different service than it is asked.** The one-shot read is
written to the sensor service's send characteristic, but the reply arrives on the
*device* service's notify characteristic. Subscribe to the sensor service and you
get silence from a connection that still reports itself healthy.

**The `CountRate` register clears on read.** Confirmed on a PS-3238; each read
returns counts since the previous read. `accumulate` therefore sums every
reading and discards only the first, which flushes the backlog banked since
power-on. Do not "optimise" it to skip readings equal to their predecessor — at
10 Hz the register holds small integers, repeats are ordinary, and skipping them
undercounts by roughly 15%.

**The USB path is unfinished, and the button is off by default.** The counter's
USB port presents a vendor-specific "Pasco USB Bridge" (0x0945:0x0002) that
WebUSB can claim — but its bulk pipe echoes every packet back byte-identical,
and nothing found by inspection opens it. It is **not** a HID device; a WebHID
picker filtered to PASCO is empty. Framing variants, all 64 vendor control IN
requests, and the descriptors have been ruled out — see
[`doc/implementation-notes.md`](doc/implementation-notes.md) before spending any
time here, and do not re-derive what is already eliminated. `?usbTransport=true`
shows the button.

**`samplesProperty` is append-only, and the statistics depend on it.**
`statisticsProperty` and `histogramProperty` are folded forward one sample at a
time (Welford state plus a `CountTally`), not derived from the run — a
continuous run at 100x collects hundreds of intervals per second, and
recomputing either from the whole array on each one is what makes the sim
heavier the longer it is left going. The model reconciles by sample count: a
shorter array rebuilds from scratch, a longer one folds in the tail. Replacing
the array with different contents of the same or greater length will silently
desync the statistics from the data.

**Do not publish inside the step loop.** One frame at a speed multiplier
completes many counting intervals. Writing `samplesProperty` (or the interval
Properties) per interval fires the whole derived chain, and the views with it,
hundreds of times in a frame — which lengthens the frame, which enlarges the
next `dt`. `step()` accumulates in locals and publishes once, at the end.

## Query parameters

| Parameter | Effect |
|---|---|
| `?showDiagnostics=true` | Show the raw count register and GM tube voltage in the source panel |
| `?beepEnabled=false` | Silence the audible count beep on a connected Geiger counter |
| `?tubeVoltage=500` | G-M tube bias setpoint in volts (Preferences slider; applied over the open link) |
| `?debugTransport=true` | Byte-level tracing of both directions on either wire (`?debugBluetooth=true` still works) |
| `?usbTransport=true` | Offer the "Connect via USB" button. Off by default: the USB data path is unsolved |
| `?showSamplesPerRunControl=true` | Show the "Samples per run" slider on the acquisition panel |

Also surfaced in Preferences → Simulation.

## Hardware testing

Requires a PASCO Wireless Geiger Counter, powered on, and Chrome or Edge on
HTTPS or `localhost`. Either wire will do: Bluetooth, or a USB cable to the
counter's own port. There is no way to exercise either transport in CI or in a
headless environment — `tests/common/hardware/PascoProtocol.test.ts` covers the
wire format, and everything above the transport is exercised through the
simulated source.

`scripts/probe/usb-probe.html` is the bring-up tool for the USB path, served by
`node scripts/probe/probe-server.mjs`, which also collects its log to a file. It
dumps what WebHID, Web Serial, and WebUSB each see, claims the bridge, sends
arbitrary hex down the bulk pipe, and sweeps vendor control requests.

To sanity-check a real device: connect, enable diagnostics, and watch the tube
voltage. It should read 500 V. Zero there means no sample is being decoded, not
a flat tube — check that the notify subscription is still on the device service.

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

`@types/web-bluetooth` and `@types/w3c-web-usb` are devDependencies and must stay
in the `types` array of **both** `tsconfig.json` and `tsconfig.test.json` — the
tests import `src` modules that reference the Web Bluetooth and WebUSB globals.

## PWA

After `npm run build`, the sim is installable offline via Workbox
(`dist/manifest.webmanifest`).
