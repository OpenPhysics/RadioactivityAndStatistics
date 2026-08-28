/**
 * SourcePanel.ts
 *
 * Shows the controls for the one counting source a screen is fixed to — the
 * simulated activity slider, or the Bluetooth connection controls — and
 * manages the Bluetooth connection when that source is a real Geiger counter.
 *
 * Each screen now has a fixed source (there is nothing to choose between), so
 * this panel only ever builds the controls for the {@link CountSourceType} it
 * is given, rather than both sets with one hidden. The connection status is a
 * coloured dot *and* a text label — the colour alone never carries the
 * meaning.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { toFixed } from "scenerystack/dot";
import { Circle, HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { NumberControl, PhetFont } from "scenerystack/scenery-phet";
import { AquaRadioButtonGroup, RectangularPushButton } from "scenerystack/sun";
import type { ScreenControlA11yStrings } from "../../i18n/StringManager.js";
import { StringManager } from "../../i18n/StringManager.js";
import RadioactivityAndStatisticsColors from "../../RadioactivityAndStatisticsColors.js";
import { CONTROL_PANEL_WIDTH, SPEED_MULTIPLIER_CHOICES } from "../../RadioactivityAndStatisticsConstants.js";
import { getWebBluetoothStatus, WebBluetoothStatus } from "../hardware/webBluetoothSupport.js";
import { ConnectionState } from "../model/ConnectionState.js";
import { CountSourceType, type CountSourceTypeValue } from "../model/CountSource.js";
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
    fixedSourceType: CountSourceTypeValue,
    a11y: ScreenControlA11yStrings,
    showDiagnosticsProperty: TReadOnlyProperty<boolean>,
  ) {
    const stringManager = StringManager.getInstance();
    const strings = stringManager.getSourceStrings();
    const disposables: { dispose: () => void }[] = [];

    const title = new Text(strings.titleStringProperty, {
      font: new PhetFont({ size: 15, weight: "bold" }),
      fill: RadioactivityAndStatisticsColors.textColorProperty,
    });

    const sourceControls: Node =
      fixedSourceType === CountSourceType.SIMULATED
        ? createSimulatedControls(model, strings, a11y)
        : createGeigerControls(model, strings, a11y, showDiagnosticsProperty, disposables);

    super(
      new VBox({
        align: "left",
        spacing: 8,
        preferredWidth: CONTROL_PANEL_WIDTH - 24,
        stretch: true,
        children: [title, sourceControls],
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

/** The label for one entry of the speed radio group. */
function speedLabelStringProperty(
  multiplier: number,
  strings: ReturnType<typeof StringManager.prototype.getSourceStrings>,
): TReadOnlyProperty<string> {
  switch (multiplier) {
    case 10:
      return strings.speed10xStringProperty;
    case 100:
      return strings.speed100xStringProperty;
    default:
      return strings.speed1xStringProperty;
  }
}

/** The simulated activity slider and the speed control that fast-forwards its clock. */
function createSimulatedControls(
  model: RadioactivityModel,
  strings: ReturnType<typeof StringManager.prototype.getSourceStrings>,
  a11y: ScreenControlA11yStrings,
): Node {
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

  const speedLabelText = new Text(strings.speedLabelStringProperty, {
    font: new PhetFont(13),
    fill: RadioactivityAndStatisticsColors.textColorProperty,
    maxWidth: CONTROL_PANEL_WIDTH - 40,
  });

  const speedRadioGroup = new AquaRadioButtonGroup(
    model.speedMultiplierProperty,
    SPEED_MULTIPLIER_CHOICES.map((multiplier) => ({
      value: multiplier,
      createNode: () =>
        new Text(speedLabelStringProperty(multiplier, strings), {
          font: new PhetFont(13),
          fill: RadioactivityAndStatisticsColors.textColorProperty,
        }),
    })),
    {
      orientation: "horizontal",
      spacing: 10,
      radioButtonOptions: { radius: 7 },
      accessibleName: a11y.speedRadioGroupStringProperty,
    },
  );

  return new VBox({
    align: "left",
    spacing: 6,
    children: [activityControl, speedLabelText, speedRadioGroup],
  });
}

/** Connection status, connect/disconnect buttons, and diagnostics for a real Geiger counter. */
function createGeigerControls(
  model: RadioactivityModel,
  strings: ReturnType<typeof StringManager.prototype.getSourceStrings>,
  a11y: ScreenControlA11yStrings,
  showDiagnosticsProperty: TReadOnlyProperty<boolean>,
  disposables: { dispose: () => void }[],
): Node {
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

  // ── Diagnostics ─────────────────────────────────────────────────────────────
  // Off by default. A live look at the two registers, for confirming a counter
  // is reporting sanely — a healthy tube sits near 500 V.
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

  disposables.push(
    statusTextProperty,
    statusColorProperty,
    deviceNameProperty,
    isConnectedProperty,
    errorTextProperty,
    registerValueProperty,
    tubeVoltageValueProperty,
  );

  return new VBox({
    align: "left",
    spacing: 6,
    children: [statusRow, deviceNameText, connectButton, disconnectButton, unavailableText, errorText, diagnostics],
  });
}
