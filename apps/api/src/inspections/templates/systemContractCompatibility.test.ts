import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV5 } from "./masterServiceReportV5.js";
import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import { resolveAutomaticSprinklerControls } from "./automaticSprinklerDefinitionControls.js";
import { resolveHoseReelControls } from "./definitionControls.js";
import { resolveCo2Controls } from "./co2DefinitionControls.js";
import { resolveFireAlarmControls } from "./fireAlarmDefinitionControls.js";
import { implementedSystemKeys, isCompatibleSystemContract } from "./systemContractCompatibility.js";

const clone = <T>(value: T): T => structuredClone(value);

test("MFE-FSSR V5 carries every implemented runtime contract forward exactly", () => {
  for (const key of implementedSystemKeys) {
    const system = masterServiceReportV5.systems.find((candidate) => candidate.key === key);
    assert.ok(system, `${key} must exist in V5`);
    assert.equal(isCompatibleSystemContract(key, system.definitionStatus, system), true, `${key} must be V5-compatible`);
  }
  const byKey = (key: string) => masterServiceReportV5.systems.find((candidate) => candidate.key === key)!;
  assert.equal(resolveAutomaticSprinklerControls(byKey("automatic_sprinkler"), "MFE-FSSR", 5).source.templateVersion, 1);
  assert.equal(resolveHoseReelControls(byKey("hose_reel"), "MFE-FSSR", 5).source.templateVersion, 1);
  assert.equal(resolveCo2Controls(byKey("co2_fire_extinguisher"), "MFE-FSSR", 5).source.templateVersion, 1);
  assert.equal(resolveCo2Controls(byKey("wet_chemical"), "MFE-FSSR", 5).source.templateVersion, 4);
  assert.equal(resolveFireAlarmControls(byKey("fire_alarm_detector"), "MFE-FSSR", 5).source.templateVersion, 3);
});

test("system contract compatibility fails closed for identity, status, field/control and future changes", () => {
  const baseline = masterServiceReportV5.systems.find((candidate) => candidate.key === "hose_reel")!;
  assert.equal(isCompatibleSystemContract("hose_reel", "confirmed", baseline), true);
  assert.equal(isCompatibleSystemContract("hose_reel", "requires_confirmation", baseline), false);
  assert.equal(isCompatibleSystemContract("hydrant", "confirmed", baseline), false);
  const label = clone(baseline) as any; label.sections[0].title = "Changed";
  assert.equal(isCompatibleSystemContract("hose_reel", "confirmed", label), false);
  const control = clone(baseline) as any; control.sections[0].blocks[0].items[0].control = "text";
  assert.equal(isCompatibleSystemContract("hose_reel", "confirmed", control), false);
  const nestedOrder = clone(baseline) as any; nestedOrder.sections[0].blocks[0].items[0].sortOrder = 99;
  assert.equal(isCompatibleSystemContract("hose_reel", "confirmed", nestedOrder), false);
  const catalogOrder = clone(baseline) as any; catalogOrder.sortOrder = 99;
  assert.equal(isCompatibleSystemContract("hose_reel", "confirmed", catalogOrder), true);
  const future = clone(baseline) as any; future.contractRevision = 2;
  assert.equal(isCompatibleSystemContract("hose_reel", "confirmed", future), false);
  const unknown = clone(baseline) as any; unknown.key = "future_hose_reel";
  assert.equal(isCompatibleSystemContract("hose_reel", "confirmed", unknown), false);
});

test("persisted JSONB system definitions retain their authoritative runtime contract", () => {
  const co2 = masterServiceReportV1.systems.find((candidate) => candidate.key === "co2_fire_extinguisher")!;
  const persisted = JSON.parse(JSON.stringify(co2));
  assert.equal(isCompatibleSystemContract("co2_fire_extinguisher", "confirmed", persisted), true);
  assert.equal(resolveCo2Controls(persisted, "MFE-FSSR", 1).source.systemKey, "co2_fire_extinguisher");
  persisted.sections[0].title = "Changed after persistence";
  assert.equal(isCompatibleSystemContract("co2_fire_extinguisher", "confirmed", persisted), false);
});
