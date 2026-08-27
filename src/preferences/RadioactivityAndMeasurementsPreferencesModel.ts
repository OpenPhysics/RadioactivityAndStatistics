/**
 * RadioactivityAndMeasurementsPreferencesModel.ts
 *
 * Model for the simulation-specific preferences shown in Preferences →
 * Simulation. Each Property takes its initial value from the corresponding
 * query parameter in radioactivityAndMeasurementsQueryParameters.
 */

import { BooleanProperty } from "scenerystack/axon";
import type { Tandem } from "scenerystack/tandem";
import RadioactivityAndMeasurementsNamespace from "../RadioactivityAndMeasurementsNamespace.js";
import radioactivityAndMeasurementsQueryParameters from "./radioactivityAndMeasurementsQueryParameters.js";

export class RadioactivityAndMeasurementsPreferencesModel {
  /**
   * Whether the source panel shows the raw count register and tube voltage.
   *
   * Off by default: the raw register is a hardware-debugging aid, not part of
   * the physics. It is what tells you which register mode a given counter needs.
   */
  public readonly showDiagnosticsProperty: BooleanProperty;

  public constructor(tandem?: Tandem) {
    this.showDiagnosticsProperty = new BooleanProperty(
      radioactivityAndMeasurementsQueryParameters.showDiagnostics,
      tandem ? { tandem: tandem.createTandem("showDiagnosticsProperty") } : undefined,
    );
  }

  public reset(): void {
    this.showDiagnosticsProperty.reset();
  }
}

RadioactivityAndMeasurementsNamespace.register(
  "RadioactivityAndMeasurementsPreferencesModel",
  RadioactivityAndMeasurementsPreferencesModel,
);
