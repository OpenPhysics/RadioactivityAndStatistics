/**
 * LabModel.ts
 *
 * Model for the Lab screen: the distribution of the measurements, and how it
 * compares with theory.
 *
 * Adds only what the Intro screen has no use for — which theoretical curves are
 * drawn — on top of the shared {@link RadioactivityModel}. Everything about
 * collecting data, including the histogram and the Gaussian fit, is shared;
 * the Lab screen simply chooses to display it.
 */

import { BooleanProperty } from "scenerystack/axon";
import type { TModel } from "scenerystack/joist";
import { RadioactivityModel } from "../../common/model/RadioactivityModel.js";
import type { RadioactivityAndMeasurementsPreferencesModel } from "../../preferences/RadioactivityAndMeasurementsPreferencesModel.js";

export class LabModel implements TModel {
  /** Sources, counting cycle, collected run, and derived statistics. */
  public readonly acquisition: RadioactivityModel;

  /**
   * Whether the Poisson prediction is drawn, using λ = the measured mean.
   *
   * On by default: it is the distribution the counts are actually drawn from,
   * and the one the sim is trying to make visible.
   */
  public readonly poissonVisibleProperty = new BooleanProperty(true);

  /**
   * Whether the Gaussian with μ = mean and σ = √mean is drawn.
   *
   * Off by default, so a student meets the Poisson curve first and then adds
   * the Gaussian to see where the approximation holds and where it does not.
   */
  public readonly gaussianPredictionVisibleProperty = new BooleanProperty(false);

  /** Whether the least-squares best-fit Gaussian is drawn. */
  public readonly gaussianFitVisibleProperty = new BooleanProperty(false);

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
    this.poissonVisibleProperty.reset();
    this.gaussianPredictionVisibleProperty.reset();
    this.gaussianFitVisibleProperty.reset();
  }

  public step(dt: number): void {
    this.acquisition.step(dt);
  }
}
