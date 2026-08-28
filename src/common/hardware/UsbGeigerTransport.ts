/**
 * UsbGeigerTransport.ts
 *
 * WebUSB transport for a PASCO Wireless Geiger Counter (PS-3238) plugged into
 * the host over USB.
 *
 * This is the only file in the sim that touches `navigator.usb`. Like the
 * Bluetooth transport it moves opaque PASCO packets and nothing more; the
 * protocol above it is identical, which is the whole point of
 * {@link TGeigerTransport}.
 *
 * ── What the counter's USB port actually is ───────────────────────────────────
 * Measured against a PS-3238 on 2026-08-28, and every claim here is from that
 * capture rather than from documentation — PASCO publish none, and neither open
 * PASCO library touches USB at all.
 *
 *   manufacturer  "Pasco"          vendor  0x0945 (USB-IF registry)
 *   product       "Pasco USB Bridge"  product 0x0002, no serial number
 *   interface 0   class 0xff, subclass 0xff (vendor-specific)
 *   endpoints     bulk IN and bulk OUT, 64-byte packets
 *
 * It is NOT a HID device: a WebHID picker filtered to vendor 0x0945 comes up
 * empty. Web Serial does not see it either. WebUSB can claim it precisely
 * because the interface is vendor-specific — no OS driver owns it, so the usual
 * "WebUSB cannot claim what Windows already claimed" objection does not apply.
 * `device.open()`, `selectConfiguration`, and `claimInterface(0)` all succeed.
 *
 * ── Why this is gated behind ?usbTransport=true ───────────────────────────────
 * The bridge answers, but it does not yet *talk*. Every packet written to bulk
 * OUT comes back on bulk IN byte-identical, about 1 ms later, whatever it
 * contains — a 1-byte 0x00, a valid GCMD_READ_ONE_SAMPLE, a 64-byte padded
 * frame, deliberate nonsense. An unconditional echo of arbitrary input is not a
 * parser rejecting bad framing; it is the data path sitting in loopback. The
 * counter meanwhile counts and beeps normally and sends nothing unsolicited.
 *
 * What has been ruled out: every framing variant tried (raw, length-prefixed,
 * channel-prefixed, zero-padded to the endpoint packet size); all 64 vendor
 * control IN requests 0x00-0x1f on both device and interface recipients, which
 * stall without exception; and the descriptors, which name the device and
 * nothing else, with no BOS descriptor and so no WebUSB landing page.
 *
 * So the code below is the transport as far as it can be verified: it reaches
 * the device, claims it, and moves bytes. The step that opens the data path is
 * still unknown, which is why the button is off by default.
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

/** Bulk packet size the bridge's endpoints declare. */
const BULK_PACKET_BYTES = 64;

export class UsbGeigerTransport implements TGeigerTransport {
  public readonly kind: TransportKindValue = TransportKind.USB;

  private device: USBDevice | null = null;

  /** Interface and endpoint numbers, read off the descriptor at connect time. */
  private interfaceNumber = 0;
  private inEndpoint = 0;
  private outEndpoint = 0;

  /** False once the read loop should wind down. */
  private isReading = false;

  private readonly callbacks: GeigerTransportCallbacks;

  /** Bound so it can be added and removed as an event listener. */
  private readonly handleDisconnect: (event: USBConnectionEvent) => void;

  public constructor(callbacks: GeigerTransportCallbacks) {
    this.callbacks = callbacks;

    // WebUSB reports an unplug on the navigator, not on the device object.
    this.handleDisconnect = (event: USBConnectionEvent) => {
      if (event.device === this.device) {
        this.isReading = false;
        this.device = null;
        this.callbacks.onUnexpectedDisconnect();
      }
    };
  }

  public get isConnected(): boolean {
    return this.device?.opened === true;
  }

  public get info(): GeigerDeviceInfo | null {
    const device = this.device;
    if (!device) {
      return null;
    }
    // The bridge reports its own product string ("Pasco USB Bridge"), not the
    // counter's advertised name, so there is no serial to parse out of it.
    const name = device.productName ?? "Pasco USB Bridge";
    return {
      advertisedName: name,
      serialId: device.serialNumber ?? parseAdvertisedName(name).serialId,
      transport: TransportKind.USB,
    };
  }

