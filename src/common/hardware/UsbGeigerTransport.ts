/**
 * UsbGeigerTransport.ts
 *
 * WebHID transport for a PASCO Wireless Geiger Counter (PS-3238) plugged into
 * the host over USB.
 *
 * This is the only file in the sim that touches `navigator.hid`. Like the
 * Bluetooth transport it moves opaque PASCO packets and nothing more; the
 * protocol above it is identical, which is the whole point of
 * {@link TGeigerTransport}.
 *
 * ── Why HID rather than WebUSB or Web Serial ──────────────────────────────────
 * PASCO's USB devices enumerate as HID, so the host OS claims them with its own
 * driver. WebUSB cannot claim an interface the OS driver already owns, which
 * rules it out on Windows and macOS; Web Serial only sees CDC-ACM ports, which
 * this device does not expose. WebHID is the one API that reaches it, and it
 * needs no driver installation — the same reason SPARKvue's browser build can
 * talk to wired sensors.
 *
 * ── The user gesture ──────────────────────────────────────────────────────────
 * `navigator.hid.requestDevice` has the same rule as `requestDevice` on
 * Bluetooth: it only opens its picker during a live user gesture, and a gesture
 * does not survive an `await`. `connect()` therefore runs synchronously up to
 * that call.
 */

import {
  DeviceSelectionCancelled,
  type GeigerDeviceInfo,
  type GeigerTransportCallbacks,
  type TGeigerTransport,
  TransportKind,
  type TransportKindValue,
} from "./GeigerTransport.js";
import { isOtherPascoDeviceName, PASCO_USB_VENDOR_ID, parseAdvertisedName } from "./PascoProtocol.js";
import { toHex, trace } from "./transportTrace.js";

export class UsbGeigerTransport implements TGeigerTransport {
  public readonly kind: TransportKindValue = TransportKind.USB;

  private device: HIDDevice | null = null;

  /** Report id the device expects on output, and how many bytes it wants. */
  private outputReportId = 0;
  private outputReportBytes = 0;

  private readonly callbacks: GeigerTransportCallbacks;

  /** Bound so it can be added and removed as an event listener. */
  private readonly handleInputReport: (event: HIDInputReportEvent) => void;

  /** Bound so it can be added and removed as an event listener. */
  private readonly handleDisconnect: (event: HIDConnectionEvent) => void;

  public constructor(callbacks: GeigerTransportCallbacks) {
    this.callbacks = callbacks;

    this.handleInputReport = (event: HIDInputReportEvent) => {
      const data = event.data;
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      trace("usb", `report ${event.reportId} <- ${bytes.length}B: ${toHex(bytes)}`);
      this.callbacks.onPacket(bytes);
    };

    // WebHID reports an unplug on the navigator, not on the device object.
    this.handleDisconnect = (event: HIDConnectionEvent) => {
      if (event.device === this.device) {
        this.device = null;
        this.callbacks.onUnexpectedDisconnect();
      }
    };
  }

  /** Whether the HID device is currently open. */
  public get isConnected(): boolean {
    return this.device?.opened === true;
  }

  public get info(): GeigerDeviceInfo | null {
    const productName = this.device?.productName;
    if (!productName) {
      return null;
    }
    return {
      advertisedName: productName,
      serialId: parseAdvertisedName(productName).serialId,
      transport: TransportKind.USB,
    };
  }

  /**
   * Shows the browser's HID picker and opens the chosen counter.
   *
   * Must be called from a user gesture. Throws {@link DeviceSelectionCancelled}
   * when the user dismisses the picker without choosing.
   */
  public async connect(): Promise<void> {
    if (!navigator.hid) {
      throw new Error("WebHID is not available in this browser");
    }

    // Filtering by PASCO's USB vendor id keeps the picker to their hardware;
    // the browser shows nothing else, so a user cannot pick a stray keyboard.
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: PASCO_USB_VENDOR_ID }],
    });

    const device = devices[0];
    if (!device) {
      throw new DeviceSelectionCancelled();
    }

    // A different PASCO sensor would decode into nonsense registers. The check
    // is looser than the Bluetooth one on purpose: a USB product string need
    // not carry the interface-id suffix, so only a name that names another
    // device is refused.
    if (device.productName && isOtherPascoDeviceName(device.productName)) {
      throw new Error(`"${device.productName}" is not a PASCO Wireless Geiger Counter`);
    }

    this.device = device;
    device.addEventListener("inputreport", this.handleInputReport);
    navigator.hid.addEventListener("disconnect", this.handleDisconnect);

    if (!device.opened) {
      await device.open();
    }
    this.adoptOutputReportLayout(device);

    trace("usb", `opened ${device.productName}`, {
      vendorId: device.vendorId,
      productId: device.productId,
      collections: device.collections.map((collection) => ({
        usagePage: collection.usagePage,
        usage: collection.usage,
        inputReports: collection.inputReports?.map((report) => report.reportId),
        outputReports: collection.outputReports?.map((report) => report.reportId),
      })),
    });
  }

  /**
   * Sends a command addressed to the counting sensor's channel.
   *
   * USB is point-to-point to a single counter, so the device/sensor split that
   * BLE expresses as two GATT services has no analogue here: both channels are
   * the one HID output report.
   */
  public async sendSensorCommand(command: ArrayBuffer): Promise<void> {
    await this.send(command);
  }

  /** Sends a command addressed to the device-level channel. See {@link sendSensorCommand}. */
  public async sendDeviceCommand(command: ArrayBuffer): Promise<void> {
    await this.send(command);
  }

  /** Closes the device and forgets it. */
  public async disconnect(): Promise<void> {
    const device = this.device;
    this.device = null;

    // Drop the listeners first so closing does not look like an unplug.
    device?.removeEventListener("inputreport", this.handleInputReport);
    navigator.hid?.removeEventListener("disconnect", this.handleDisconnect);

    if (device?.opened) {
      try {
        await device.close();
      } catch {
        // The device may already be gone; nothing useful to do about it.
      }
    }
  }

  /**
   * Writes one PASCO command as an HID output report.
   *
   * HID reports are fixed-length, so a short command is zero-padded out to the
   * length the report descriptor declares. A device that declares no output
   * report gets the command bytes unpadded.
   */
  private async send(command: ArrayBuffer): Promise<void> {
    const device = this.device;
    if (!(device && this.isConnected)) {
      throw new Error("Geiger counter is not connected");
    }

    const commandBytes = new Uint8Array(command);
    const report = new Uint8Array(Math.max(this.outputReportBytes, commandBytes.length));
    report.set(commandBytes);

    trace("usb", `report ${this.outputReportId} -> ${toHex(report)}`);
    try {
      await device.sendReport(this.outputReportId, report);
    } catch (error) {
      trace("usb", "sendReport FAILED", error);
      throw error;
    }
  }

  /**
   * Reads the output report's id and length off the HID report descriptor.
   *
   * A report id of 0 means the device uses unnumbered reports, which is what
   * `sendReport` expects to be told in that case.
   */
  private adoptOutputReportLayout(device: HIDDevice): void {
    const outputReports = device.collections.flatMap((collection) => collection.outputReports ?? []);
    const report = outputReports[0];
    this.outputReportId = report?.reportId ?? 0;
    this.outputReportBytes = (report?.items ?? []).reduce(
      (total, item) => total + ((item.reportSize ?? 0) * (item.reportCount ?? 0)) / 8,
      0,
    );
  }
}
