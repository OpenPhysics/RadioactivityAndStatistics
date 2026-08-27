/**
 * Unit tests for the Levenberg–Marquardt Gaussian fit.
 *
 * The fit is the one place the sim reports a number a student cannot check by
 * hand, so these tests hold it to recovering parameters that are known in
 * advance.
 */

import { describe, expect, it } from "vitest";
import { fitGaussian } from "../../../src/common/model/GaussianFit.js";

/** Samples a Gaussian on unit bins, as a noiseless histogram would look. */
function syntheticHistogram(
  amplitude: number,
  mean: number,
  deviation: number,
  from: number,
  to: number,
): { centers: number[]; counts: number[] } {
  const centers: number[] = [];
  const counts: number[] = [];
  for (let x = from; x <= to; x++) {
    const z = (x - mean) / deviation;
    centers.push(x);
    counts.push(amplitude * Math.exp(-0.5 * z * z));
  }
  return { centers, counts };
}

describe("fitGaussian", () => {
  it("refuses to fit three parameters to fewer than four bins", () => {
    expect(fitGaussian([1, 2, 3], [1, 2, 1])).toBeNull();
  });

  it("returns null when there is no signal to fit", () => {
    expect(fitGaussian([1, 2, 3, 4, 5], [0, 0, 0, 0, 0])).toBeNull();
  });

  it("recovers the parameters of a clean Gaussian", () => {
    const { centers, counts } = syntheticHistogram(50, 20, 4, 5, 35);
    const fit = fitGaussian(centers, counts);

    expect(fit).not.toBeNull();
    expect(fit?.mean).toBeCloseTo(20, 4);
    expect(fit?.standardDeviation).toBeCloseTo(4, 4);
    expect(fit?.amplitude).toBeCloseTo(50, 3);
    expect(fit?.converged).toBe(true);
  });

  it("recovers an off-centre, narrow peak", () => {
    const { centers, counts } = syntheticHistogram(120, 8, 1.5, 0, 20);
    const fit = fitGaussian(centers, counts);

    expect(fit?.mean).toBeCloseTo(8, 3);
    expect(fit?.standardDeviation).toBeCloseTo(1.5, 3);
  });

  it("reports a near-zero reduced chi-square on noiseless data", () => {
    const { centers, counts } = syntheticHistogram(80, 30, 5, 10, 50);
    const fit = fitGaussian(centers, counts);
    expect(fit?.reducedChiSquare).toBeLessThan(1e-6);
  });

  it("counts degrees of freedom as bins minus the three fitted parameters", () => {
    const { centers, counts } = syntheticHistogram(40, 15, 3, 5, 25);
    const fit = fitGaussian(centers, counts);
    expect(fit?.degreesOfFreedom).toBe(centers.length - 3);
  });

  it("recovers sigma close to sqrt(mean) for Poisson-shaped data", () => {
    // The comparison the Lab screen exists to make: a histogram whose shape is
    // Poisson should fit a Gaussian of width √λ.
    const lambda = 100;
    const centers: number[] = [];
    const counts: number[] = [];
    for (let k = 60; k <= 140; k++) {
      centers.push(k);
      // Gaussian limit of Poisson(100), scaled to 1000 measurements.
      const z = (k - lambda) / Math.sqrt(lambda);
      counts.push((1000 * Math.exp(-0.5 * z * z)) / Math.sqrt(2 * Math.PI * lambda));
    }
    const fit = fitGaussian(centers, counts);
    expect(fit?.mean).toBeCloseTo(lambda, 2);
    expect(fit?.standardDeviation).toBeCloseTo(Math.sqrt(lambda), 2);
  });

  it("keeps the fitted width positive even on ragged data", () => {
    // A short, lumpy run is the normal case early in a measurement; the solver
    // must not wander to a negative or zero width, which is undefined.
    const centers = [10, 11, 12, 13, 14, 15];
    const counts = [1, 0, 3, 1, 2, 1];
    const fit = fitGaussian(centers, counts);
    expect(fit).not.toBeNull();
    expect(fit?.standardDeviation).toBeGreaterThan(0);
    expect(Number.isFinite(fit?.mean ?? Number.NaN)).toBe(true);
  });
});
