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
export function chooseBinWidth(values: readonly number[]): number {
  if (values.length < 4) {
    return 1;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const interquartileRange = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const span = (sorted[sorted.length - 1] ?? 0) - (sorted[0] ?? 0) + 1;

  if (interquartileRange <= 0) {
    return 1;
  }

  const idealWidth = 2 * interquartileRange * values.length ** (-1 / 3);
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

/** Linearly interpolated quantile of an already-sorted array. */
function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const position = (sorted.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

/**
 * Bins count measurements.
 *
 * @param values - the measured counts, one per counting interval
 * @param binWidth - integer bin width; when omitted, chosen by {@link chooseBinWidth}
 */
export function createHistogram(values: readonly number[], binWidth?: number): Histogram {
  if (values.length === 0) {
    return EMPTY_HISTOGRAM;
  }

  const width = Math.max(1, Math.round(binWidth ?? chooseBinWidth(values)));
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }

  // Snap the first edge down to a multiple of the bin width so that re-binning
  // the same data with a different width keeps the bars aligned to the axis.
  const minimumEdge = Math.floor(minimum / width) * width;
  const binCount = Math.min(MAXIMUM_BIN_COUNT, Math.floor((maximum - minimumEdge) / width) + 1);

  const binCounts = new Array<number>(binCount).fill(0);
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - minimumEdge) / width)));
    binCounts[index] = (binCounts[index] ?? 0) + 1;
  }

  const binCenters = binCounts.map((_, index) => minimumEdge + (index + 0.5) * width);

  return {
    binWidth: width,
    minimumEdge,
    binCounts,
    binCenters,
    totalSamples: values.length,
    maximumBinCount: Math.max(...binCounts),
  };
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
