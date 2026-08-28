/**
 * ConnectionState.ts
 *
 * The lifecycle of the link to a Geiger counter — Bluetooth or USB, the states
 * are the same — shared by the model that owns the connection and the panel
 * that reports it.
 */

/** Where the hardware connection currently stands. */
export const ConnectionState = {
  /** No device selected, or the user disconnected deliberately. */
  DISCONNECTED: "disconnected",
  /** The browser's device picker is open, or link setup is in progress. */
  CONNECTING: "connecting",
  /** Connected and delivering samples. */
  CONNECTED: "connected",
  /** The last connection attempt or read failed; see the error message. */
  ERROR: "error",
} as const;

export type ConnectionStateValue = (typeof ConnectionState)[keyof typeof ConnectionState];
