/**
 * Unit tests for the PASCO wire protocol.
 *
 * These are the pieces that were reverse-engineered from PASCO's Python
 * library rather than from a specification, so they are the parts most worth
 * pinning down: a wrong UUID or a mis-decoded advertised name fails at connect
 * time with a browser error that says nothing about the cause.
 */

import { describe, expect, it } from "vitest";
import {
  CHARACTERISTIC,
  COMMAND,
  decodeGeigerNotification,
  decodeGeigerPayload,
  decodePascoBase64,
  enableBeeperCommand,
  GEIGER_INTERFACE_ID,
  GEIGER_SAMPLE_BYTES,
  isGeigerCounterName,
  isOtherPascoDeviceName,
  OPTIONAL_SERVICE_UUIDS,
  PASCO_USB_VENDOR_ID,
  parseAdvertisedName,
  pascoUuid,
  RESPONSE,
  readOneSampleCommand,
  setTubeVoltageCommand,
  toCommandBuffer,
} from "../../../src/common/hardware/PascoProtocol.js";

describe("pascoUuid", () => {
  it("builds the documented 4a5c000S-000C-… form", () => {
    expect(pascoUuid(0, 0)).toBe("4a5c0000-0000-0000-0000-5c1e741f1c00");
    expect(pascoUuid(1, CHARACTERISTIC.SEND_COMMAND)).toBe("4a5c0001-0002-0000-0000-5c1e741f1c00");
    expect(pascoUuid(1, CHARACTERISTIC.RECEIVE)).toBe("4a5c0001-0003-0000-0000-5c1e741f1c00");
  });

  it("lists the sensor services a browser must be granted up front", () => {
    // Web Bluetooth blocks any service not named in optionalServices, and the
    // channel count is unknown until after discovery.
    expect(OPTIONAL_SERVICE_UUIDS).toContain("4a5c0000-0000-0000-0000-5c1e741f1c00");
    expect(OPTIONAL_SERVICE_UUIDS).toContain("4a5c0001-0000-0000-0000-5c1e741f1c00");
  });
});

describe("decodePascoBase64", () => {
  it("decodes each band of PASCO's alphabet", () => {
    expect(decodePascoBase64("0")).toBe(0);
    expect(decodePascoBase64("9")).toBe(9);
    expect(decodePascoBase64("K")).toBe(10);
    expect(decodePascoBase64("Z")).toBe(25);
    expect(decodePascoBase64("A")).toBe(26);
    expect(decodePascoBase64("J")).toBe(35);
    expect(decodePascoBase64("a")).toBe(36);
    expect(decodePascoBase64("z")).toBe(61);
    expect(decodePascoBase64("*")).toBe(62);
    expect(decodePascoBase64("#")).toBe(63);
  });

  it("rejects characters outside the alphabet", () => {
    expect(decodePascoBase64("-")).toBe(-1);
    expect(decodePascoBase64("")).toBe(-1);
    expect(decodePascoBase64("ab")).toBe(-1);
  });
});

describe("parseAdvertisedName", () => {
  it("splits type, serial, and interface id", () => {
    // Interface 1064 encodes as 1064 − 1024 = 40, which is 'e' in the alphabet.
    const parsed = parseAdvertisedName("Geiger Counter 123-456Xe");
    expect(parsed.deviceType).toBe("Geiger Counter");
    expect(parsed.serialId).toBe("123-456");
    expect(parsed.interfaceId).toBe(GEIGER_INTERFACE_ID);
  });

  it("keeps the device type when the name carries no interface suffix", () => {
    const parsed = parseAdvertisedName("Geiger Counter 123-456");
    expect(parsed.deviceType).toBe("Geiger Counter");
    expect(parsed.serialId).toBe("123-456");
    expect(parsed.interfaceId).toBeNull();
  });

  it("handles a name with no space at all", () => {
    const parsed = parseAdvertisedName("Unnamed");
    expect(parsed.deviceType).toBe("Unnamed");
    expect(parsed.serialId).toBeNull();
    expect(parsed.interfaceId).toBeNull();
  });
});

describe("isOtherPascoDeviceName", () => {
  it("refuses a PASCO sensor whose encoded interface id is not the counter's", () => {
    expect(isOtherPascoDeviceName("Temperature 123-456X1")).toBe(true);
  });

  it("accepts the counter's own name", () => {
    expect(isOtherPascoDeviceName("Geiger Counter 123-456Xe")).toBe(false);
  });

  it("accepts a name that encodes no interface id at all", () => {
    // A USB product string comes from the device descriptor, not the BLE
    // advertisement, so it need not carry the suffix. Silence is not grounds
    // for refusal — this is the whole difference from isGeigerCounterName.
    expect(isOtherPascoDeviceName("Geiger Counter")).toBe(false);
    expect(isOtherPascoDeviceName("PS-3238")).toBe(false);
    expect(isGeigerCounterName("PS-3238")).toBe(false);
  });
});

describe("PASCO_USB_VENDOR_ID", () => {
  it("is the vendor id the USB-IF registry assigns to PASCO scientific", () => {
    // The only filter available to the WebHID picker: PASCO publish no product ids.
    expect(PASCO_USB_VENDOR_ID).toBe(0x0945);
  });
});

