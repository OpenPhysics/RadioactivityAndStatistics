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
  countRegisterDelta,
  decodeGeigerNotification,
  decodeGeigerPayload,
  decodePascoBase64,
  GEIGER_INTERFACE_ID,
  GEIGER_SAMPLE_BYTES,
  isGeigerCounterName,
  OPTIONAL_SERVICE_UUIDS,
  parseAdvertisedName,
  pascoUuid,
  RESPONSE,
  readOneSampleCommand,
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

describe("countRegisterDelta", () => {
  it("differences successive readings", () => {
    expect(countRegisterDelta(100, 137)).toBe(37);
    expect(countRegisterDelta(100, 100)).toBe(0);
  });

  it("stays correct across the 16-bit wraparound", () => {
    // 65530 → 4 is 10 counts, not a 65526-count drop.
    expect(countRegisterDelta(65530, 4)).toBe(10);
    expect(countRegisterDelta(65535, 0)).toBe(1);
  });
});
