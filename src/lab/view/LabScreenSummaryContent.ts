/**
 * LabScreenSummaryContent.ts
 *
 * The accessible screen summary for the Lab screen.
 *
 * Shares the live current-details paragraph with the Intro screen — the state
 * being described (how much data, what it says) is the same on both screens,
 * and the Lab screen's own additions are curve visibility, which the checkboxes
 * already announce themselves.
 */

import { ScreenSummaryContent } from "scenerystack/sim";
import { createCurrentDetailsProperty } from "../../common/view/currentDetailsProperty.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { LabModel } from "../model/LabModel.js";

export class LabScreenSummaryContent extends ScreenSummaryContent {
  private readonly disposeLabScreenSummaryContent: () => void;

  public constructor(model: LabModel) {
    const a11y = StringManager.getInstance().getLabA11yStrings();
    const currentDetails = createCurrentDetailsProperty(model.acquisition, a11y);

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: currentDetails.property,
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });

    this.disposeLabScreenSummaryContent = currentDetails.dispose;
  }

  public override dispose(): void {
    this.disposeLabScreenSummaryContent();
    super.dispose();
  }
}
