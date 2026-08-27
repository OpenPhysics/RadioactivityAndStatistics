/**
 * RadioactivityAndMeasurementsPanel.ts
 *
 * A pre-themed Panel that automatically uses RadioactivityAndMeasurementsColors for background and
 * border. Use this for all control panels and info boxes in the sim so that
 * default / projector mode switching is handled automatically.
 *
 * ── Basic usage ───────────────────────────────────────────────────────────────
 *
 *   import { RadioactivityAndMeasurementsPanel } from "../../common/RadioactivityAndMeasurementsPanel.js";
 *   import { VBox, Text } from "scenerystack/scenery";
 *
 *   const content = new VBox({
 *     children: [ new Text("label"), slider ],
 *     spacing: 8,
 *   });
 *   const panel = new RadioactivityAndMeasurementsPanel(content);
 *
 * ── Overriding defaults ───────────────────────────────────────────────────────
 *
 *   // Wider margins, sharper corners, custom stroke
 *   const panel = new RadioactivityAndMeasurementsPanel(content, { xMargin: 20, cornerRadius: 0 });
 *
 *   // Transparent background (decorative border only)
 *   const panel = new RadioactivityAndMeasurementsPanel(content, { fill: "transparent" });
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { Node } from "scenerystack/scenery";
import { Panel, type PanelOptions } from "scenerystack/sun";
import RadioactivityAndMeasurementsColors from "../RadioactivityAndMeasurementsColors.js";
import { PANEL_CORNER_RADIUS } from "../RadioactivityAndMeasurementsConstants.js";

export type SimPanelOptions = PanelOptions;

export class RadioactivityAndMeasurementsPanel extends Panel {
  public constructor(content: Node, providedOptions?: SimPanelOptions) {
    const options = optionize<SimPanelOptions, EmptySelfOptions, PanelOptions>()(
      {
        fill: RadioactivityAndMeasurementsColors.panelBackgroundColorProperty,
        stroke: RadioactivityAndMeasurementsColors.panelBorderColorProperty,
        cornerRadius: PANEL_CORNER_RADIUS,
        xMargin: 12,
        yMargin: 10,
      },
      providedOptions,
    );
    super(content, options);
  }
}
