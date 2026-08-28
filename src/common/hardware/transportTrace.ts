/**
 * transportTrace.ts
 *
 * TEMPORARY diagnostic tracing shared by the hardware transports, enabled with
 * `?debugTransport=true` (`?debugBluetooth=true` is still accepted).
 *
 * Dumps every byte in both directions plus the discovered device layout, so a
 * counter's actual behaviour can be read off the console during bring-up.
 */

const parameters = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);

/** Whether byte-level tracing is on. */
export const TRANSPORT_TRACE_ENABLED =
  parameters?.get("debugTransport") === "true" || parameters?.get("debugBluetooth") === "true";

/** Formats bytes as space-separated hex, the form used in the capture logs. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

let lastTraceTime = 0;

/**
 * Logs one traced event, prefixed with the gap since the previous one.
 *
 * The gap is what makes a capture readable: it is how the CountRate register's
 * clear-on-read behaviour was identified in the first place.
 *
 * @param channel - short tag for the wire, e.g. "ble" or "usb"
 * @param label - what happened
 * @param detail - optional structured payload
 */
export function trace(channel: string, label: string, detail: unknown = ""): void {
  if (!TRANSPORT_TRACE_ENABLED) {
    return;
  }
  const now = performance.now();
  const sinceLast = lastTraceTime === 0 ? 0 : Math.round(now - lastTraceTime);
  lastTraceTime = now;
  // biome-ignore lint/suspicious/noConsole: temporary hardware bring-up tracing
  console.log(`[${channel}] +${String(sinceLast).padStart(4)}ms ${label}`, detail);
}
