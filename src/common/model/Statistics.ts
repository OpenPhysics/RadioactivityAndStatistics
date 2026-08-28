/**
 * Statistics.ts
 *
 * Descriptive statistics and the probability distributions a counting
 * experiment is compared against. Every function here is pure, so the whole
 * file is unit-testable without a model or a view.
 *
 * ── Which spread is which ─────────────────────────────────────────────────────
 * The sim reports two different "spread" numbers and students routinely confuse
 * them, so both are computed explicitly:
 *
 *   - standard deviation (s): how much a SINGLE measurement scatters. It does
 *     not shrink as you take more data; it converges on the true σ.
 *   - standard deviation of the mean (s/√N), a.k.a. the standard error: how
 *     precisely the MEAN is known. This one does shrink, as 1/√N.
 *
 * ── Why Poisson ───────────────────────────────────────────────────────────────
 * Radioactive decays are independent events at a constant average rate, so the
 * number seen in a fixed window is Poisson distributed with parameter λ. The
 * signature result is that its variance equals its mean, so σ = √λ — a
 * prediction the sim lets students check against the measured s. For λ ≳ 20 the
 * Poisson distribution is closely approximated by a Gaussian of the same mean
 * and σ = √λ, which is why both overlays are offered.
 */

/** Descriptive statistics of one set of counting measurements. */
export type SampleStatistics = {
  /** Number of measurements, N. */
  readonly sampleCount: number;
  /** Arithmetic mean of the counts. */
  readonly mean: number;
  /** Sample variance, with the N − 1 (Bessel-corrected) denominator. */
  readonly variance: number;
  /** Sample standard deviation, s — the scatter of a single measurement. */
  readonly standardDeviation: number;
  /** Standard deviation of the mean, s/√N — the uncertainty on the mean. */
  readonly standardErrorOfMean: number;
  /** Smallest count observed. */
  readonly minimum: number;
  /** Largest count observed. */
  readonly maximum: number;
  /** Sum of all counts. */
  readonly total: number;
};

/** Statistics of an empty data set: everything zero, nothing NaN. */
export const EMPTY_STATISTICS: SampleStatistics = {
  sampleCount: 0,
  mean: 0,
  variance: 0,
  standardDeviation: 0,
  standardErrorOfMean: 0,
  minimum: 0,
  maximum: 0,
  total: 0,
};

/**
 * Running state of Welford's algorithm: everything needed to fold in one more
 * measurement without revisiting the ones already seen.
 *
 * This is what lets a live run stay cheap. A counting run only ever grows by
 * appending, so recomputing from the whole array on each new interval is
 * O(N) work per interval and O(N²) over the run — which at a high speed
 * multiplier is enough on its own to stall the sim. Folding in the one new
 * value is O(1), and gives bit-identical results to the batch pass because it
 * is the same recurrence.
 */
export type StatisticsAccumulator = {
  readonly sampleCount: number;
  readonly mean: number;
  /** Σ(xᵢ − x̄)², Welford's M₂. Variance is this over N − 1. */
  readonly sumSquaredDeviations: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly total: number;
};

/** The accumulator before any measurement has been folded in. */
export const EMPTY_ACCUMULATOR: StatisticsAccumulator = {
  sampleCount: 0,
  mean: 0,
  sumSquaredDeviations: 0,
  minimum: Number.POSITIVE_INFINITY,
  maximum: Number.NEGATIVE_INFINITY,
  total: 0,
};

/**
 * Folds one more measurement into a running accumulator.
 *
 * Uses Welford's update rather than banking Σx and Σx², which loses
 * catastrophic precision when the mean is large compared with the spread —
 * exactly the regime of a high-count-rate source.
 */
export function accumulateValue(state: StatisticsAccumulator, value: number): StatisticsAccumulator {
  const sampleCount = state.sampleCount + 1;
  const delta = value - state.mean;
  const mean = state.mean + delta / sampleCount;

  return {
    sampleCount,
    mean,
    sumSquaredDeviations: state.sumSquaredDeviations + delta * (value - mean),
    minimum: Math.min(state.minimum, value),
    maximum: Math.max(state.maximum, value),
    total: state.total + value,
  };
}

/**
 * Reads the reportable statistics out of an accumulator.
 *
 * A single measurement has no defined scatter, so variance and both deviations
 * are reported as 0 for N = 1 rather than NaN.
 */
export function statisticsOf(state: StatisticsAccumulator): SampleStatistics {
  if (state.sampleCount === 0) {
    return EMPTY_STATISTICS;
  }

  const variance = state.sampleCount > 1 ? state.sumSquaredDeviations / (state.sampleCount - 1) : 0;
  const standardDeviation = Math.sqrt(variance);

  return {
    sampleCount: state.sampleCount,
    mean: state.mean,
    variance,
    standardDeviation,
    standardErrorOfMean: standardDeviation / Math.sqrt(state.sampleCount),
    minimum: state.minimum,
    maximum: state.maximum,
    total: state.total,
  };
}

/**
 * Computes descriptive statistics of a complete data set in a single pass.
 *
 * The batch form, for callers holding an array they will not extend — the CSV
 * export, and the tests. A live run uses {@link accumulateValue} instead.
 */
export function computeStatistics(values: readonly number[]): SampleStatistics {
  let state = EMPTY_ACCUMULATOR;
  for (const value of values) {
    state = accumulateValue(state, value);
  }
  return statisticsOf(state);
}

// ── Distributions ────────────────────────────────────────────────────────────

/** Lanczos coefficients (g = 7, n = 9) for the log-gamma approximation. */
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/**
 * Natural log of the gamma function, via the Lanczos approximation.
 *
 * Working in logs is what keeps the Poisson formula usable: at λ = 200 both
 * λ^k and k! overflow a double long before their ratio does.
 */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflection formula, for arguments where the series below is inaccurate.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }

  const z = x - 1;
  let series = LANCZOS_COEFFICIENTS[0] ?? 0;
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    series += (LANCZOS_COEFFICIENTS[i] ?? 0) / (z + i);
  }
  const t = z + LANCZOS_COEFFICIENTS.length - 1.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

/** Natural log of n! for non-negative integers. */
export function logFactorial(n: number): number {
  return logGamma(n + 1);
}

/**
 * Poisson probability of observing exactly k events when the mean is lambda.
 *
 * P(k; λ) = e^(−λ) λ^k / k!, evaluated in log space.
 */
export function poissonProbability(k: number, lambda: number): number {
  if (k < 0 || !Number.isFinite(k) || !Number.isFinite(lambda)) {
    return 0;
  }
  if (lambda <= 0) {
    return k === 0 ? 1 : 0;
  }
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
}

/** Gaussian probability density at x for the given mean and standard deviation. */
export function gaussianDensity(x: number, mean: number, standardDeviation: number): number {
  if (standardDeviation <= 0 || !Number.isFinite(standardDeviation)) {
    return 0;
  }
  const z = (x - mean) / standardDeviation;
  return Math.exp(-0.5 * z * z) / (standardDeviation * Math.sqrt(2 * Math.PI));
}
