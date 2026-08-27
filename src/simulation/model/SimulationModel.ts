/**
 * SimulationModel.ts
 *
 * Model for the Simulation screen: a mock-up counting source with a known,
 * adjustable activity, that can be viewed as either the histogram or the
 * count-rate chart.
 *
 * Being the only source whose true λ is known, this is the one screen where
 * the σ = √λ prediction can be checked against an answer known in advance.
 */

import { ChartViewType } from "../../common/model/ChartViewType.js";
import { CountSourceType } from "../../common/model/CountSource.js";
import { RadioactivityScreenModel } from "../../common/model/RadioactivityScreenModel.js";
import type { RadioactivityAndStatisticsPreferencesModel } from "../../preferences/RadioactivityAndStatisticsPreferencesModel.js";

export class SimulationModel extends RadioactivityScreenModel {
  public constructor(preferences: RadioactivityAndStatisticsPreferencesModel) {
    super(preferences, {
      fixedSourceType: CountSourceType.SIMULATED,
      // Opens on the fluctuating trace, the sim's central point, before any
      // statistic has been computed from it.
      initialChartView: ChartViewType.COUNT_RATE,
    });
  }
}
