/**
 * Unit tests for CSV serialization.
 *
 * The exported file is what leaves the sim and gets analysed elsewhere, so its
 * shape is a contract: a spreadsheet or pandas import that silently shifts a
 * column would corrupt an analysis without ever raising an error.
 */

import { describe, expect, it } from "vitest";
import type { CountSample } from "../../../src/common/model/CountSample.js";
import { createExportFilename, samplesToCsv } from "../../../src/common/model/csvExport.js";
import { createHistogram } from "../../../src/common/model/Histogram.js";
import { computeStatistics } from "../../../src/common/model/Statistics.js";

const SAMPLES: CountSample[] = [
  { index: 1, startTime: 0, duration: 1, counts: 18 },
  { index: 2, startTime: 1, duration: 1, counts: 23 },
  { index: 3, startTime: 2, duration: 1, counts: 19 },
];

function csvFor(samples: readonly CountSample[], sourceDescription = "Simulated (true mean rate 20 counts/s)"): string {
  return samplesToCsv(samples, {
    sourceDescription,
    intervalSeconds: 1,
    statistics: computeStatistics(samples.map((sample) => sample.counts)),
  });
}

describe("samplesToCsv", () => {
  it("uses CRLF line endings so Excel reads it as one row per line", () => {
    expect(csvFor(SAMPLES)).toContain("\r\n");
    expect(csvFor(SAMPLES).endsWith("\r\n")).toBe(true);
  });

  it("writes the documented column header", () => {
    expect(csvFor(SAMPLES)).toContain("index,start_time_s,duration_s,counts,counts_per_second");
  });

  it("writes one row per sample, in order", () => {
    const rows = csvFor(SAMPLES)
      .split("\r\n")
      .filter((line) => /^\d/.test(line));
    expect(rows).toEqual(["1,0,1,18,18", "2,1,1,23,23", "3,2,1,19,19"]);
  });

  it("reports the rate for intervals longer than a second", () => {
    const rows = csvFor([{ index: 1, startTime: 0, duration: 4, counts: 50 }])
      .split("\r\n")
      .filter((line) => /^\d/.test(line));
    expect(rows).toEqual(["1,0,4,50,12.5"]);
  });

  it("carries the run's conditions and statistics in the header", () => {
    const csv = csvFor(SAMPLES);
    expect(csv).toContain("# Counting interval (s),1");
    expect(csv).toContain("# Samples,3");
    expect(csv).toContain("# Total counts,60");
    expect(csv).toContain("# Mean counts,20");
    // sqrt(20) is recorded next to the measured deviation so the central
    // comparison survives the export.
    expect(csv).toContain(`# sqrt(mean) [Poisson prediction],${Number(Math.sqrt(20).toFixed(4))}`);
  });

  it("quotes a source description containing a comma", () => {
    const csv = csvFor(SAMPLES, "Geiger counter, serial 123-456");
    expect(csv).toContain('# Source,"Geiger counter, serial 123-456"');
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = csvFor(SAMPLES, 'Counter "A", bench 2');
    expect(csv).toContain('# Source,"Counter ""A"", bench 2"');
  });

  it("produces a header-only file for an empty run", () => {
    const csv = csvFor([]);
    expect(csv).toContain("# Samples,0");
    expect(csv.split("\r\n").filter((line) => /^\d/.test(line))).toEqual([]);
  });
});

describe("samplesToCsv with a histogram", () => {
  const counts = SAMPLES.map((sample) => sample.counts);

  function csvWithHistogram(binWidth?: number): string {
    return samplesToCsv(SAMPLES, {
      sourceDescription: "Simulated",
      intervalSeconds: 1,
      statistics: computeStatistics(counts),
      histogram: createHistogram(counts, binWidth),
    });
  }

  it("leaves the samples table untouched ahead of it", () => {
    expect(csvWithHistogram()).toContain("index,start_time_s,duration_s,counts,counts_per_second");
    expect(csvWithHistogram().split("\r\n")).toContain("1,0,1,18,18");
  });

  it("writes the documented histogram column header", () => {
    expect(csvWithHistogram()).toContain("bin_index,bin_start,bin_end,bin_center,frequency,poisson_expected");
  });

  it("writes one row per bin, with edges and observed frequencies", () => {
    const csv = csvWithHistogram(2);
    const headerIndex = csv.split("\r\n").indexOf("bin_index,bin_start,bin_end,bin_center,frequency,poisson_expected");
    const rows = csv
      .split("\r\n")
      .slice(headerIndex + 1)
      .filter((line) => line.length > 0);

    // Counts 18, 19, 23 with width 2 snap to bins starting at 18: [18,20) holds
    // two, [20,22) none, [22,24) one.
    expect(rows).toHaveLength(3);
    expect(rows[0]?.startsWith("0,18,20,19,2,")).toBe(true);
    expect(rows[1]?.startsWith("1,20,22,21,0,")).toBe(true);
    expect(rows[2]?.startsWith("2,22,24,23,1,")).toBe(true);
  });

  it("records the bin width the bars were drawn with", () => {
    expect(csvWithHistogram(2)).toContain("# Bin width (counts),2");
    expect(csvWithHistogram(2)).toContain("# Bins,3");
  });

  it("carries a Poisson expectation totalling the sample count", () => {
    const csv = csvWithHistogram(2);
    const headerIndex = csv.split("\r\n").indexOf("bin_index,bin_start,bin_end,bin_center,frequency,poisson_expected");
    const expected = csv
      .split("\r\n")
      .slice(headerIndex + 1)
      .filter((line) => line.length > 0)
      .map((line) => Number(line.split(",")[5]));

    // Only the plotted range is covered, so the expectations sum to less than
    // the 3 samples — but they must be positive and bounded by it.
    const total = expected.reduce((sum, value) => sum + value, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(3);
  });

  it("omits the histogram section when none is supplied", () => {
    expect(csvFor(SAMPLES)).not.toContain("bin_index");
    expect(csvFor(SAMPLES)).not.toContain("# Histogram");
  });
});

describe("createExportFilename", () => {
  it("stamps the filename so successive exports do not collide", () => {
    const filename = createExportFilename(new Date(2026, 7, 27, 9, 5, 3));
    expect(filename).toBe("radioactivity-20260827-090503.csv");
  });

  it("always produces a .csv name", () => {
    expect(createExportFilename()).toMatch(/^radioactivity-\d{8}-\d{6}\.csv$/);
  });
});
