/**
 * GeigerCountSource.ts
 *
 * A {@link TCountSource} backed by a real PASCO Wireless Geiger Counter.
 *
 * Owns the BLE connection lifecycle and a polling loop that keeps the running
 * total up to date. The sim's timebase stays in RadioactivityModel; this class
 * only answers "how many counts have arrived so far".
 *
 * ── Interpreting the CountRate register ───────────────────────────────────────
 * Measurement 0 of sensor 2079 is "CountRate", and the device CLEARS it on
 * read: each one-shot read returns the counts accumulated since the previous
 * read, not a free-running total and not a fixed-length window. Confirmed on a
 * PS-3238 — the first read after connecting returns everything banked since
 * power-on, and subsequent values scale with the gap between reads.
 *
 * So every reading is summed, and the first is discarded because counts banked
 * before the sim connected are not ours to report. A dropped or timed-out read
 * costs nothing: those counts stay banked on the device and arrive in the next
 * successful read.
 */

import { BooleanProperty, NumberProperty, Property, type TReadOnlyProperty } from "scenerystack/axon";
import {
  DeviceSelectionCancelled,
  GeigerCounterDevice,
  type GeigerDeviceInfo,
} from "../hardware/GeigerCounterDevice.js";
import { ConnectionState, type ConnectionStateValue } from "./ConnectionState.js";
import { CountSourceType, type CountSourceTypeValue, type TCountSource } from "./CountSource.js";

/**
 * How often the device is polled, in ms. Fast enough to resolve a one-second
 * counting interval, slow enough to sit well inside a BLE connection interval.
 */
const DEFAULT_POLL_INTERVAL_MS = 100;

/**
 * TEMPORARY: `?pollIntervalMs=N` overrides the polling period, so the CountRate
 * register's behaviour can be identified by seeing whether its magnitude scales
 * with the gap between reads. Remove with the tracing in GeigerCounterDevice.
 */
