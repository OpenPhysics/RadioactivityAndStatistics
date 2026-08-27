/**
 * radioactivityAndMeasurementsQueryParameters.ts
 *
 * Sim-specific startup query parameters — the single place each is declared and
 * documented. Public-facing parameters (intended for end users and shared
 * links) set `public: true`.
 *
 * Usage: append e.g. `?showDiagnostics=true&registerMode=perSampleWindow` to
 * the sim URL.
 */

import { logGlobal } from "scenerystack/phet-core";
import { QueryStringMachine } from "scenerystack/query-string-machine";
import RadioactivityAndMeasurementsNamespace from "../RadioactivityAndMeasurementsNamespace.js";

const radioactivityAndMeasurementsQueryParameters = QueryStringMachine.getAll({
  /**
   * Shows the raw CountRate register and GM tube voltage in the source panel.
   *
   * Useful when checking how a particular Geiger counter reports its counts,
   * which is what determines the correct `registerMode` below.
   */
  showDiagnostics: {
    type: "boolean",
    defaultValue: false,
    public: true,
  },

  /**
   * How the Geiger counter's raw CountRate register is turned into a running
   * total. See GeigerCountSource for what each mode means and how to tell which
   * one a given device needs.
   */
  registerMode: {
    type: "string",
    defaultValue: "cumulative",
    validValues: ["cumulative", "perSampleWindow"],
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
