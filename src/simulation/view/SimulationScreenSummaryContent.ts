/**
 * SimulationScreenSummaryContent.ts
 *
 * The accessible screen summary for the Simulation screen — the first thing a
 * screen-reader user encounters, and the place they return to for the sim's
 * current state.
 *
 * The current-details region is live: it reports how much data has been
 * collected and what it says, so a non-visual user gets the same information
 * the charts carry visually.
 */

import { ScreenSummaryContent } from "scenerystack/sim";
import { createCurrentDetailsProperty } from "../../common/view/currentDetailsProperty.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { SimulationModel } from "../model/SimulationModel.js";

export class SimulationScreenSummaryContent extends ScreenSummaryContent {
  private readonly disposeSimulationScreenSummaryContent: () => void;

  public constructor(model: SimulationModel) {
    const a11y = StringManager.getInstance().getSimulationA11yStrings();
    const currentDetails = createCurrentDetailsProperty(model.acquisition, a11y);

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: currentDetails.property,
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });

    this.disposeSimulationScreenSummaryContent = currentDetails.dispose;
  }

  public override dispose(): void {
    this.disposeSimulationScreenSummaryContent();
    super.dispose();
  }
}
