/**
 * RadioactivityModel.ts
 *
 * The acquisition model shared by both screens: it owns the count sources, the
 * counting timebase, the collected run, and every statistic derived from it.
 * The Intro and Lab models compose this rather than extending it, so the two
 * screens genuinely share one implementation of "what a measurement is".
 *
 * ── The counting cycle ────────────────────────────────────────────────────────
 * The model runs a free-running counting cycle whether or not it is recording,
 * exactly as a bench counter does: it always shows a live rate, and Record only
 * decides whether completed intervals are kept. Each cycle it reads the active
 * source's running total, and when the interval elapses it turns the difference
 * into one {@link CountSample}.
 *
 * Reading a difference of totals — rather than having sources push events — is
 * what lets a Bluetooth device that samples on its own clock and a generator
 * that samples on the sim's clock feed identical code.
 */

import { BooleanProperty, DerivedProperty, NumberProperty, Property, type TReadOnlyProperty } from "scenerystack/axon";
import type { Range } from "scenerystack/dot";
import type { TModel } from "scenerystack/joist";
import {
  ACTIVITY_RANGE,
  BIN_WIDTH_RANGE,
  COUNTING_INTERVAL_DECIMAL_PLACES,
  COUNTING_INTERVAL_DELTA,
  COUNTING_INTERVAL_RANGE,
  DEFAULT_ACTIVITY,
  DEFAULT_COUNTING_INTERVAL,
  DEFAULT_SAMPLES_PER_RUN,
  DEFAULT_SPEED_MULTIPLIER,
  MAXIMUM_STEP_DT,
  SAMPLES_PER_RUN_RANGE,
  SPEED_MULTIPLIER_CHOICES,
} from "../../RadioactivityAndStatisticsConstants.js";
import type { CountSample } from "./CountSample.js";
import { CountSourceType, type CountSourceTypeValue, type TCountSource } from "./CountSource.js";
import { fitGaussian, type GaussianFitResult } from "./GaussianFit.js";
import { GeigerCountSource, type GeigerDeviceControls } from "./GeigerCountSource.js";
import { CountTally, chooseBinWidthOf, createHistogramOf, type Histogram } from "./Histogram.js";
import { SimulatedCountSource } from "./SimulatedCountSource.js";
import {
  accumulateValue,
  EMPTY_ACCUMULATOR,
  type SampleStatistics,
  type StatisticsAccumulator,
  statisticsOf,
} from "./Statistics.js";

export type RadioactivityModelOptions = {
  /** Host-side Geiger controls from Preferences → Simulation. */
  readonly geigerControls?: GeigerDeviceControls;

  /**
   * Locks {@link sourceTypeProperty} to one source for the lifetime of the
   * model (reset returns to this value too, since it is the Property's
   * initial value). Each screen now has a fixed counting source, so there is
   * no UI that could ever change it away from this. Defaults to
   * {@link CountSourceType.SIMULATED}.
   */
  readonly fixedSourceType?: CountSourceTypeValue;

  /** Range offered for {@link RadioactivityModel.countingIntervalProperty}. Defaults to {@link COUNTING_INTERVAL_RANGE}. */
  readonly countingIntervalRange?: Range;

  /** Arrow-button step for the counting interval control. Defaults to {@link COUNTING_INTERVAL_DELTA}. */
  readonly countingIntervalDelta?: number;

  /** Decimal places shown for the counting interval control. Defaults to {@link COUNTING_INTERVAL_DECIMAL_PLACES}. */
  readonly countingIntervalDecimalPlaces?: number;

  /**
   * Initial (and reset) value of {@link RadioactivityModel.isContinuousProperty}.
   * Defaults to false. Without the "samples per run" control, a run has no
   * way to change the sample count it stops at, so screens without that
   * control default to continuous recording instead.
   */
  readonly defaultContinuous?: boolean;
};

export class RadioactivityModel implements TModel {
  // ── Sources ────────────────────────────────────────────────────────────────

  /** Poisson generator; always available, and the only source with a known λ. */
  public readonly simulatedSource: SimulatedCountSource;

  /** PASCO Wireless Geiger Counter, over Bluetooth or USB. */
  public readonly geigerSource: GeigerCountSource;

