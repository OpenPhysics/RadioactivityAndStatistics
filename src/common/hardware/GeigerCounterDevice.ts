/**
 * GeigerCounterDevice.ts
 *
 * A PASCO Wireless Geiger Counter (PS-3238), independent of the wire it is
 * reached over.
 *
 * Everything the model layer needs — connect, readSample, setBeeperEnabled,
 * setTubeVoltage, disconnect — lives here, expressed in terms of PASCO packets.
 * A {@link TGeigerTransport} moves those packets over Bluetooth or USB, and this
 * class does not care which: response matching, the read timeout, and the
 * decode are wire-independent and therefore written once.
 *
 * ── Why polling ───────────────────────────────────────────────────────────────
 * PASCO devices can stream periodically, but the command that sets the sample
 * period is not published in any of PASCO's open code, and the Geiger counter's
 * datasheet default is a 30 s window — far too coarse for counting statistics.
 * Polling with GCMD_READ_ONE_SAMPLE puts the timebase in the sim, where it can
 * be tied to the user's chosen counting interval.
 */

import { BluetoothGeigerTransport } from "./BluetoothGeigerTransport.js";
import {
  DeviceReadTimeout,
  type GeigerDeviceInfo,
  type TGeigerTransport,
  TransportKind,
  type TransportKindValue,
} from "./GeigerTransport.js";
import {
  COMMAND,
  decodeGeigerNotification,
  enableBeeperCommand,
  GEIGER_SAMPLE_BYTES,
  type GeigerSample,
  readOneSampleCommand,
  setTubeVoltageCommand,
  toCommandBuffer,
} from "./PascoProtocol.js";
import { UsbGeigerTransport } from "./UsbGeigerTransport.js";

/** How long to wait for a device's response to a one-shot read, in ms. */
const READ_TIMEOUT_MS = 2000;

export class GeigerCounterDevice {
  /** The open link, or null when disconnected. */
  private transport: TGeigerTransport | null = null;

  /** Resolver for the read currently in flight, if any. */
  private pendingRead: ((sample: GeigerSample) => void) | null = null;

  /** Invoked when the device drops the connection on its own. */
  private readonly onUnexpectedDisconnect: () => void;

  public constructor(onUnexpectedDisconnect: () => void = () => undefined) {
    this.onUnexpectedDisconnect = onUnexpectedDisconnect;
  }

  /** Whether a link is currently open. */
  public get isConnected(): boolean {
    return this.transport?.isConnected === true;
  }

  /** Identifying details of the connected device, or null when disconnected. */
  public get info(): GeigerDeviceInfo | null {
    return this.transport?.info ?? null;
  }

  /** Which wire the open link uses, or null when disconnected. */
  public get transportKind(): TransportKindValue | null {
    return this.transport?.kind ?? null;
  }

  /**
   * Shows the browser's device picker for the requested wire and connects.
   *
   * Must be called from a user gesture: every picker API refuses to open
   * otherwise, and a gesture does not survive an `await`. This method runs
   * synchronously up to the transport's picker call.
   */
  public async connect(kind: TransportKindValue = TransportKind.BLUETOOTH): Promise<void> {
    await this.disconnect();

    const callbacks = {
      onPacket: (packet: Uint8Array) => this.handlePacket(packet),
      onUnexpectedDisconnect: () => {
        this.transport = null;
        this.pendingRead = null;
        this.onUnexpectedDisconnect();
      },
    };
    const transport: TGeigerTransport =
      kind === TransportKind.USB ? new UsbGeigerTransport(callbacks) : new BluetoothGeigerTransport(callbacks);

    // Assigned before connecting so a transport that fails part-way through is
    // still torn down by the caller's disconnect().
    this.transport = transport;
    await transport.connect();

    // A no-op write on the device channel tells the sensor a host is present;
    // the Python library sends the same byte as its keepalive.
    await transport.sendDeviceCommand(toCommandBuffer([COMMAND.KEEPALIVE]));
  }

  /**
   * Requests one immediate sample and resolves with the decoded registers.
   *
   * Rejects with {@link DeviceReadTimeout} if the device does not answer, which
   * keeps a stalled device from silently freezing acquisition.
   */
  public async readSample(): Promise<GeigerSample> {
    const transport = this.requireTransport();

    const sample = new Promise<GeigerSample>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRead = null;
        reject(new DeviceReadTimeout());
      }, READ_TIMEOUT_MS);

      this.pendingRead = (value: GeigerSample) => {
        clearTimeout(timeoutId);
        resolve(value);
      };
    });

    await transport.sendSensorCommand(readOneSampleCommand(GEIGER_SAMPLE_BYTES));
    return sample;
  }

  /**
   * Enables or silences the audible count beep on the device.
   *
   * Capstone/SPARKvue call the same control; the power-button half-press still
   * toggles beep locally and can override this until the next write.
   */
  public async setBeeperEnabled(enabled: boolean): Promise<void> {
    await this.requireTransport().sendSensorCommand(enableBeeperCommand(enabled));
  }

  /**
   * Sets the G-M tube bias in volts.
   *
   * Manual mode (what this sim uses) sends the same value for the initial and
   * final voltages in the wire payload.
   */
  public async setTubeVoltage(volts: number): Promise<void> {
    await this.requireTransport().sendSensorCommand(setTubeVoltageCommand(volts));
  }

  /** Closes the link and forgets the transport. */
  public async disconnect(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    this.pendingRead = null;
    await transport?.disconnect();
  }

  /** Matches an inbound packet against the read in flight, if any. */
  private handlePacket(packet: Uint8Array): void {
    const sample = decodeGeigerNotification(packet);
    if (sample && this.pendingRead) {
      const resolve = this.pendingRead;
      this.pendingRead = null;
      resolve(sample);
    }
  }

  private requireTransport(): TGeigerTransport {
    const transport = this.transport;
    if (!transport?.isConnected) {
      throw new Error("Geiger counter is not connected");
    }
    return transport;
  }
}
