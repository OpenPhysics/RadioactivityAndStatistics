/**
 * LabScreen.ts
 *
 * Wires the Lab model and view together and supplies screen-level options.
 * Registered in the screens array in src/main.ts.
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createLabIcon } from "../common/RadioactivityAndStatisticsScreenIcons.js";
import { RadioactivityKeyboardHelpContent } from "../common/view/RadioactivityKeyboardHelpContent.js";
import type { RadioactivityAndStatisticsPreferencesModel } from "../preferences/RadioactivityAndStatisticsPreferencesModel.js";
import RadioactivityAndStatisticsColors from "../RadioactivityAndStatisticsColors.js";
import { LabModel } from "./model/LabModel.js";
import { LabScreenView } from "./view/LabScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type LabScreenOptions = ScreenOptions & { tandem: Tandem };

export class LabScreen extends Screen<LabModel, LabScreenView> {
  public constructor(preferences: RadioactivityAndStatisticsPreferencesModel, options: LabScreenOptions) {
    super(
      () => new LabModel(preferences),
      (model) =>
        new LabScreenView(model, preferences.showDiagnosticsProperty, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<LabScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: RadioactivityAndStatisticsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new RadioactivityKeyboardHelpContent(),
          homeScreenIcon: createLabIcon(),
          navigationBarIcon: createLabIcon(),
        },
        options,
      ),
    );
  }
}
