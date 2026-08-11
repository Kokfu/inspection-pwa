import assert from "node:assert/strict";
import test from "node:test";
import { resolveCo2Controls } from "./co2DefinitionControls.js";
import { masterServiceReportV3 } from "./masterServiceReportV3.js";
import { masterServiceReportV4, wetChemicalV4 } from "./masterServiceReportV4.js";

test("Wet Chemical is published only by forward-only V4", () => {
  assert.equal(masterServiceReportV3.systems.find((system) => system.key === "wet_chemical")?.definitionStatus, "requires_confirmation");
  assert.equal(masterServiceReportV4.systems.find((system) => system.key === "wet_chemical")?.definitionStatus, "confirmed");
  const controls = resolveCo2Controls(wetChemicalV4, "MFE-FSSR", 4);
  assert.deepEqual(controls.source, { templateCode: "MFE-FSSR", templateVersion: 4, systemKey: "wet_chemical" });
  assert.equal(controls.detectorRows.heatDetector.key, "heat_detector");
  assert.equal(controls.detectorRows.smokeDetector.key, "unconfirmed_second_heat_detector");
  assert.equal(controls.physicalOutlook.length, 8);
  assert.equal(controls.chargerAndBatteries.length, 3);
  assert.equal(controls.mainFunctionKeys.length, 6);
});

test("Wet Chemical resolver rejects an altered published definition", () => {
  const altered = JSON.parse(JSON.stringify(wetChemicalV4));
  altered.sections[0].blocks[1].columns[3].label = "Smoke Detector";
  assert.throws(() => resolveCo2Controls(altered, "MFE-FSSR", 4));
});
