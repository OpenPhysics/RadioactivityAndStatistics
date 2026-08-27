/**
 * SimControlOptions.ts
 *
 * Shared sizing and layout for panel controls (sliders, checkboxes, NumberControls).
 * Import these instead of repeating scale / track-size values in each screen view.
 */

import { Dimension2 } from "scenerystack/dot";
import { NumberControl } from "scenerystack/scenery-phet";
import type { CheckboxOptions, HSliderOptions } from "scenerystack/sun";
import RadioactivityAndStatisticsColors from "../RadioactivityAndStatisticsColors.js";
import { FLAT_RECTANGULAR_BUTTON_OPTIONS } from "./RadioactivityAndStatisticsButtonOptions.js";

const SLIDER_THUMB_SIZE = new Dimension2(12, 22);
const STANDALONE_SLIDER_TRACK_SIZE = new Dimension2(150, 3);
const NUMBER_CONTROL_SLIDER_TRACK_SIZE = new Dimension2(110, 3);
const CHECKBOX_BOX_WIDTH = 16;

/** Options for standalone HSlider instances in control panels. */
export const SIM_SLIDER_OPTIONS = {
  trackSize: STANDALONE_SLIDER_TRACK_SIZE,
  thumbSize: SLIDER_THUMB_SIZE,
  trackFillEnabled: RadioactivityAndStatisticsColors.textColorProperty,
} satisfies HSliderOptions;

/** Base NumberControl options; spread into each instance and add titleNodeOptions as needed. */
export const SIM_NUMBER_CONTROL_OPTIONS = {
  arrowButtonOptions: { ...FLAT_RECTANGULAR_BUTTON_OPTIONS, scale: 0.75 },
  layoutFunction: NumberControl.createLayoutFunction4({
    sliderPadding: 4,
    arrowButtonSpacing: 3,
    verticalSpacing: 4,
  }),
  sliderOptions: {
    trackSize: NUMBER_CONTROL_SLIDER_TRACK_SIZE,
    thumbSize: SLIDER_THUMB_SIZE,
    trackFillEnabled: RadioactivityAndStatisticsColors.textColorProperty,
  },
};

/**
 * Themed checkbox chrome on dark panel backgrounds.
 *
 * The box fill matches the panel so the control reads as part of the panel, and
 * the tick/border use {@link RadioactivityAndStatisticsColors.textColorProperty} (near-white in default
 * mode). Do not use {@link RadioactivityAndStatisticsColors.controlSurfaceColorProperty} here — that
 * colour is for white chrome (push buttons, combo lists, Preferences).
 */
export const SIM_CHECKBOX_OPTIONS = {
  boxWidth: CHECKBOX_BOX_WIDTH,
  spacing: 4,
  checkboxColor: RadioactivityAndStatisticsColors.textColorProperty,
  checkboxColorBackground: RadioactivityAndStatisticsColors.panelBackgroundColorProperty,
} satisfies CheckboxOptions;
