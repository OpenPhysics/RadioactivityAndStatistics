/**
 * SourcePanel.ts
 *
 * Chooses where counts come from, and manages the Bluetooth connection when
 * that choice is a real Geiger counter.
 *
 * Only the controls belonging to the selected source are shown, so the panel
 * never presents a Connect button next to a simulated activity slider. The
 * connection status is a coloured dot *and* a text label — the colour alone
 * never carries the meaning.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { toFixed } from "scenerystack/dot";
import { Circle, HBox, Node, Text, VBox } from "scenerystack/scenery";
import { NumberControl, PhetFont } from "scenerystack/scenery-phet";
import { AquaRadioButtonGroup, RectangularPushButton } from "scenerystack/sun";
import type { SharedControlA11yStrings } from "../../i18n/StringManager.js";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../RadioactivityAndStatisticsConstants.js";
import { getWebBluetoothStatus, WebBluetoothStatus } from "../hardware/webBluetoothSupport.js";
import { ConnectionState } from "../model/ConnectionState.js";
import { CountSourceType } from "../model/CountSource.js";
import type { RadioactivityModel } from "../model/RadioactivityModel.js";
import { FLAT_PANEL_PUSH_BUTTON_OPTIONS, LIGHT_SURFACE_TEXT_FILL } from "../RadioactivityAndStatisticsButtonOptions.js";
import { RadioactivityAndStatisticsPanel } from "../RadioactivityAndStatisticsPanel.js";
import { SIM_NUMBER_CONTROL_OPTIONS } from "../SimControlOptions.js";

/** Radius of the connection-status dot. */
const STATUS_DOT_RADIUS = 5;

export class SourcePanel extends RadioactivityAndStatisticsPanel {
  private readonly disposeSourcePanel: () => void;

