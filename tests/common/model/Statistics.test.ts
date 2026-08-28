/**
 * Unit tests for descriptive statistics and the distributions the sim compares
 * measurements against.
 */

import { describe, expect, it } from "vitest";
import {
  accumulateValue,
  computeStatistics,
  EMPTY_ACCUMULATOR,
  EMPTY_STATISTICS,
  gaussianDensity,
  logFactorial,
  poissonProbability,
  statisticsOf,
} from "../../../src/common/model/Statistics.js";

describe("computeStatistics", () => {
  it("returns all-zero statistics for no data instead of NaN", () => {
    expect(computeStatistics([])).toEqual(EMPTY_STATISTICS);
  });

  it("reports zero spread for a single measurement rather than NaN", () => {
    const statistics = computeStatistics([17]);
    expect(statistics.sampleCount).toBe(1);
    expect(statistics.mean).toBe(17);
    expect(statistics.variance).toBe(0);
    expect(statistics.standardDeviation).toBe(0);
    expect(statistics.standardErrorOfMean).toBe(0);
  });

  it("uses the N − 1 denominator for the sample variance", () => {
    // For [2,4,4,4,5,5,7,9]: mean 5, Σ(x−x̄)² = 32, so s² = 32/7.
    const statistics = computeStatistics([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(statistics.mean).toBeCloseTo(5, 12);
    expect(statistics.variance).toBeCloseTo(32 / 7, 12);
    expect(statistics.standardDeviation).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it("computes the standard deviation of the mean as s/√N", () => {
    const values = [10, 12, 14, 16, 18];
    const statistics = computeStatistics(values);
    expect(statistics.standardErrorOfMean).toBeCloseTo(statistics.standardDeviation / Math.sqrt(values.length), 12);
  });

  it("tracks the extremes and the total", () => {
    const statistics = computeStatistics([4, 9, 1, 7]);
    expect(statistics.minimum).toBe(1);
    expect(statistics.maximum).toBe(9);
    expect(statistics.total).toBe(21);
  });

  it("stays accurate when the mean dwarfs the spread", () => {
    // The textbook Σx² − (Σx)²/N form loses most of its significant digits
    // here; Welford's algorithm does not. This is the high-count-rate case.
    const values = [1_000_000_001, 1_000_000_002, 1_000_000_003, 1_000_000_004];
    const statistics = computeStatistics(values);
    expect(statistics.mean).toBeCloseTo(1_000_000_002.5, 6);
    expect(statistics.variance).toBeCloseTo(5 / 3, 9);
  });
});

describe("accumulateValue", () => {
  it("gives bit-identical results to the batch pass", () => {
    // The live run folds one value in at a time rather than re-reading the run,
    // so the two paths must not drift apart.
    const values = [12, 19, 7, 23, 18, 15, 21, 9, 16, 20];

    let state = EMPTY_ACCUMULATOR;
    for (const value of values) {
      state = accumulateValue(state, value);
    }

    expect(statisticsOf(state)).toEqual(computeStatistics(values));
  });

  it("matches the batch pass at every prefix of a run", () => {
    // A run is read after every completed interval, not just at the end.
    const values = [30, 14, 22, 27, 11, 25, 19, 33];

    let state = EMPTY_ACCUMULATOR;
    for (let length = 1; length <= values.length; length++) {
      state = accumulateValue(state, values[length - 1] as number);
      expect(statisticsOf(state)).toEqual(computeStatistics(values.slice(0, length)));
    }
  });

  it("reports an empty accumulator as the empty statistics", () => {
    expect(statisticsOf(EMPTY_ACCUMULATOR)).toEqual(EMPTY_STATISTICS);
  });
});

describe("logFactorial", () => {
  it("matches exact factorials for small n", () => {
    expect(Math.exp(logFactorial(0))).toBeCloseTo(1, 9);
    expect(Math.exp(logFactorial(1))).toBeCloseTo(1, 9);
    expect(Math.exp(logFactorial(5))).toBeCloseTo(120, 6);
    expect(Math.exp(logFactorial(10))).toBeCloseTo(3_628_800, 1);
  });

  it("stays finite where n! itself overflows a double", () => {
    // 200! is about 10^375 — far past Number.MAX_VALUE.
    expect(Number.isFinite(logFactorial(200))).toBe(true);
  });
});

describe("poissonProbability", () => {
  it("matches hand-computed values", () => {
    // P(0; 1) = P(1; 1) = e^-1
    expect(poissonProbability(0, 1)).toBeCloseTo(Math.exp(-1), 12);
    expect(poissonProbability(1, 1)).toBeCloseTo(Math.exp(-1), 12);
    // P(2; 3) = e^-3 · 9/2
    expect(poissonProbability(2, 3)).toBeCloseTo(Math.exp(-3) * 4.5, 12);
  });

  it("sums to one over all outcomes", () => {
    let total = 0;
    for (let k = 0; k <= 200; k++) {
      total += poissonProbability(k, 20);
    }
    expect(total).toBeCloseTo(1, 9);
  });

  it("has variance equal to its mean — the result the sim is about", () => {
    const lambda = 25;
    let mean = 0;
    let secondMoment = 0;
    for (let k = 0; k <= 400; k++) {
      const probability = poissonProbability(k, lambda);
      mean += k * probability;
      secondMoment += k * k * probability;
    }
    expect(mean).toBeCloseTo(lambda, 6);
    expect(secondMoment - mean * mean).toBeCloseTo(lambda, 6);
  });

  it("stays computable at a large mean, where λ^k and k! both overflow", () => {
    const probability = poissonProbability(200, 200);
    expect(Number.isFinite(probability)).toBe(true);
    // The mode of a Poisson sits at its mean, with height about 1/√(2πλ).
    expect(probability).toBeCloseTo(1 / Math.sqrt(2 * Math.PI * 200), 3);
  });

  it("degenerates sensibly at zero mean", () => {
    expect(poissonProbability(0, 0)).toBe(1);
    expect(poissonProbability(3, 0)).toBe(0);
    expect(poissonProbability(-1, 5)).toBe(0);
  });
});

describe("gaussianDensity", () => {
  it("peaks at 1/(σ√2π) on the mean", () => {
    expect(gaussianDensity(5, 5, 2)).toBeCloseTo(1 / (2 * Math.sqrt(2 * Math.PI)), 12);
  });

  it("integrates to one", () => {
    const mean = 20;
    const deviation = 4;
    const step = 0.01;
    let integral = 0;
    for (let x = mean - 10 * deviation; x <= mean + 10 * deviation; x += step) {
      integral += gaussianDensity(x, mean, deviation) * step;
    }
    expect(integral).toBeCloseTo(1, 6);
  });

  it("returns zero for a non-positive width instead of dividing by zero", () => {
    expect(gaussianDensity(1, 0, 0)).toBe(0);
    expect(gaussianDensity(1, 0, -2)).toBe(0);
  });

  it("approaches the Poisson distribution as the mean grows", () => {
    // The reason the sim offers a Gaussian overlay at all — and the reason it
    // is not the default: the agreement is excellent at the peak but only a
    // few percent out in the shoulders, improving as 1/sqrt(lambda).
    const relativeErrorAtOneSigma = (lambda: number): number => {
      const deviation = Math.sqrt(lambda);
      const k = Math.round(lambda + deviation);
      const gaussian = gaussianDensity(k, lambda, deviation);
      return Math.abs(poissonProbability(k, lambda) - gaussian) / gaussian;
    };

    // At the peak the two agree closely even at a modest mean.
    const peakError =
      Math.abs(poissonProbability(100, 100) - gaussianDensity(100, 100, 10)) / gaussianDensity(100, 100, 10);
    expect(peakError).toBeLessThan(0.005);

    // A sim-typical mean of 20 counts is where the skew is still visible.
    expect(relativeErrorAtOneSigma(25)).toBeGreaterThan(0.02);

    // Agreement improves monotonically with the mean, and is within 1% by 1600.
    const errors = [25, 100, 400, 1600].map(relativeErrorAtOneSigma);
    for (let i = 1; i < errors.length; i++) {
      expect(errors[i]).toBeLessThan(errors[i - 1] as number);
    }
    expect(errors[errors.length - 1]).toBeLessThan(0.01);
  });
});
