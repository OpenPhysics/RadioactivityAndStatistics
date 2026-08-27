/**
 * ConnectionState.ts
 *
 * The lifecycle of the Bluetooth link to a Geiger counter, shared by the model
 * that owns the connection and the panel that reports it.
 */

/** Where the hardware connection currently stands. */
export const ConnectionState = {
  /** No device selected, or the user disconnected deliberately. */
  DISCONNECTED: "disconnected",
  /** The browser's device picker is open, or GATT setup is in progress. */
  CONNECTING: "connecting",
  /** Connected and delivering samples. */
  CONNECTED: "connected",
  /** The last connection attempt or read failed; see the error message. */
  ERROR: "error",
} as const;

export type ConnectionStateValue = (typeof ConnectionState)[keyof typeof ConnectionState];