  public constructor(
    model: RadioactivityModel,
    a11y: SharedControlA11yStrings,
    showDiagnosticsProperty: TReadOnlyProperty<boolean>,
  ) {
    const stringManager = StringManager.getInstance();
    const strings = stringManager.getSourceStrings();
    const disposables: { dispose: () => void }[] = [];

    const title = new Text(strings.titleStringProperty, {
      font: new PhetFont({ size: 15, weight: "bold" }),
      fill: RadioactivityAndStatisticsColors.textColorProperty,
    });

    // ── Source selection ──────────────────────────────────────────────────────
    const sourceRadioGroup = new AquaRadioButtonGroup(
      model.sourceTypeProperty,
      [
        {
          value: CountSourceType.SIMULATED,
          createNode: () =>
            new Text(strings.simulatedStringProperty, {
              font: new PhetFont(13),
              fill: RadioactivityAndStatisticsColors.textColorProperty,
              maxWidth: 170,
            }),
        },
        {
          value: CountSourceType.GEIGER_COUNTER,
          createNode: () =>
            new Text(strings.geigerCounterStringProperty, {
              font: new PhetFont(13),
              fill: RadioactivityAndStatisticsColors.textColorProperty,
              maxWidth: 170,
            }),
        },
      ],
      {
        spacing: 6,
        radioButtonOptions: { radius: 7 },
        accessibleName: a11y.sourceRadioGroupStringProperty,
      },
    );

    // ── Simulated-source controls ─────────────────────────────────────────────
    const activityControl = new NumberControl(
      strings.activityStringProperty,
      model.simulatedSource.activityProperty,
      model.activityRange,
      {
        ...SIM_NUMBER_CONTROL_OPTIONS,
        delta: 1,
        titleNodeOptions: {
          font: new PhetFont(13),
          fill: RadioactivityAndStatisticsColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 40,
        },
        numberDisplayOptions: {
          valuePattern: "{{value}} /s",
          textOptions: { font: new PhetFont(13) },
        },
        accessibleName: a11y.activitySliderStringProperty,
      },
    );

    const simulatedControls = new VBox({
      align: "left",
      spacing: 6,
      children: [activityControl],
    });

    // ── Hardware-source controls ──────────────────────────────────────────────
    const geigerSource = model.geigerSource;

    const statusTextProperty = new DerivedProperty(
      [
        geigerSource.connectionStateProperty,
        strings.statusDisconnectedStringProperty,
        strings.statusConnectingStringProperty,
        strings.statusConnectedStringProperty,
        strings.statusErrorStringProperty,
      ],
      (state, disconnected, connecting, connected, errored) => {
        if (state === ConnectionState.CONNECTING) {
          return connecting;
        }
        if (state === ConnectionState.CONNECTED) {
          return connected;
        }
        if (state === ConnectionState.ERROR) {
          return errored;
        }
        return disconnected;
      },
    );

    const statusColorProperty = new DerivedProperty([geigerSource.connectionStateProperty], (state) => {
      if (state === ConnectionState.CONNECTED) {
        return RadioactivityAndStatisticsColors.statusGoodColorProperty.value;
      }
      if (state === ConnectionState.CONNECTING) {
        return RadioactivityAndStatisticsColors.statusWarningColorProperty.value;
      }
      if (state === ConnectionState.ERROR) {
        return RadioactivityAndStatisticsColors.statusCriticalColorProperty.value;
      }
      return RadioactivityAndStatisticsColors.statusIdleColorProperty.value;
    });

    const statusRow = new HBox({
      spacing: 6,
      children: [
        new Circle(STATUS_DOT_RADIUS, { fill: statusColorProperty }),
        new Text(statusTextProperty, {
          font: new PhetFont(13),
          fill: RadioactivityAndStatisticsColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 60,
        }),
      ],
    });

    // The device's own name is the only way to tell two counters apart on a
    // bench with several of them running.
    const deviceNameProperty = new DerivedProperty(
      [geigerSource.deviceInfoProperty],
      (info) => info?.advertisedName ?? "",
    );
    const deviceNameText = new Text(deviceNameProperty, {
      font: new PhetFont(11),
      fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
      visibleProperty: new DerivedProperty([deviceNameProperty], (name) => name.length > 0),
    });

    const isConnectedProperty = new DerivedProperty(
      [geigerSource.connectionStateProperty],
      (state) => state === ConnectionState.CONNECTED,
    );

    const connectButton = new RectangularPushButton({
      ...FLAT_PANEL_PUSH_BUTTON_OPTIONS,
      content: new Text(strings.connectStringProperty, { font: new PhetFont(13), fill: LIGHT_SURFACE_TEXT_FILL }),
      // Web Bluetooth only opens its picker during a user gesture, so this must
      // reach requestDevice without an intervening await — it does: connect()
      // runs synchronously up to that call.
      listener: () => {
        geigerSource.connect().catch(() => undefined);
      },
      accessibleName: a11y.connectButtonStringProperty,
      visibleProperty: new DerivedProperty([isConnectedProperty], (connected) => !connected),
    });

    const disconnectButton = new RectangularPushButton({
      ...FLAT_PANEL_PUSH_BUTTON_OPTIONS,
      content: new Text(strings.disconnectStringProperty, { font: new PhetFont(13), fill: LIGHT_SURFACE_TEXT_FILL }),
      listener: () => {
        geigerSource.disconnect().catch(() => undefined);
      },
      accessibleName: a11y.disconnectButtonStringProperty,
      visibleProperty: isConnectedProperty,
    });

    // Reasons a connection can never succeed here are worth stating up front,
    // rather than after a click that silently does nothing.
    const browserStatus = getWebBluetoothStatus();
    const unavailableMessage =
      browserStatus === WebBluetoothStatus.INSECURE_CONTEXT
        ? strings.insecureContextStringProperty
        : strings.unsupportedBrowserStringProperty;
    const unavailableText = new Text(unavailableMessage, {
      font: new PhetFont(11),
      fill: RadioactivityAndStatisticsColors.statusCriticalColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
      visible: browserStatus !== WebBluetoothStatus.AVAILABLE,
    });

    const errorTextProperty = new DerivedProperty([geigerSource.errorMessageProperty], (message) => message ?? "");
    const errorText = new Text(errorTextProperty, {
      font: new PhetFont(11),
      fill: RadioactivityAndStatisticsColors.statusCriticalColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
      visibleProperty: new DerivedProperty([errorTextProperty], (message) => message.length > 0),
    });

    // ── Diagnostics ───────────────────────────────────────────────────────────
    // Off by default. A live look at the two registers, for confirming a
    // counter is reporting sanely — a healthy tube sits near 500 V.
    const registerValueProperty = new DerivedProperty(
      [geigerSource.countRegisterProperty, strings.rawRegisterStringProperty],
      (register, label) => `${label}: ${register}`,
    );
    const tubeVoltageValueProperty = new DerivedProperty(
      [geigerSource.tubeVoltageProperty, strings.tubeVoltageStringProperty],
      (volts, label) => `${label}: ${toFixed(volts, 0)} V`,
    );

    const diagnostics = new VBox({
      align: "left",
      spacing: 4,
      visibleProperty: showDiagnosticsProperty,
      children: [
        new Text(registerValueProperty, {
          font: new PhetFont(11),
          fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
        }),
        new Text(tubeVoltageValueProperty, {
          font: new PhetFont(11),
          fill: RadioactivityAndStatisticsColors.secondaryTextColorProperty,
        }),
      ],
    });

    const geigerControls = new VBox({
      align: "left",
      spacing: 6,
      children: [statusRow, deviceNameText, connectButton, disconnectButton, unavailableText, errorText, diagnostics],
    });

    // ── Assemble ──────────────────────────────────────────────────────────────
    const isSimulatedProperty = new DerivedProperty(
      [model.sourceTypeProperty],
      (sourceType) => sourceType === CountSourceType.SIMULATED,
    );
    simulatedControls.visibleProperty = isSimulatedProperty;
    geigerControls.visibleProperty = new DerivedProperty([isSimulatedProperty], (isSimulated) => !isSimulated);

    disposables.push(
      statusTextProperty,
      statusColorProperty,
      deviceNameProperty,
      isConnectedProperty,
      errorTextProperty,
      registerValueProperty,
      tubeVoltageValueProperty,
      isSimulatedProperty,
    );

    super(
      new VBox({
        align: "left",
        spacing: 8,
        // A fixed width keeps the control column from reflowing as the two
        // source sub-panels swap in and out.
        preferredWidth: CONTROL_PANEL_WIDTH - 24,
        stretch: true,
        children: [title, sourceRadioGroup, new Node({ children: [simulatedControls, geigerControls] })],
      }),
      { minWidth: CONTROL_PANEL_WIDTH },
    );

    this.disposeSourcePanel = () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }

  public override dispose(): void {
    this.disposeSourcePanel();
    super.dispose();
  }
}
