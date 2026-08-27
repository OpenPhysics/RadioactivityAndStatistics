/**
 * webBluetoothSupport.ts
 *
 * Feature detection for the Web Bluetooth API, so the sim can explain exactly
 * why hardware is unavailable instead of failing at the first click.
 *
 * Web Bluetooth is only exposed to a secure context (HTTPS or localhost) and
 * only in Chromium-based browsers. The sim stays fully usable without it — the
 * simulated source is always available — so nothing here throws.
 */

/** Why hardware acquisition is or is not available in this browser. */
export const WebBluetoothStatus = {
  /** navigator.bluetooth exists and the page is in a secure context. */
  AVAILABLE: "available",
  /** Not a browser (server-side render, unit test, …). */
  NO_BROWSER: "noBrowser",
  /** Page is not HTTPS or localhost, so the API is hidden. */
  INSECURE_CONTEXT: "insecureContext",
  /** Browser does not implement Web Bluetooth (Firefox, Safari). */
  UNSUPPORTED_BROWSER: "unsupportedBrowser",
} as const;

export type WebBluetoothStatusValue = (typeof WebBluetoothStatus)[keyof typeof WebBluetoothStatus];

/** Result cache — the answer cannot change over a page's lifetime. */
let cachedStatus: WebBluetoothStatusValue | null = null;

/** Determines whether this page can talk to Bluetooth hardware. */
export function getWebBluetoothStatus(): WebBluetoothStatusValue {
  if (cachedStatus !== null) {
    return cachedStatus;
  }

  if (typeof navigator === "undefined" || typeof window === "undefined") {
    cachedStatus = WebBluetoothStatus.NO_BROWSER;
  } else if (!window.isSecureContext) {
    cachedStatus = WebBluetoothStatus.INSECURE_CONTEXT;
  } else if (navigator.bluetooth === undefined) {
    cachedStatus = WebBluetoothStatus.UNSUPPORTED_BROWSER;
  } else {
    cachedStatus = WebBluetoothStatus.AVAILABLE;
  }

  return cachedStatus;
}

/** Whether a hardware connection can be attempted at all. */
export function isWebBluetoothAvailable(): boolean {
  return getWebBluetoothStatus() === WebBluetoothStatus.AVAILABLE;
}

/** Clears the cached answer. Exists for unit tests. */
export function clearWebBluetoothStatusCache(): void {
  cachedStatus = null;
}
