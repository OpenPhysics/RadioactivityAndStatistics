/**
 * RadioactivityAndMeasurementsPreferencesNode.ts
 *
 * Custom preferences UI shown in Preferences → Simulation. Controls are bound
 * to RadioactivityAndMeasurementsPreferencesModel Properties (whose initial values come from
 * radioactivityAndMeasurementsQueryParameters).
 */

import { Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import type { Tandem } from "scenerystack/tandem";
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

    const showDiagnosticsCheckbox = new Checkbox(
      preferencesModel.showDiagnosticsProperty,
      new Text(prefStrings.showDiagnosticsStringProperty, {
        font: new PhetFont(14),
        fill: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
      }),
      {
        checkboxColor: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
        checkboxColorBackground: RadioactivityAndMeasurementsColors.controlSurfaceColorProperty,
        spacing: 8,
        ...(tandem && { tandem: tandem.createTandem("showDiagnosticsCheckbox") }),
      },
    );

    // A one-line explanation under the checkbox: "diagnostics" means nothing
    // without saying what they are for.
    const description = new Text(prefStrings.showDiagnosticsDescriptionStringProperty, {
      font: new PhetFont(12),
      fill: RadioactivityAndMeasurementsColors.controlSurfaceTextColorProperty,
      maxWidth: 460,
    });

    super({
      align: "left",
      spacing: 12,
      children: [header, showDiagnosticsCheckbox, description],
    });
  }
}

RadioactivityAndMeasurementsNamespace.register(
  "RadioactivityAndMeasurementsPreferencesNode",
  RadioactivityAndMeasurementsPreferencesNode,
);
