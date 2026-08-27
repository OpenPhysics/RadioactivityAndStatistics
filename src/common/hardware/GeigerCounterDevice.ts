/**
 * GeigerCounterDevice.ts
 *
 * Web Bluetooth transport for the PASCO Wireless Geiger Counter (PS-3238).
 *
 * This is the only file in the sim that touches `navigator.bluetooth`. It owns
 * the GATT connection and exposes three things to the model layer: connect,
 * readSample, and disconnect. Wire-format concerns live in PascoProtocol.ts.
 *
 * ── Connection sequence ───────────────────────────────────────────────────────
 * 1. `requestDevice` with a `namePrefix` filter — this MUST be called from a
 *    user gesture, so `connect()` is only ever invoked from a button listener.
 * 2. Connect to the GATT server and grab the sensor service (channel 0 → service 1).
 * 3. Subscribe to the notify characteristic; responses arrive there.
 * 4. Poll with a one-shot read command and match the response by opcode.
 *
 * ── Why polling ───────────────────────────────────────────────────────────────
 * PASCO devices can stream periodically, but the command that sets the sample
 * period is not published in any of PASCO's open code, and the Geiger counter's
 * datasheet default is a 30 s window — far too coarse for counting statistics.
 * Polling with GCMD_READ_ONE_SAMPLE puts the timebase in the sim, where it can
 * be tied to the user's chosen counting interval.
 */

import {
  CHARACTERISTIC,
  COMMAND,
  DEVICE_SERVICE_ID,
  decodeGeigerNotification,
  GEIGER_ADVERTISED_NAME,
  GEIGER_SAMPLE_BYTES,
  GEIGER_SERVICE_ID,
  type GeigerSample,
  isGeigerCounterName,
  OPTIONAL_SERVICE_UUIDS,
  parseAdvertisedName,
  pascoUuid,
  readOneSampleCommand,
  toCommandBuffer,
} from "./PascoProtocol.js";

/** How long to wait for a device's response to a one-shot read, in ms. */
const READ_TIMEOUT_MS = 2000;

/** Raised when the user cancels the browser's device picker. */
export class DeviceSelectionCancelled extends Error {
  public constructor() {
    super("Device selection was cancelled");
    this.name = "DeviceSelectionCancelled";
  }
}

/** Raised when a connected device does not answer a read in time. */
export class DeviceReadTimeout extends Error {
  public constructor() {
    super("Timed out waiting for a sample from the Geiger counter");
    this.name = "DeviceReadTimeout";
  }
}

/** Identifying details of a connected counter, for display in the UI. */
export type GeigerDeviceInfo = {
  /** Full advertised name, e.g. "Geiger Counter 123-456Xe". */
  readonly advertisedName: string;
  /** Six-digit serial printed on the case, or null when the name omits it. */
  readonly serialId: string | null;
};

export class GeigerCounterDevice {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private commandCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  /** Resolver for the read currently in flight, if any. */
  private pendingRead: ((sample: GeigerSample) => void) | null = null;

  /** Invoked when the device drops the connection on its own. */
  private readonly onUnexpectedDisconnect: () => void;

  /** Bound so it can be added and removed as an event listener. */
  private readonly handleDisconnect: () => void;

  /** Bound so it can be added and removed as an event listener. */
  private readonly handleNotification: (event: Event) => void;