  /**
   * Shows the browser's USB picker and claims the counter's bridge interface.
   *
   * Must be called from a user gesture. Throws {@link DeviceSelectionCancelled}
   * when the user dismisses the picker without choosing.
   */
  public async connect(): Promise<void> {
    if (!navigator.usb) {
      throw new Error("WebUSB is not available in this browser");
    }

    let device: USBDevice;
    try {
      device = await navigator.usb.requestDevice({ filters: [{ vendorId: PASCO_USB_VENDOR_ID }] });
    } catch (error) {
      // The picker rejects with NotFoundError both when the user cancels and
      // when nothing matched; either way there is no device to connect to.
      if (error instanceof Error && error.name === "NotFoundError") {
        throw new DeviceSelectionCancelled();
      }
      throw error;
    }

    // A different PASCO sensor would decode into nonsense registers. The check
    // is looser than the Bluetooth one on purpose: a USB product string need
    // not carry the interface-id suffix, so only a name that names another
    // device is refused.
    if (device.productName && isOtherPascoDeviceName(device.productName)) {
      throw new Error(`"${device.productName}" is not a PASCO Wireless Geiger Counter`);
    }

    this.device = device;
    navigator.usb.addEventListener("disconnect", this.handleDisconnect);

    await device.open();
    const firstConfiguration = device.configurations[0];
    if (device.configuration === null && firstConfiguration) {
      await device.selectConfiguration(firstConfiguration.configurationValue);
    }
    this.adoptEndpoints(device);
    await device.claimInterface(this.interfaceNumber);

    trace("usb", `claimed interface ${this.interfaceNumber}`, {
      productName: device.productName,
      inEndpoint: this.inEndpoint,
      outEndpoint: this.outEndpoint,
    });

    this.isReading = true;
    // Deliberately not awaited: the loop runs for the life of the connection.
    this.readLoop();
  }

  /** Sends a command addressed to the counting sensor's channel. */
  public async sendSensorCommand(command: ArrayBuffer): Promise<void> {
    await this.send(command);
  }

  /**
   * Sends a command addressed to the device-level channel.
   *
   * USB is point-to-point to a single counter, so the device/sensor split that
   * BLE expresses as two GATT services has no analogue here: both go out on the
   * one bulk endpoint.
   */
  public async sendDeviceCommand(command: ArrayBuffer): Promise<void> {
    await this.send(command);
  }

  /** Releases the interface and closes the device. */
  public async disconnect(): Promise<void> {
    const device = this.device;
    this.isReading = false;
    this.device = null;

    // Drop the listener first so closing does not look like an unplug.
    navigator.usb?.removeEventListener("disconnect", this.handleDisconnect);

    if (device?.opened) {
      try {
        await device.releaseInterface(this.interfaceNumber);
      } catch {
        // The device may already be gone; nothing useful to do about it.
      }
      try {
        await device.close();
      } catch {
        // Likewise.
      }
    }
  }

  /** Reads the interface and bulk endpoint numbers off the device descriptor. */
  private adoptEndpoints(device: USBDevice): void {
    const configuration = device.configuration;
    const usbInterface = configuration?.interfaces[0];
    const alternate = usbInterface?.alternates[0];
    if (!(usbInterface && alternate)) {
      throw new Error("The PASCO USB bridge exposes no usable interface");
    }

    this.interfaceNumber = usbInterface.interfaceNumber;
    const bulkIn = alternate.endpoints.find((endpoint) => endpoint.direction === "in" && endpoint.type === "bulk");
    const bulkOut = alternate.endpoints.find((endpoint) => endpoint.direction === "out" && endpoint.type === "bulk");
    if (!(bulkIn && bulkOut)) {
      throw new Error("The PASCO USB bridge exposes no bulk endpoint pair");
    }
    this.inEndpoint = bulkIn.endpointNumber;
    this.outEndpoint = bulkOut.endpointNumber;
  }

  /** Writes one PASCO command to the bulk OUT endpoint. */
  private async send(command: ArrayBuffer): Promise<void> {
    const device = this.device;
    if (!(device && this.isConnected)) {
      throw new Error("Geiger counter is not connected");
    }
    const bytes = new Uint8Array(command);
    trace("usb", `write -> ${toHex(bytes)}`);
    try {
      await device.transferOut(this.outEndpoint, bytes);
    } catch (error) {
      trace("usb", "transferOut FAILED", error);
      throw error;
    }
  }

  /**
   * Reads bulk IN for the life of the connection, handing packets upward.
   *
   * A transfer that fails ends the loop rather than spinning: the device is
   * gone, or the interface was released underneath it.
   */
  private async readLoop(): Promise<void> {
    while (this.isReading && this.device) {
      let result: USBInTransferResult;
      try {
        result = await this.device.transferIn(this.inEndpoint, BULK_PACKET_BYTES);
      } catch (error) {
        trace("usb", "transferIn FAILED", error);
        return;
      }
      const data = result.data;
      if (data && data.byteLength > 0) {
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        trace("usb", `read <- ${bytes.length}B: ${toHex(bytes)}`);
        this.callbacks.onPacket(bytes);
      }
    }
  }
}
