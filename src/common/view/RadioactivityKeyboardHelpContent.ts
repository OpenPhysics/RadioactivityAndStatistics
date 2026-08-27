/**
 * RadioactivityKeyboardHelpContent.ts
 *
 * Content for the navigation bar's keyboard-help ("?") dialog, shared by both
 * screens because both offer the same kinds of interaction: sliders on the
 * NumberControls, checkboxes, radio buttons, and push buttons.
 *
 * The sections here carry their own translations, so this file needs no strings
 * of its own.
 */

import {
  BasicActionsKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";

export class RadioactivityKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super(
      // Left: the interaction-specific sections this sim actually has —
      // NumberControl sliders for interval, run length, activity, bin width.
      [new SliderControlsKeyboardHelpSection()],
      // Right: Tab/button navigation, including checkbox toggling.
      [new BasicActionsKeyboardHelpSection({ withCheckboxContent: true })],
    );
  }
}
