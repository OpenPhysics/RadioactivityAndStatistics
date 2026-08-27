/**
 * AcquisitionPanel.ts
 *
 * The transport controls: how long each measurement lasts, how many to take,
 * and Record / Stop / Clear / Export.
 *
 * Record and Stop are separate buttons that swap places rather than one button
 * with a changing label — a screen reader then announces a stable name for the
 * control it is on, and the accessible name never has to be recomputed.
 */

import { DerivedProperty, PatternStringProperty } from "scenerystack/axon";
import { HBox, Node, Text, VBox } from "scenerystack/scenery";
import { NumberControl, PhetFont } from "scenerystack/scenery-phet";
import { Checkbox, RectangularPushButton } from "scenerystack/sun";
import type { ScreenControlA11yStrings } from "../../i18n/StringManager.js";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import {
  CONTROL_PANEL_WIDTH,
  COUNTING_INTERVAL_RANGE,
  SAMPLES_PER_RUN_RANGE,
} from "../../RadioactivityAndStatisticsConstants.js";
import { createExportFilename, samplesToCsv } from "../model/csvExport.js";
import type { RadioactivityModel } from "../model/RadioactivityModel.js";
import { FLAT_PANEL_PUSH_BUTTON_OPTIONS, LIGHT_SURFACE_TEXT_FILL } from "../RadioactivityAndStatisticsButtonOptions.js";
import { RadioactivityAndStatisticsPanel } from "../RadioactivityAndStatisticsPanel.js";
import { SIM_CHECKBOX_OPTIONS, SIM_NUMBER_CONTROL_OPTIONS } from "../SimControlOptions.js";
import { downloadCsv } from "./downloadCsv.js";

export class AcquisitionPanel extends RadioactivityAndStatisticsPanel {
  private readonly disposeAcquisitionPanel: () => void;

