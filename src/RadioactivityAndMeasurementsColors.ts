/**
 * RadioactivityAndMeasurementsColors.ts
 *
 * Defines all dynamic colors for the simulation using ProfileColorProperty.
 *
 * Each color has two profiles:
 *   - "default"   — used in standard (dark) mode
 *   - "projector" — used when the user enables Projector Mode in Preferences
 *
 * SceneryStack switches profiles automatically; no manual toggling is needed.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 * Import RadioactivityAndMeasurementsColors and pass properties directly to Node's fillProperty or
 * strokeProperty options:
 *
 *   import RadioactivityAndMeasurementsColors from "../../RadioactivityAndMeasurementsColors.js";
 *
 *   new Rectangle( 0, 0, 100, 50, {
 *     fillProperty: RadioactivityAndMeasurementsColors.backgroundColorProperty,
 *   });
 *
 * ── How to add a color ────────────────────────────────────────────────────────
 * Add a new ProfileColorProperty entry to the RadioactivityAndMeasurementsColors object below.
 * Always provide both "default" and "projector" values.
 */
import { ProfileColorProperty } from "scenerystack/scenery";
import RadioactivityAndMeasurementsNamespace from "./RadioactivityAndMeasurementsNamespace.js";

const RadioactivityAndMeasurementsColors = {
  /**
   * Background color for the simulation screen.
   * Deep navy in default mode; white in projector mode.
   */
  backgroundColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "background", {
    default: "#1a1a2e",
    projector: "#ffffff",
  }),

  /**
   * Primary accent color for highlights, selected items, and key UI elements.
   * Sky blue in default mode; dark navy in projector mode.
   */
  accentColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "accent", {
    default: "#4fc3f7",
    projector: "#1a1a2e",
  }),

  /**
   * Background fill for control panels and dialogs.
   * Deep blue in default mode; light gray in projector mode.
   */
  panelBackgroundColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "panelBackground", {
    default: "#16213e",
    projector: "#f5f5f5",
  }),

  /**
   * Border/stroke color for control panels and dialogs.
   * Teal-navy in default mode; medium gray in projector mode.
   */
  panelBorderColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "panelBorder", {
    default: "#0f3460",
    projector: "#999999",
  }),

  /**
   * Text color for labels, readouts, and general UI text.
   * Near-white in default mode; near-black in projector mode.
   */
  textColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "text", {
    default: "#e0e0e0",
    projector: "#1a1a1a",
  }),

  // ── Light control surfaces ───────────────────────────────────────────────────
  // White chrome (combo boxes, flat push buttons, editable input fields) stays light
  // in both profiles; its text stays dark. Same values in default and projector mode,
  // but defined here so every color lives in one themeable place.

  /** Fill of light control surfaces: combo-box button/list, editable input fields. */
  controlSurfaceColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "controlSurface", {
    default: "#ffffff",
    projector: "#ffffff",
  }),

  /** Fill of a disabled control surface (grayed-out editable input field). */
  controlSurfaceDisabledColorProperty: new ProfileColorProperty(
    RadioactivityAndMeasurementsNamespace,
    "controlSurfaceDisabled",
    {
      default: "#cccccc",
      projector: "#cccccc",
    },
  ),

  /** Text on light control surfaces: combo items, flat-button labels, field values, preferences. */
  controlSurfaceTextColorProperty: new ProfileColorProperty(
    RadioactivityAndMeasurementsNamespace,
    "controlSurfaceText",
    {
      default: "#1a1a1a",
      projector: "#1a1a1a",
    },
  ),
  // ── Chart surfaces ───────────────────────────────────────────────────────────

  /** Plot-area fill behind the histogram and the count-rate chart. */
  chartSurfaceColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "chartSurface", {
    default: "#16213e",
    projector: "#ffffff",
  }),

  /** Border around the plot area. */
  chartBorderColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "chartBorder", {
    default: "#3a4a70",
    projector: "#b9bfc9",
  }),

  /** Grid lines. Deliberately recessive — the data must dominate the chart. */
  chartGridColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "chartGrid", {
    default: "#2a3a5c",
    projector: "#e6e9ee",
  }),

  /** Axis lines, tick marks, and tick labels. */
  chartAxisColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "chartAxis", {
    default: "#93a1bd",
    projector: "#6b7280",
  }),

  // ── Data marks ───────────────────────────────────────────────────────────────
  // The measured data is drawn as a neutral fill so the three model curves —
  // which are a validated categorical set — read as figure against it. Making
  // the bars a fourth categorical hue was tried and fails the colour-vision
  // separation floor against the curves in both profiles.

  /** Histogram bars: the measured distribution. */
  histogramBarColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "histogramBar", {
    default: "#8fa3c4",
    projector: "#5b6b8c",
  }),

  /** Count-rate trace on the Intro screen's strip chart (a single series). */
  countRateTraceColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "countRateTrace", {
    default: "#3987e5",
    projector: "#2a78d6",
  }),

  // ── Model curves (categorical slots 1–3, validated for both profiles) ────────
  // Each curve also carries a distinct dash pattern (see CURVE_DASH_PATTERNS),
  // so the three are separable without relying on colour at all.

  /** Poisson prediction with λ = the measured mean. */
  poissonCurveColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "poissonCurve", {
    default: "#3987e5",
    projector: "#2a78d6",
  }),

  /** Gaussian prediction with μ = mean and σ = √mean. */
  gaussianPredictionColorProperty: new ProfileColorProperty(
    RadioactivityAndMeasurementsNamespace,
    "gaussianPrediction",
    {
      default: "#d95926",
      projector: "#eb6834",
    },
  ),

  /** Least-squares best-fit Gaussian, with all three parameters floated. */
  gaussianFitColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "gaussianFit", {
    default: "#199e70",
    projector: "#1baf7a",
  }),

  // ── Status ───────────────────────────────────────────────────────────────────
  // Status colours are reserved and identical in both profiles, and are never
  // the only cue: every status mark in this sim sits beside its own text label.

  /** Connected and delivering samples. */
  statusGoodColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "statusGood", {
    default: "#0ca30c",
    projector: "#0ca30c",
  }),

  /** Connection in progress. */
  statusWarningColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "statusWarning", {
    default: "#fab219",
    projector: "#fab219",
  }),

  /** Connection failed, or recording in progress. */
  statusCriticalColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "statusCritical", {
    default: "#d03b3b",
    projector: "#d03b3b",
  }),

  /**
   * Text and icons drawn ON a critical-status fill — the Stop button's label.
   * White in both profiles, because the red beneath it is fixed in both.
   */
  onStatusCriticalTextColorProperty: new ProfileColorProperty(
    RadioactivityAndMeasurementsNamespace,
    "onStatusCriticalText",
    {
      default: "#ffffff",
      projector: "#ffffff",
    },
  ),

  /** Disconnected / idle. */
  statusIdleColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "statusIdle", {
    default: "#7b879e",
    projector: "#9aa2b1",
  }),

  // ── Data table ───────────────────────────────────────────────────────────────

  /** Fill behind alternating table rows, for horizontal tracking. */
  tableStripeColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "tableStripe", {
    default: "#1d2c50",
    projector: "#f2f4f7",
  }),

  /** Rule under the table header and between column groups. */
  tableRuleColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "tableRule", {
    default: "#3a4a70",
    projector: "#cbd2dc",
  }),

  /** Secondary text: units, tick labels, table headers. */
  secondaryTextColorProperty: new ProfileColorProperty(RadioactivityAndMeasurementsNamespace, "secondaryText", {
    default: "#a8b4cc",
    projector: "#525a66",
  }),
};

export default RadioactivityAndMeasurementsColors;
