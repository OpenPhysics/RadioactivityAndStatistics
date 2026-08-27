/**
 * RadioactivityScreenView.ts
 *
 * The view shared by both screens: a fixed-source {@link SourcePanel} plus
 * {@link AcquisitionPanel} on the left, a chart-view switch on the right that
 * swaps the rest of the right column between the histogram's statistics and
 * curve controls or the count-rate chart's live readout and data table, and
 * the chosen chart itself in the centre.
 *
 * ── Layout ────────────────────────────────────────────────────────────────────
 * Only one context block (histogram or count-rate) and one chart are ever
 * visible at a time; the other sits alongside it, invisible, inside a plain
 * `Node` rather than a layout container — the same pattern {@link SourcePanel}
 * used for its own mutually-exclusive source blocks — so the visible one alone
 * decides the bounds.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { DerivedProperty } from "scenerystack/axon";
import { Bounds2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { AlignBox, Node, VBox } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import type { ScreenControlA11yStrings } from "../../i18n/StringManager.js";
import { CENTRE_COLUMN_PADDING, PANEL_SPACING, SCREEN_VIEW_MARGIN } from "../../RadioactivityAndStatisticsConstants.js";
import { ChartViewType } from "../model/ChartViewType.js";
import type { CountSourceTypeValue } from "../model/CountSource.js";
import type { RadioactivityScreenModel } from "../model/RadioactivityScreenModel.js";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../RadioactivityAndStatisticsButtonOptions.js";
import { AcquisitionPanel } from "./AcquisitionPanel.js";
import { ChartViewPanel } from "./ChartViewPanel.js";
import { CountRateChartNode } from "./CountRateChartNode.js";
import { CountRateDisplayNode } from "./CountRateDisplayNode.js";
import { DataTableNode } from "./DataTableNode.js";
import { DistributionControlsPanel } from "./DistributionControlsPanel.js";
import { HistogramNode } from "./HistogramNode.js";
import { SourcePanel } from "./SourcePanel.js";
import { StatisticsPanel } from "./StatisticsPanel.js";

export type RadioactivityScreenViewOptions = ScreenViewOptions;

export class RadioactivityScreenView extends ScreenView {
  public constructor(
    model: RadioactivityScreenModel,
    fixedSourceType: CountSourceTypeValue,
    showDiagnosticsProperty: TReadOnlyProperty<boolean>,
    a11y: ScreenControlA11yStrings,
    providedOptions: RadioactivityScreenViewOptions,
  ) {
    const options = optionize<RadioactivityScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      {},
      providedOptions,
    );
    super(options);

    const acquisition = model.acquisition;

    // ── Left column: choose a source, then set up and run a measurement ───────
    const sourcePanel = new SourcePanel(acquisition, fixedSourceType, a11y, showDiagnosticsProperty);
    const acquisitionPanel = new AcquisitionPanel(acquisition, a11y);

    const leftColumn = new VBox({
      align: "left",
      spacing: PANEL_SPACING,
      children: [sourcePanel, acquisitionPanel],
      left: this.layoutBounds.minX + SCREEN_VIEW_MARGIN,
      top: this.layoutBounds.minY + SCREEN_VIEW_MARGIN,
    });

    // ── Right column: choose the chart, then see what it implies ──────────────
    const chartViewPanel = new ChartViewPanel(model.chartViewProperty, a11y);

    const isHistogramProperty = new DerivedProperty(
      [model.chartViewProperty],
      (chartView) => chartView === ChartViewType.HISTOGRAM,
    );
    const isCountRateProperty = new DerivedProperty([isHistogramProperty], (isHistogram) => !isHistogram);

    const statisticsPanel = new StatisticsPanel(acquisition);
    const distributionControlsPanel = new DistributionControlsPanel(acquisition, model, a11y);
    const histogramContext = new VBox({
      align: "right",
      spacing: PANEL_SPACING,
      children: [statisticsPanel, distributionControlsPanel],
      visibleProperty: isHistogramProperty,
    });

    const countRateDisplay = new CountRateDisplayNode(acquisition);
    const dataTable = new DataTableNode(acquisition);
    const countRateContext = new VBox({
      align: "right",
      spacing: PANEL_SPACING,
      children: [countRateDisplay, dataTable],
      visibleProperty: isCountRateProperty,
    });

    const rightColumn = new VBox({
      align: "right",
      spacing: PANEL_SPACING,
      children: [chartViewPanel, new Node({ children: [histogramContext, countRateContext] })],
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: this.layoutBounds.minY + SCREEN_VIEW_MARGIN,
    });

    // ── Centre: whichever chart is chosen ──────────────────────────────────────
    // The chart occupies whatever the two columns leave. An AlignBox centres it
    // in that gap and keeps it centred: the chart's bounds change as the axes
    // rescale to incoming data, and a one-off centerX would drift out of place.
    // maxWidth is the backstop, capping it at the gap it has been given.
    const availableBounds = new Bounds2(
      leftColumn.right + CENTRE_COLUMN_PADDING,
      this.layoutBounds.minY + SCREEN_VIEW_MARGIN,
      rightColumn.left - CENTRE_COLUMN_PADDING,
      this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    );

    const histogram = new HistogramNode(acquisition, model);
    histogram.maxWidth = availableBounds.width;
    const histogramContainer = new AlignBox(histogram, {
      alignBounds: availableBounds,
      xAlign: "center",
      yAlign: "top",
      visibleProperty: isHistogramProperty,
    });

    const rateChart = new CountRateChartNode(acquisition);
    rateChart.maxWidth = availableBounds.width;
    const rateChartContainer = new AlignBox(rateChart, {
      alignBounds: availableBounds,
      xAlign: "center",
      yAlign: "top",
      visibleProperty: isCountRateProperty,
    });

    this.addChild(leftColumn);
    this.addChild(new Node({ children: [histogramContainer, rateChartContainer] }));
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
    // can operate first, and the summary already describes the current state.
    this.addChild(
      new Node({
        pdomOrder: [
          sourcePanel,
          acquisitionPanel,
          chartViewPanel,
          distributionControlsPanel,
          dataTable,
          resetAllButton,
        ],
      }),
    );
  }

  /** Resets view-side state. The charts and tables follow the model, so none. */
  public reset(): void {
    // Nothing view-only to reset — every visible node derives from the model.
  }
}