  /** Which source feeds the counting cycle. */
  public readonly sourceTypeProperty: Property<CountSourceTypeValue>;

  /** The source selected by {@link sourceTypeProperty}. */
  public readonly activeSourceProperty: TReadOnlyProperty<TCountSource>;

  // ── Acquisition settings ───────────────────────────────────────────────────

  /** Length of one counting interval, in seconds. */
  public readonly countingIntervalProperty: NumberProperty;

  /** Range offered for {@link countingIntervalProperty}, for the view control. */
  public readonly countingIntervalRange: Range;

  /** Arrow-button step for the counting interval control. */
  public readonly countingIntervalDelta: number;

  /** Decimal places shown for the counting interval control. */
  public readonly countingIntervalDecimalPlaces: number;

  /**
   * How many simulated seconds pass per real second. A control on the
   * Simulation screen alone ever changes this away from 1 — a real source's
   * decays cannot be sped up, so the Device screen leaves it at real time.
   */
  public readonly speedMultiplierProperty: Property<number>;

  /** How many intervals a run collects before recording stops on its own. */
  public readonly samplesPerRunProperty: NumberProperty;

  /** When true, recording continues until the user stops it. */
  public readonly isContinuousProperty: BooleanProperty;

  // ── Acquisition state ──────────────────────────────────────────────────────

  /** Whether completed intervals are being kept. */
  public readonly isRecordingProperty: BooleanProperty;

  /** The run collected so far, oldest first. Replaced wholesale on each add. */
  public readonly samplesProperty: Property<readonly CountSample[]>;

  /** Seconds elapsed within the interval currently being counted. */
  public readonly intervalElapsedProperty: NumberProperty;

  /** Counts registered so far within the interval currently being counted. */
  public readonly intervalCountsProperty: NumberProperty;

  /** Counts per second over the most recently completed interval. */
  public readonly lastCountRateProperty: NumberProperty;

  /** Seconds of recording accumulated in the current run. */
  public readonly runTimeProperty: NumberProperty;

  // ── Histogram settings ─────────────────────────────────────────────────────

  /** When true, bin width follows the Freedman–Diaconis rule. */
  public readonly isAutoBinWidthProperty: BooleanProperty;

  /** Bin width used when {@link isAutoBinWidthProperty} is false. */
  public readonly manualBinWidthProperty: NumberProperty;

  // ── Derived results ────────────────────────────────────────────────────────

  /** Mean, standard deviation, and standard deviation of the mean. */
  public readonly statisticsProperty: TReadOnlyProperty<SampleStatistics>;

  /** √mean: what the standard deviation should be if the process is Poisson. */
  public readonly poissonDeviationProperty: TReadOnlyProperty<number>;

  /** The binned run. */
  public readonly histogramProperty: TReadOnlyProperty<Histogram>;

  /** Best-fit Gaussian, or null when there is too little data. */
  public readonly gaussianFitProperty: TReadOnlyProperty<GaussianFitResult | null>;

  /** Text describing the source, used in the exported file's header. */
  public readonly sourceDescriptionProperty: TReadOnlyProperty<string>;

  /** Source running total at the start of the interval being counted. */
  private intervalStartTotal = 0;

  /** Writable views of the two Properties folded forward from the run. */
  private readonly statistics: Property<SampleStatistics>;
  private readonly histogram: Property<Histogram>;

  /** Welford state over every count recorded in the current run. */
  private accumulator: StatisticsAccumulator = EMPTY_ACCUMULATOR;

  /** Frequency of each count value in the current run — the histogram's input. */
  private readonly tally = new CountTally();

  /** How many samples have already been folded into the two above. */
  private consumedSampleCount = 0;

  /** True while the automatic width is being mirrored, to break the cycle. */
  private isMirroringBinWidth = false;

  /** Retained so the source-change listener can be removed on dispose. */
  private readonly sourceTypeListener: () => void;

  /** Retained so the run listener can be removed on dispose. */
  private readonly samplesListener: (samples: readonly CountSample[]) => void;

  /** Retained so the bin-width listener can be removed on dispose. */
  private readonly binWidthListener: () => void;

