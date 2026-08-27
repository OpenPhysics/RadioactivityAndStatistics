/**
 * csvExport.ts
 *
 * Serializes a run to CSV. Pure string building, so it is unit-testable and
 * carries no DOM dependency; the browser download itself lives in the view.
 *
 * The file leads with commented metadata — source, interval, and the summary
 * statistics — so a spreadsheet opened weeks later still says what was measured
 * and under what conditions.
 */

import { type CountSample, countRate } from "./CountSample.js";
import type { SampleStatistics } from "./Statistics.js";

/** Everything needed to describe a run in the exported file's header. */
export type ExportContext = {
  /** Human-readable source description, e.g. "Simulated" or a device serial. */
  readonly sourceDescription: string;
  /** Counting interval used for the run, in seconds. */
  readonly intervalSeconds: number;
  /** Summary statistics of the run. */
  readonly statistics: SampleStatistics;
};

/** Number of decimal places used for derived (non-integer) columns. */
const DECIMAL_PLACES = 4;

/**
 * Builds the CSV text for a run.
 *
 * Fields are plain numbers and quoted strings, with CRLF line endings, so the
 * result opens cleanly in Excel, Sheets, and pandas alike.
 */
export function samplesToCsv(samples: readonly CountSample[], context: ExportContext): string {
  const { statistics } = context;
  const lines: string[] = [
    `# Radioactivity and Statistics`,
    `# Source,${escapeField(context.sourceDescription)}`,
    `# Counting interval (s),${context.intervalSeconds}`,
    `# Samples,${statistics.sampleCount}`,
    `# Total counts,${statistics.total}`,
    `# Mean counts,${round(statistics.mean)}`,
    `# Standard deviation,${round(statistics.standardDeviation)}`,
    `# Standard deviation of the mean,${round(statistics.standardErrorOfMean)}`,
    `# sqrt(mean) [Poisson prediction],${round(Math.sqrt(Math.max(statistics.mean, 0)))}`,
    "",
    "index,start_time_s,duration_s,counts,counts_per_second",
  ];

  for (const sample of samples) {
    lines.push(
      [sample.index, round(sample.startTime), round(sample.duration), sample.counts, round(countRate(sample))].join(
        ",",
      ),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}

/** Rounds to the export precision without trailing zeros. */
function round(value: number): number {
  return Number.parseFloat(value.toFixed(DECIMAL_PLACES));
}

/** Quotes a field if it contains a comma, quote, or newline. */
function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** Filename for an exported run, stamped so successive exports do not collide. */
export function createExportFilename(date: Date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
  return `radioactivity-${stamp}.csv`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
