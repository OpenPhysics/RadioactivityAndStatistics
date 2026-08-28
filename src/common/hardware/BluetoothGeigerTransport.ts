/**
 * BluetoothGeigerTransport.ts
 *
 * Web Bluetooth transport for the PASCO Wireless Geiger Counter (PS-3238).
 *
 * This is the only file in the sim that touches `navigator.bluetooth`. It owns
 * the GATT connection and nothing else: packets go out through two command
 * characteristics and come back through one notify characteristic. Wire-format
 * concerns live in PascoProtocol.ts, and response matching in
 * GeigerCounterDevice.ts.
 *
 * ── Connection sequence ───────────────────────────────────────────────────────
 * 1. `requestDevice` with a `namePrefix` filter — this MUST be called from a
 *    user gesture, so `connect()` is only ever invoked from a button listener.
 * 2. Connect to the GATT server and grab the sensor service (channel 0 → service 1).
 * 3. Subscribe to the DEVICE service's notify characteristic. Commands go to the
 *    sensor service, but the device answers on the device-level channel — this
 *    is asymmetric, and reading the sensor service's notify characteristic
 *    instead yields silence.
 */

import {
  DeviceSelectionCancelled,
  type GeigerDeviceInfo,
  type GeigerTransportCallbacks,
  type TGeigerTransport,
  TransportKind,
  type TransportKindValue,
} from "./GeigerTransport.js";
import {
  CHARACTERISTIC,
  DEVICE_SERVICE_ID,
  GEIGER_ADVERTISED_NAME,
  GEIGER_SERVICE_ID,
  isGeigerCounterName,
  OPTIONAL_SERVICE_UUIDS,
  parseAdvertisedName,
  pascoUuid,
} from "./PascoProtocol.js";
import { TRANSPORT_TRACE_ENABLED, toHex, trace } from "./transportTrace.js";

export class BluetoothGeigerTransport implements TGeigerTransport {
  public readonly kind: TransportKindValue = TransportKind.BLUETOOTH;

  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private sensorCommandCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private deviceCommandCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private readonly callbacks: GeigerTransportCallbacks;

  /** Bound so it can be added and removed as an event listener. */
  private readonly handleDisconnect: () => void;

  /** Bound so it can be added and removed as an event listener. */
  private readonly handleNotification: (event: Event) => void;

  public constructor(callbacks: GeigerTransportCallbacks) {
    this.callbacks = callbacks;
    this.handleDisconnect = () => {
      this.clearConnectionState();
      this.callbacks.onUnexpectedDisconnect();
    };
    this.handleNotification = (event: Event) => {
      const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
      const value = characteristic.value;
      if (!value) {
        return;
      }
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      trace("ble", `notify <- ${bytes.length}B: ${toHex(bytes)}`);
      this.callbacks.onPacket(bytes);
    };
  }

  /** Whether a GATT connection is currently established. */
  public get isConnected(): boolean {
    return this.server?.connected === true;
  }

  public get info(): GeigerDeviceInfo | null {
    const advertisedName = this.device?.name;
    if (!advertisedName) {
      return null;
    }
    return {
      advertisedName,
      serialId: parseAdvertisedName(advertisedName).serialId,
      transport: TransportKind.BLUETOOTH,
    };
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
    this.sensorCommandCharacteristic = await service.getCharacteristic(
      pascoUuid(GEIGER_SERVICE_ID, CHARACTERISTIC.SEND_COMMAND),
    );

    // Responses come home on the DEVICE service, not the sensor service that
    // the command was written to — confirmed against a PS-3238: a one-shot read
    // written to 4a5c0001-0002 is answered on 4a5c0000-0003.
    const deviceService = await server.getPrimaryService(pascoUuid(DEVICE_SERVICE_ID, CHARACTERISTIC.SERVICE));
    this.deviceCommandCharacteristic = await deviceService.getCharacteristic(
      pascoUuid(DEVICE_SERVICE_ID, CHARACTERISTIC.SEND_COMMAND),
    );
    this.notifyCharacteristic = await deviceService.getCharacteristic(
      pascoUuid(DEVICE_SERVICE_ID, CHARACTERISTIC.RECEIVE),
    );

    this.notifyCharacteristic.addEventListener("characteristicvaluechanged", this.handleNotification);
    await this.notifyCharacteristic.startNotifications();

    if (TRANSPORT_TRACE_ENABLED) {
      await this.traceGattLayout(server);
    }
  }

  /** Writes a command to the sensor service's command characteristic. */
  public async sendSensorCommand(command: ArrayBuffer): Promise<void> {
    await this.write(this.sensorCommandCharacteristic, command, "sensor");
  }

  /** Writes a command to the device service's command characteristic. */
  public async sendDeviceCommand(command: ArrayBuffer): Promise<void> {
    await this.write(this.deviceCommandCharacteristic, command, "device");
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

  private async write(
    characteristic: BluetoothRemoteGATTCharacteristic | null,
    command: ArrayBuffer,
    channel: string,
  ): Promise<void> {
    if (!(characteristic && this.isConnected)) {
      throw new Error("Geiger counter is not connected");
    }
    trace("ble", `write ${channel} -> ${toHex(new Uint8Array(command))}`);
    try {
      await characteristic.writeValueWithoutResponse(command);
    } catch (error) {
      trace("ble", `write ${channel} FAILED`, error);
      throw error;
    }
  }

  /**
   * TEMPORARY: logs every service/characteristic Web Bluetooth will expose, and
   * taps every other notify characteristic so unsolicited packets — battery,
   * status, streamed samples — show up too.
   */
  private async traceGattLayout(server: BluetoothRemoteGATTServer): Promise<void> {
    for (const serviceUuid of OPTIONAL_SERVICE_UUIDS) {
      let service: BluetoothRemoteGATTService;
      try {
        service = await server.getPrimaryService(serviceUuid);
      } catch {
        trace("ble", `service ${serviceUuid} absent`);
        continue;
      }
      const characteristics = await service.getCharacteristics();
      trace(
        "ble",
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

      // Tap anything that can notify, apart from the characteristic the real
      // read path already listens on.
      for (const characteristic of characteristics) {
        if (!characteristic.properties.notify || characteristic.uuid === this.notifyCharacteristic?.uuid) {
          continue;
        }
        characteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
          const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
          if (value) {
            const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            trace("ble", `notify ${characteristic.uuid} <- ${bytes.length}B: ${toHex(bytes)}`);
          }
        });
        try {
          await characteristic.startNotifications();
        } catch (error) {
          trace("ble", `startNotifications failed on ${characteristic.uuid}`, error);
        }
      }
    }
  }

  /** Drops GATT handles. */
  private clearConnectionState(): void {
    this.server = null;
    this.sensorCommandCharacteristic = null;
    this.deviceCommandCharacteristic = null;
    this.notifyCharacteristic = null;
  }
}
