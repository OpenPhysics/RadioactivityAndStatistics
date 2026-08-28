/**
 * RadioactivityAndStatisticsPreferencesModel.ts
 *
 * Model for the simulation-specific preferences shown in Preferences →
 * Simulation. Each Property takes its initial value from the corresponding
 * query parameter in radioactivityAndStatisticsQueryParameters.
 */

import { BooleanProperty, NumberProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import type { Tandem } from "scenerystack/tandem";
import { TUBE_VOLTAGE_CONTROL_RANGE } from "../common/hardware/PascoProtocol.js";
import RadioactivityAndStatisticsNamespace from "../RadioactivityAndStatisticsNamespace.js";
import radioactivityAndStatisticsQueryParameters from "./radioactivityAndStatisticsQueryParameters.js";

export class RadioactivityAndStatisticsPreferencesModel {
  /**
   * Whether the source panel shows the raw count register and tube voltage.
   *
   * Off by default: the raw register is a hardware-debugging aid, not part of
   * the physics. It is what tells you which register mode a given counter needs.
   */
  public readonly showDiagnosticsProperty: BooleanProperty;

  /**
   * Whether a connected Geiger counter is allowed to beep on each count.
   *
   * On by default so the device behaves as it does out of the box; uncheck to
   * silence it from the host (same control Capstone/SPARKvue expose).
   */
  public readonly beepEnabledProperty: BooleanProperty;

  /**
   * G-M tube bias setpoint sent to a connected counter, in volts.
   *
   * Applied on connect and whenever the value changes while connected. The
   * measured tube voltage in the source panel is what the device reports back.
   */
  public readonly tubeVoltageProperty: NumberProperty;

  /**
   * Whether the acquisition panel shows the "Samples per run" slider.
   *
   * Off by default: every bounded run then collects a fixed number of
   * samples, so the run length isn't yet another variable a student has to
   * reason about. Check it to let them set it themselves.
   */
  public readonly showSamplesPerRunControlProperty: BooleanProperty;

  public constructor(tandem?: Tandem) {
    this.showDiagnosticsProperty = new BooleanProperty(
      radioactivityAndStatisticsQueryParameters.showDiagnostics,
      tandem ? { tandem: tandem.createTandem("showDiagnosticsProperty") } : undefined,
    );

    this.beepEnabledProperty = new BooleanProperty(
      radioactivityAndStatisticsQueryParameters.beepEnabled,
      tandem ? { tandem: tandem.createTandem("beepEnabledProperty") } : undefined,
    );

    this.tubeVoltageProperty = new NumberProperty(radioactivityAndStatisticsQueryParameters.tubeVoltage, {
      range: new Range(TUBE_VOLTAGE_CONTROL_RANGE.min, TUBE_VOLTAGE_CONTROL_RANGE.max),
      units: "V",
      ...(tandem ? { tandem: tandem.createTandem("tubeVoltageProperty") } : {}),
    });

    this.showSamplesPerRunControlProperty = new BooleanProperty(
      radioactivityAndStatisticsQueryParameters.showSamplesPerRunControl,
      tandem ? { tandem: tandem.createTandem("showSamplesPerRunControlProperty") } : undefined,
    );
  }

  public reset(): void {
    this.showDiagnosticsProperty.reset();
    this.beepEnabledProperty.reset();
    this.tubeVoltageProperty.reset();
    this.showSamplesPerRunControlProperty.reset();
  }
}

RadioactivityAndStatisticsNamespace.register(
  "RadioactivityAndStatisticsPreferencesModel",
  RadioactivityAndStatisticsPreferencesModel,
);
