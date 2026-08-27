/**
 * GaussianFit.ts
 *
 * Least-squares fit of a Gaussian to a binned count distribution, by the
 * Levenberg–Marquardt method.
 *
 * ── Fit versus prediction ─────────────────────────────────────────────────────
 * The Lab screen can draw three curves, and the distinction matters:
 *
 *   - Poisson prediction — λ taken from the measured mean. No free parameters.
 *   - Gaussian prediction — μ = measured mean, σ = √mean. Also no free
 *     parameters: it asserts the Poisson relation σ = √λ.
 *   - Gaussian FIT — amplitude, μ and σ all floated to minimise χ². The
 *     interesting comparison is the fitted σ against √mean; agreement is
 *     evidence the process really is Poisson.
 *
 * ── Weighting ─────────────────────────────────────────────────────────────────
 * A bin holding nᵢ measurements carries Poisson uncertainty √nᵢ, so each
 * residual is weighted by 1/nᵢ. Empty bins would give infinite weight, so their
 * uncertainty is floored at 1. Unweighted fitting would let the tall central
 * bins dominate and would systematically underestimate σ.
 */

/** Free parameters of the fitted curve, plus goodness-of-fit diagnostics. */
export type GaussianFitResult = {
  /** Peak height of the fitted curve, in measurements per bin. */
  readonly amplitude: number;
  /** Fitted centre of the distribution. */
  readonly mean: number;
  /** Fitted width. Compare against √mean to test the Poisson relation. */
  readonly standardDeviation: number;
  /** Weighted sum of squared residuals at the solution. */
  readonly chiSquare: number;
  /** Number of bins used, minus the three fitted parameters. */
  readonly degreesOfFreedom: number;
  /** χ² per degree of freedom; near 1 means the model describes the data. */
  readonly reducedChiSquare: number;
  /** Whether the iteration met the convergence tolerance before the cap. */
  readonly converged: boolean;
  /** How many iterations were taken. */
  readonly iterations: number;
};

/** Maximum Levenberg–Marquardt iterations before giving up. */
const MAXIMUM_ITERATIONS = 100;

/** Relative change in χ² below which the fit is considered converged. */
const CONVERGENCE_TOLERANCE = 1e-8;

/** Minimum number of bins needed to constrain three parameters. */
const MINIMUM_BINS = 4;

/** Damping above which the iteration is abandoned as stuck. */
const MAXIMUM_DAMPING = 1e12;

/** Determinant magnitude below which the normal equations are called singular. */
const SINGULAR_THRESHOLD = 1e-14;

/** The three fitted parameters, in the order the solver works with them. */
type Parameters3 = readonly [amplitude: number, mean: number, standardDeviation: number];

/** A 3-vector: a gradient, a step, or a column. */
type Vector3 = readonly [number, number, number];

/**
 * The upper triangle of a symmetric 3×3 matrix.
 *
 * JᵀWJ is symmetric by construction, so storing six entries instead of nine
 * removes the nested index loops — and with them a pile of bounds checks that
 * `noUncheckedIndexedAccess` would otherwise require at every access.
 */
type SymmetricMatrix3 = {
  readonly m00: number;
  readonly m01: number;
  readonly m02: number;
  readonly m11: number;
  readonly m12: number;
  readonly m22: number;
};

/**
 * Fits A·exp(−½((x−μ)/σ)²) to binned data.
 *
 * @param binCenters - x value of each bin
 * @param binCounts - number of measurements in each bin
 * @returns the fit, or null when there is too little data to constrain it
 */
export function fitGaussian(binCenters: readonly number[], binCounts: readonly number[]): GaussianFitResult | null {
  const pointCount = Math.min(binCenters.length, binCounts.length);
  if (pointCount < MINIMUM_BINS) {
    return null;
  }

  const initial = estimateInitialParameters(binCenters, binCounts, pointCount);
  if (!initial) {
    return null;
  }

  let parameters = initial;
  let chiSquare = computeChiSquare(binCenters, binCounts, pointCount, parameters);
  let damping = 1e-3;
  let converged = false;
  let iterations = 0;

  while (iterations < MAXIMUM_ITERATIONS) {
    iterations += 1;

    const step = computeStep(binCenters, binCounts, pointCount, parameters, damping);
    const candidate = step && applyStep(parameters, step);

    if (!candidate) {
      // Either the normal equations were singular or the step left the model
      // undefined; more damping shortens the step towards gradient descent.
      damping *= 10;
      if (damping > MAXIMUM_DAMPING) {
        break;
      }
      continue;
    }

    const candidateChiSquare = computeChiSquare(binCenters, binCounts, pointCount, candidate);
    if (candidateChiSquare >= chiSquare) {
      damping *= 10;
      if (damping > MAXIMUM_DAMPING) {
        break;
      }
      continue;
    }

    const improvement = (chiSquare - candidateChiSquare) / Math.max(chiSquare, Number.EPSILON);
    parameters = candidate;
    chiSquare = candidateChiSquare;
    damping = Math.max(damping / 10, 1e-12);

    if (improvement < CONVERGENCE_TOLERANCE) {
      converged = true;
      break;
    }
  }

  const degreesOfFreedom = Math.max(1, pointCount - 3);
  const [amplitude, mean, standardDeviation] = parameters;

  return {
    amplitude,
    mean,
    standardDeviation,
    chiSquare,
    degreesOfFreedom,
    reducedChiSquare: chiSquare / degreesOfFreedom,
    converged,
    iterations,
  };
}

/**
 * Solves the damped normal equations for one Levenberg–Marquardt step.
 *
 * @returns the parameter increment, or null if the system is singular
 */
