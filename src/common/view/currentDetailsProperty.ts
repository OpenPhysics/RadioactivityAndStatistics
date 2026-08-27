/**
 * currentDetailsProperty.ts
 *
 * Builds the live "current details" paragraph of a screen summary — the region
 * a screen-reader user re-reads to find out what the sim is doing right now.
 *
 * Both screens describe the same underlying state (how much data exists and
 * what it says), so they share one factory. The three phrasings are separate
 * localized patterns rather than sentences assembled from fragments, because
 * word order and agreement differ between languages.
 */

import { DerivedProperty, PatternStringProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { toFixed } from "scenerystack/dot";
import type { RadioactivityModel } from "../model/RadioactivityModel.js";

/** The three phrasings a screen's `a11y` group must supply. */
export type CurrentDetailsStrings = {
  /** Shown before any data exists. */
  readonly currentDetailsStringProperty: TReadOnlyProperty<string>;
  /** Shown while recording; takes {{count}} and {{rate}}. */
  readonly currentDetailsRecordingStringProperty: TReadOnlyProperty<string>;
  /** Shown once a run is collected; takes {{count}}, {{mean}}, {{deviation}}, {{poisson}}. */
  readonly currentDetailsCollectedStringProperty: TReadOnlyProperty<string>;
};

/** Decimal places used in spoken statistics — more would be read aloud as noise. */
const SPOKEN_DECIMALS = 1;

/** A live paragraph describing the state of the run, plus its teardown. */
export type CurrentDetails = {
  readonly property: TReadOnlyProperty<string>;
  readonly dispose: () => void;
};

/** Creates the live current-details paragraph for one screen. */
export function createCurrentDetailsProperty(
  model: RadioactivityModel,
  strings: CurrentDetailsStrings,
): CurrentDetails {
  const sampleCountProperty = new DerivedProperty([model.statisticsProperty], (statistics) => statistics.sampleCount);
  const rateProperty = new DerivedProperty([model.lastCountRateProperty], (rate) => toFixed(rate, SPOKEN_DECIMALS));
  const meanProperty = new DerivedProperty([model.statisticsProperty], (statistics) =>
    toFixed(statistics.mean, SPOKEN_DECIMALS),
  );
  const deviationProperty = new DerivedProperty([model.statisticsProperty], (statistics) =>
    toFixed(statistics.standardDeviation, SPOKEN_DECIMALS),
  );
  const poissonProperty = new DerivedProperty([model.poissonDeviationProperty], (deviation) =>
    toFixed(deviation, SPOKEN_DECIMALS),
  );

  const recordingProperty = new PatternStringProperty(strings.currentDetailsRecordingStringProperty, {
    count: sampleCountProperty,
    rate: rateProperty,
  });
  const collectedProperty = new PatternStringProperty(strings.currentDetailsCollectedStringProperty, {
    count: sampleCountProperty,
    mean: meanProperty,
    deviation: deviationProperty,
    poisson: poissonProperty,
  });

  const property = new DerivedProperty(
    [
      model.isRecordingProperty,
      sampleCountProperty,
      strings.currentDetailsStringProperty,
      recordingProperty,
      collectedProperty,
    ],
    (isRecording, sampleCount, empty, recording, collected) => {
      if (sampleCount === 0) {
        return empty;
      }
      return isRecording ? recording : collected;
    },
  );

  return {
    property,
    dispose: () => {
      property.dispose();
      recordingProperty.dispose();
      collectedProperty.dispose();
      poissonProperty.dispose();
      deviationProperty.dispose();
      meanProperty.dispose();
      rateProperty.dispose();
      sampleCountProperty.dispose();
    },
  };
}
