/**
 * ChartViewType.ts
 *
 * Which of the two model charts a screen is currently showing. Both screens
 * carry the same acquisition machinery and can display either chart — only the
 * counting source is fixed per screen — so the choice between them is a single
 * enum rather than two screen-specific booleans.
 */

/** Which chart is drawn in the centre of the screen. */
export const ChartViewType = {
  /** Distribution of counts per interval, with the theoretical curves. */
  HISTOGRAM: "histogram",
  /** Count rate against time, with the running mean. */
  COUNT_RATE: "countRate",
} as const;

export type ChartViewTypeValue = (typeof ChartViewType)[keyof typeof ChartViewType];

/** Ordered for the view-choice radio button group. */
export const CHART_VIEW_TYPES: readonly ChartViewTypeValue[] = [ChartViewType.HISTOGRAM, ChartViewType.COUNT_RATE];