function computeStep(
  binCenters: readonly number[],
  binCounts: readonly number[],
  pointCount: number,
  parameters: Parameters3,
  damping: number,
): Vector3 | null {
  const [amplitude, mean, standardDeviation] = parameters;

  let m00 = 0;
  let m01 = 0;
  let m02 = 0;
  let m11 = 0;
  let m12 = 0;
  let m22 = 0;
  let g0 = 0;
  let g1 = 0;
  let g2 = 0;

  for (let i = 0; i < pointCount; i++) {
    const x = binCenters[i] ?? 0;
    const observed = binCounts[i] ?? 0;

    // Poisson weighting: a bin holding n measurements is known to ±√n. Empty
    // bins would carry infinite weight, so their uncertainty is floored at 1.
    const weight = 1 / Math.max(observed, 1);

    const z = (x - mean) / standardDeviation;
    const shape = Math.exp(-0.5 * z * z);
    const model = amplitude * shape;
    const residual = observed - model;

    // ∂f/∂A, ∂f/∂μ, ∂f/∂σ
    const j0 = shape;
    const j1 = (model * z) / standardDeviation;
    const j2 = (model * z * z) / standardDeviation;

    m00 += weight * j0 * j0;
    m01 += weight * j0 * j1;
    m02 += weight * j0 * j2;
    m11 += weight * j1 * j1;
    m12 += weight * j1 * j2;
    m22 += weight * j2 * j2;

    g0 += weight * residual * j0;
    g1 += weight * residual * j1;
    g2 += weight * residual * j2;
  }

  // Damping the diagonal is what makes this Levenberg–Marquardt rather than
  // Gauss–Newton: large damping degrades gracefully to a short gradient-descent
  // step, small damping recovers fast quadratic convergence near the minimum.
  const damped: SymmetricMatrix3 = {
    m00: m00 * (1 + damping),
    m01,
    m02,
    m11: m11 * (1 + damping),
    m12,
    m22: m22 * (1 + damping),
  };

  return solveSymmetric3(damped, [g0, g1, g2]);
}

/** Applies a step, rejecting one that would make the model undefined. */
function applyStep(parameters: Parameters3, step: Vector3): Parameters3 | null {
  const amplitude = parameters[0] + step[0];
  const mean = parameters[1] + step[1];
  const standardDeviation = parameters[2] + step[2];

  // A non-positive width is unphysical and divides by zero in the next residual.
  if (!(standardDeviation > 0 && Number.isFinite(amplitude) && Number.isFinite(mean))) {
    return null;
  }
  return [amplitude, mean, standardDeviation];
}

/**
 * Solves a symmetric 3×3 system by Cramer's rule.
 *
 * At this size Cramer's rule is branch-free and exact enough, which keeps the
 * solver free of the pivoting bookkeeping that elimination would need — and the
 * matrix here is JᵀWJ plus a positive diagonal, so it is well conditioned
 * except in the degenerate cases the determinant check already catches.
 *
 * @returns the solution, or null when the matrix is singular
 */
function solveSymmetric3(m: SymmetricMatrix3, v: Vector3): Vector3 | null {
  const columnA: Vector3 = [m.m00, m.m01, m.m02];
  const columnB: Vector3 = [m.m01, m.m11, m.m12];
  const columnC: Vector3 = [m.m02, m.m12, m.m22];

  const determinant = determinant3(columnA, columnB, columnC);
  if (Math.abs(determinant) < SINGULAR_THRESHOLD) {
    return null;
  }

  return [
    determinant3(v, columnB, columnC) / determinant,
    determinant3(columnA, v, columnC) / determinant,
    determinant3(columnA, columnB, v) / determinant,
  ];
}

/** Determinant of the matrix with the given columns. */
function determinant3(a: Vector3, b: Vector3, c: Vector3): number {
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
}

/**
 * Seeds the iteration from the data's own moments.
 *
 * Levenberg–Marquardt only finds a local minimum, so a starting point near the
 * answer matters. Treating the histogram as a discrete distribution and taking
 * its first two moments lands close enough for well-behaved counting data.
 */
function estimateInitialParameters(
  binCenters: readonly number[],
  binCounts: readonly number[],
  pointCount: number,
): Parameters3 | null {
  let total = 0;
  let weightedSum = 0;
  let peak = 0;

  for (let i = 0; i < pointCount; i++) {
    const count = binCounts[i] ?? 0;
    total += count;
    weightedSum += count * (binCenters[i] ?? 0);
    peak = Math.max(peak, count);
  }

  if (total <= 0 || peak <= 0) {
    return null;
  }

  const mean = weightedSum / total;
  let variance = 0;
  for (let i = 0; i < pointCount; i++) {
    const deviation = (binCenters[i] ?? 0) - mean;
    variance += ((binCounts[i] ?? 0) * deviation * deviation) / total;
  }

  // Fall back to the Poisson width when every measurement landed in one bin.
  const standardDeviation = variance > 0 ? Math.sqrt(variance) : Math.max(Math.sqrt(Math.abs(mean)), 1);
  return [peak, mean, standardDeviation];
}

/** Weighted sum of squared residuals for one parameter set. */
function computeChiSquare(
  binCenters: readonly number[],
  binCounts: readonly number[],
  pointCount: number,
  parameters: Parameters3,
): number {
  const [amplitude, mean, standardDeviation] = parameters;
  let chiSquare = 0;
  for (let i = 0; i < pointCount; i++) {
    const x = binCenters[i] ?? 0;
    const observed = binCounts[i] ?? 0;
    const z = (x - mean) / standardDeviation;
    const residual = observed - amplitude * Math.exp(-0.5 * z * z);
    chiSquare += (residual * residual) / Math.max(observed, 1);
  }
  return chiSquare;
}
