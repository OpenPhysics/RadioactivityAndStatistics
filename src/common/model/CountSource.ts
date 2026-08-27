/**
 * CountSource.ts
 *
 * The interface every source of counts satisfies, so the rest of the sim never
 * branches on whether the data came from a Geiger tube or a random generator.
 *
 * ── The contract ──────────────────────────────────────────────────────────────
 * A source exposes one number: a monotonically increasing running total of
 * events registered since it was reset. The acquisition model owns the
 * timebase; at the end of each counting interval it subtracts the total it saw
 * at the interval's start. That single design choice is what makes hardware and
 * simulated acquisition literally the same code path — a hardware source
 * advances its total from BLE notifications on its own clock, a simulated
 * source advances it from step(dt), and neither needs to know about intervals.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";

/** Where the counts on screen are coming from. */
export const CountSourceType = {
  /** Pseudo-random Poisson events generated in the browser. */
  SIMULATED: "simulated",
  /** A PASCO Wireless Geiger Counter over Web Bluetooth. */
  GEIGER_COUNTER: "geigerCounter",
} as const;

export type CountSourceTypeValue = (typeof CountSourceType)[keyof typeof CountSourceType];

/** Ordered for radio-button groups and combo boxes. */
export const COUNT_SOURCE_TYPES: readonly CountSourceTypeValue[] = [
  CountSourceType.SIMULATED,
  CountSourceType.GEIGER_COUNTER,
];

/** A source of counting events. */
export type TCountSource = {
  /** Which kind of source this is. */
  readonly sourceType: CountSourceTypeValue;

  /**
   * Running total of events since the last reset. Never decreases, so the
   * counts in any window are the difference of two readings.
   */
  readonly totalCountsProperty: TReadOnlyProperty<number>;

  /**
   * Whether the source is currently able to deliver counts. Always true for a
   * simulated source; tracks the BLE connection for a hardware one.
   */
  readonly isAvailableProperty: TReadOnlyProperty<boolean>;

  /**
   * Advances a source that runs on the sim's clock.
   *
   * Hardware sources ignore this — they advance from BLE notifications, on the
   * device's clock, and must keep counting even while the sim is paused.
   */
  step(dt: number): void;

  /** Zeroes the running total. */
  reset(): void;

  /** Releases listeners, timers, and connections. */
  dispose(): void;
};
