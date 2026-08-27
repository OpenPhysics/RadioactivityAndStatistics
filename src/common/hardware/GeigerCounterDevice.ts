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
 * 3. Subscribe to the DEVICE service's notify characteristic. Commands go to the
 *    sensor service, but the device answers on the device-level channel — this
 *    is asymmetric, and reading the sensor service's notify characteristic
 *    instead yields silence.
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

/**
 * TEMPORARY diagnostic tracing, enabled with `?debugBluetooth=true`.
 *
 * Dumps every byte in both directions plus the discovered GATT layout, so the
 * PS-3238's actual behaviour can be read off the console. Remove once the
 * CountRate register question in GeigerCountSource is settled.
 */
const DEBUG_BLUETOOTH =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugBluetooth") === "true";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

let lastTraceTime = 0;

function trace(label: string, detail: unknown = ""): void {
  if (DEBUG_BLUETOOTH) {
    const now = performance.now();
    const sinceLast = lastTraceTime === 0 ? 0 : Math.round(now - lastTraceTime);
    lastTraceTime = now;
    // biome-ignore lint/style/noParameterAssign: temporary bring-up tracing
    label = `+${String(sinceLast).padStart(4)}ms ${label}`;
    // biome-ignore lint/suspicious/noConsole: temporary hardware bring-up tracing
    console.log(`[ble] ${label}`, detail);
  }
}

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
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const sample = decodeGeigerNotification(bytes);
      trace(
        `notify sensor <- ${bytes.length}B: ${toHex(bytes)}`,
        sample ? { decoded: sample, pendingRead: this.pendingRead !== null } : "(not a one-shot sample response)",
      );
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
    // Responses come home on the DEVICE service, not the sensor service that
    // the command was written to — confirmed against a PS-3238: a one-shot read
    // written to 4a5c0001-0002 is answered on 4a5c0000-0003.
    const deviceService = await server.getPrimaryService(pascoUuid(DEVICE_SERVICE_ID, CHARACTERISTIC.SERVICE));
    this.notifyCharacteristic = await deviceService.getCharacteristic(
      pascoUuid(DEVICE_SERVICE_ID, CHARACTERISTIC.RECEIVE),
    );

    this.notifyCharacteristic.addEventListener("characteristicvaluechanged", this.handleNotification);
    await this.notifyCharacteristic.startNotifications();

    // A no-op write on the device service tells the sensor a host is present;
    // the Python library sends the same byte as its keepalive.
    await this.sendKeepalive(server);

    if (DEBUG_BLUETOOTH) {
      await this.traceGattLayout(server);
    }
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

    const commandBytes = readOneSampleCommand(GEIGER_SAMPLE_BYTES);
    trace(`write sensor -> ${toHex(new Uint8Array(commandBytes))}`);
    try {
      await command.writeValueWithoutResponse(commandBytes);
    } catch (error) {
      trace("write sensor FAILED", error);
      throw error;
    }
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

  /**
   * TEMPORARY: logs every service/characteristic Web Bluetooth will expose, and
   * taps the device service's notify characteristic so unsolicited packets —
   * battery, status, streamed samples — show up too.
   */
  private async traceGattLayout(server: BluetoothRemoteGATTServer): Promise<void> {
    for (const serviceUuid of OPTIONAL_SERVICE_UUIDS) {
      let service: BluetoothRemoteGATTService;
      try {
        service = await server.getPrimaryService(serviceUuid);
      } catch {
        trace(`service ${serviceUuid} absent`);
        continue;
      }
      const characteristics = await service.getCharacteristics();
      trace(
        `service ${serviceUuid}`,
        characteristics.map((characteristic) => ({
          uuid: characteristic.uuid,
          read: characteristic.properties.read,
          write: characteristic.properties.write,
          writeNoResponse: characteristic.properties.writeWithoutResponse,
          notify: characteristic.properties.notify,
          indicate: characteristic.properties.indicate,
        })),
      );

      // Tap anything that can notify, apart from the sensor characteristic the
      // real read path already listens on.
      for (const characteristic of characteristics) {
        if (!characteristic.properties.notify || characteristic.uuid === this.notifyCharacteristic?.uuid) {
          continue;
        }
        characteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
          const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
          if (value) {
            const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            trace(`notify ${characteristic.uuid} <- ${bytes.length}B: ${toHex(bytes)}`);
          }
        });
        try {
          await characteristic.startNotifications();
        } catch (error) {
          trace(`startNotifications failed on ${characteristic.uuid}`, error);
        }
      }
    }
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
