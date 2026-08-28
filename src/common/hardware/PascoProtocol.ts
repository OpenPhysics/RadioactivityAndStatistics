/**
 * PascoProtocol.ts
 *
 * Pure, dependency-free encoding/decoding for the PASCO wireless-sensor
 * protocol, scoped to what the Wireless Geiger Counter (PS-3238) needs. The
 * same packets travel over Bluetooth and over USB; only the GATT layout below
 * is Bluetooth-specific.
 *
 * Everything here is a pure function over bytes and strings so it can be unit
 * tested without a Bluetooth stack. The stateful wrappers live in
 * GeigerCounterDevice.ts and the transports beside it.
 *
 * ── Where this came from ──────────────────────────────────────────────────────
 * Ported from PASCO's own Python library, PASCOscientific/pasco_python
 * (`src/pasco/pasco_ble_device.py` for the transport, `src/pasco/datasheets.py`
 * for the device tables). Note that the Geiger counter is NOT supported by that
 * library — it appears in its `_not_compatible_devices` list — nor by the
 * `pasco-ble` npm package, whose datasheet covers interfaces 1025–1057 only.
 * The device tables below are transcribed from the datasheet XML entries for
 * interface 1064 and sensor 2079, which are present in `datasheets.py` even
 * though the Python transport refuses to talk to them.
 *
 * ── GATT layout ───────────────────────────────────────────────────────────────
 * Every PASCO service and characteristic UUID has the form
 *
 *     4a5c000<S>-000<C>-0000-0000-5c1e741f1c00
 *
 * where <S> is the service id and <C> the characteristic id. C = 0 addresses the
 * service itself. Service 0 is the device-level service; a sensor on channel N
 * is served by service N + 1.
 */

/** Common prefix of every PASCO 128-bit UUID. */
const UUID_PREFIX = "4a5c000";

/** Common suffix of every PASCO 128-bit UUID. */
const UUID_SUFFIX = "5c1e741f1c00";

/**
 * Builds a PASCO GATT UUID.
 *
 * @param serviceId - 0 for the device service, N + 1 for sensor channel N
 * @param characteristicId - 0 addresses the service itself; see CHARACTERISTIC
 */
export function pascoUuid(serviceId: number, characteristicId: number): string {
  return `${UUID_PREFIX}${serviceId}-000${characteristicId}-0000-0000-${UUID_SUFFIX}`;
}

/** Characteristic ids within a PASCO service. */
export const CHARACTERISTIC = {
  /** The service itself (used when requesting a GATT primary service). */
  SERVICE: 0,
  /** Host → device commands. */
  SEND_COMMAND: 2,
  /** Device → host responses and streamed samples (notify). */
  RECEIVE: 3,
  /** Host → device flow-control acknowledgements for streamed data. */
  SEND_ACK: 5,
} as const;

/** The device-level service; sensor channel N is served by service N + 1. */
export const DEVICE_SERVICE_ID = 0;

/**
 * Services a browser must declare in `optionalServices` before it may touch
 * them. Web Bluetooth blocks access to any service not requested up front, and
 * the number of sensor channels is not known until after discovery, so request
 * the device service plus a few sensor services.
 */
export const OPTIONAL_SERVICE_UUIDS: readonly string[] = [0, 1, 2, 3, 4].map((serviceId) =>
  pascoUuid(serviceId, CHARACTERISTIC.SERVICE),
);

/** Generic command opcodes (`GCMD_*` in the Python library / SPARKvue). */
export const COMMAND = {
  /** No-op write used as a keepalive on the device service. */
  KEEPALIVE: 0x00,
  /** Request one immediate sample; second byte is the expected payload size. */
  READ_ONE_SAMPLE: 0x05,
  /**
   * Device-specific control command. Sub-opcodes for the Geiger counter are in
   * {@link GEIGER_CONTROL}; the rest of the payload is command-specific.
   */
  CUSTOM: 0x37,
} as const;

