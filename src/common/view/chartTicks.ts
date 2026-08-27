/**
 * chartTicks.ts
 *
 * Chooses tick spacing that lands on round numbers at any zoom level.
 *
 * Both charts in this sim rescale continuously as data arrives, so a fixed tick
 * spacing would either crowd into an unreadable smear or thin out to two ticks.
 * Snapping to the 1–2–5 sequence keeps labels on values a reader can do
 * arithmetic with, whatever the range happens to be.
 */

/** The mantissas that make readable ticks, in ascending order. */
const NICE_MANTISSAS = [1, 2, 5, 10];

/**
 * Returns a "nice" tick spacing for the given span.
 *
 * @param span - the extent of the axis in model coordinates
 * @param targetTickCount - roughly how many ticks are wanted
 * @param minimumSpacing - never return a spacing below this (1 for integer axes)
 */
export function chooseTickSpacing(span: number, targetTickCount: number, minimumSpacing = 0): number {
  if (!(span > 0 && Number.isFinite(span)) || targetTickCount <= 0) {
    return Math.max(minimumSpacing, 1);
  }

  const rawSpacing = span / targetTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawSpacing));
  const normalized = rawSpacing / magnitude;

  const mantissa = NICE_MANTISSAS.find((candidate) => normalized <= candidate) ?? 10;
  return Math.max(minimumSpacing, mantissa * magnitude);
}
