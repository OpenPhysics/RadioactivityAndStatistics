/**
 * Unit tests for the shared acquisition model — the counting cycle, the run,
 * and the way the two count sources plug into it.
 *
 * Timing is driven with exact-binary dt values (0.5 s) so the tests exercise
 * the counting logic rather than floating-point accumulation.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { CountSourceType } from "../../../src/common/model/CountSource.js";
import { RadioactivityModel } from "../../../src/common/model/RadioactivityModel.js";

/** Advances the model by `seconds`, in steps the model will not clamp. */
function advance(model: RadioactivityModel, seconds: number, step = 0.5): void {
  const stepCount = Math.round(seconds / step);
  for (let i = 0; i < stepCount; i++) {
    model.step(step);
  }
}

describe("RadioactivityModel", () => {
  let model: RadioactivityModel;

  beforeEach(() => {
    model = new RadioactivityModel();
    model.countingIntervalProperty.value = 1;
    model.samplesPerRunProperty.value = 5;
  });

  it("starts with no data and the simulated source selected", () => {
    expect(model.samplesProperty.value).toEqual([]);
    expect(model.isRecordingProperty.value).toBe(false);
    expect(model.sourceTypeProperty.value).toBe(CountSourceType.SIMULATED);
    expect(model.statisticsProperty.value.sampleCount).toBe(0);
  });

  it("keeps no samples while not recording, but still updates the live rate", () => {
    // A bench counter always shows a rate; Record only decides what is kept.
    model.simulatedSource.activityProperty.value = 50;
    advance(model, 5);

    expect(model.samplesProperty.value).toEqual([]);
    expect(model.lastCountRateProperty.value).toBeGreaterThan(0);
  });

  it("records one sample per counting interval", () => {
    model.startRecording();
    advance(model, 3);
    expect(model.samplesProperty.value).toHaveLength(3);
  });

  it("stamps samples with a running index and contiguous start times", () => {
    model.countingIntervalProperty.value = 2;
    model.startRecording();
    advance(model, 6);

    const samples = model.samplesProperty.value;
    expect(samples.map((sample) => sample.index)).toEqual([1, 2, 3]);
    expect(samples.map((sample) => sample.startTime)).toEqual([0, 2, 4]);
    expect(samples.every((sample) => sample.duration === 2)).toBe(true);
  });

  it("stops on its own once the run length is reached", () => {
    model.samplesPerRunProperty.value = 5;
    model.startRecording();
    advance(model, 10);

    expect(model.isRecordingProperty.value).toBe(false);
    expect(model.samplesProperty.value).toHaveLength(5);
  });

  it("keeps going past the run length in continuous mode", () => {
    model.samplesPerRunProperty.value = 5;
    model.isContinuousProperty.value = true;
    model.startRecording();
    advance(model, 8);

    expect(model.isRecordingProperty.value).toBe(true);
    expect(model.samplesProperty.value).toHaveLength(8);
  });

  it("starts a fresh run when Record is pressed after a completed one", () => {
    model.samplesPerRunProperty.value = 3;
    model.startRecording();
    advance(model, 3);
    expect(model.samplesProperty.value).toHaveLength(3);

    model.startRecording();
    advance(model, 1);
    // Not 4: pressing Record on a finished run means "do it again".
    expect(model.samplesProperty.value).toHaveLength(1);
  });

  it("resumes into the same run when stopped part-way", () => {
    model.samplesPerRunProperty.value = 10;
    model.startRecording();
    advance(model, 2);
    model.stopRecording();
    advance(model, 2);
    model.startRecording();
    advance(model, 2);

    expect(model.samplesProperty.value).toHaveLength(4);
  });

  it("conserves counts: the run accounts for every event in its window", () => {
    model.simulatedSource.activityProperty.value = 40;
    model.isContinuousProperty.value = true;

    model.startRecording();
    const totalAtStart = model.simulatedSource.totalCountsProperty.value;
    advance(model, 10);
    const totalAtEnd = model.simulatedSource.totalCountsProperty.value;

    const recorded = model.samplesProperty.value.reduce((sum, sample) => sum + sample.counts, 0);
    const stillInProgress = model.intervalCountsProperty.value;

    expect(model.samplesProperty.value).toHaveLength(10);
    expect(recorded + stillInProgress).toBe(totalAtEnd - totalAtStart);
  });

  it("carries the interval remainder so intervals do not drift", () => {
    // 0.3 s steps never land on a 1 s boundary, so each interval ends with
    // 0.2 s of overshoot. Carrying that remainder forward keeps one sample per
    // second of elapsed time; discarding it would stretch every interval to
    // 1.2 s and lose a sixth of the run.
    model.countingIntervalProperty.value = 1;
    model.isContinuousProperty.value = true;
    model.startRecording();

    const stepCount = 100;
    for (let i = 0; i < stepCount; i++) {
      model.step(0.3);
    }

    // 30 s of elapsed time. Discarding the remainder would yield 25.
    const sampleCount = model.samplesProperty.value.length;
    expect(sampleCount).toBeGreaterThanOrEqual(29);
    expect(sampleCount).toBeLessThanOrEqual(30);
  });

  it("clamps an enormous dt instead of fabricating intervals", () => {
    // What a backgrounded tab hands back on return. The elapsed wall time was
    // never observed, so it must not become 60 measurements.
    model.isContinuousProperty.value = true;
    model.startRecording();
    model.step(60);
    expect(model.samplesProperty.value.length).toBeLessThanOrEqual(1);
  });

  it("clears the run without disturbing settings", () => {
    model.countingIntervalProperty.value = 2;
    model.startRecording();
    advance(model, 4);
    expect(model.samplesProperty.value).toHaveLength(2);

    model.clearRun();
    expect(model.samplesProperty.value).toEqual([]);
    expect(model.runTimeProperty.value).toBe(0);
    expect(model.countingIntervalProperty.value).toBe(2);
  });

  it("does not credit a newly selected source with the old one's backlog", () => {
    model.simulatedSource.activityProperty.value = 100;
    advance(model, 3);

    model.sourceTypeProperty.value = CountSourceType.GEIGER_COUNTER;
    expect(model.intervalCountsProperty.value).toBe(0);

    // The Geiger source is not connected, so no counts arrive and the first
    // interval on it is empty rather than inheriting the simulated total.
    model.isContinuousProperty.value = true;
    model.startRecording();
    advance(model, 2);
    expect(model.samplesProperty.value.every((sample) => sample.counts === 0)).toBe(true);
  });

  it("derives statistics from the recorded counts", () => {
    model.simulatedSource.activityProperty.value = 30;
    model.isContinuousProperty.value = true;
    model.startRecording();
    advance(model, 20);

    const counts = model.samplesProperty.value.map((sample) => sample.counts);
    const statistics = model.statisticsProperty.value;
    const expectedMean = counts.reduce((sum, value) => sum + value, 0) / counts.length;

    expect(statistics.sampleCount).toBe(counts.length);
    expect(statistics.mean).toBeCloseTo(expectedMean, 9);
    expect(model.poissonDeviationProperty.value).toBeCloseTo(Math.sqrt(expectedMean), 9);
  });

  it("bins the recorded counts into the histogram", () => {
    model.simulatedSource.activityProperty.value = 20;
    model.isContinuousProperty.value = true;
    model.startRecording();
    advance(model, 30);

    const histogram = model.histogramProperty.value;
    expect(histogram.totalSamples).toBe(30);
    expect(histogram.binCounts.reduce((sum, count) => sum + count, 0)).toBe(30);
  });

  it("reports the automatic bin width through the manual Property", () => {
    // The bin-width control is disabled while automatic binning is on, but it
    // still has to say which width is actually in use.
    model.simulatedSource.activityProperty.value = 60;
    model.isContinuousProperty.value = true;
    model.startRecording();
    advance(model, 40);

    expect(model.isAutoBinWidthProperty.value).toBe(true);
    expect(model.manualBinWidthProperty.value).toBe(model.histogramProperty.value.binWidth);
  });

  it("keeps the automatic width when auto binning is switched off", () => {
    // Unchecking "automatic" must not jump the histogram to an unrelated width.
    model.simulatedSource.activityProperty.value = 60;
    model.isContinuousProperty.value = true;
    model.startRecording();
    advance(model, 40);

    const automaticWidth = model.histogramProperty.value.binWidth;
    model.isAutoBinWidthProperty.value = false;
    expect(model.histogramProperty.value.binWidth).toBe(automaticWidth);
  });

  it("honours a manual bin width when auto binning is switched off", () => {
    model.simulatedSource.activityProperty.value = 50;
    model.isContinuousProperty.value = true;
    model.startRecording();
    advance(model, 20);

    model.isAutoBinWidthProperty.value = false;
    model.manualBinWidthProperty.value = 7;
    expect(model.histogramProperty.value.binWidth).toBe(7);
  });

  it("restores every setting on reset", () => {
    model.countingIntervalProperty.value = 5;
    model.samplesPerRunProperty.value = 100;
    model.isContinuousProperty.value = true;
    model.simulatedSource.activityProperty.value = 150;
    model.startRecording();
    advance(model, 10);

    model.reset();

    expect(model.isRecordingProperty.value).toBe(false);
    expect(model.samplesProperty.value).toEqual([]);
    expect(model.countingIntervalProperty.value).toBe(1);
    expect(model.samplesPerRunProperty.value).toBe(20);
    expect(model.isContinuousProperty.value).toBe(false);
    expect(model.simulatedSource.activityProperty.value).toBe(20);
    expect(model.sourceTypeProperty.value).toBe(CountSourceType.SIMULATED);
  });
});

describe("SimulatedCountSource statistics", () => {
  it("produces counts whose variance matches their mean", () => {
    // The defining property of a Poisson process, and the thing the sim asks
    // students to verify. Checked loosely because it is itself a random draw.
    const model = new RadioactivityModel();
    model.countingIntervalProperty.value = 1;
    model.isContinuousProperty.value = true;
    model.simulatedSource.activityProperty.value = 25;
    model.startRecording();
    advance(model, 400);

    const statistics = model.statisticsProperty.value;
    expect(statistics.sampleCount).toBe(400);
    // With N = 400 the mean is known to about ±0.25, so ±2 is comfortable.
    expect(statistics.mean).toBeGreaterThan(23);
    expect(statistics.mean).toBeLessThan(27);
    // s should land near sqrt(25) = 5; the spread of s itself is about 0.18.
    expect(statistics.standardDeviation).toBeGreaterThan(4);
    expect(statistics.standardDeviation).toBeLessThan(6);
  });
});
