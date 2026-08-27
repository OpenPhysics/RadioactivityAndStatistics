/**
 * radioactivityAndMeasurementsQueryParameters.ts
 *
 * Sim-specific startup query parameters — the single place each is declared and
 * documented. Public-facing parameters (intended for end users and shared
 * links) set `public: true`.
 *
 * Usage: append e.g. `?showDiagnostics=true` to the sim URL.
 */

import { logGlobal } from "scenerystack/phet-core";
import { QueryStringMachine } from "scenerystack/query-string-machine";
import RadioactivityAndMeasurementsNamespace from "../RadioactivityAndMeasurementsNamespace.js";

const radioactivityAndMeasurementsQueryParameters = QueryStringMachine.getAll({
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
});

RadioactivityAndMeasurementsNamespace.register(
  "radioactivityAndMeasurementsQueryParameters",
  radioactivityAndMeasurementsQueryParameters,
);

// Log query parameters (for the console / PhET-iO).
logGlobal("phet.chipper.queryParameters");

export default radioactivityAndMeasurementsQueryParameters;
