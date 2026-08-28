/**
 * RadioactivityAndStatisticsConstants.ts
 *
 * Every named numeric constant used across the simulation. Values that carry
 * semantic meaning live here rather than inline, so they are named, documented,
 * and changed in one place.
 *
 * Conventions
 * ───────────
 *  - Model values use SI units; the unit is noted on each value.
 *  - Layout values are in screen pixels of the 1024 × 618 layout space.
 *  - Colours live in RadioactivityAndStatisticsColors.ts, not here.
 */

import { Range } from "scenerystack/dot";
import RadioactivityAndStatisticsNamespace from "./RadioactivityAndStatisticsNamespace.js";

// ── Layout / chrome (screen pixels) ───────────────────────────────────────────

/** Margin between the screen edge and edge-anchored controls (e.g. Reset All). */
export const SCREEN_VIEW_MARGIN = 20;

/** Corner radius shared by control panels and dialogs. */
export const PANEL_CORNER_RADIUS = 6;

/** Vertical gap between stacked panels in a control column. */
export const PANEL_SPACING = 10;

/**
 * Clear space left between the centre chart and the control columns either
 * side of it. The chart is also hard-capped to the gap it is given, so a font
 * or translation that makes its labels wider scales it down rather than letting
 * it grow underneath a panel.
 */
export const CENTRE_COLUMN_PADDING = 16;

/** Width of the control column on the right-hand side of both screens. */
export const CONTROL_PANEL_WIDTH = 225;

// ── Charts (screen pixels) ────────────────────────────────────────────────────

/** Plot area of the histogram, shown on either screen. */
export const HISTOGRAM_CHART_SIZE = { width: 380, height: 440 } as const;

/** Plot area of the count-rate strip chart, shown on either screen. */
export const RATE_CHART_SIZE = { width: 420, height: 330 } as const;

/** Stroke width of plotted model curves. */
export const CURVE_LINE_WIDTH = 2;

/** Dash pattern distinguishing each model curve without relying on colour. */
export const CURVE_DASH_PATTERNS = {
  /** Poisson prediction — solid. */
  poisson: [] as number[],
  /** Gaussian prediction from √mean — dashed. */
  gaussianPrediction: [8, 4] as number[],
  /** Best-fit Gaussian — dash-dot. */
  gaussianFit: [10, 3, 2, 3] as number[],
} as const;

/** Gap left between adjacent histogram bars, in view pixels. */
export const HISTOGRAM_BAR_GAP = 2;

// ── Data table (screen pixels) ────────────────────────────────────────────────

/** How many sample rows the data table shows at once. */
export const TABLE_VISIBLE_ROWS = 16;

/** Height of one data-table row. */
export const TABLE_ROW_HEIGHT = 20;

/** Width of the data table, including all columns. */
export const TABLE_WIDTH = 230;

// ── Acquisition defaults and ranges ───────────────────────────────────────────

/** Counting interval in seconds: how long each measurement accumulates. */
export const COUNTING_INTERVAL_RANGE = new Range(0.5, 20);

/** Arrow-button step for the counting interval. */
export const COUNTING_INTERVAL_DELTA = 0.5;

/** Decimal places shown for the counting interval. */
export const COUNTING_INTERVAL_DECIMAL_PLACES = 1;

/**
 * Counting interval range on the Simulation screen, whose fastest rate is not
 * limited by any hardware polling rate the way a real Geiger counter is.
 */
export const SIMULATION_COUNTING_INTERVAL_RANGE = new Range(0.25, 20);

/** Arrow-button step for the counting interval on the Simulation screen. */
export const SIMULATION_COUNTING_INTERVAL_DELTA = 0.25;

/** Decimal places shown for the counting interval on the Simulation screen. */
export const SIMULATION_COUNTING_INTERVAL_DECIMAL_PLACES = 2;

/** Default counting interval, in seconds. */
export const DEFAULT_COUNTING_INTERVAL = 1;

/**
 * Selectable factors by which the Simulation screen's clock can run faster
 * than real time. Offered only on the Simulation screen — a real source's
 * decays cannot be sped up, so the Device screen leaves this at 1.
 */
export const SPEED_MULTIPLIER_CHOICES = [1, 10, 100];

/** Default speed multiplier: real time. */
export const DEFAULT_SPEED_MULTIPLIER = 1;

/** How many intervals a run collects before recording stops on its own. */
export const SAMPLES_PER_RUN_RANGE = new Range(5, 200);

/** Default run length, in samples. */
export const DEFAULT_SAMPLES_PER_RUN = 20;

/** Mean event rate of the simulated source, in counts per second. */
export const ACTIVITY_RANGE = new Range(1, 200);

/**
 * Default simulated activity, in counts per second.
 *
 * Chosen so the default 1 s interval gives a mean near 20 counts — high enough
 * that the Gaussian limit is a good approximation and the histogram has a
 * recognisable shape, low enough that the Poisson skew is still visible.
 */
export const DEFAULT_ACTIVITY = 20;

/** Histogram bin width in counts, when not chosen automatically. */
export const BIN_WIDTH_RANGE = new Range(1, 20);

// ── Timing guards ─────────────────────────────────────────────────────────────

/**
 * Largest dt the model will act on, in seconds.
 *
 * A backgrounded tab hands back one enormous dt on return. Counting it in full
 * would fabricate intervals for time the source was never observed.
 */
export const MAXIMUM_STEP_DT = 0.5;

/**
 * Cap on intervals completed in a single frame, as a runaway-loop guard.
 *
 * Sized to keep up with the fastest speed multiplier (100×) at the shortest
 * counting interval (0.25 s): a 60 fps frame then needs to complete up to
 * ~7 intervals to avoid throttling the requested speedup. Any surplus beyond
 * the cap is not lost — the remainder carries into the next frame.
 */
export const MAXIMUM_INTERVALS_PER_FRAME = 20;

RadioactivityAndStatisticsNamespace.register("RadioactivityAndStatisticsConstants", {
  SCREEN_VIEW_MARGIN,
  PANEL_CORNER_RADIUS,
  PANEL_SPACING,
  CONTROL_PANEL_WIDTH,
  HISTOGRAM_CHART_SIZE,
  RATE_CHART_SIZE,
  CURVE_LINE_WIDTH,
  CURVE_DASH_PATTERNS,
  HISTOGRAM_BAR_GAP,
  TABLE_VISIBLE_ROWS,
  TABLE_ROW_HEIGHT,
  TABLE_WIDTH,
  COUNTING_INTERVAL_RANGE,
  COUNTING_INTERVAL_DELTA,
  COUNTING_INTERVAL_DECIMAL_PLACES,
  SIMULATION_COUNTING_INTERVAL_RANGE,
  SIMULATION_COUNTING_INTERVAL_DELTA,
  SIMULATION_COUNTING_INTERVAL_DECIMAL_PLACES,
  DEFAULT_COUNTING_INTERVAL,
  SPEED_MULTIPLIER_CHOICES,
  DEFAULT_SPEED_MULTIPLIER,
  SAMPLES_PER_RUN_RANGE,
  DEFAULT_SAMPLES_PER_RUN,
  ACTIVITY_RANGE,
  DEFAULT_ACTIVITY,
  BIN_WIDTH_RANGE,
  MAXIMUM_STEP_DT,
  MAXIMUM_INTERVALS_PER_FRAME,
});
