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
import {
  SIMULATION_COUNTING_INTERVAL_DECIMAL_PLACES,
  SIMULATION_COUNTING_INTERVAL_DELTA,
  SIMULATION_COUNTING_INTERVAL_RANGE,
} from "../../RadioactivityAndStatisticsConstants.js";

export class SimulationModel extends RadioactivityScreenModel {
  public constructor(preferences: RadioactivityAndStatisticsPreferencesModel) {
    super(preferences, {
      fixedSourceType: CountSourceType.SIMULATED,
      // Opens on the fluctuating trace, the sim's central point, before any
      // statistic has been computed from it.
      initialChartView: ChartViewType.COUNT_RATE,
      // Not limited by any hardware polling rate the way a real Geiger
      // counter is, so this screen alone offers the finer 0.25 s interval.
      countingIntervalRange: SIMULATION_COUNTING_INTERVAL_RANGE,
      countingIntervalDelta: SIMULATION_COUNTING_INTERVAL_DELTA,
      countingIntervalDecimalPlaces: SIMULATION_COUNTING_INTERVAL_DECIMAL_PLACES,
    });
  }
}
