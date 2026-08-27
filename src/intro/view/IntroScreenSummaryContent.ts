/**
 * IntroScreenSummaryContent.ts
 *
 * The accessible screen summary for the Intro screen — the first thing a
 * screen-reader user encounters, and the place they return to for the sim's
 * current state.
 *
 * The current-details region is live: it reports how much data has been
 * collected and what it says, so a non-visual user gets the same information
 * the count-rate readout and the chart carry visually.
 */

import { ScreenSummaryContent } from "scenerystack/sim";
import { createCurrentDetailsProperty } from "../../common/view/currentDetailsProperty.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { IntroModel } from "../model/IntroModel.js";

export class IntroScreenSummaryContent extends ScreenSummaryContent {
  private readonly disposeIntroScreenSummaryContent: () => void;

  public constructor(model: IntroModel) {
    const a11y = StringManager.getInstance().getIntroA11yStrings();
    const currentDetails = createCurrentDetailsProperty(model.acquisition, a11y);

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: currentDetails.property,
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });

    this.disposeIntroScreenSummaryContent = currentDetails.dispose;
  }

  public override dispose(): void {
    this.disposeIntroScreenSummaryContent();
    super.dispose();
  }
}