/**
 * Sub-opcodes for {@link COMMAND.CUSTOM} on the Wireless Geiger Counter.
 *
 * Recovered from SPARKvue's `PascoBLEDriver::GMSetVoltage` /
 * `GMEnableBeeper` (wasm), which write these to channel 0's command
 * characteristic — the same one used for one-shot sample reads.
 */
export const GEIGER_CONTROL = {
  /** Set the G-M tube bias: two little-endian uint16 voltages in volts. */
  SET_VOLTAGE: 0x01,
  /** Enable or silence the audible count beep: one byte, 1 or 0. */
  ENABLE_BEEPER: 0x02,
} as const;

/** Response opcodes appearing in the first byte of a notification. */
export const RESPONSE = {
  /** Generic result packet: [0xc0, status, echoedOpcode, ...payload]. */
  RESULT: 0xc0,
  /** Status byte of a RESULT packet meaning "payload follows". */
  STATUS_OK: 0x00,
} as const;

/**
 * Streamed-sample packets are tagged with a rolling sequence number in the
 * first byte; anything at or below this value is periodic data rather than a
 * command response.
 */
export const MAX_STREAM_SEQUENCE = 0x1f;

// ── Wireless Geiger Counter (PS-3238) device tables ───────────────────────────

/** Interface id of the Wireless Geiger Counter, from the datasheet XML. */
export const GEIGER_INTERFACE_ID = 1064;

/** Sensor id behind channel 0 of that interface (`WirelessGM`). */
export const GEIGER_SENSOR_ID = 2079;

/** Channel the counting sensor sits on, hence service GEIGER_CHANNEL_ID + 1. */
export const GEIGER_CHANNEL_ID = 0;

/** Service that carries the counting sensor's command/notify characteristics. */
export const GEIGER_SERVICE_ID = GEIGER_CHANNEL_ID + 1;

/**
 * PASCO scientific's USB vendor id, from the USB-IF registry.
 *
 * Used to filter the WebHID picker so it offers PASCO hardware and nothing
 * else. Product ids are not published, and differ per device, so the vendor is
 * the only filter available.
 */
export const PASCO_USB_VENDOR_ID = 0x0945;

/**
 * Name the device advertises. PASCO devices advertise "<type> <serial><code>",
 * so this is a prefix match, e.g. "Geiger Counter 123-456Xe".
 */
export const GEIGER_ADVERTISED_NAME = "Geiger Counter";

/**
 * Payload of one sample from sensor 2079, in wire order. Both fields are
 * little-endian unsigned 16-bit, so a sample is 4 bytes:
 *
 *   - CountRate   counts accumulated since the previous read (cleared on read)
 *   - TubeVoltage GM tube bias, nominally 450–600 V
 */
export const GEIGER_SAMPLE_BYTES = 4;

/**
 * Typical healthy-tube bias as reported by the TubeVoltage measurement.
 *
 * The software-controlled range is wider; see {@link TUBE_VOLTAGE_CONTROL_RANGE}.
 */
export const TUBE_VOLTAGE_RANGE = { min: 450, max: 600 } as const;

/**
 * G-M tube bias the host may set, in volts.
 *
 * Matches SPARKvue's Geiger control panel (180–697 V in 8 V steps, default
 * 500 V). The product page quotes 150–650 V; Capstone/SPARKvue use this slightly
 * wider window. Sending the same value for both payload voltages is "manual"
 * mode; `(0, 0)` is SPARKvue's "automatic" optimum (not used by this sim).
 */
export const TUBE_VOLTAGE_CONTROL_RANGE = { min: 180, max: 697, step: 8, default: 500 } as const;

/** One decoded sample from the Geiger counter's sensor. */
export type GeigerSample = {
  /** Raw CountRate register: counts since the previous read. */
  readonly countRegister: number;
  /** GM tube bias in volts. */
  readonly tubeVoltage: number;
};

