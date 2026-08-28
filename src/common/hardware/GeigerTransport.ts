/**
 * GeigerTransport.ts
 *
 * The contract every link to a PASCO Wireless Geiger Counter satisfies, and the
 * errors that link can raise.
 *
 * The counter speaks one protocol (PascoProtocol.ts) over two different wires:
 * Bluetooth Low Energy, and USB when the counter is plugged into the host. A
 * transport's whole job is to move opaque PASCO packets in both directions; it
 * knows nothing about samples, registers, or beepers. Everything above the wire
 * — command framing, response matching, timeouts — lives once in
 * GeigerCounterDevice.ts, so adding a wire never duplicates protocol logic.
 *
 * ── Two channels, not one ─────────────────────────────────────────────────────
 * PASCO addresses a device on two logical channels: a device-level one and one
 * per sensor. Over BLE those are separate GATT services, so the distinction has
 * to survive down to the wire; a transport that does not need it (USB, which is
 * point-to-point to a single counter) simply treats both the same. Hence a pair
 * of send methods rather than a single "write bytes".
 */

/** Which wire a counter is reached over. */
export const TransportKind = {
  /** Web Bluetooth (GATT). Chromium browsers, secure context, wireless. */
  BLUETOOTH: "bluetooth",
  /** USB cable. */
  USB: "usb",
} as const;

export type TransportKindValue = (typeof TransportKind)[keyof typeof TransportKind];

/** Identifying details of a connected counter, for display in the UI. */
export type GeigerDeviceInfo = {
  /** Full device name, e.g. "Geiger Counter 123-456Xe". */
  readonly advertisedName: string;
  /** Six-digit serial printed on the case, or null when the name omits it. */
  readonly serialId: string | null;
  /** The wire this counter is reached over. */
  readonly transport: TransportKindValue;
};

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

/** Callbacks a transport reports upward, supplied at construction. */
export type GeigerTransportCallbacks = {
  /**
   * One inbound PASCO packet, stripped of any wire-specific framing — the same
   * bytes on either transport, starting at the response opcode.
   */
  readonly onPacket: (packet: Uint8Array) => void;
  /** The device dropped the link on its own: flat battery, unplugged, off. */
  readonly onUnexpectedDisconnect: () => void;
};

/** A link to one Geiger counter. */
export interface TGeigerTransport {
  /** Which wire this is. */
  readonly kind: TransportKindValue;

  /** Whether the link is currently open. */
  readonly isConnected: boolean;

  /** Identifying details of the connected counter, or null when disconnected. */
  readonly info: GeigerDeviceInfo | null;

  /**
   * Shows the browser's device picker and opens the link.
   *
   * Every picker API — Web Bluetooth, WebHID, Web Serial — requires a live user
   * gesture, and a gesture does not survive an `await`. Implementations must
   * therefore run synchronously up to their picker call, and callers must invoke
   * this directly from an event listener.
   *
   * Throws {@link DeviceSelectionCancelled} when the user dismisses the picker.
   */
  connect(): Promise<void>;

  /** Closes the link and forgets every handle. */
  disconnect(): Promise<void>;

  /** Sends a command to the counting sensor's channel. */
  sendSensorCommand(command: ArrayBuffer): Promise<void>;

  /** Sends a command to the device-level channel. */
  sendDeviceCommand(command: ArrayBuffer): Promise<void>;
}
