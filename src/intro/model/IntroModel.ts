/**
 * IntroModel.ts
 *
 * Model for the Intro screen: making measurements and watching them fluctuate.
 *
 * The Intro screen is deliberately thin. All of the acquisition machinery —
 * sources, the counting cycle, the collected run, the statistics — lives in the
 * shared {@link RadioactivityModel}, which this class composes rather than
 * extends. Composition keeps the shared model free of any screen's assumptions
 * and lets the Lab screen add its own state without touching this one.
 */

import type { TModel } from "scenerystack/joist";
import { RadioactivityModel } from "../../common/model/RadioactivityModel.js";
import type { RadioactivityAndMeasurementsPreferencesModel } from "../../preferences/RadioactivityAndMeasurementsPreferencesModel.js";

export class IntroModel implements TModel {
  /** Sources, counting cycle, collected run, and derived statistics. */
  public readonly acquisition: RadioactivityModel;

  public constructor(preferences: RadioactivityAndMeasurementsPreferencesModel) {
    this.acquisition = new RadioactivityModel({
      geigerControls: {
        beepEnabledProperty: preferences.beepEnabledProperty,
        tubeVoltageProperty: preferences.tubeVoltageProperty,
      },
    });
  }

  public reset(): void {
    this.acquisition.reset();
  }

  public step(dt: number): void {
    this.acquisition.step(dt);
  }
}