describe("isGeigerCounterName", () => {
  it("accepts a counter identified by its encoded interface id", () => {
    expect(isGeigerCounterName("Geiger Counter 123-456Xe")).toBe(true);
  });

  it("falls back to the advertised device type", () => {
    expect(isGeigerCounterName("Geiger Counter 123-456")).toBe(true);
  });

  it("rejects another PASCO sensor", () => {
    // 1025 − 1024 = 1, which is '1'.
    expect(isGeigerCounterName("Temperature 123-456X1")).toBe(false);
    expect(isGeigerCounterName("Temperature 123-456")).toBe(false);
  });

  it("rejects a device whose interface id contradicts its name", () => {
    // The encoded id wins: a renamed device must not be read as a counter.
    expect(isGeigerCounterName("Geiger Counter 123-456X1")).toBe(false);
  });
});

describe("command encoding", () => {
  it("asks for exactly the Geiger sample size", () => {
    const bytes = new Uint8Array(readOneSampleCommand(GEIGER_SAMPLE_BYTES));
    expect(Array.from(bytes)).toEqual([COMMAND.READ_ONE_SAMPLE, 4]);
  });

  it("packs commands into a plain ArrayBuffer for Web Bluetooth", () => {
    const buffer = toCommandBuffer([COMMAND.KEEPALIVE]);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(buffer))).toEqual([0x00]);
  });

  it("enables or silences the Geiger beep via CUSTOM sub-opcode 0x02", () => {
    expect(Array.from(new Uint8Array(enableBeeperCommand(true)))).toEqual([COMMAND.CUSTOM, 0x02, 1]);
    expect(Array.from(new Uint8Array(enableBeeperCommand(false)))).toEqual([COMMAND.CUSTOM, 0x02, 0]);
  });

  it("sets tube voltage as two little-endian uint16 values", () => {
    // Manual mode sends the same bias for both payload voltages.
    expect(Array.from(new Uint8Array(setTubeVoltageCommand(500)))).toEqual([
      COMMAND.CUSTOM,
      0x01,
      0xf4,
      0x01,
      0xf4,
      0x01,
    ]);
    expect(Array.from(new Uint8Array(setTubeVoltageCommand(180, 697)))).toEqual([
      COMMAND.CUSTOM,
      0x01,
      0xb4,
      0x00,
      0xb9,
      0x02,
    ]);
  });
});

describe("decodeGeigerPayload", () => {
  it("reads both measurements little-endian", () => {
    // CountRate = 0x0123 = 291, TubeVoltage = 0x01f4 = 500 V
    const payload = new Uint8Array([0x23, 0x01, 0xf4, 0x01]);
    expect(decodeGeigerPayload(payload)).toEqual({ countRegister: 291, tubeVoltage: 500 });
  });

  it("returns null on a short payload rather than inventing zeros", () => {
    expect(decodeGeigerPayload(new Uint8Array([0x01, 0x00]))).toBeNull();
  });
});

describe("decodeGeigerNotification", () => {
  it("decodes a successful one-shot read", () => {
    const packet = new Uint8Array([
      RESPONSE.RESULT,
      RESPONSE.STATUS_OK,
      COMMAND.READ_ONE_SAMPLE,
      0x0a,
      0x00,
      0xf4,
      0x01,
    ]);
    expect(decodeGeigerNotification(packet)).toEqual({ countRegister: 10, tubeVoltage: 500 });
  });

  it("decodes packets captured from a PS-3238", () => {
    // Verbatim from a connected counter beside a source: the first read after
    // connecting returns the backlog banked since power-on, later reads the
    // counts since the previous read. Tube bias reads 500 V throughout.
    expect(decodeGeigerNotification(new Uint8Array([0xc0, 0x00, 0x05, 0x92, 0x03, 0xf4, 0x01]))).toEqual({
      countRegister: 914,
      tubeVoltage: 500,
    });
    expect(decodeGeigerNotification(new Uint8Array([0xc0, 0x00, 0x05, 0x49, 0x00, 0xf4, 0x01]))).toEqual({
      countRegister: 73,
      tubeVoltage: 500,
    });
  });

  it("ignores the device's unsolicited status packets", () => {
    // Captured alongside the sample responses; not a one-shot result.
    expect(decodeGeigerNotification(new Uint8Array([0x85, 0x51, 0x0f, 0x54, 0x00, 0x00]))).toBeNull();
  });

  it("ignores an error result", () => {
    const packet = new Uint8Array([RESPONSE.RESULT, 0x01, COMMAND.READ_ONE_SAMPLE, 0, 0, 0, 0]);
    expect(decodeGeigerNotification(packet)).toBeNull();
  });

  it("ignores streamed data and battery notifications", () => {
    // A periodic sample is tagged with a low sequence number, not 0xc0.
    expect(decodeGeigerNotification(new Uint8Array([0x03, 0x0a, 0x00, 0xf4, 0x01, 0, 0]))).toBeNull();
    expect(decodeGeigerNotification(new Uint8Array([0x82, 0x01, 0x00, 0, 0, 0, 0]))).toBeNull();
  });
});
