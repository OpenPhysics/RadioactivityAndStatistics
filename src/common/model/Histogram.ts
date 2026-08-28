/**
 * Histogram.ts
 *
 * Binning of integer count measurements, plus the expected-frequency curves the
 * Lab screen draws on top of the bars.
 *
 * Counts are integers, so bin edges are kept on integer boundaries and the bin
 * width is an integer. A histogram whose bins straddle half-integers would show
 * a spurious comb pattern, because each bin would capture a different number of
 * possible integer outcomes.
 */

import { gaussianDensity, poissonProbability } from "./Statistics.js";

/** A binned view of one set of count measurements. */
export type Histogram = {
  /** Width of every bin, in counts. Always a positive integer. */
  readonly binWidth: number;
  /** Lower edge of the first bin, inclusive. Always an integer. */
  readonly minimumEdge: number;
  /** Number of measurements falling in each bin. */
  readonly binCounts: readonly number[];
  /** Centre of each bin, for plotting. */
  readonly binCenters: readonly number[];
  /** Total number of measurements binned. */
  readonly totalSamples: number;
  /** Tallest bin, useful for scaling the y axis. */
  readonly maximumBinCount: number;
};

/** An empty histogram, so views never have to special-case "no data yet". */
export const EMPTY_HISTOGRAM: Histogram = {
  binWidth: 1,
  minimumEdge: 0,
  binCounts: [],
  binCenters: [],
  totalSamples: 0,
  maximumBinCount: 0,
};

/** Upper bound on bin count, so a wild data set cannot allocate a huge array. */
const MAXIMUM_BIN_COUNT = 200;

/**
 * Fewest bins the automatic rule will settle for.
 *
 * Freedman–Diaconis optimises density estimation, not legibility, and on a
 * short run it is brutal: 20 samples of a mean-20 source come out as four bars,
 * which shows no distribution at all. Since the point of the histogram here is
 * to let a shape be recognised and compared with a curve, the width is narrowed
 * until there are at least this many bins.
 */
const MINIMUM_TARGET_BINS = 8;

/** Most bins the automatic rule will produce, so a long run stays readable. */
const MAXIMUM_TARGET_BINS = 30;

/**
 * A running tally of how many measurements produced each integer count.
 *
 * Everything downstream — the bin width, the bars, the extremes — depends on
 * the data only through these frequencies, never through the order or the
 * identity of individual measurements. So a run of any length compresses to one
 * number per *distinct count value*, and both the Freedman–Diaconis width and
 * the binning become O(distinct values) instead of O(N) — and the width no
 * longer needs a sort of the whole run at all.
 *
 * That matters because the alternative grows without bound: at 100x a
 * continuous run banks hundreds of intervals per real second, and re-sorting
 * every one of them on every frame is what makes the sim heavier the longer it
 * has been left running. The spread of a counting distribution does not grow
 * with N — it is a few √λ wide — so this tally stays a fixed size while the run
 * does not.
 *
 * Mutable by design: it is a live accumulator, folded forward one measurement
 * at a time. The pure array functions below build one and throw it away.
 */
export class CountTally {
  /** frequencies[value] — how many measurements came out exactly `value`. */
  private readonly frequencies: number[] = [];
  private samples = 0;
  private smallest = Number.POSITIVE_INFINITY;
  private largest = Number.NEGATIVE_INFINITY;

  /** Folds in one measurement. Counts are integers, so the value is rounded. */
  public add(value: number): void {
    const count = Math.max(0, Math.round(value));
    this.frequencies[count] = (this.frequencies[count] ?? 0) + 1;
    this.samples += 1;
    this.smallest = Math.min(this.smallest, count);
    this.largest = Math.max(this.largest, count);
  }

  /** Forgets everything, as when a run is cleared. */
  public clear(): void {
    this.frequencies.length = 0;
    this.samples = 0;
    this.smallest = Number.POSITIVE_INFINITY;
    this.largest = Number.NEGATIVE_INFINITY;
  }

  public get totalSamples(): number {
    return this.samples;
  }

  /** Smallest count observed; +∞ when empty. */
  public get minimum(): number {
    return this.smallest;
  }

  /** Largest count observed; −∞ when empty. */
  public get maximum(): number {
    return this.largest;
  }

  /** Frequency of one count value. */
  public frequencyOf(value: number): number {
    return this.frequencies[value] ?? 0;
  }
}

/** Builds a tally from a complete data set. */
export function createTally(values: readonly number[]): CountTally {
  const tally = new CountTally();
  for (const value of values) {
    tally.add(value);
  }
  return tally;
}

/**
 * Chooses an integer bin width using the Freedman–Diaconis rule, then keeps the
 * resulting bin count inside a legible range.
 *
 * Width = 2 · IQR · N^(−1/3). Unlike Sturges' rule it is driven by the
 * interquartile range rather than the extremes, so a single outlying interval
 * does not wash out the shape of the distribution.
 *
 * Counts are integers, so the width can never go below 1 — a narrow spread
 * simply gets as many bins as it has distinct values.
 */
