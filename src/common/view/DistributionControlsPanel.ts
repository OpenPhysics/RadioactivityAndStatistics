/**
 * DistributionControlsPanel.ts
 *
 * Chooses which theoretical curves are drawn over the histogram, and how the
 * measurements are binned.
 *
 * ── Why these belong together ─────────────────────────────────────────────────
 * Both settings change how the distribution is *displayed* without touching the
 * data, so putting them in one panel keeps the boundary clear: nothing here can
 * alter a measurement. The bin-width control sits below the curves because it is
 * the one most likely to mislead — widening bins smooths a ragged histogram into
 * something that looks like better agreement, and having it adjacent to the
 * curves it appears to improve makes that easy to notice and discuss.
 */

import { type BooleanProperty, DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { Text, VBox } from "scenerystack/scenery";
import { NumberControl, PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import type { ScreenControlA11yStrings } from "../../i18n/StringManager.js";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import { BIN_WIDTH_RANGE, CONTROL_PANEL_WIDTH } from "../../RadioactivityAndStatisticsConstants.js";
import type { RadioactivityModel } from "../model/RadioactivityModel.js";
import { RadioactivityAndStatisticsPanel } from "../RadioactivityAndStatisticsPanel.js";
import { SIM_CHECKBOX_OPTIONS, SIM_NUMBER_CONTROL_OPTIONS } from "../SimControlOptions.js";
import type { CurveVisibility } from "./HistogramNode.js";

/**
 * Writable counterpart of {@link CurveVisibility}: the histogram only reads
 * these Properties, whereas this panel's checkboxes write to them.
 */
export type CurveVisibilityControls = {
  readonly poissonVisibleProperty: BooleanProperty;
  readonly gaussianPredictionVisibleProperty: BooleanProperty;
  readonly gaussianFitVisibleProperty: BooleanProperty;
};

export class DistributionControlsPanel extends RadioactivityAndStatisticsPanel {
  private readonly disposeDistributionControlsPanel: () => void;

  public constructor(model: RadioactivityModel, curves: CurveVisibilityControls, a11y: ScreenControlA11yStrings) {
    const strings = StringManager.getInstance().getHistogramStrings();

    const title = new Text(strings.titleStringProperty, {
      font: new PhetFont({ size: 15, weight: "bold" }),
      fill: RadioactivityAndStatisticsColors.textColorProperty,
    });

    /** A checkbox whose label carries the curve's own colour as a cue. */
    const curveCheckbox = (
      property: BooleanProperty,
      labelProperty: TReadOnlyProperty<string>,
      accessibleName: TReadOnlyProperty<string>,
    ): Checkbox =>
      new Checkbox(
        property,
        new Text(labelProperty, {
          font: new PhetFont(12),
          fill: RadioactivityAndStatisticsColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 55,
        }),
        { ...SIM_CHECKBOX_OPTIONS, accessibleName },
      );

    const poissonCheckbox = curveCheckbox(
      curves.poissonVisibleProperty,
      strings.poissonStringProperty,
      a11y.poissonCheckboxStringProperty,
    );
    const gaussianPredictionCheckbox = curveCheckbox(
      curves.gaussianPredictionVisibleProperty,
      strings.gaussianPredictionStringProperty,
      a11y.gaussianPredictionCheckboxStringProperty,
    );
    const gaussianFitCheckbox = curveCheckbox(
      curves.gaussianFitVisibleProperty,
      strings.gaussianFitStringProperty,
      a11y.gaussianFitCheckboxStringProperty,
    );

    const autoBinWidthCheckbox = new Checkbox(
      model.isAutoBinWidthProperty,
      new Text(strings.autoBinWidthStringProperty, {
        font: new PhetFont(12),
        fill: RadioactivityAndStatisticsColors.textColorProperty,
        maxWidth: CONTROL_PANEL_WIDTH - 55,
      }),
      { ...SIM_CHECKBOX_OPTIONS, accessibleName: a11y.autoBinWidthCheckboxStringProperty },
    );

    const manualBinWidthEnabledProperty = new DerivedProperty([model.isAutoBinWidthProperty], (isAuto) => !isAuto);

    const binWidthControl = new NumberControl(
      strings.binWidthStringProperty,
      model.manualBinWidthProperty,
      BIN_WIDTH_RANGE,
      {
        ...SIM_NUMBER_CONTROL_OPTIONS,
        delta: 1,
        titleNodeOptions: {
          font: new PhetFont(12),
          fill: RadioactivityAndStatisticsColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 40,
        },
        numberDisplayOptions: { textOptions: { font: new PhetFont(12) } },
        accessibleName: a11y.binWidthControlStringProperty,
        enabledProperty: manualBinWidthEnabledProperty,
      },
    );

    super(
      new VBox({
        align: "left",
        spacing: 6,
        preferredWidth: CONTROL_PANEL_WIDTH - 24,
        stretch: true,
        children: [
          title,
          poissonCheckbox,
          gaussianPredictionCheckbox,
          gaussianFitCheckbox,
          autoBinWidthCheckbox,
          binWidthControl,
        ],
      }),
      { minWidth: CONTROL_PANEL_WIDTH },
    );

    this.disposeDistributionControlsPanel = () => {
      manualBinWidthEnabledProperty.dispose();
    };
  }

  public override dispose(): void {
    this.disposeDistributionControlsPanel();
    super.dispose();
  }
}
