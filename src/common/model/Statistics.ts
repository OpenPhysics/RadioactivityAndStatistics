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
 * Computes descriptive statistics in a single pass.
 *
 * Uses Welford's algorithm rather than the textbook Σx² − (Σx)²/N form, which
 * loses catastrophic precision when the mean is large compared with the spread
 * — exactly the regime of a high-count-rate source.
 *
 * A single measurement has no defined scatter, so variance and both deviations
 * are reported as 0 for N = 1 rather than NaN.
 */
export function computeStatistics(values: readonly number[]): SampleStatistics {
  const sampleCount = values.length;
  if (sampleCount === 0) {
    return EMPTY_STATISTICS;
  }

  let mean = 0;
  let sumSquaredDeviations = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let total = 0;
  let index = 0;

  for (const value of values) {
    index += 1;
    const delta = value - mean;
    mean += delta / index;
    sumSquaredDeviations += delta * (value - mean);
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    total += value;
  }

  const variance = sampleCount > 1 ? sumSquaredDeviations / (sampleCount - 1) : 0;
  const standardDeviation = Math.sqrt(variance);

  return {
    sampleCount,
    mean,
    variance,
    standardDeviation,
    standardErrorOfMean: standardDeviation / Math.sqrt(sampleCount),
    minimum,
    maximum,
    total,
  };
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
