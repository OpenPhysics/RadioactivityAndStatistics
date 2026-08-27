/**
 * StatisticsPanel.ts
 *
 * Summary statistics for the collected run, as a label/value table.
 *
 * ── What the rows are for ─────────────────────────────────────────────────────
 * The panel is arranged so the central comparison of the whole sim is a single
 * glance: the measured standard deviation sits directly above √mean. If the
 * decays are Poisson, those two numbers agree. The standard deviation of the
 * mean is kept visually separate because it answers a different question — how
 * well the mean is known, not how much a single measurement scatters.
 *
 * The fit rows appear only when a fit exists, so the panel does not show
 * placeholder dashes for most of a run.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { toFixed } from "scenerystack/dot";
import { GridBox, Line, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../RadioactivityAndStatisticsConstants.js";
import type { RadioactivityModel } from "../model/RadioactivityModel.js";
import { RadioactivityAndStatisticsPanel } from "../RadioactivityAndStatisticsPanel.js";

/** Decimal places for statistics; counting data rarely justifies more. */
const STATISTIC_DECIMALS = 2;

/** Usable width inside the panel, once its margins are taken out. */
const CONTENT_WIDTH = CONTROL_PANEL_WIDTH - 24;

export class StatisticsPanel extends RadioactivityAndStatisticsPanel {
  private readonly disposeStatisticsPanel: () => void;

  public constructor(model: RadioactivityModel) {
    const strings = StringManager.getInstance().getStatisticsStrings();
    const disposables: { dispose: () => void }[] = [];

    /** Builds a value Property that renders "—" when there is no data. */
    const valueProperty = (
      derive: (statistics: ReturnType<typeof model.statisticsProperty.get>) => number,
      decimals = STATISTIC_DECIMALS,
    ): TReadOnlyProperty<string> => {
      const property = new DerivedProperty(
        [model.statisticsProperty, strings.notAvailableStringProperty],
        (statistics, notAvailable) =>
          statistics.sampleCount === 0 ? notAvailable : toFixed(derive(statistics), decimals),
      );
      disposables.push(property);
      return property;
    };

    const rows: Node[] = [];
    let rowIndex = 0;

    /** Adds one label/value row to the grid. */
    const addRow = (
      labelProperty: TReadOnlyProperty<string>,
      textProperty: TReadOnlyProperty<string>,
      emphasized = false,
    ): void => {
      const label = new Text(labelProperty, {
        font: new PhetFont(13),
        fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
        maxWidth: CONTENT_WIDTH * 0.62,
        layoutOptions: { column: 0, row: rowIndex, xAlign: "left" },
      });
      const value = new Text(textProperty, {
        font: new PhetFont({ size: 14, weight: emphasized ? "bold" : "normal" }),
        fill: RadioactivityAndStatisticsColors.textColorProperty,
        layoutOptions: { column: 1, row: rowIndex, xAlign: "right" },
      });
      rows.push(label, value);
      rowIndex += 1;
    };

    addRow(
      strings.sampleCountStringProperty,
      valueProperty((statistics) => statistics.sampleCount, 0),
    );
    addRow(
      strings.meanStringProperty,
      valueProperty((statistics) => statistics.mean),
      true,
    );

    // The comparison the sim exists to make: measured scatter against √mean.
    addRow(
      strings.standardDeviationStringProperty,
      valueProperty((statistics) => statistics.standardDeviation),
      true,
    );
    addRow(
      strings.poissonPredictionStringProperty,
      valueProperty((statistics) => Math.sqrt(Math.max(statistics.mean, 0))),
      true,
    );
    addRow(
      strings.standardErrorOfMeanStringProperty,
      valueProperty((statistics) => statistics.standardErrorOfMean),
    );

    const fittedSigmaProperty = new DerivedProperty(
      [model.gaussianFitProperty, strings.notAvailableStringProperty],
      (fit, notAvailable) => (fit ? toFixed(fit.standardDeviation, STATISTIC_DECIMALS) : notAvailable),
    );
    const reducedChiSquareProperty = new DerivedProperty(
      [model.gaussianFitProperty, strings.notAvailableStringProperty],
      (fit, notAvailable) => (fit ? toFixed(fit.reducedChiSquare, STATISTIC_DECIMALS) : notAvailable),
    );
    disposables.push(fittedSigmaProperty, reducedChiSquareProperty);

    addRow(strings.fittedSigmaStringProperty, fittedSigmaProperty);
    addRow(strings.reducedChiSquareStringProperty, reducedChiSquareProperty);

    const title = new Text(strings.titleStringProperty, {
      font: new PhetFont({ size: 15, weight: "bold" }),
      fill: RadioactivityAndStatisticsColors.textColorProperty,
    });

    const rule = new Line(0, 0, CONTENT_WIDTH, 0, {
      stroke: RadioactivityAndStatisticsColors.tableRuleColorProperty,
      lineWidth: 1,
    });

    // preferredWidth (not minContentWidth — that is a per-cell floor, and would
    // make the panel twice as wide as intended) fixes the grid to the column
    // width, so the left-aligned labels and right-aligned values pin to the
    // panel edges and every statistic reads down a single decimal column.
    const grid = new GridBox({
      xSpacing: 12,
      ySpacing: 5,
      children: rows,
      preferredWidth: CONTENT_WIDTH,
      stretch: true,
    });

    super(
      new VBox({
        align: "left",
        spacing: 6,
        preferredWidth: CONTENT_WIDTH,
        stretch: true,
        children: [title, rule, grid],
      }),
      { minWidth: CONTROL_PANEL_WIDTH },
    );

    this.disposeStatisticsPanel = () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }

  public override dispose(): void {
    this.disposeStatisticsPanel();
    super.dispose();
  }
}
