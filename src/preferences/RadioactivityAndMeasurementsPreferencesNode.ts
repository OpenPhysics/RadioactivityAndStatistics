/**
 * RadioactivityAndMeasurementsPreferencesNode.ts
 *
 * Custom preferences UI shown in Preferences → Simulation. Controls are bound
 * to RadioactivityAndMeasurementsPreferencesModel Properties (whose initial values come from
 * radioactivityAndMeasurementsQueryParameters).
 */

import { Range } from "scenerystack/dot";
import { Text, VBox } from "scenerystack/scenery";
import { NumberControl, PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import type { Tandem } from "scenerystack/tandem";
import { TUBE_VOLTAGE_CONTROL_RANGE } from "../common/hardware/PascoProtocol.js";
import { StringManager } from "../i18n/StringManager.js";
import RadioactivityAndMeasurementsColors from "../RadioactivityAndMeasurementsColors.js";
import RadioactivityAndMeasurementsNamespace from "../RadioactivityAndMeasurementsNamespace.js";
import type { RadioactivityAndMeasurementsPreferencesModel } from "./RadioactivityAndMeasurementsPreferencesModel.js";

export class RadioactivityAndMeasurementsPreferencesNode extends VBox {
  public constructor(preferencesModel: RadioactivityAndMeasurementsPreferencesModel, tandem?: Tandem) {
    const prefStrings = StringManager.getInstance().getPreferences();

    // The Preferences dialog is always white, so use the dark "light control surface"
    // colors (readable on white in both default and projector profiles), not textColorProperty
    // (which is near-white in default mode and would be invisible on the white dialog).
    const header = new Text(prefStrings.titleStringProperty, {
      font: new PhetFont({ size: 18, weight: "bold" }),
      fill: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
    });

    const labelOptions = {
      font: new PhetFont(14),
      fill: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
      maxWidth: 420,
    };

    const descriptionOptions = {
      font: new PhetFont(12),
      fill: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
      maxWidth: 460,
    };

    const checkboxOptions = {
      checkboxColor: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
      checkboxColorBackground: RadioactivityAndMeasurementsColors.controlSurfaceColorProperty,
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
          fill: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
          maxWidth: 280,
        },
        numberDisplayOptions: {
          valuePattern: "{{value}} V",
          decimalPlaces: 0,
          textOptions: {
            font: new PhetFont(14),
            fill: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
          },
        },
        sliderOptions: {
          trackFillEnabled: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
        },
        accessibleName: prefStrings.tubeVoltageStringProperty,
        ...(tandem && { tandem: tandem.createTandem("tubeVoltageControl") }),
      },
    );

    const tubeVoltageDescription = new Text(prefStrings.tubeVoltageDescriptionStringProperty, descriptionOptions);

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
      ],
    });
  }
}

RadioactivityAndMeasurementsNamespace.register(
  "RadioactivityAndMeasurementsPreferencesNode",
  RadioactivityAndMeasurementsPreferencesNode,
);