  public constructor(onUnexpectedDisconnect: () => void = () => undefined) {
    this.onUnexpectedDisconnect = onUnexpectedDisconnect;
    this.handleDisconnect = () => {
      this.clearConnectionState();
      this.onUnexpectedDisconnect();
    };
    this.handleNotification = (event: Event) => {
      const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
      const value = characteristic.value;
      if (!value) {
        return;
      }
      const sample = decodeGeigerNotification(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      if (sample && this.pendingRead) {
        const resolve = this.pendingRead;
        this.pendingRead = null;
        resolve(sample);
      }
    };
  }

  /** Whether a GATT connection is currently established. */
  public get isConnected(): boolean {
    return this.server?.connected === true;
  }

  /** Identifying details of the connected device, or null when disconnected. */
  public get info(): GeigerDeviceInfo | null {
    const advertisedName = this.device?.name;
    if (!advertisedName) {
      return null;
    }
    return { advertisedName, serialId: parseAdvertisedName(advertisedName).serialId };
  }

  /**
   * Shows the browser's device picker and connects to the chosen counter.
   *
   * Must be called from a user gesture. Throws {@link DeviceSelectionCancelled}
   * when the user dismisses the picker, and passes through any GATT error.
   */
  public async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth is not available in this browser");
    }

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: GEIGER_ADVERTISED_NAME }],
        optionalServices: [...OPTIONAL_SERVICE_UUIDS],
      });
    } catch (error) {
      // The picker rejects with NotFoundError both when the user cancels and
      // when nothing matched; either way there is no device to connect to.
      if (error instanceof Error && error.name === "NotFoundError") {
        throw new DeviceSelectionCancelled();
      }
      throw error;
    }

    // A non-Geiger device can only arrive here if a user picked something whose
    // name merely starts the same way; refuse rather than misread its registers.
    if (device.name && !isGeigerCounterName(device.name)) {
      throw new Error(`"${device.name}" is not a PASCO Wireless Geiger Counter`);
    }

    this.device = device;
    device.addEventListener("gattserverdisconnected", this.handleDisconnect);

    const server = await device.gatt?.connect();
    if (!server) {
      throw new Error("Could not reach the device's GATT server");
    }
    this.server = server;

    const service = await server.getPrimaryService(pascoUuid(GEIGER_SERVICE_ID, CHARACTERISTIC.SERVICE));
    this.commandCharacteristic = await service.getCharacteristic(
      pascoUuid(GEIGER_SERVICE_ID, CHARACTERISTIC.SEND_COMMAND),
    );
    this.notifyCharacteristic = await service.getCharacteristic(pascoUuid(GEIGER_SERVICE_ID, CHARACTERISTIC.RECEIVE));

    this.notifyCharacteristic.addEventListener("characteristicvaluechanged", this.handleNotification);
    await this.notifyCharacteristic.startNotifications();

    // A no-op write on the device service tells the sensor a host is present;
    // the Python library sends the same byte as its keepalive.
    await this.sendKeepalive(server);
  }

  /**
   * Requests one immediate sample and resolves with the decoded registers.
   *
   * Rejects with {@link DeviceReadTimeout} if the device does not answer, which
   * keeps a stalled device from silently freezing acquisition.
   */
  public async readSample(): Promise<GeigerSample> {
    const command = this.commandCharacteristic;
    if (!(command && this.isConnected)) {
      throw new Error("Geiger counter is not connected");
    }

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

    await command.writeValueWithoutResponse(readOneSampleCommand(GEIGER_SAMPLE_BYTES));
    return sample;
  }

  /** Closes the connection and forgets all GATT handles. */
  public async disconnect(): Promise<void> {
    const device = this.device;
    const notify = this.notifyCharacteristic;

    // Drop the listener first so tearing down does not look like a device-side drop.
    device?.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    notify?.removeEventListener("characteristicvaluechanged", this.handleNotification);

    if (notify && this.isConnected) {
      try {
        await notify.stopNotifications();
      } catch {
        // The device may already be gone; nothing useful to do about it.
      }
    }
    if (this.server?.connected) {
      this.server.disconnect();
    }

    this.clearConnectionState();
    this.device = null;
  }

  /** Sends the device-service keepalive byte. */
  private async sendKeepalive(server: BluetoothRemoteGATTServer): Promise<void> {
    const deviceService = await server.getPrimaryService(pascoUuid(DEVICE_SERVICE_ID, CHARACTERISTIC.SERVICE));
    const deviceCommand = await deviceService.getCharacteristic(
      pascoUuid(DEVICE_SERVICE_ID, CHARACTERISTIC.SEND_COMMAND),
    );
    await deviceCommand.writeValueWithoutResponse(toCommandBuffer([COMMAND.KEEPALIVE]));
  }

  /** Drops GATT handles and fails any read still in flight. */
  private clearConnectionState(): void {
    this.server = null;
    this.commandCharacteristic = null;
    this.notifyCharacteristic = null;
    this.pendingRead = null;
  }
}