  public constructor(options?: RadioactivityModelOptions) {
    this.simulatedSource = new SimulatedCountSource(DEFAULT_ACTIVITY);
    this.geigerSource = new GeigerCountSource(options?.geigerControls ?? null);

    this.sourceTypeProperty = new Property<CountSourceTypeValue>(options?.fixedSourceType ?? CountSourceType.SIMULATED);
    this.activeSourceProperty = new DerivedProperty(
      [this.sourceTypeProperty],
      (sourceType): TCountSource =>
        sourceType === CountSourceType.GEIGER_COUNTER ? this.geigerSource : this.simulatedSource,
    );

    this.countingIntervalRange = options?.countingIntervalRange ?? COUNTING_INTERVAL_RANGE;
    this.countingIntervalDelta = options?.countingIntervalDelta ?? COUNTING_INTERVAL_DELTA;
    this.countingIntervalDecimalPlaces = options?.countingIntervalDecimalPlaces ?? COUNTING_INTERVAL_DECIMAL_PLACES;
    this.countingIntervalProperty = new NumberProperty(DEFAULT_COUNTING_INTERVAL, {
      range: this.countingIntervalRange,
      units: "s",
    });
    this.speedMultiplierProperty = new Property<number>(DEFAULT_SPEED_MULTIPLIER, {
      validValues: SPEED_MULTIPLIER_CHOICES,
    });
    this.samplesPerRunProperty = new NumberProperty(DEFAULT_SAMPLES_PER_RUN, { range: SAMPLES_PER_RUN_RANGE });
    this.isContinuousProperty = new BooleanProperty(options?.defaultContinuous ?? false);

    this.isRecordingProperty = new BooleanProperty(false);
    this.samplesProperty = new Property<readonly CountSample[]>([]);
    this.intervalElapsedProperty = new NumberProperty(0, { units: "s" });
    this.intervalCountsProperty = new NumberProperty(0);
    this.lastCountRateProperty = new NumberProperty(0);
    this.runTimeProperty = new NumberProperty(0, { units: "s" });

    this.isAutoBinWidthProperty = new BooleanProperty(true);
    this.manualBinWidthProperty = new NumberProperty(BIN_WIDTH_RANGE.min, { range: BIN_WIDTH_RANGE });

    // Statistics and the histogram are folded forward from the run rather than
    // derived from it: a run only ever grows by appending, so each new interval
    // costs one Welford update and one tally increment, whatever the run length.
    // As DerivedProperties they re-read the entire run on every completed
    // interval — an O(N log N) sort among it, for the automatic bin width —
    // which at 100x is unbounded per-frame work that grows for as long as the
    // sim is left running.
    this.statistics = new Property<SampleStatistics>(statisticsOf(EMPTY_ACCUMULATOR));
    this.statisticsProperty = this.statistics;
    this.histogram = new Property<Histogram>(createHistogramOf(this.tally));
    this.histogramProperty = this.histogram;

    this.poissonDeviationProperty = new DerivedProperty([this.statisticsProperty], (statistics) =>
      Math.sqrt(Math.max(statistics.mean, 0)),
    );
    this.gaussianFitProperty = new DerivedProperty([this.histogramProperty], (histogram) =>
      fitGaussian(histogram.binCenters, histogram.binCounts),
    );

    this.samplesListener = (samples) => this.foldRunForward(samples);
    this.samplesProperty.link(this.samplesListener);

    // Re-bin when the width changes, but not while the automatic width is being
    // mirrored into manualBinWidthProperty below — that write is part of a
    // rebin already in progress.
    this.binWidthListener = () => {
      if (!this.isMirroringBinWidth) {
        this.rebuildHistogram();
      }
    };
    this.isAutoBinWidthProperty.link(this.binWidthListener);
    this.manualBinWidthProperty.link(this.binWidthListener);

    this.sourceDescriptionProperty = new DerivedProperty(
      [this.sourceTypeProperty, this.geigerSource.deviceInfoProperty, this.simulatedSource.activityProperty],
      (sourceType, deviceInfo, activity) => {
        if (sourceType === CountSourceType.GEIGER_COUNTER) {
          return deviceInfo ? `PASCO Wireless Geiger Counter ${deviceInfo.serialId ?? ""}`.trim() : "Geiger counter";
        }
        return `Simulated (true mean rate ${activity} counts/s)`;
      },
    );

    // Switching sources mid-run would otherwise credit the new source with the
    // old one's backlog, so rebase the interval on the new source's total.
    this.sourceTypeListener = () => {
      this.restartInterval();
    };
    this.sourceTypeProperty.lazyLink(this.sourceTypeListener);
  }

