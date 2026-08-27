/**
 * DeviceModel.ts
 *
 * Model for the Device screen: a real PASCO Wireless Geiger Counter connected
 * over Bluetooth, that can be viewed as either the histogram or the
 * count-rate chart.
 */

import { ChartViewType } from "../../common/model/ChartViewType.js";
import { CountSourceType } from "../../common/model/CountSource.js";
import { RadioactivityScreenModel } from "../../common/model/RadioactivityScreenModel.js";
import type { RadioactivityAndStatisticsPreferencesModel } from "../../preferences/RadioactivityAndStatisticsPreferencesModel.js";

export class DeviceModel extends RadioactivityScreenModel {
  public constructor(preferences: RadioactivityAndStatisticsPreferencesModel) {
    super(preferences, {
      fixedSourceType: CountSourceType.GEIGER_COUNTER,
      // Opens on the distribution, the comparison a real source is collected
      // for, once it is connected and a run exists to compare.
      initialChartView: ChartViewType.HISTOGRAM,
    });
  }
}