  public constructor(model: RadioactivityModel, a11y: ScreenControlA11yStrings) {
    const stringManager = StringManager.getInstance();
    const strings = stringManager.getAcquisitionStrings();
    const readoutStrings = stringManager.getReadoutStrings();
    const disposables: { dispose: () => void }[] = [];

    const title = new Text(strings.titleStringProperty, {
      font: new PhetFont({ size: 15, weight: "bold" }),
      fill: RadioactivityAndStatisticsColors.textColorProperty,
    });

    const titleNodeOptions = {
      font: new PhetFont(13),
      fill: RadioactivityAndStatisticsColors.textColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 40,
    };

    const intervalControl = new NumberControl(
      strings.intervalStringProperty,
      model.countingIntervalProperty,
      COUNTING_INTERVAL_RANGE,
      {
        ...SIM_NUMBER_CONTROL_OPTIONS,
        delta: 0.5,
        titleNodeOptions,
        numberDisplayOptions: {
          valuePattern: "{{value}} s",
          decimalPlaces: 1,
          textOptions: { font: new PhetFont(13) },
        },
        accessibleName: a11y.intervalControlStringProperty,
        // Changing the interval mid-run would put samples of different lengths
        // in the same distribution, which is not a distribution of anything.
        enabledProperty: new DerivedProperty([model.isRecordingProperty], (isRecording) => !isRecording),
      },
    );

    const samplesPerRunControl = new NumberControl(
      strings.samplesPerRunStringProperty,
      model.samplesPerRunProperty,
      SAMPLES_PER_RUN_RANGE,
      {
        ...SIM_NUMBER_CONTROL_OPTIONS,
        delta: 5,
        titleNodeOptions,
        numberDisplayOptions: { textOptions: { font: new PhetFont(13) } },
        accessibleName: a11y.samplesPerRunControlStringProperty,
        enabledProperty: new DerivedProperty([model.isContinuousProperty], (continuous) => !continuous),
      },
    );

    const continuousCheckbox = new Checkbox(
      model.isContinuousProperty,
      new Text(strings.continuousStringProperty, {
        font: new PhetFont(13),
        fill: RadioactivityAndStatisticsColors.textColorProperty,
        maxWidth: CONTROL_PANEL_WIDTH - 50,
      }),
      { ...SIM_CHECKBOX_OPTIONS, accessibleName: a11y.continuousCheckboxStringProperty },
    );

    // ── Transport buttons ─────────────────────────────────────────────────────
    const isRecordingProperty = model.isRecordingProperty;
    const notRecordingProperty = new DerivedProperty([isRecordingProperty], (isRecording) => !isRecording);

    const recordButton = new RectangularPushButton({
      ...FLAT_PANEL_PUSH_BUTTON_OPTIONS,
      content: new Text(strings.recordStringProperty, { font: new PhetFont(13), fill: LIGHT_SURFACE_TEXT_FILL }),
      listener: () => model.startRecording(),
      accessibleName: a11y.recordButtonStringProperty,
      visibleProperty: notRecordingProperty,
    });

    const stopButton = new RectangularPushButton({
      ...FLAT_PANEL_PUSH_BUTTON_OPTIONS,
      baseColor: RadioactivityAndStatisticsColors.statusCriticalColorProperty,
      content: new Text(strings.stopStringProperty, {
        font: new PhetFont(13),
        fill: RadioactivityAndStatisticsColors.onStatusCriticalTextColorProperty,
      }),
      listener: () => model.stopRecording(),
      accessibleName: a11y.stopButtonStringProperty,
      visibleProperty: isRecordingProperty,
    });

    const hasSamplesProperty = new DerivedProperty([model.samplesProperty], (samples) => samples.length > 0);

    const clearButton = new RectangularPushButton({
      ...FLAT_PANEL_PUSH_BUTTON_OPTIONS,
      content: new Text(strings.clearStringProperty, { font: new PhetFont(13), fill: LIGHT_SURFACE_TEXT_FILL }),
      listener: () => model.clearRun(),
      accessibleName: a11y.clearButtonStringProperty,
      enabledProperty: hasSamplesProperty,
    });

    const exportButton = new RectangularPushButton({
      ...FLAT_PANEL_PUSH_BUTTON_OPTIONS,
      content: new Text(strings.exportCsvStringProperty, { font: new PhetFont(13), fill: LIGHT_SURFACE_TEXT_FILL }),
      listener: () => {
        const csv = samplesToCsv(model.samplesProperty.value, {
          sourceDescription: model.sourceDescriptionProperty.value,
          intervalSeconds: model.countingIntervalProperty.value,
          statistics: model.statisticsProperty.value,
        });
        downloadCsv(createExportFilename(), csv);
      },
      accessibleName: a11y.exportButtonStringProperty,
      enabledProperty: hasSamplesProperty,
    });

    // ── Run progress ──────────────────────────────────────────────────────────
    const sampleCountProperty = new DerivedProperty([model.samplesProperty], (samples) => samples.length);
    const boundedProgressProperty = new PatternStringProperty(readoutStrings.collectedStringProperty, {
      count: sampleCountProperty,
      total: model.samplesPerRunProperty,
    });
    const continuousProgressProperty = new PatternStringProperty(readoutStrings.collectedContinuousStringProperty, {
      count: sampleCountProperty,
    });
    const progressProperty = new DerivedProperty(
      [model.isContinuousProperty, boundedProgressProperty, continuousProgressProperty],
      (continuous, bounded, unbounded) => (continuous ? unbounded : bounded),
    );

    const progressText = new Text(progressProperty, {
      font: new PhetFont(12),
      fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
    });

    disposables.push(
      notRecordingProperty,
      hasSamplesProperty,
      sampleCountProperty,
      boundedProgressProperty,
      continuousProgressProperty,
      progressProperty,
    );

    super(
      new VBox({
        align: "left",
        spacing: 8,
        preferredWidth: CONTROL_PANEL_WIDTH - 24,
        stretch: true,
        children: [
          title,
          intervalControl,
          samplesPerRunControl,
          continuousCheckbox,
          new HBox({
            spacing: 8,
            children: [new Node({ children: [recordButton, stopButton] }), clearButton, exportButton],
          }),
          progressText,
        ],
      }),
      { minWidth: CONTROL_PANEL_WIDTH },
    );

    this.disposeAcquisitionPanel = () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }

  public override dispose(): void {
    this.disposeAcquisitionPanel();
    super.dispose();
  }
}
