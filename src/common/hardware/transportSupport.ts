/**
 * transportSupport.ts
 *
 * Feature detection for the browser APIs behind each hardware transport, so the
 * sim can explain exactly why a wire is unavailable instead of failing at the
 * first click.
 *
 * Web Bluetooth and WebHID are both exposed only to a secure context (HTTPS or
 * localhost) and only in Chromium-based browsers. The sim stays fully usable
 * without either — the simulated source is always available — so nothing here
 * throws.
 */

import { TransportKind, type TransportKindValue } from "./GeigerTransport.js";

/** Why a transport is or is not available in this browser. */
export const TransportStatus = {
  /** The API exists and the page is in a secure context. */
  AVAILABLE: "available",
  /** Not a browser (server-side render, unit test, …). */
  NO_BROWSER: "noBrowser",
  /** Page is not HTTPS or localhost, so the API is hidden. */
  INSECURE_CONTEXT: "insecureContext",
  /** Browser does not implement the API (Firefox, Safari). */
  UNSUPPORTED_BROWSER: "unsupportedBrowser",
} as const;

export type TransportStatusValue = (typeof TransportStatus)[keyof typeof TransportStatus];

/** Result cache — the answers cannot change over a page's lifetime. */
const cachedStatus = new Map<TransportKindValue, TransportStatusValue>();

/** Whether the browser object backing a transport exists. */
function hasApi(kind: TransportKindValue): boolean {
  return kind === TransportKind.USB ? navigator.hid !== undefined : navigator.bluetooth !== undefined;
}

/** Determines whether this page can talk to hardware over one wire. */
export function getTransportStatus(kind: TransportKindValue): TransportStatusValue {
  const cached = cachedStatus.get(kind);
  if (cached !== undefined) {
    return cached;
  }

  let status: TransportStatusValue;
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    status = TransportStatus.NO_BROWSER;
  } else if (!window.isSecureContext) {
    status = TransportStatus.INSECURE_CONTEXT;
  } else if (!hasApi(kind)) {
    status = TransportStatus.UNSUPPORTED_BROWSER;
  } else {
    status = TransportStatus.AVAILABLE;
  }

  cachedStatus.set(kind, status);
  return status;
}

/** Whether a connection can be attempted at all over one wire. */
export function isTransportAvailable(kind: TransportKindValue): boolean {
  return getTransportStatus(kind) === TransportStatus.AVAILABLE;
}

/** Every wire this browser can reach a counter over, in the order offered. */
export function getAvailableTransports(): readonly TransportKindValue[] {
  return [TransportKind.BLUETOOTH, TransportKind.USB].filter(isTransportAvailable);
}

/** Clears the cached answers. Exists for unit tests. */
export function clearTransportStatusCache(): void {
  cachedStatus.clear();
}
