/**
 * LabScreenView.ts
 *
 * The Lab screen: what the collected measurements add up to.
 *
 * ── Layout ────────────────────────────────────────────────────────────────────
 * The histogram takes the centre, because the whole screen exists to be
 * compared against it. Acquisition controls stay on the left, in the same order
 * as on the Intro screen, so moving between screens does not relocate them. The
 * right column holds what is derived from the data — the statistics, and the
 * display choices that govern the curves drawn over the bars.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { Bounds2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { AlignBox, Node, VBox } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/RadioactivityAndMeasurementsButtonOptions.js";
import { AcquisitionPanel } from "../../common/view/AcquisitionPanel.js";
import { DistributionControlsPanel } from "../../common/view/DistributionControlsPanel.js";
import { HistogramNode } from "../../common/view/HistogramNode.js";
import { SourcePanel } from "../../common/view/SourcePanel.js";
import { StatisticsPanel } from "../../common/view/StatisticsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import {
  CENTRE_COLUMN_PADDING,
  PANEL_SPACING,
  SCREEN_VIEW_MARGIN,
} from "../../RadioactivityAndMeasurementsConstants.js";
import type { LabModel } from "../model/LabModel.js";
import { LabScreenSummaryContent } from "./LabScreenSummaryContent.js";

export type LabScreenViewOptions = ScreenViewOptions;

export class LabScreenView extends ScreenView {
  public constructor(
    model: LabModel,
    showDiagnosticsProperty: TReadOnlyProperty<boolean>,
    providedOptions?: LabScreenViewOptions,
  ) {
    const options = optionize<LabScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      {
        screenSummaryContent: new LabScreenSummaryContent(model),
      },
      providedOptions,
    );
    super(options);

    const a11y = StringManager.getInstance().getLabA11yStrings();
    const acquisition = model.acquisition;

    // ── Left column: the same acquisition controls as the Intro screen ────────
    const sourcePanel = new SourcePanel(acquisition, a11y.controls, showDiagnosticsProperty);
    const acquisitionPanel = new AcquisitionPanel(acquisition, a11y.controls);

    const leftColumn = new VBox({
      align: "left",
      spacing: PANEL_SPACING,
      children: [sourcePanel, acquisitionPanel],
      left: this.layoutBounds.minX + SCREEN_VIEW_MARGIN,
      top: this.layoutBounds.minY + SCREEN_VIEW_MARGIN,
    });

    // ── Right column: what the data implies ───────────────────────────────────
    const statisticsPanel = new StatisticsPanel(acquisition);
    const distributionControlsPanel = new DistributionControlsPanel(acquisition, model, a11y.controls);

    const rightColumn = new VBox({
      align: "right",
      spacing: PANEL_SPACING,
      children: [statisticsPanel, distributionControlsPanel],
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: this.layoutBounds.minY + SCREEN_VIEW_MARGIN,
    });

    // ── Centre: the distribution ──────────────────────────────────────────────
    const histogram = new HistogramNode(acquisition, model);
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
    histogram.maxWidth = availableBounds.width;
    const histogramContainer = new AlignBox(histogram, {
      alignBounds: availableBounds,
      xAlign: "center",
      yAlign: "top",
    });

    this.addChild(leftColumn);
    this.addChild(histogramContainer);
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
    // Collect data first, then decide how to look at it — the same order the
    // screen is meant to be worked through.
    this.addChild(
      new Node({
        pdomOrder: [sourcePanel, acquisitionPanel, distributionControlsPanel, resetAllButton],
      }),
    );
  }

  /** Resets view-side state. Every visible node derives from the model. */
  public reset(): void {
    // Nothing view-only to reset.
  }
}