  /** Range of activities the simulated source accepts, for view controls. */
  public get activityRange(): Range {
    return ACTIVITY_RANGE;
  }

  /** Starts keeping completed intervals. */
  public startRecording(): void {
    // Finishing a run and pressing Record again reads as "do it again", so a
    // completed run is cleared rather than appended to.
    if (!this.isContinuousProperty.value && this.samplesProperty.value.length >= this.samplesPerRunProperty.value) {
      this.clearRun();
    }
    this.restartInterval();
    this.isRecordingProperty.value = true;
  }

  /** Stops keeping completed intervals; the live readout keeps running. */
  public stopRecording(): void {
    this.isRecordingProperty.value = false;
  }

  /** Discards the collected run, leaving settings and the connection alone. */
  public clearRun(): void {
    this.samplesProperty.value = [];
    this.runTimeProperty.value = 0;
    this.restartInterval();
  }

  /**
   * Advances the counting cycle.
   *
   * @param dt - elapsed seconds since the previous frame
   */
  public step(dt: number): void {
    // A backgrounded tab can hand back a very large dt. Counting it in full
    // would manufacture a burst of empty intervals for time the source was not
    // actually observed, so it is capped.
    const clampedDt = Math.min(Math.max(dt, 0), MAXIMUM_STEP_DT);
    if (clampedDt === 0) {
      return;
    }

    // The speed multiplier scales simulated time after the backgrounded-tab
    // guard above, not before it — so a real wall-clock stall is still capped
    // by MAXIMUM_STEP_DT, while a deliberate 10x or 100x speedup is not.
    let remainingDt = clampedDt * this.speedMultiplierProperty.value;

    const source = this.activeSourceProperty.value;
    const interval = this.countingIntervalProperty.value;

    // A simulated count is one Poisson draw for whatever dt it is given. Once
    // a speed multiplier or a short interval lets one frame span more than
    // one counting interval, the source must be stepped once per interval
    // boundary rather than once for the whole frame — otherwise every
    // interval after the first in that frame would close over a count that
    // was already spent (and reset to zero) by the one before it.
    //
    // There used to be a cap on how many intervals a single frame could
    // complete, meant as a runaway-loop guard. It instead created a runaway:
    // once a slow frame handed back more simulated time than the cap could
    // drain, the surplus was stepped through the source in one lump without
    // completing any interval, then misread on the next frame as a single
    // interval's worth of counts — a spike that grew every time it
    // recurred, since draining the backlog could never outrun the surplus
    // still arriving each frame. MAXIMUM_STEP_DT already bounds remainingDt,
    // and the shortest interval (0.25 s) keeps the iteration count here
    // trivial even at the fastest speed multiplier, so no cap is needed.
    // Every quantity the loop touches is accumulated locally and published once,
    // after the loop. Writing to the Properties inside it instead would fire the
    // whole derived chain — counts, statistics, histogram, Gaussian fit, and the
    // views listening to them — once per completed interval. At 100x that is
    // hundreds of full recomputes in a single frame, which lengthens the frame,
    // which enlarges the next dt: the sim gets slower the longer it runs at
    // speed, until it stops responding.
    const samples = this.samplesProperty.value;
    let appended: CountSample[] | null = null;
    let sampleCount = samples.length;
    let elapsed = this.intervalElapsedProperty.value;
    let runTime = this.runTimeProperty.value;
    let lastCountRate = this.lastCountRateProperty.value;

    while (remainingDt > 0) {
      const stepDt = Math.min(remainingDt, Math.max(interval - elapsed, 0));

      source.step(stepDt);
      elapsed += stepDt;

      if (this.isRecordingProperty.value) {
        runTime += stepDt;
      }

      remainingDt -= stepDt;

      if (elapsed >= interval) {
        const counts = Math.max(0, Math.round(source.totalCountsProperty.value - this.intervalStartTotal));
        lastCountRate = counts / interval;

        if (this.isRecordingProperty.value) {
          appended ??= [];
          appended.push({
            index: sampleCount + 1,
            startTime: sampleCount * interval,
            duration: interval,
            counts,
          });
          sampleCount += 1;

          if (!this.isContinuousProperty.value && sampleCount >= this.samplesPerRunProperty.value) {
            this.stopRecording();
          }
        }

        // Carry the remainder rather than zeroing it, so intervals do not drift
        // relative to the frame rate over a long run.
        elapsed -= interval;
        this.intervalStartTotal = source.totalCountsProperty.value;
      }
    }

    this.intervalElapsedProperty.value = elapsed;
    this.intervalCountsProperty.value = source.totalCountsProperty.value - this.intervalStartTotal;
    this.runTimeProperty.value = runTime;
    this.lastCountRateProperty.value = lastCountRate;

    if (appended) {
      this.samplesProperty.value = [...samples, ...appended];
    }
  }