const POLL_INTERVAL_MS = (() => {
  if (typeof window === "undefined") {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  const requested = Number(new URLSearchParams(window.location.search).get("pollIntervalMs"));
  return Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_POLL_INTERVAL_MS;
})();

/** Consecutive failed reads tolerated before the connection is declared bad. */
const MAXIMUM_CONSECUTIVE_FAILURES = 10;

export class GeigerCountSource implements TCountSource {
  public readonly sourceType: CountSourceTypeValue = CountSourceType.GEIGER_COUNTER;

  /** Where the Bluetooth connection stands. */
  public readonly connectionStateProperty: Property<ConnectionStateValue>;

  /** Human-readable reason for the most recent failure, or null. */
  public readonly errorMessageProperty: Property<string | null>;

  /** Advertised name and serial of the connected counter, or null. */
  public readonly deviceInfoProperty: Property<GeigerDeviceInfo | null>;

  /** Most recent raw CountRate register value — the diagnostic readout. */
  public readonly countRegisterProperty: NumberProperty;

  /** Most recent GM tube bias in volts; healthy tubes sit near 500 V. */
  public readonly tubeVoltageProperty: NumberProperty;

  /** True while connected, so acquisition can refuse to start without a device. */
  public readonly isAvailableProperty: BooleanProperty;

  private readonly totalCounts: NumberProperty;
  private readonly device: GeigerCounterDevice;

  /** Handle of the polling timer, or null when not polling. */
  private pollTimerId: ReturnType<typeof setInterval> | null = null;

  /** Guards against issuing a new read while one is still outstanding. */
  private isPolling = false;

  /** False until the first read has flushed the device's pre-connection backlog. */
  private hasFlushedBacklog = false;

  private consecutiveFailures = 0;

  public constructor() {
    this.connectionStateProperty = new Property<ConnectionStateValue>(ConnectionState.DISCONNECTED);
    this.errorMessageProperty = new Property<string | null>(null);
    this.deviceInfoProperty = new Property<GeigerDeviceInfo | null>(null);
    this.countRegisterProperty = new NumberProperty(0);
    this.tubeVoltageProperty = new NumberProperty(0, { units: "V" });
    this.isAvailableProperty = new BooleanProperty(false);
    this.totalCounts = new NumberProperty(0);

    this.device = new GeigerCounterDevice(() => this.handleUnexpectedDisconnect());
  }

  public get totalCountsProperty(): TReadOnlyProperty<number> {
    return this.totalCounts;
  }

  /**
   * Opens the browser's device picker and connects.
   *
   * Must be called directly from a user gesture — Web Bluetooth refuses to show
   * the picker otherwise. A cancelled picker is not an error; it simply returns
   * the source to the disconnected state.
   */
  public async connect(): Promise<void> {
    if (this.connectionStateProperty.value === ConnectionState.CONNECTING) {
      return;
    }

    this.connectionStateProperty.value = ConnectionState.CONNECTING;
    this.errorMessageProperty.value = null;

    try {
      await this.device.connect();
    } catch (error) {
      if (error instanceof DeviceSelectionCancelled) {
        this.connectionStateProperty.value = ConnectionState.DISCONNECTED;
      } else {
        this.connectionStateProperty.value = ConnectionState.ERROR;
        this.errorMessageProperty.value = error instanceof Error ? error.message : String(error);
      }
      return;
    }

    this.deviceInfoProperty.value = this.device.info;
    this.connectionStateProperty.value = ConnectionState.CONNECTED;
    this.isAvailableProperty.value = true;
    this.hasFlushedBacklog = false;
    this.consecutiveFailures = 0;
    this.startPolling();
  }

  /** Closes the connection at the user's request. */
  public async disconnect(): Promise<void> {
    this.stopPolling();
    await this.device.disconnect();
    this.deviceInfoProperty.value = null;
    this.isAvailableProperty.value = false;
    this.connectionStateProperty.value = ConnectionState.DISCONNECTED;
    this.errorMessageProperty.value = null;
  }

  /**
   * No-op: the counter runs on its own clock.
   *
   * Deliberately empty rather than unimplemented — a real source must keep
   * accumulating decays while the sim's clock is paused, because the physical
   * process does not stop when the user presses pause.
   */
  public step(_dt: number): void {
    // Intentionally empty; see the doc comment.
  }

  public reset(): void {
    this.totalCounts.value = 0;
  }

  public dispose(): void {
    this.stopPolling();
    // Disposal cannot await, and a failure to close a link that is going away
    // anyway is not actionable.
    this.device.disconnect().catch(() => undefined);
    this.connectionStateProperty.dispose();
    this.errorMessageProperty.dispose();
    this.deviceInfoProperty.dispose();
    this.countRegisterProperty.dispose();
    this.tubeVoltageProperty.dispose();
    this.isAvailableProperty.dispose();
    this.totalCounts.dispose();
  }

  /** Begins the polling loop that keeps the running total current. */
  private startPolling(): void {
    if (this.pollTimerId !== null) {
      return;
    }
    this.pollTimerId = setInterval(() => {
      // poll() reports failures through connectionStateProperty rather than
      // rejecting; this catch only guards against a teardown race becoming an
      // unhandled rejection.
      this.poll().catch(() => undefined);
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimerId !== null) {
      clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
    this.isPolling = false;
  }

  /** Reads one sample and folds it into the running total. */
  private async poll(): Promise<void> {
    // A slow read must not queue up behind itself; skipping a tick is harmless
    // because CUMULATIVE differencing spans whatever gap it leaves.
    if (this.isPolling || !this.device.isConnected) {
      return;
    }
    this.isPolling = true;

    try {
      const sample = await this.device.readSample();
      this.consecutiveFailures = 0;
      this.tubeVoltageProperty.value = sample.tubeVoltage;
      this.accumulate(sample.countRegister);
      this.countRegisterProperty.value = sample.countRegister;
    } catch (error) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= MAXIMUM_CONSECUTIVE_FAILURES) {
        this.stopPolling();
        this.isAvailableProperty.value = false;
        this.connectionStateProperty.value = ConnectionState.ERROR;
        this.errorMessageProperty.value = error instanceof Error ? error.message : String(error);
      }
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Folds one raw register reading into the running total.
   *
   * Every reading is added, including one equal to its predecessor: at a poll
   * interval short against the count rate the register holds small integers, so
   * repeats are common and skipping them would systematically undercount.
   */
  private accumulate(register: number): void {
    // The first read returns whatever the device banked before the sim
    // connected, which is not ours to report; it only flushes the accumulator.
    if (!this.hasFlushedBacklog) {
      this.hasFlushedBacklog = true;
      return;
    }
    this.totalCounts.value += register;
  }

  /** The device dropped the link on its own — flat battery, out of range, off. */
  private handleUnexpectedDisconnect(): void {
    this.stopPolling();
    this.isAvailableProperty.value = false;
    this.deviceInfoProperty.value = null;
    this.connectionStateProperty.value = ConnectionState.ERROR;
    this.errorMessageProperty.value = "The Geiger counter disconnected";
  }
}
