/**
 * SimulatedCountSource.ts
 *
 * A software stand-in for the Geiger counter: a Poisson event generator driven
 * by the sim clock.
 *
 * This is not a fallback bolted on for when hardware is missing — it is the
 * default source, and it matters pedagogically. A student can set a known true
 * mean, collect data, and check that the measured standard deviation really
 * does come out at √λ. With real hardware the true λ is never known, so the
 * simulated source is the only place the theory can be checked against an
 * answer that is known in advance.
 */

import { NumberProperty, Property, type TReadOnlyProperty } from "scenerystack/axon";
import { dotRandom } from "scenerystack/dot";
import { CountSourceType, type CountSourceTypeValue, type TCountSource } from "./CountSource.js";

/**
 * Above this expected number of events per step, Knuth's product algorithm
 * needs too many iterations and a Gaussian approximation is indistinguishable
 * (the relative error of the normal approximation is below a part in a thousand
 * by λ = 30).
 */
const KNUTH_ALGORITHM_LIMIT = 30;

/**
 * Draws from a Poisson distribution with the given mean.
 *
 * Small means use Knuth's algorithm — multiply uniforms until the product falls
 * below e^(−λ) — which is exact. Large means use a rounded Gaussian of matching
 * mean and variance, clamped at zero.
 */
export function samplePoisson(mean: number): number {
  if (!(mean > 0 && Number.isFinite(mean))) {
    return 0;
  }

  if (mean < KNUTH_ALGORITHM_LIMIT) {
    const threshold = Math.exp(-mean);
    let count = 0;
    let product = dotRandom.nextDouble();
    while (product > threshold) {
      count += 1;
      product *= dotRandom.nextDouble();
    }
    return count;
  }

  return Math.max(0, Math.round(mean + Math.sqrt(mean) * dotRandom.nextGaussian()));
}

export class SimulatedCountSource implements TCountSource {
  public readonly sourceType: CountSourceTypeValue = CountSourceType.SIMULATED;

  /** Mean event rate of the simulated source, in counts per second. */
  public readonly activityProperty: NumberProperty;

  /** A simulated source is always ready. */
  public readonly isAvailableProperty: TReadOnlyProperty<boolean> = new Property(true);

  private readonly totalCounts: NumberProperty;

  public constructor(initialActivity: number) {
    // PhET's units vocabulary has no counts-per-second entry, so this rate
    // carries no unit annotation; the view labels it explicitly.
    this.activityProperty = new NumberProperty(initialActivity);
    this.totalCounts = new NumberProperty(0);
  }

  public get totalCountsProperty(): TReadOnlyProperty<number> {
    return this.totalCounts;
  }

  /**
   * Generates the events that occurred during dt.
   *
   * The number of Poisson events in a window is itself Poisson with mean
   * rate × dt, so one draw per frame is exact — there is no need to simulate
   * individual decays, and the result does not depend on the frame rate.
   */
  public step(dt: number): void {
    if (dt <= 0) {
      return;
    }
    const events = samplePoisson(this.activityProperty.value * dt);
    if (events > 0) {
      this.totalCounts.value += events;
    }
  }

  public reset(): void {
    this.totalCounts.value = 0;
    this.activityProperty.reset();
  }

  public dispose(): void {
    this.activityProperty.dispose();
    this.totalCounts.dispose();
  }
}
