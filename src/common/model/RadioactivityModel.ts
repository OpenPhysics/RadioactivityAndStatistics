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
  MAXIMUM_INTERVALS_PER_FRAME,
  MAXIMUM_STEP_DT,
  SAMPLES_PER_RUN_RANGE,
  SPEED_MULTIPLIER_CHOICES,
} from "../../RadioactivityAndStatisticsConstants.js";
import type { CountSample } from "./CountSample.js";
import { CountSourceType, type CountSourceTypeValue, type TCountSource } from "./CountSource.js";
import { fitGaussian, type GaussianFitResult } from "./GaussianFit.js";
import { GeigerCountSource, type GeigerDeviceControls } from "./GeigerCountSource.js";
import { chooseBinWidth, createHistogram, type Histogram } from "./Histogram.js";
import { SimulatedCountSource } from "./SimulatedCountSource.js";
import { computeStatistics, type SampleStatistics } from "./Statistics.js";

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
};

export class RadioactivityModel implements TModel {
  // ── Sources ────────────────────────────────────────────────────────────────

  /** Poisson generator; always available, and the only source with a known λ. */
  public readonly simulatedSource: SimulatedCountSource;

  /** PASCO Wireless Geiger Counter over Web Bluetooth. */
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

  /** Just the counts, in order — the input to every statistic. */
  public readonly countsProperty: TReadOnlyProperty<readonly number[]>;

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

  /** Retained so the source-change listener can be removed on dispose. */
  private readonly sourceTypeListener: () => void;

  /** Retained so the automatic-bin-width listener can be removed on dispose. */
  private readonly autoBinWidthListener: () => void;

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
    this.isContinuousProperty = new BooleanProperty(false);

    this.isRecordingProperty = new BooleanProperty(false);
    this.samplesProperty = new Property<readonly CountSample[]>([]);
    this.intervalElapsedProperty = new NumberProperty(0, { units: "s" });
    this.intervalCountsProperty = new NumberProperty(0);
    this.lastCountRateProperty = new NumberProperty(0);
    this.runTimeProperty = new NumberProperty(0, { units: "s" });

    this.isAutoBinWidthProperty = new BooleanProperty(true);
    this.manualBinWidthProperty = new NumberProperty(BIN_WIDTH_RANGE.min, { range: BIN_WIDTH_RANGE });

    this.countsProperty = new DerivedProperty([this.samplesProperty], (samples) =>
      samples.map((sample) => sample.counts),
    );
    this.statisticsProperty = new DerivedProperty([this.countsProperty], (counts) => computeStatistics(counts));
    this.poissonDeviationProperty = new DerivedProperty([this.statisticsProperty], (statistics) =>
      Math.sqrt(Math.max(statistics.mean, 0)),
    );

    this.histogramProperty = new DerivedProperty(
      [this.countsProperty, this.isAutoBinWidthProperty, this.manualBinWidthProperty],
      (counts, isAuto, manualWidth) => createHistogram(counts, isAuto ? chooseBinWidth(counts) : manualWidth),
    );
    this.gaussianFitProperty = new DerivedProperty([this.histogramProperty], (histogram) =>
      fitGaussian(histogram.binCenters, histogram.binCounts),
    );

    // While automatic binning is on, mirror the chosen width into the manual
    // Property. The bin-width control is disabled but still visible, so this is
    // what lets it report the width actually in use rather than a stale number
    // — and unchecking "automatic" then starts from where the data left off,
    // instead of jumping the histogram to an unrelated width.
    // Safe against reentrancy: this reacts to the counts and the auto flag,
    // both of which sit upstream of histogramProperty, never downstream.
    this.autoBinWidthListener = () => {
      if (!this.isAutoBinWidthProperty.value) {
        return;
      }
      const chosen = chooseBinWidth(this.countsProperty.value);
      this.manualBinWidthProperty.value = BIN_WIDTH_RANGE.constrainValue(Math.round(chosen));
    };
    this.countsProperty.link(this.autoBinWidthListener);
    this.isAutoBinWidthProperty.link(this.autoBinWidthListener);

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
    let completed = 0;

    // A simulated count is one Poisson draw for whatever dt it is given. Once
    // a speed multiplier or a short interval lets one frame span more than
    // one counting interval, the source must be stepped once per interval
    // boundary rather than once for the whole frame — otherwise every
    // interval after the first in that frame would close over a count that
    // was already spent (and reset to zero) by the one before it.
    while (remainingDt > 0) {
      const timeToIntervalEnd =
        completed < MAXIMUM_INTERVALS_PER_FRAME
          ? Math.max(interval - this.intervalElapsedProperty.value, 0)
          : remainingDt;
      const stepDt = Math.min(remainingDt, timeToIntervalEnd);

      source.step(stepDt);
      this.intervalElapsedProperty.value += stepDt;
      this.intervalCountsProperty.value = source.totalCountsProperty.value - this.intervalStartTotal;

      if (this.isRecordingProperty.value) {
        this.runTimeProperty.value += stepDt;
      }

      remainingDt -= stepDt;

      if (completed < MAXIMUM_INTERVALS_PER_FRAME && this.intervalElapsedProperty.value >= interval) {
        this.completeInterval(interval);
        completed += 1;
      }
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
    this.countsProperty.unlink(this.autoBinWidthListener);
    this.isAutoBinWidthProperty.unlink(this.autoBinWidthListener);
    this.simulatedSource.dispose();
    this.geigerSource.dispose();
  }

  /** Turns the interval just finished into a sample and starts the next one. */
  private completeInterval(interval: number): void {
    const counts = Math.max(0, Math.round(this.intervalCountsProperty.value));
    this.lastCountRateProperty.value = counts / interval;

    if (this.isRecordingProperty.value) {
      const samples = this.samplesProperty.value;
      const sample: CountSample = {
        index: samples.length + 1,
        startTime: samples.length * interval,
        duration: interval,
        counts,
      };
      this.samplesProperty.value = [...samples, sample];

      if (!this.isContinuousProperty.value && this.samplesProperty.value.length >= this.samplesPerRunProperty.value) {
        this.stopRecording();
      }
    }

    // Carry the remainder rather than zeroing it, so intervals do not drift
    // relative to the frame rate over a long run.
    this.intervalElapsedProperty.value -= interval;
    this.intervalStartTotal = this.activeSourceProperty.value.totalCountsProperty.value;
    this.intervalCountsProperty.value = 0;
  }

  /** Rebases the counting cycle on the active source's current total. */
  private restartInterval(): void {
    this.intervalStartTotal = this.activeSourceProperty.value.totalCountsProperty.value;
    this.intervalElapsedProperty.value = 0;
    this.intervalCountsProperty.value = 0;
  }
}
