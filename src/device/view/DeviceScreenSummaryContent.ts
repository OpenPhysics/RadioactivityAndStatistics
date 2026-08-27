/**
 * DeviceScreenSummaryContent.ts
 *
 * The accessible screen summary for the Device screen.
 *
 * Shares the live current-details paragraph with the Simulation screen — the
 * state being described (how much data, what it says) is the same on both
 * screens; only the source and the chart-neutral phrasing of the control area
 * differ.
 */

import { ScreenSummaryContent } from "scenerystack/sim";
import { createCurrentDetailsProperty } from "../../common/view/currentDetailsProperty.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { DeviceModel } from "../model/DeviceModel.js";

export class DeviceScreenSummaryContent extends ScreenSummaryContent {
  private readonly disposeDeviceScreenSummaryContent: () => void;

  public constructor(model: DeviceModel) {
    const a11y = StringManager.getInstance().getDeviceA11yStrings();
    const currentDetails = createCurrentDetailsProperty(model.acquisition, a11y);

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: currentDetails.property,
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });

    this.disposeDeviceScreenSummaryContent = currentDetails.dispose;
  }

  public override dispose(): void {
    this.disposeDeviceScreenSummaryContent();
    super.dispose();
  }
}
