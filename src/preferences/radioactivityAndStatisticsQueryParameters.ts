/**
 * radioactivityAndStatisticsQueryParameters.ts
 *
 * Sim-specific startup query parameters — the single place each is declared and
 * documented. Public-facing parameters (intended for end users and shared
 * links) set `public: true`.
 *
 * Usage: append e.g. `?showDiagnostics=true` to the sim URL.
 */

import { logGlobal } from "scenerystack/phet-core";
import { QueryStringMachine } from "scenerystack/query-string-machine";
import { TUBE_VOLTAGE_CONTROL_RANGE } from "../common/hardware/PascoProtocol.js";
import RadioactivityAndStatisticsNamespace from "../RadioactivityAndStatisticsNamespace.js";

const radioactivityAndStatisticsQueryParameters = QueryStringMachine.getAll({
  /**
   * Shows the raw CountRate register and GM tube voltage in the source panel.
   *
   * Useful for confirming a connected counter is reporting sanely: a healthy
   * GM tube sits near 500 V.
   */
  showDiagnostics: {
    type: "boolean",
    defaultValue: false,
    public: true,
  },

  /**
   * Whether a connected Geiger counter may beep on each count.
   *
   * Surfaced in Preferences → Simulation; applied over the open link when a counter is
   * connected.
   */
  beepEnabled: {
    type: "boolean",
    defaultValue: true,
    public: true,
  },

  /**
   * Offers the "Connect via USB" button on the Geiger counter screen.
   *
   * Off by default, and deliberately not `public`. The counter's USB port does
   * present a reachable WebUSB interface — "Pasco USB Bridge", vendor 0x0945,
   * class 0xff with bulk endpoints, and `claimInterface` succeeds — but its
   * data path stays in loopback: every packet written comes back byte-identical,
   * and nothing opens it that can be found by inspection. See
   * doc/implementation-notes.md. Until that is solved the button would fail for
   * every user, so only someone deliberately working on the USB path sees it.
   */
  usbTransport: {
    type: "boolean",
    defaultValue: false,
  },

  /**
   * G-M tube bias setpoint in volts for a connected Geiger counter.
   *
   * Surfaced as a slider in Preferences → Simulation. Range matches SPARKvue's
   * Geiger control panel.
   */
  tubeVoltage: {
    type: "number",
    defaultValue: TUBE_VOLTAGE_CONTROL_RANGE.default,
    public: true,
  },
});

RadioactivityAndStatisticsNamespace.register(
  "radioactivityAndStatisticsQueryParameters",
  radioactivityAndStatisticsQueryParameters,
);

// Log query parameters (for the console / PhET-iO).
logGlobal("phet.chipper.queryParameters");

export default radioactivityAndStatisticsQueryParameters;
