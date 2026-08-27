/**
 * IntroScreen.ts
 *
 * Wires the Intro model and view together and supplies screen-level options.
 * Registered in the screens array in src/main.ts.
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createIntroIcon } from "../common/RadioactivityAndStatisticsScreenIcons.js";
import { RadioactivityKeyboardHelpContent } from "../common/view/RadioactivityKeyboardHelpContent.js";
import type { RadioactivityAndStatisticsPreferencesModel } from "../preferences/RadioactivityAndStatisticsPreferencesModel.js";
import RadioactivityAndStatisticsColors from "../RadioactivityAndStatisticsColors.js";
import { IntroModel } from "./model/IntroModel.js";
import { IntroScreenView } from "./view/IntroScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type IntroScreenOptions = ScreenOptions & { tandem: Tandem };

export class IntroScreen extends Screen<IntroModel, IntroScreenView> {
  public constructor(preferences: RadioactivityAndStatisticsPreferencesModel, options: IntroScreenOptions) {
    super(
      () => new IntroModel(preferences),
      (model) =>
        new IntroScreenView(model, preferences.showDiagnosticsProperty, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<IntroScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: RadioactivityAndStatisticsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new RadioactivityKeyboardHelpContent(),
          homeScreenIcon: createIntroIcon(),
          navigationBarIcon: createIntroIcon(),
        },
        options,
      ),
    );
  }
}