/**
 * Packs command bytes into an ArrayBuffer.
 *
 * Web Bluetooth's write methods take a BufferSource, which under
 * `strict` TypeScript means an ArrayBuffer rather than an ArrayBufferLike-backed
 * view, so commands are built on an explicit buffer.
 */
export function toCommandBuffer(bytes: readonly number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(buffer);
  view.set(bytes);
  return buffer;
}

/**
 * Builds the "read one sample" command for a sensor channel.
 *
 * @param payloadBytes - total size of the sensor's sample payload
 */
export function readOneSampleCommand(payloadBytes: number): ArrayBuffer {
  return toCommandBuffer([COMMAND.READ_ONE_SAMPLE, payloadBytes]);
}

/**
 * Builds the command that enables or silences the audible count beep.
 *
 * @param enabled - true to allow beeps; false to suppress them
 */
export function enableBeeperCommand(enabled: boolean): ArrayBuffer {
  return toCommandBuffer([COMMAND.CUSTOM, GEIGER_CONTROL.ENABLE_BEEPER, enabled ? 1 : 0]);
}

/**
 * Builds the command that sets the G-M tube bias.
 *
 * SPARKvue's manual mode sends the same voltage for both arguments; ramp mode
 * sends distinct initial and final values. Voltages are truncated to unsigned
 * 16-bit little-endian, matching `PascoBLEDriver::GMSetVoltage`.
 *
 * @param initialVolts - bias in volts (or ramp start)
 * @param finalVolts - bias in volts (or ramp end); omit to set a fixed bias
 */
export function setTubeVoltageCommand(initialVolts: number, finalVolts: number = initialVolts): ArrayBuffer {
  const initial = clampUint16(Math.trunc(initialVolts));
  const final = clampUint16(Math.trunc(finalVolts));
  return toCommandBuffer([
    COMMAND.CUSTOM,
    GEIGER_CONTROL.SET_VOLTAGE,
    initial & 0xff,
    (initial >> 8) & 0xff,
    final & 0xff,
    (final >> 8) & 0xff,
  ]);
}

/** Clamps a number into the unsigned 16-bit range used on the wire. */
function clampUint16(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 0xffff) {
    return 0xffff;
  }
  return value;
}

/**
 * Decodes a notification from a sensor service into a Geiger sample.
 *
 * Returns null when the packet is not a successful one-shot sample response —
 * battery status, streamed data, and error results all land here too and are
 * simply not what a polling reader asked for.
 */
export function decodeGeigerNotification(data: Uint8Array): GeigerSample | null {
  if (data.length < 3 + GEIGER_SAMPLE_BYTES) {
    return null;
  }
  if (data[0] !== RESPONSE.RESULT || data[1] !== RESPONSE.STATUS_OK || data[2] !== COMMAND.READ_ONE_SAMPLE) {
    return null;
  }
  return decodeGeigerPayload(data.subarray(3));
}

/**
 * Decodes the 4-byte sample payload of sensor 2079.
 *
 * Returns null if the payload is short. Measurements are consumed in datasheet
 * order, each little-endian over its own DataSize.
 */
export function decodeGeigerPayload(payload: Uint8Array): GeigerSample | null {
  if (payload.length < GEIGER_SAMPLE_BYTES) {
    return null;
  }
  return {
    countRegister: readUint16LE(payload, 0),
    tubeVoltage: readUint16LE(payload, 2),
  };
}

/** Reads a little-endian unsigned 16-bit integer. */
export function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/**
 * Decodes one character of PASCO's base-64-ish alphabet, used to pack the
 * interface id into the advertised name. Returns -1 for characters outside it.
 *
 *   '0'–'9' → 0–9      'K'–'Z' → 10–25    'A'–'J' → 26–35
 *   'a'–'z' → 36–61    '*'     → 62       '#'     → 63
 */
