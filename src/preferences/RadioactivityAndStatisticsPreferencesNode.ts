/**
 * RadioactivityAndStatisticsPreferencesNode.ts
 *
 * Custom preferences UI shown in Preferences → Simulation. Controls are bound
 * to RadioactivityAndStatisticsPreferencesModel Properties (whose initial values come from
 * radioactivityAndStatisticsQueryParameters).
 */

import { Range } from "scenerystack/dot";
import { Text, VBox } from "scenerystack/scenery";
import { NumberControl, PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import type { Tandem } from "scenerystack/tandem";
import { TUBE_VOLTAGE_CONTROL_RANGE } from "../common/hardware/PascoProtocol.js";
import { StringManager } from "../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../RadioactivityAndStatisticsColors.js";
import RadioactivityAndStatisticsNamespace from "../RadioactivityAndStatisticsNamespace.js";
import type { RadioactivityAndStatisticsPreferencesModel } from "./RadioactivityAndStatisticsPreferencesModel.js";

export class RadioactivityAndStatisticsPreferencesNode extends VBox {
  public constructor(preferencesModel: RadioactivityAndStatisticsPreferencesModel, tandem?: Tandem) {
    const prefStrings = StringManager.getInstance().getPreferences();

    // The Preferences dialog is always white, so use the dark "light control surface"
    // colors (readable on white in both default and projector profiles), not textColorProperty
    // (which is near-white in default mode and would be invisible on the white dialog).
    const header = new Text(prefStrings.titleStringProperty, {
      font: new PhetFont({ size: 18, weight: "bold" }),
      fill: RadioactivityAndStatisticsColors.controlSurfaceTextColorProperty,
    });

    const labelOptions = {
      font: new PhetFont(14),
      fill: RadioactivityAndStatisticsColors.controlSurfaceTextColorProperty,
      maxWidth: 420,
    };

    const descriptionOptions = {
      font: new PhetFont(12),
      fill: RadioactivityAndStatisticsColors.controlSurfaceTextColorProperty,
      maxWidth: 460,
    };

    const checkboxOptions = {
      checkboxColor: RadioactivityAndStatisticsColors.controlSurfaceTextColorProperty,
      checkboxColorBackground: RadioactivityAndStatisticsColors.controlSurfaceColorProperty,
      spacing: 8,
    };

    const showDiagnosticsCheckbox = new Checkbox(
      preferencesModel.showDiagnosticsProperty,
      new Text(prefStrings.showDiagnosticsStringProperty, labelOptions),
      {
        ...checkboxOptions,
        ...(tandem && { tandem: tandem.createTandem("showDiagnosticsCheckbox") }),
      },
    );

    // A one-line explanation under the checkbox: "diagnostics" means nothing
    // without saying what they are for.
    const diagnosticsDescription = new Text(prefStrings.showDiagnosticsDescriptionStringProperty, descriptionOptions);

    const beepEnabledCheckbox = new Checkbox(
      preferencesModel.beepEnabledProperty,
      new Text(prefStrings.beepEnabledStringProperty, labelOptions),
      {
        ...checkboxOptions,
        ...(tandem && { tandem: tandem.createTandem("beepEnabledCheckbox") }),
      },
    );

    const beepDescription = new Text(prefStrings.beepEnabledDescriptionStringProperty, descriptionOptions);

    const tubeVoltageControl = new NumberControl(
      prefStrings.tubeVoltageStringProperty,
      preferencesModel.tubeVoltageProperty,
      new Range(TUBE_VOLTAGE_CONTROL_RANGE.min, TUBE_VOLTAGE_CONTROL_RANGE.max),
      {
        delta: TUBE_VOLTAGE_CONTROL_RANGE.step,
        layoutFunction: NumberControl.createLayoutFunction1({
          arrowButtonsXSpacing: 8,
          ySpacing: 6,
        }),
        titleNodeOptions: {
          font: new PhetFont(14),
          fill: RadioactivityAndStatisticsColors.controlSurfaceTextColorProperty,
          maxWidth: 280,
        },
        numberDisplayOptions: {
          valuePattern: "{{value}} V",
          decimalPlaces: 0,
          textOptions: {
            font: new PhetFont(14),
            fill: RadioactivityAndStatisticsColors.controlSurfaceTextColorProperty,
          },
        },
        sliderOptions: {
          trackFillEnabled: RadioactivityAndStatisticsColors.controlSurfaceTextColorProperty,
        },
        accessibleName: prefStrings.tubeVoltageStringProperty,
        ...(tandem && { tandem: tandem.createTandem("tubeVoltageControl") }),
      },
    );

    const tubeVoltageDescription = new Text(prefStrings.tubeVoltageDescriptionStringProperty, descriptionOptions);

    const showSamplesPerRunControlCheckbox = new Checkbox(
      preferencesModel.showSamplesPerRunControlProperty,
      new Text(prefStrings.showSamplesPerRunControlStringProperty, labelOptions),
      {
        ...checkboxOptions,
        ...(tandem && { tandem: tandem.createTandem("showSamplesPerRunControlCheckbox") }),
      },
    );

    const showSamplesPerRunControlDescription = new Text(
      prefStrings.showSamplesPerRunControlDescriptionStringProperty,
      descriptionOptions,
    );

    super({
      align: "left",
      spacing: 12,
      children: [
        header,
        showDiagnosticsCheckbox,
        diagnosticsDescription,
        beepEnabledCheckbox,
        beepDescription,
        tubeVoltageControl,
        tubeVoltageDescription,
        showSamplesPerRunControlCheckbox,
        showSamplesPerRunControlDescription,
      ],
    });
  }
}

RadioactivityAndStatisticsNamespace.register(
  "RadioactivityAndStatisticsPreferencesNode",
  RadioactivityAndStatisticsPreferencesNode,
);
