/**
 * RadioactivityScreenModel.ts
 *
 * Model shared by both screens: a {@link RadioactivityModel} locked to one
 * counting source, plus the display choices that used to live on the Lab
 * screen alone — which chart is shown, and which theoretical curves are drawn
 * over the histogram. Both screens can show either chart now, so both need
 * this state; only the fixed source tells the two screens apart.
 */

import { BooleanProperty, Property } from "scenerystack/axon";
import type { TModel } from "scenerystack/joist";
import type { RadioactivityAndStatisticsPreferencesModel } from "../../preferences/RadioactivityAndStatisticsPreferencesModel.js";
import type { ChartViewTypeValue } from "./ChartViewType.js";
import type { CountSourceTypeValue } from "./CountSource.js";
import { RadioactivityModel } from "./RadioactivityModel.js";

export type RadioactivityScreenModelOptions = {
  /** The one source this screen ever counts from. */
  readonly fixedSourceType: CountSourceTypeValue;

  /** Which chart the screen opens on. */
  readonly initialChartView: ChartViewTypeValue;
};

export class RadioactivityScreenModel implements TModel {
  /** Sources, counting cycle, collected run, and derived statistics. */
  public readonly acquisition: RadioactivityModel;

  /** Which chart is currently shown: the histogram, or the count-rate trace. */
  public readonly chartViewProperty: Property<ChartViewTypeValue>;

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

  public constructor(
    preferences: RadioactivityAndStatisticsPreferencesModel,
    options: RadioactivityScreenModelOptions,
  ) {
    this.acquisition = new RadioactivityModel({
      fixedSourceType: options.fixedSourceType,
      geigerControls: {
        beepEnabledProperty: preferences.beepEnabledProperty,
        tubeVoltageProperty: preferences.tubeVoltageProperty,
      },
    });
    this.chartViewProperty = new Property<ChartViewTypeValue>(options.initialChartView);
  }

  public reset(): void {
    this.acquisition.reset();
    this.chartViewProperty.reset();
    this.poissonVisibleProperty.reset();
    this.gaussianPredictionVisibleProperty.reset();
    this.gaussianFitVisibleProperty.reset();
  }

  public step(dt: number): void {
    this.acquisition.step(dt);
  }
}