  public reset(): void {
    this.stopRecording();
    this.samplesProperty.value = [];
    this.sourceTypeProperty.reset();
    this.countingIntervalProperty.reset();
    this.speedMultiplierProperty.reset();
    this.samplesPerRunProperty.reset();
    this.isContinuousProperty.reset();
    this.isAutoBinWidthProperty.reset();
    this.manualBinWidthProperty.reset();
    this.runTimeProperty.reset();
    this.lastCountRateProperty.reset();
    this.simulatedSource.reset();
    this.geigerSource.reset();
    this.restartInterval();
  }

  public dispose(): void {
    this.sourceTypeProperty.unlink(this.sourceTypeListener);
    this.samplesProperty.unlink(this.samplesListener);
    this.isAutoBinWidthProperty.unlink(this.binWidthListener);
    this.manualBinWidthProperty.unlink(this.binWidthListener);
    this.simulatedSource.dispose();
    this.geigerSource.dispose();
  }

  /**
   * Brings the statistics and the histogram up to date with the run.
   *
   * The run is append-only in normal operation, so the usual path folds in just
   * the samples that are new since the last call. Anything else — a cleared run,
   * a reset — is a shrink, and rebuilds from scratch, which is O(N) but happens
   * once rather than every frame.
   */
  private foldRunForward(samples: readonly CountSample[]): void {
    if (samples.length < this.consumedSampleCount) {
      this.accumulator = EMPTY_ACCUMULATOR;
      this.tally.clear();
      this.consumedSampleCount = 0;
    }

    for (let index = this.consumedSampleCount; index < samples.length; index++) {
      const counts = samples[index]?.counts ?? 0;
      this.accumulator = accumulateValue(this.accumulator, counts);
      this.tally.add(counts);
    }
    this.consumedSampleCount = samples.length;

    this.statistics.value = statisticsOf(this.accumulator);
    this.rebuildHistogram();
  }

  /**
   * Re-bins the run at the width currently in force.
   *
   * While automatic binning is on, the chosen width is mirrored into the manual
   * Property. The bin-width control is disabled but still visible, so this is
   * what lets it report the width actually in use rather than a stale number —
   * and unchecking "automatic" then starts from where the data left off,
   * instead of jumping the histogram to an unrelated width.
   */
  private rebuildHistogram(): void {
    if (this.isAutoBinWidthProperty.value) {
      const chosen = BIN_WIDTH_RANGE.constrainValue(Math.round(chooseBinWidthOf(this.tally)));
      this.isMirroringBinWidth = true;
      this.manualBinWidthProperty.value = chosen;
      this.isMirroringBinWidth = false;
    }

    this.histogram.value = createHistogramOf(this.tally, this.manualBinWidthProperty.value);
  }

  /** Rebases the counting cycle on the active source's current total. */
  private restartInterval(): void {
    this.intervalStartTotal = this.activeSourceProperty.value.totalCountsProperty.value;
    this.intervalElapsedProperty.value = 0;
    this.intervalCountsProperty.value = 0;
  }
}
