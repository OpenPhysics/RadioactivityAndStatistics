/**
 * SimulationScreen.ts
 *
 * Wires the Simulation model and view together and supplies screen-level
 * options. Registered in the screens array in src/main.ts.
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { CountSourceType } from "../common/model/CountSource.js";
import { createSimulationIcon } from "../common/RadioactivityAndStatisticsScreenIcons.js";
import { RadioactivityKeyboardHelpContent } from "../common/view/RadioactivityKeyboardHelpContent.js";
import { RadioactivityScreenView } from "../common/view/RadioactivityScreenView.js";
import { StringManager } from "../i18n/StringManager.js";
import type { RadioactivityAndStatisticsPreferencesModel } from "../preferences/RadioactivityAndStatisticsPreferencesModel.js";
import RadioactivityAndStatisticsColors from "../RadioactivityAndStatisticsColors.js";
import { SimulationModel } from "./model/SimulationModel.js";
import { SimulationScreenSummaryContent } from "./view/SimulationScreenSummaryContent.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type SimulationScreenOptions = ScreenOptions & { tandem: Tandem };

export class SimulationScreen extends Screen<SimulationModel, RadioactivityScreenView> {
  public constructor(preferences: RadioactivityAndStatisticsPreferencesModel, options: SimulationScreenOptions) {
    super(
      () => new SimulationModel(preferences),
      (model) =>
        new RadioactivityScreenView(
          model,
          CountSourceType.SIMULATED,
          preferences.showDiagnosticsProperty,
          StringManager.getInstance().getSimulationA11yStrings().controls,
          {
            screenSummaryContent: new SimulationScreenSummaryContent(model),
            tandem: options.tandem.createTandem("view"),
          },
        ),
      optionize<SimulationScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: RadioactivityAndStatisticsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new RadioactivityKeyboardHelpContent(),
          homeScreenIcon: createSimulationIcon(),
          navigationBarIcon: createSimulationIcon(),
        },
        options,
      ),
    );
  }
}
