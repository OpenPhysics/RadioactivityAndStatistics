/**
 * DeviceScreen.ts
 *
 * Wires the Device model and view together and supplies screen-level options.
 * Registered in the screens array in src/main.ts.
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { CountSourceType } from "../common/model/CountSource.js";
import { createDeviceIcon } from "../common/RadioactivityAndStatisticsScreenIcons.js";
import { RadioactivityKeyboardHelpContent } from "../common/view/RadioactivityKeyboardHelpContent.js";
import { RadioactivityScreenView } from "../common/view/RadioactivityScreenView.js";
import { StringManager } from "../i18n/StringManager.js";
import type { RadioactivityAndStatisticsPreferencesModel } from "../preferences/RadioactivityAndStatisticsPreferencesModel.js";
import RadioactivityAndStatisticsColors from "../RadioactivityAndStatisticsColors.js";
import { DeviceModel } from "./model/DeviceModel.js";
import { DeviceScreenSummaryContent } from "./view/DeviceScreenSummaryContent.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type DeviceScreenOptions = ScreenOptions & { tandem: Tandem };

export class DeviceScreen extends Screen<DeviceModel, RadioactivityScreenView> {
  public constructor(preferences: RadioactivityAndStatisticsPreferencesModel, options: DeviceScreenOptions) {
    super(
      () => new DeviceModel(preferences),
      (model) =>
        new RadioactivityScreenView(
          model,
          CountSourceType.GEIGER_COUNTER,
          preferences.showDiagnosticsProperty,
          StringManager.getInstance().getDeviceA11yStrings().controls,
          {
            screenSummaryContent: new DeviceScreenSummaryContent(model),
            tandem: options.tandem.createTandem("view"),
          },
        ),
      optionize<DeviceScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: RadioactivityAndStatisticsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new RadioactivityKeyboardHelpContent(),
          homeScreenIcon: createDeviceIcon(),
          navigationBarIcon: createDeviceIcon(),
        },
        options,
      ),
    );
  }
}
