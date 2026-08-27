/**
 * main.ts
 *
 * Entry point for the simulation. Initializes SceneryStack, creates the
 * screens, and starts the main event loop.
 *
 * !! CRITICAL IMPORT ORDER !!
 * brand.js MUST be the first import. Each module imports the next, so the import nesting is
 *
 *   main → brand → splash → assert → init
 *
 * and therefore the actual EXECUTION order (deepest import runs first) is the reverse:
 *
 *   init → assert → splash → brand → main
 *
 * SceneryStack requires this exact load order. Never reorder these imports.
 */

// brand.js MUST be first; importing it runs the whole chain (init→assert→splash→brand) before main.
import "./brand.js";

import { onReadyToLaunch, PreferencesModel, Sim } from "scenerystack/sim";
import { Tandem } from "scenerystack/tandem";
import { StringManager } from "./i18n/StringManager.js";
import { IntroScreen } from "./intro/IntroScreen.js";
import { LabScreen } from "./lab/LabScreen.js";
import { RadioactivityAndMeasurementsPreferencesModel } from "./preferences/RadioactivityAndMeasurementsPreferencesModel.js";
import { RadioactivityAndMeasurementsPreferencesNode } from "./preferences/RadioactivityAndMeasurementsPreferencesNode.js";
import RadioactivityAndMeasurementsColors from "./RadioactivityAndMeasurementsColors.js";

onReadyToLaunch(() => {
  const stringManager = StringManager.getInstance();

  // Simulation-specific preferences; initial values come from radioactivityAndMeasurementsQueryParameters.
  const simPreferences = new RadioactivityAndMeasurementsPreferencesModel(Tandem.ROOT.createTandem("preferences"));

  const screens = [
    new IntroScreen(simPreferences, {
      name: stringManager.getScreenNames().introStringProperty,
      tandem: Tandem.ROOT.createTandem("introScreen"),
      backgroundColorProperty: RadioactivityAndMeasurementsColors.backgroundColorProperty,
    }),
    new LabScreen(simPreferences, {
      name: stringManager.getScreenNames().labStringProperty,
      tandem: Tandem.ROOT.createTandem("labScreen"),
      backgroundColorProperty: RadioactivityAndMeasurementsColors.backgroundColorProperty,
    }),
  ];

  const sim = new Sim(stringManager.getTitleStringProperty(), screens, {
    preferencesModel: new PreferencesModel({
      visualOptions: {
        // Adds a "Projector Mode" toggle in Preferences → Visual
        supportsProjectorMode: true,
        // Enables keyboard-navigation highlight outlines
        supportsInteractiveHighlights: true,
      },
      simulationOptions: {
        customPreferences: [
          {
            createContent: (tandem: Tandem) => new RadioactivityAndMeasurementsPreferencesNode(simPreferences, tandem),
          },
        ],
      },
      localizationOptions: {
        // Adds a language picker in Preferences → Language
        supportsDynamicLocale: true,
      },
    }),

    credits: {
      softwareDevelopment: "OpenPhysics",
    },
  });

  sim.start();
});
