# Implementation notes — Radioactivity and Measurements

Architecture, the PASCO Bluetooth protocol, and the decisions that are not
obvious from the code.

## Shape of the sim

Two screens over one shared acquisition model.

```
src/
  common/
    hardware/   PascoProtocol.ts  GeigerCounterDevice.ts  webBluetoothSupport.ts
    model/      RadioactivityModel.ts  CountSource.ts  SimulatedCountSource.ts
                GeigerCountSource.ts  Statistics.ts  Histogram.ts  GaussianFit.ts
                CountSample.ts  csvExport.ts  ConnectionState.ts
    view/       SourcePanel  AcquisitionPanel  DataTableNode  StatisticsPanel
                HistogramNode  CountRateChartNode  CountRateDisplayNode
                DistributionControlsPanel  currentDetailsProperty  downloadCsv
  intro/        model/IntroModel.ts  view/IntroScreenView.ts
  lab/          model/LabModel.ts    view/LabScreenView.ts
```

`IntroModel` and `LabModel` **compose** `RadioactivityModel` rather than extend
it. Composition keeps the shared model free of any one screen's assumptions:
the Lab screen adds curve-visibility state without the Intro screen carrying it,
and neither screen can quietly change acquisition semantics for the other.

## The count-source abstraction

The single most load-bearing decision in the sim.

A count source exposes exactly one number: a monotonically increasing running
total of events since reset. The acquisition model owns the timebase — at the
end of each counting interval it subtracts the total it saw at the interval's
start.

That is what lets a Bluetooth device sampling on its own clock and a random
generator sampling on the sim's clock feed *literally the same code path*. A
hardware source advances its total from BLE notifications; a simulated source
advances it from `step(dt)`; neither knows what an interval is. Nothing
downstream — statistics, histogram, fit, table, export — branches on the source.

A corollary worth stating: `GeigerCountSource.step()` is deliberately empty. A
real source must keep accumulating decays while the sim's clock is paused,
because the physical process does not stop when a user presses pause.

## PASCO Bluetooth protocol

