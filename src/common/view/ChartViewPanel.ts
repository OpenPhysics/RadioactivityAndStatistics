/**
 * ChartViewPanel.ts
 *
 * Chooses which of the two model charts is drawn: the histogram, or the count
 * rate over time. Every screen now carries both charts, so this is the one
 * control that decides which one is on screen.
 */

import type { Property } from "scenerystack/axon";
import { Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { AquaRadioButtonGroup } from "scenerystack/sun";
import type { ScreenControlA11yStrings } from "../../i18n/StringManager.js";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../RadioactivityAndStatisticsConstants.js";
import { ChartViewType, type ChartViewTypeValue } from "../model/ChartViewType.js";
import { RadioactivityAndStatisticsPanel } from "../RadioactivityAndStatisticsPanel.js";

export class ChartViewPanel extends RadioactivityAndStatisticsPanel {
  public constructor(chartViewProperty: Property<ChartViewTypeValue>, a11y: ScreenControlA11yStrings) {
    const strings = StringManager.getInstance().getChartViewStrings();

    const title = new Text(strings.titleStringProperty, {
      font: new PhetFont({ size: 15, weight: "bold" }),
      fill: RadioactivityAndStatisticsColors.textColorProperty,
    });

    const radioGroup = new AquaRadioButtonGroup(
      chartViewProperty,
      [
        {
          value: ChartViewType.HISTOGRAM,
          createNode: () =>
            new Text(strings.histogramStringProperty, {
              font: new PhetFont(13),
              fill: RadioactivityAndStatisticsColors.textColorProperty,
              maxWidth: 170,
            }),
        },
        {
          value: ChartViewType.COUNT_RATE,
          createNode: () =>
            new Text(strings.countRateStringProperty, {
              font: new PhetFont(13),
              fill: RadioactivityAndStatisticsColors.textColorProperty,
              maxWidth: 170,
            }),
        },
      ],
      {
        spacing: 6,
        radioButtonOptions: { radius: 7 },
        accessibleName: a11y.chartViewRadioGroupStringProperty,
      },
    );

    super(
      new VBox({
        align: "left",
        spacing: 8,
        preferredWidth: CONTROL_PANEL_WIDTH - 24,
        stretch: true,
        children: [title, radioGroup],
      }),
      { minWidth: CONTROL_PANEL_WIDTH },
    );
  }
}
