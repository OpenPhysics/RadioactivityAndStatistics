/**
 * CountSample.ts
 *
 * One completed counting interval: the atom of data this sim collects.
 *
 * Samples are immutable. The model replaces the whole array when a sample is
 * added rather than mutating it in place, so DerivedProperty listeners (the
 * statistics, the histogram, the fit) fire reliably on reference change.
 */

/** The result of counting decays over one interval. */
export type CountSample = {
  /** 1-based position in the run, as shown in the data table. */
  readonly index: number;
  /** When the interval began, in seconds since the run started. */
  readonly startTime: number;
  /** Length of the counting interval, in seconds. */
  readonly duration: number;
  /** Number of decays registered during the interval. */
  readonly counts: number;
};

/** Counts per second for one sample. */
export function countRate(sample: CountSample): number {
  return sample.duration > 0 ? sample.counts / sample.duration : 0;
}
