/**
 * Unit tests for binning and the expected-frequency curves.
 */

import { describe, expect, it } from "vitest";
import {
  chooseBinWidth,
  createHistogram,
  EMPTY_HISTOGRAM,
  gaussianCurve,
  poissonExpectation,
} from "../../../src/common/model/Histogram.js";

describe("createHistogram", () => {
  it("returns the empty histogram for no data", () => {
    expect(createHistogram([])).toEqual(EMPTY_HISTOGRAM);
  });

  it("bins integers with unit width", () => {
    const histogram = createHistogram([3, 3, 4, 5, 5, 5], 1);
    expect(histogram.minimumEdge).toBe(3);
    expect(histogram.binWidth).toBe(1);
    expect(histogram.binCounts).toEqual([2, 1, 3]);
    expect(histogram.binCenters).toEqual([3.5, 4.5, 5.5]);
    expect(histogram.totalSamples).toBe(6);
    expect(histogram.maximumBinCount).toBe(3);
  });

  it("keeps every measurement — the bins account for all of them", () => {
    const values = [11, 14, 14, 19, 20, 22, 27, 30, 31, 31];
    const histogram = createHistogram(values, 5);
    const binned = histogram.binCounts.reduce((total, count) => total + count, 0);
    expect(binned).toBe(values.length);
  });

  it("snaps the first edge to a multiple of the bin width", () => {
    // So that re-binning the same data keeps bars aligned to the axis.
    const histogram = createHistogram([13, 14, 27], 5);
    expect(histogram.minimumEdge).toBe(10);
  });

  it("forces an integer bin width of at least one", () => {
    // Counts are integers; a fractional bin would capture a different number of
    // possible outcomes per bin and produce a spurious comb pattern.
    expect(createHistogram([1, 2, 3], 0.25).binWidth).toBe(1);
    expect(createHistogram([1, 2, 3], 2.4).binWidth).toBe(2);
  });

  it("handles every measurement being identical", () => {
    const histogram = createHistogram([7, 7, 7, 7]);
    expect(histogram.binCounts).toEqual([4]);
    expect(histogram.maximumBinCount).toBe(4);
  });
});

describe("chooseBinWidth", () => {
  it("uses unit width for very small data sets", () => {
    expect(chooseBinWidth([])).toBe(1);
    expect(chooseBinWidth([4, 5, 6])).toBe(1);
  });

  it("uses unit width when every value is the same", () => {
    expect(chooseBinWidth([9, 9, 9, 9, 9, 9])).toBe(1);
  });

  it("widens bins as the spread grows", () => {
    const narrow = Array.from({ length: 200 }, (_, index) => 20 + (index % 5));
    const wide = Array.from({ length: 200 }, (_, index) => 20 + (index % 80));
    expect(chooseBinWidth(wide)).toBeGreaterThan(chooseBinWidth(narrow));
  });

  it("gives a short run enough bins to show a shape", () => {
    // Freedman-Diaconis alone bins 20 Poisson-ish samples into about four
    // bars, which shows no distribution at all. This is the sim's default run
    // length, so it is the case that matters most.
    const run = [14, 16, 17, 17, 18, 19, 19, 20, 20, 20, 21, 21, 22, 22, 23, 24, 25, 26, 27, 30];
    const histogram = createHistogram(run, chooseBinWidth(run));
    expect(histogram.binCounts.length).toBeGreaterThanOrEqual(7);
  });

  it("keeps a long, wide run from turning into a picket fence", () => {
    const wide = Array.from({ length: 500 }, (_, index) => (index * 37) % 400);
    const histogram = createHistogram(wide, chooseBinWidth(wide));
    expect(histogram.binCounts.length).toBeLessThanOrEqual(31);
  });

  it("never bins integer counts more finely than one", () => {
    const tight = Array.from({ length: 100 }, (_, index) => 20 + (index % 3));
    expect(chooseBinWidth(tight)).toBe(1);
  });
});

describe("poissonExpectation", () => {
  it("sums to the number of measurements when the bins cover the distribution", () => {
    // Bins spanning 0..80 hold essentially all of the probability at λ = 20.
    const values = Array.from({ length: 81 }, (_, index) => index);
    const histogram = createHistogram(values, 1);
    const expectation = poissonExpectation(histogram, 20);
    const total = expectation.reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(histogram.totalSamples, 6);
  });

  it("peaks at the mean, which for an integer mean is a two-way tie", () => {
    // P(k)/P(k-1) = lambda/k, so at k = lambda the ratio is exactly 1: an
    // integer-mean Poisson has two equal modes, at lambda - 1 and lambda.
    const values = Array.from({ length: 61 }, (_, index) => index);
    const histogram = createHistogram(values, 1);
    const expectation = poissonExpectation(histogram, 20);

    const peak = Math.max(...expectation);
    // Bin i covers count i exactly, since the bins are unit-width from zero.
    expect(expectation[19]).toBeCloseTo(peak, 12);
    expect(expectation[20]).toBeCloseTo(peak, 12);
    expect(expectation[18] as number).toBeLessThan(peak);
    expect(expectation[21] as number).toBeLessThan(peak);
  });

  it("peaks at the single mode when the mean is not an integer", () => {
    const values = Array.from({ length: 61 }, (_, index) => index);
    const histogram = createHistogram(values, 1);
    const expectation = poissonExpectation(histogram, 20.6);
    const peakIndex = expectation.indexOf(Math.max(...expectation));
    // The mode of a Poisson is floor(lambda).
    expect(peakIndex).toBe(20);
  });

  it("sums whole integers per bin rather than sampling the centre", () => {
    // A width-2 bin holds two possible outcomes, so its expectation is the sum
    // of both probabilities — not one density reading at the half-integer.
    const values = Array.from({ length: 41 }, (_, index) => index);
    const wide = createHistogram(values, 2);
    const narrow = createHistogram(values, 1);
    const wideTotal = poissonExpectation(wide, 10).reduce((sum, value) => sum + value, 0);
    const narrowTotal = poissonExpectation(narrow, 10).reduce((sum, value) => sum + value, 0);
    expect(wideTotal).toBeCloseTo(narrowTotal, 6);
  });
});

describe("gaussianCurve", () => {
  it("is empty when there is no histogram to draw over", () => {
    expect(gaussianCurve(EMPTY_HISTOGRAM, 10, 3)).toEqual([]);
  });

  it("is empty for a non-positive width", () => {
    const histogram = createHistogram([1, 2, 3, 4], 1);
    expect(gaussianCurve(histogram, 2, 0)).toEqual([]);
  });

  it("scales to measurements-per-bin, so it is comparable with the bars", () => {
    const values = Array.from({ length: 200 }, (_, index) => 20 + (index % 11) - 5);
    const histogram = createHistogram(values, 1);
    const curve = gaussianCurve(histogram, 20, 3);
    const peak = Math.max(...curve.map((point) => point.y));
    // Peak height = N · binWidth / (σ√2π)
    expect(peak).toBeCloseTo((histogram.totalSamples * histogram.binWidth) / (3 * Math.sqrt(2 * Math.PI)), 1);
  });
});