export function decodePascoBase64(character: string): number {
  if (character.length !== 1) {
    return -1;
  }
  const code = character.charCodeAt(0);
  const zero = "0".charCodeAt(0);
  const upperA = "A".charCodeAt(0);
  const upperJ = "J".charCodeAt(0);
  const upperK = "K".charCodeAt(0);
  const upperZ = "Z".charCodeAt(0);
  const lowerA = "a".charCodeAt(0);
  const lowerZ = "z".charCodeAt(0);

  if (character >= "0" && character <= "9") {
    return code - zero;
  }
  if (code >= upperK && code <= upperZ) {
    return code - upperA;
  }
  if (code >= upperA && code <= upperJ) {
    return code - upperA + 26;
  }
  if (code >= lowerA && code <= lowerZ) {
    return code - lowerA + 36;
  }
  if (character === "*") {
    return 62;
  }
  if (character === "#") {
    return 63;
  }
  return -1;
}

/** Base added to the encoded interface character to get an interface id. */
const INTERFACE_ID_BASE = 1024;

/** What a PASCO advertised name tells us about the device behind it. */
export type ParsedDeviceName = {
  /** Device type as advertised, e.g. "Geiger Counter". */
  readonly deviceType: string;
  /** Six-digit serial with its dash, e.g. "123-456", or null if absent. */
  readonly serialId: string | null;
  /** Interface id decoded from the name, or null if the name is too short. */
  readonly interfaceId: number | null;
};

/**
 * Parses a PASCO advertised name of the form "<type> <serial><flags><code>",
 * e.g. "Geiger Counter 123-456Xe".
 *
 * The trailing token is split as: 7 characters of serial, one reserved
 * character, then one base-64 character encoding `interfaceId - 1024`. Devices
 * whose name lacks that suffix still yield a device type, so a caller can fall
 * back to matching on the advertised name alone.
 */
export function parseAdvertisedName(advertisedName: string): ParsedDeviceName {
  const lastSpace = advertisedName.lastIndexOf(" ");
  if (lastSpace < 0) {
    return { deviceType: advertisedName, serialId: null, interfaceId: null };
  }

  const deviceType = advertisedName.slice(0, lastSpace);
  const suffix = advertisedName.slice(lastSpace + 1);
  const serialId = suffix.length >= 7 ? suffix.slice(0, 7) : null;

  let interfaceId: number | null = null;
  if (suffix.length >= 9) {
    const decoded = decodePascoBase64(suffix.charAt(8));
    if (decoded >= 0) {
      interfaceId = decoded + INTERFACE_ID_BASE;
    }
  }

  return { deviceType, serialId, interfaceId };
}

/**
 * Whether a name positively identifies some PASCO device other than a Geiger
 * counter.
 *
 * The lenient counterpart of {@link isGeigerCounterName}, for USB. A device's
 * USB product string comes from its descriptor rather than its BLE
 * advertisement, so it need not carry the interface-id suffix that
 * {@link isGeigerCounterName} prefers — and a name that simply says nothing
 * must not be refused. Only a name that decodes to a *different* interface id
 * is grounds for refusal.
 */
export function isOtherPascoDeviceName(name: string): boolean {
  const parsed = parseAdvertisedName(name);
  return parsed.interfaceId !== null && parsed.interfaceId !== GEIGER_INTERFACE_ID;
}

/**
 * Whether an advertised name belongs to a Wireless Geiger Counter.
 *
 * Prefers the interface id encoded in the name; falls back to the advertised
 * device type when the name carries no interface character.
 */
export function isGeigerCounterName(advertisedName: string): boolean {
  const parsed = parseAdvertisedName(advertisedName);
  if (parsed.interfaceId !== null) {
    return parsed.interfaceId === GEIGER_INTERFACE_ID;
  }
  return parsed.deviceType === GEIGER_ADVERTISED_NAME;
}