Ported from PASCO's own Python library,
[PASCOscientific/pasco_python](https://github.com/PASCOscientific/pasco_python)
(`pasco_ble_device.py` for the transport, `datasheets.py` for the device tables).

**Neither open PASCO library supports this device.** The Python library lists
`'Geiger'` in its `_not_compatible_devices`, and the
[`pasco-ble`](https://github.com/veillette/pascoTS) npm package's datasheet
covers interfaces 1025–1057 only. The Geiger counter is interface **1064**. Its
tables *are* present in `datasheets.py` even though the transport refuses to talk
to it, so the device description below is transcribed, not guessed.

### GATT layout

Every PASCO UUID has the form

```
4a5c000<S>-000<C>-0000-0000-5c1e741f1c00
```

where `<S>` is the service id and `<C>` the characteristic id. `C = 0` addresses
the service itself; service 0 is the device service, and a sensor on channel N
is served by service N + 1.

| Characteristic | Id | Direction |
|---|---|---|
| service | 0 | — |
| send command | 2 | host → device |
| receive | 3 | device → host (notify) |
| send ack | 5 | host → device (streaming flow control) |

### The device

| | |
|---|---|
| Interface | 1064, `WirelessGM`, advertised as `Geiger Counter` |
| Model | PS-3238 |
| Sensor | 2079 on channel 0, hence service 1 |
| Measurement 0 | `CountRate`, uint16 LE, unit type CountsPerSample |
| Measurement 1 | `TubeVoltage`, uint16 LE, volts (nominally 450–600) |

A sample payload is therefore 4 bytes. The advertised name packs the interface
id: `"<type> <serial><flags><code>"`, e.g. `Geiger Counter 123-456Xe`, where the
9th character of the trailing token is base-64 for `interfaceId − 1024` in
PASCO's own alphabet (`0-9`, `K-Z`, `A-J`, `a-z`, `*`, `#`). 1064 encodes as
`'e'`. `isGeigerCounterName` prefers that encoded id and falls back to the
advertised device type, so a device whose name says "Geiger Counter" but whose
id says otherwise is refused rather than misread.

### Polling, not streaming

PASCO devices can stream periodically, but **the command that sets the sample
period is not published in any of PASCO's open code**, and this device's
datasheet default is a 30 s window — far too coarse for counting statistics.
So the sim polls with `GCMD_READ_ONE_SAMPLE` (0x05) at 10 Hz and keeps the
timebase itself, tied to the user's chosen counting interval.

The command goes to the **sensor** service's send characteristic, but the device
answers on the **device** service's notify characteristic — writes to
`4a5c0001-0002-…` come back on `4a5c0000-0003-…`. This asymmetry is not
documented anywhere; subscribing to the sensor service's notify characteristic
instead yields perfect silence with a connection that still looks healthy.

### Reading the CountRate register

The datasheet calls measurement 0 "CountRate" with unit type *CountsPerSample*,
which is ambiguous under one-shot polling. Confirmed against a PS-3238 in
August 2026: **the device clears the register on read**. Each read returns the
counts accumulated since the previous read — not a free-running total, and not a
fixed-length window.

Two observations pin it down. The first read after connecting returns everything
banked since power-on (914, against ~60 for the reads that followed at the same
spacing), and the values scale with the gap between reads rather than staying
constant. A capture at ~2 s spacing beside a source:

```
write -> 05 04     notify <- c0 00 05 92 03 f4 01   register 914, 500 V
write -> 05 04     notify <- c0 00 05 49 00 f4 01   register  73, 500 V
write -> 05 04     notify <- c0 00 05 39 00 f4 01   register  57, 500 V
write -> 05 04     notify <- c0 00 05 45 00 f4 01   register  69, 500 V
```

≈ 30 counts/s, matching the counter's own audible rate. Those exact packets are
pinned in `tests/common/hardware/PascoProtocol.test.ts`.

So `accumulate` sums **every** reading and discards only the first, which exists
to flush the backlog. Summing unconditionally matters: at a poll interval short
against the count rate the register holds small integers, so consecutive equal
readings are common — for a mean of 3 per poll, skipping repeats would
undercount by roughly 15%. A dropped or timed-out read costs nothing, because
those counts stay banked on the device and arrive in the next successful read.

Turn on **Preferences → Simulation → Show Geiger counter diagnostics** (or
`?showDiagnostics=true`) to watch the raw register and tube voltage. A healthy
tube reads 500 V; a zero there means no sample is being decoded at all.

### Beep and tube-voltage control

SPARKvue's WASM backend (`PascoBLEDriver::GMEnableBeeper` /
`GMSetVoltage`) writes `GCMD_CUSTOM` (0x37) to channel 0's command
characteristic — the same one used for one-shot reads:

| Command | Bytes |
|---|---|
| Enable beep | `[0x37, 0x02, enabled]` (`enabled` is 0 or 1) |
| Set tube voltage | `[0x37, 0x01, V₁_lo, V₁_hi, V₂_lo, V₂_hi]` (little-endian volts) |

Manual mode (what Preferences uses) sends the same voltage for both `V₁` and
`V₂`. SPARKvue's "automatic" optimum is `(0, 0)`; this sim does not offer that
mode. The Preferences slider spans 180–697 V in 8 V steps (SPARKvue's range),
default 500 V, and is reapplied whenever the value changes while a counter is
connected. The beep checkbox likewise pushes immediately over BLE.

### Web Bluetooth constraints

- `requestDevice` only opens its picker during a **user gesture**. `connect()`
  runs synchronously up to that call, so the button listener must not `await`
  anything first — and the listener therefore calls it directly.
- Services must be declared in `optionalServices` before they can be touched,
  and the channel count is unknown until after discovery, so services 0–4 are
  requested up front.
- Only Chromium-based browsers implement the API, and only in a secure context.
  `webBluetoothSupport.ts` distinguishes those cases so the panel can say which
  one applies instead of failing on a click.

## Charts

Built on SceneryStack's **bamboo**: `ChartTransform` + `BarPlot` / `LinePlot` /
`ScatterPlot`, with `GridLineSet`, `TickMarkSet`, and `TickLabelSet`.

**No `AxisLine` nodes.** This one bit, and is worth recording. `AxisLine` anchors
to model coordinate 0. Both charts autoscale, so once a run narrows the
histogram's x-range to, say, 12–36, the vertical axis line renders at view
x = −64 — far outside the plot — which inflated the node's bounds by ~170 px and
pushed the chart underneath the neighbouring panel. `ChartRectangle` already
strokes the plot border, and both axes start at zero, so the axis lines were
redundant as well as harmful.

**Charts are wrapped in an `AlignBox`,** not positioned with a one-off `centerX`.
Chart bounds change as the axes rescale to incoming data; an `AlignBox` with
fixed `alignBounds` re-centres automatically, and `maxWidth` is the backstop that
caps the chart at the gap it has been given.

**`minContentWidth` on a `GridBox` is a per-cell floor,** not a total. Using it
to size the statistics panel made the panel twice as wide as intended and
squeezed the histogram; `preferredWidth` is the right knob.

## Colour

The three model curves are a categorical set, validated for colour-vision
separation against both the default (dark) and projector (light) chart surfaces.
The histogram bars are deliberately **not** a fourth categorical hue — a
four-colour set fails the separation floor in both profiles — but a neutral fill,
so the data reads as ground and the model curves as figure.

Each curve also carries its own dash pattern (solid / dashed / dash-dot), and the
legend swatches reproduce it, so the three stay separable in greyscale, in print,
and to a colour-blind reader without relying on hue at all.

## Testing

`npm test` — 98 unit tests under `tests/`, mirroring `src/`:

| File | Covers |
|---|---|
| `common/hardware/PascoProtocol.test.ts` | UUIDs, name parsing, base-64 alphabet, packet decode, register wraparound |
| `common/model/Statistics.test.ts` | Welford accuracy, log-gamma, Poisson (variance = mean), Poisson→Gaussian convergence |
| `common/model/Histogram.test.ts` | binning, conservation, per-bin Poisson expectation, bin-count targeting |
| `common/model/GaussianFit.test.ts` | parameter recovery, degrees of freedom, robustness on ragged data |
| `common/model/csvExport.test.ts` | column contract, CRLF, quoting, filename stamping |
| `common/model/RadioactivityModel.test.ts` | counting cycle, auto-stop, count conservation, interval drift, dt clamping |
| `memory-leak.test.ts` | `WeakRef` dispose regression on `SimulatedCountSource` |

The protocol tests matter disproportionately: that code was reverse-engineered
rather than written against a spec, and a wrong UUID or mis-decoded name fails at
connect time with a browser error that says nothing about the cause.