export function chooseBinWidthOf(tally: CountTally): number {
  if (tally.totalSamples < 4) {
    return 1;
  }

  const interquartileRange = quantileOf(tally, 0.75) - quantileOf(tally, 0.25);
  const span = tally.maximum - tally.minimum + 1;

  if (interquartileRange <= 0) {
    return 1;
  }

  const idealWidth = 2 * interquartileRange * tally.totalSamples ** (-1 / 3);
  let width = Math.max(1, Math.round(idealWidth));

  // Too few bins to show a shape: narrow them until there are enough.
  if (span / width < MINIMUM_TARGET_BINS) {
    width = Math.max(1, Math.floor(span / MINIMUM_TARGET_BINS));
  }
  // Too many to read: widen them.
  if (span / width > MAXIMUM_TARGET_BINS) {
    width = Math.ceil(span / MAXIMUM_TARGET_BINS);
  }

  return Math.max(1, width);
}

/** {@link chooseBinWidthOf} for a caller holding a plain array. */
export function chooseBinWidth(values: readonly number[]): number {
  return chooseBinWidthOf(createTally(values));
}

/**
 * Linearly interpolated quantile, read off the cumulative frequencies.
 *
 * Identical to indexing a sorted copy of the data at (N − 1) · fraction, which
 * is what this replaces — one walk over the distinct values finds both the
 * bracketing order statistics without materialising the sorted array.
 */
function quantileOf(tally: CountTally, fraction: number): number {
  if (tally.totalSamples === 0) {
    return 0;
  }

  const position = (tally.totalSamples - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  let cumulative = 0;
  let lower = tally.maximum;
  let upper = tally.maximum;
  let haveLower = false;

  for (let value = tally.minimum; value <= tally.maximum; value++) {
    cumulative += tally.frequencyOf(value);
    if (!haveLower && cumulative > lowerIndex) {
      lower = value;
      haveLower = true;
    }
    if (cumulative > upperIndex) {
      upper = value;
      break;
    }
  }

  return lower + (upper - lower) * (position - lowerIndex);
}

/**
 * Bins a tally of count measurements.
 *
 * @param tally - the run so far
 * @param binWidth - integer bin width; when omitted, chosen by {@link chooseBinWidthOf}
 */
export function createHistogramOf(tally: CountTally, binWidth?: number): Histogram {
  if (tally.totalSamples === 0) {
    return EMPTY_HISTOGRAM;
  }

  const width = Math.max(1, Math.round(binWidth ?? chooseBinWidthOf(tally)));

  // Snap the first edge down to a multiple of the bin width so that re-binning
  // the same data with a different width keeps the bars aligned to the axis.
  const minimumEdge = Math.floor(tally.minimum / width) * width;
  const binCount = Math.min(MAXIMUM_BIN_COUNT, Math.floor((tally.maximum - minimumEdge) / width) + 1);

  const binCounts = new Array<number>(binCount).fill(0);
  let maximumBinCount = 0;
  for (let value = tally.minimum; value <= tally.maximum; value++) {
    const frequency = tally.frequencyOf(value);
    if (frequency === 0) {
      continue;
    }
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - minimumEdge) / width)));
    const binned = (binCounts[index] ?? 0) + frequency;
    binCounts[index] = binned;
    maximumBinCount = Math.max(maximumBinCount, binned);
  }

  const binCenters = binCounts.map((_, index) => minimumEdge + (index + 0.5) * width);

  return {
    binWidth: width,
    minimumEdge,
    binCounts,
    binCenters,
    totalSamples: tally.totalSamples,
    maximumBinCount,
  };
}

/** {@link createHistogramOf} for a caller holding a plain array. */
export function createHistogram(values: readonly number[], binWidth?: number): Histogram {
  return createHistogramOf(createTally(values), binWidth);
}

/**
 * Expected number of measurements per bin if the counts are Poisson with the
 * given mean, on the same bins as `histogram`.
 *
 * Each bin's expectation is the sum of P(k; λ) over the integers it contains,
 * scaled by N. Summing over the integers rather than sampling a density at the
 * bin centre keeps the curve correct for wide bins and small λ, where the
 * distribution is visibly skewed.
 */
export function poissonExpectation(histogram: Histogram, mean: number): number[] {
  return histogram.binCenters.map((_, binIndex) => {
    const firstInteger = Math.ceil(histogram.minimumEdge + binIndex * histogram.binWidth);
    const lastInteger = Math.ceil(histogram.minimumEdge + (binIndex + 1) * histogram.binWidth) - 1;

    let probability = 0;
    for (let k = firstInteger; k <= lastInteger; k++) {
      probability += poissonProbability(k, mean);
    }
    return probability * histogram.totalSamples;
  });
}

/**
 * Expected number of measurements per bin for a Gaussian of the given mean and
 * standard deviation, evaluated on a finer grid than the bars.
 *
 * @param histogram - supplies the binning and the sample total for scaling
 * @param mean - centre of the Gaussian
 * @param standardDeviation - width of the Gaussian
 * @param pointCount - how many points to evaluate across the plotted range
 * @returns (count, expectedFrequency) pairs, suitable for a smooth line plot
 */
export function gaussianCurve(
  histogram: Histogram,
  mean: number,
  standardDeviation: number,
  pointCount = 120,
): { x: number; y: number }[] {
  if (histogram.binCounts.length === 0 || standardDeviation <= 0) {
    return [];
  }

  const start = histogram.minimumEdge;
  const end = histogram.minimumEdge + histogram.binCounts.length * histogram.binWidth;
  const scale = histogram.totalSamples * histogram.binWidth;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= pointCount; i++) {
    const x = start + ((end - start) * i) / pointCount;
    points.push({ x, y: scale * gaussianDensity(x, mean, standardDeviation) });
  }
  return points;
}
