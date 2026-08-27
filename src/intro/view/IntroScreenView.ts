/**
 * IntroScreenView.ts
 *
 * The Intro screen: make measurements and watch them fluctuate.
 *
 * ── Layout ────────────────────────────────────────────────────────────────────
 * Three columns. The left column carries the answer (the live rate) above the
 * evidence (the table of every measurement). The centre shows the rate over
 * time against its own mean, which is where the fluctuation becomes obvious.
 * The right column holds the controls, in the order a user meets them: choose a
 * source, then set up and run a measurement.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { Bounds2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { AlignBox, Node, VBox } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/RadioactivityAndMeasurementsButtonOptions.js";
import { AcquisitionPanel } from "../../common/view/AcquisitionPanel.js";
import { CountRateChartNode } from "../../common/view/CountRateChartNode.js";
import { CountRateDisplayNode } from "../../common/view/CountRateDisplayNode.js";
import { DataTableNode } from "../../common/view/DataTableNode.js";
import { SourcePanel } from "../../common/view/SourcePanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import {
  CENTRE_COLUMN_PADDING,
  PANEL_SPACING,
  SCREEN_VIEW_MARGIN,
} from "../../RadioactivityAndMeasurementsConstants.js";
import type { IntroModel } from "../model/IntroModel.js";
import { IntroScreenSummaryContent } from "./IntroScreenSummaryContent.js";

export type IntroScreenViewOptions = ScreenViewOptions;

export class IntroScreenView extends ScreenView {
  public constructor(
    model: IntroModel,
    showDiagnosticsProperty: TReadOnlyProperty<boolean>,
    providedOptions?: IntroScreenViewOptions,
  ) {
    const options = optionize<IntroScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      {
        screenSummaryContent: new IntroScreenSummaryContent(model),
      },
      providedOptions,
    );
    super(options);

    const a11y = StringManager.getInstance().getIntroA11yStrings();
    const acquisition = model.acquisition;

    // ── Left column: the reading, then the record of every reading ────────────
    const countRateDisplay = new CountRateDisplayNode(acquisition);
    const dataTable = new DataTableNode(acquisition);

    const leftColumn = new VBox({
      align: "center",
      spacing: 16,
      children: [countRateDisplay, dataTable],
      left: this.layoutBounds.minX + SCREEN_VIEW_MARGIN,
      top: this.layoutBounds.minY + SCREEN_VIEW_MARGIN,
    });

    // ── Centre: the fluctuation itself ────────────────────────────────────────
    const rateChart = new CountRateChartNode(acquisition);

    // ── Right column: controls, in the order they are used ────────────────────
    const sourcePanel = new SourcePanel(acquisition, a11y.controls, showDiagnosticsProperty);
    const acquisitionPanel = new AcquisitionPanel(acquisition, a11y.controls);

    const rightColumn = new VBox({
      align: "right",
      spacing: PANEL_SPACING,
      children: [sourcePanel, acquisitionPanel],
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: this.layoutBounds.minY + SCREEN_VIEW_MARGIN,
    });

    // The chart occupies whatever the two columns leave. An AlignBox centres it
    // in that gap and keeps it centred: the chart's bounds change as the axes
    // rescale to incoming data, and a one-off centerX would drift out of place
    // (and, before the axis lines were removed, straight under a panel).
    // maxWidth is the backstop, capping it at the gap it has been given.
    const availableBounds = new Bounds2(
      leftColumn.right + CENTRE_COLUMN_PADDING,
      this.layoutBounds.minY + SCREEN_VIEW_MARGIN,
      rightColumn.left - CENTRE_COLUMN_PADDING,
      this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    );
    rateChart.maxWidth = availableBounds.width;
    const chartContainer = new AlignBox(rateChart, {
      alignBounds: availableBounds,
      xAlign: "center",
      yAlign: "top",
    });

    this.addChild(leftColumn);
    this.addChild(chartContainer);
    this.addChild(rightColumn);

    const resetAllButton = new ResetAllButton({
      ...FLAT_RESET_ALL_BUTTON_OPTIONS,
      listener: () => {
        model.reset();
        this.reset();
      },
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      bottom: this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    });
    this.addChild(resetAllButton);

    // ── Keyboard / reading order ──────────────────────────────────────────────
    // Controls before readouts: a keyboard user wants to reach the things they
    // can operate, and the summary already describes the current state.
    this.addChild(
      new Node({
        pdomOrder: [sourcePanel, acquisitionPanel, dataTable, resetAllButton],
      }),
    );
  }

  /** Resets view-side state. The charts and table follow the model, so none. */
  public reset(): void {
    // Nothing view-only to reset — every visible node derives from the model.
  }
}
