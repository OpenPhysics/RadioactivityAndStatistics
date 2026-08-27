/**
 * StringManager.ts
 *
 * Centralizes all localized string access for the simulation.
 *
 * Strings are loaded from JSON files per locale and wrapped in reactive
 * Property objects by SceneryStack. When the user switches language in the
 * Preferences dialog, all StringProperties update automatically.
 *
 * ── How to add a locale ───────────────────────────────────────────────────────
 * 1. Create src/i18n/strings_XX.json with the same keys as strings_en.json
 * 2. Import it below and add `XX: stringsXX` to the locale map
 * 3. Add "XX" to `availableLocales` in src/init.ts
 *
 * ── How to add a string ───────────────────────────────────────────────────────
 * 1. Add the key + English value to strings_en.json
 * 2. Add the same key + translated value to ALL other locale files
 *    (TypeScript will show an error here if any locale is missing a key)
 * 3. Expose the new StringProperty via a new getter method below
 */

import type { ReadOnlyProperty } from "scenerystack/axon";
import { LocalizedString } from "scenerystack/chipper";
import stringsEn from "./strings_en.json";
import stringsEs from "./strings_es.json";
import stringsFr from "./strings_fr.json";

// ── Compile-time key-parity check ─────────────────────────────────────────────
// English is the canonical shape; every other locale must match it exactly.
// TypeScript errors here if any locale file is missing (or adds) a key relative to
// English. Add one `satisfies` line per new locale so the check stays exhaustive.
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsFr satisfies typeof stringsEn);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEn satisfies typeof stringsFr);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEs satisfies typeof stringsEn);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEn satisfies typeof stringsEs);

// ── Build the reactive string property tree ───────────────────────────────────
const stringProperties = LocalizedString.getNestedStringProperties({
  en: stringsEn,
  fr: stringsFr,
  es: stringsEs,
});

/**
 * Every control name used across the two screens. Both screens now carry the
 * same panels — only the fixed counting source and the default chart differ
 * between them — so one shape covers both `a11y.simulation.controls` and
 * `a11y.device.controls`; a screen simply never wires up the accessible name
 * that belongs to the other one's source (e.g. the Bluetooth screen never
 * builds `activitySlider`).
 */
export type ScreenControlA11yStrings = {
  readonly activitySliderStringProperty: ReadOnlyProperty<string>;
  readonly connectButtonStringProperty: ReadOnlyProperty<string>;
  readonly disconnectButtonStringProperty: ReadOnlyProperty<string>;
  readonly intervalControlStringProperty: ReadOnlyProperty<string>;
  readonly samplesPerRunControlStringProperty: ReadOnlyProperty<string>;
  readonly continuousCheckboxStringProperty: ReadOnlyProperty<string>;
  readonly recordButtonStringProperty: ReadOnlyProperty<string>;
  readonly stopButtonStringProperty: ReadOnlyProperty<string>;
  readonly clearButtonStringProperty: ReadOnlyProperty<string>;
  readonly exportButtonStringProperty: ReadOnlyProperty<string>;
  readonly chartViewRadioGroupStringProperty: ReadOnlyProperty<string>;
  readonly poissonCheckboxStringProperty: ReadOnlyProperty<string>;
  readonly gaussianPredictionCheckboxStringProperty: ReadOnlyProperty<string>;
  readonly gaussianFitCheckboxStringProperty: ReadOnlyProperty<string>;
  readonly autoBinWidthCheckboxStringProperty: ReadOnlyProperty<string>;
  readonly binWidthControlStringProperty: ReadOnlyProperty<string>;
};

export type SimA11yStrings = {
  readonly screenSummary: {
    readonly playAreaStringProperty: ReadOnlyProperty<string>;
    readonly controlAreaStringProperty: ReadOnlyProperty<string>;
    readonly interactionHintStringProperty: ReadOnlyProperty<string>;
  };
  readonly currentDetailsStringProperty: ReadOnlyProperty<string>;
  readonly controls: ScreenControlA11yStrings;
};

/**
 * Explicit Preferences → Simulation labels from {@link StringManager.getPreferences}.
 * Same sync rule as {@link SimA11yStrings}.
 */
export type SimPreferenceStrings = {
  readonly titleStringProperty: ReadOnlyProperty<string>;
  readonly showDiagnosticsStringProperty: ReadOnlyProperty<string>;
  readonly showDiagnosticsDescriptionStringProperty: ReadOnlyProperty<string>;
  readonly beepEnabledStringProperty: ReadOnlyProperty<string>;
  readonly beepEnabledDescriptionStringProperty: ReadOnlyProperty<string>;
  readonly tubeVoltageStringProperty: ReadOnlyProperty<string>;
  readonly tubeVoltageDescriptionStringProperty: ReadOnlyProperty<string>;
};

/**
 * StringManager is a singleton that provides typed access to all localized
 * strings. Use `StringManager.getInstance()` everywhere — never construct it
 * directly.
 */
export class StringManager {
  private static instance: StringManager | null = null;

  private constructor() {
    // Private — obtain via getInstance()
  }

  public static getInstance(): StringManager {
    if (StringManager.instance === null) {
      StringManager.instance = new StringManager();
    }
    return StringManager.instance;
  }

  /**
   * The simulation title shown in the navigation bar and browser tab.
   * Updates automatically when the locale changes.
   */
  public getTitleStringProperty(): ReadOnlyProperty<string> {
    return stringProperties.titleStringProperty;
  }

  /**
   * Screen name StringProperties used when constructing Screen instances.
   * Each property updates automatically when the locale changes.
   */
  public getScreenNames(): {
    readonly simulationStringProperty: ReadOnlyProperty<string>;
    readonly deviceStringProperty: ReadOnlyProperty<string>;
  } {
    return {
      simulationStringProperty: stringProperties.screens.simulationStringProperty,
      deviceStringProperty: stringProperties.screens.deviceStringProperty,
    };
  }

  /** Accessibility strings for the Simulation screen (the mock-up counter). */
  public getSimulationA11yStrings() {
    return stringProperties.a11y.simulation;
  }

  /** Accessibility strings for the Device screen (the Bluetooth Geiger counter). */
  public getDeviceA11yStrings() {
    return stringProperties.a11y.device;
  }

  /** Labels for the source panel: connection and diagnostics. */
  public getSourceStrings() {
    return stringProperties.source;
  }

  /** Labels for the acquisition panel: interval, run length, transport buttons. */
  public getAcquisitionStrings() {
    return stringProperties.acquisition;
  }

  /** Labels for the live count-rate readout. */
  public getReadoutStrings() {
    return stringProperties.readout;
  }

  /** Column headings and the empty-state message for the data table. */
  public getTableStrings() {
    return stringProperties.table;
  }

  /** Row labels for the statistics panel. */
  public getStatisticsStrings() {
    return stringProperties.statistics;
  }

  /** Axis titles, curve names, and binning labels for the histogram. */
  public getHistogramStrings() {
    return stringProperties.histogram;
  }

  /** Axis titles for the count-rate chart. */
  public getRateChartStrings() {
    return stringProperties.rateChart;
  }

  /** Labels for the histogram / count-rate view switch. */
  public getChartViewStrings() {
    return stringProperties.chartView;
  }

  /**
   * Simulation-specific preference labels shown in Preferences → Simulation.
   */
  public getPreferences() {
    return stringProperties.preferences;
  }
}
