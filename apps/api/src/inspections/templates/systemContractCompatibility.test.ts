import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV5 } from "./masterServiceReportV5.js";
import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import { masterServiceReportV6 } from "./masterServiceReportV6.js";
import { masterServiceReportV7 } from "./masterServiceReportV7.js";
import { resolveAutomaticSprinklerControls } from "./automaticSprinklerDefinitionControls.js";
import { resolveHoseReelControls } from "./definitionControls.js";
import { resolveCo2Controls } from "./co2DefinitionControls.js";
import { resolveFm200Controls } from "./fm200DefinitionControls.js";
import { resolveFireAlarmControls, resolveFireAlarmV6Controls } from "./fireAlarmDefinitionControls.js";
import { implementedSystemKeys, isCompatibleSystemContract, systemContractVersion } from "./systemContractCompatibility.js";

const clone = <T>(value: T): T => structuredClone(value);

/** Systems with no pre-V7 lineage at all, named explicitly rather than derived
 * from `systemContractVersion`.  Filtering by that production mapping would let
 * an accidental edit (e.g. flipping a legacy system's version to 7) silently
 * drop that system out of the invariant below instead of failing it. */
const v7OnlySystemKeys = new Set<string>(["smoke_ventilation", "fire_intercom", "fm200_fire_suppression"]);

test("MFE-FSSR V5 carries every implemented runtime contract forward exactly", () => {
  for (const key of implementedSystemKeys.filter((candidate) => !v7OnlySystemKeys.has(candidate))) {
    assert.ok(systemContractVersion(key) <= 5, `${key} is not V7-only, so its contract version must be a pre-V7 one`);
    const system = masterServiceReportV5.systems.find((candidate) => candidate.key === key);
    assert.ok(system, `${key} must exist in V5`);
    assert.equal(isCompatibleSystemContract(key, system.definitionStatus, system), true, `${key} must be V5-compatible`);
  }
  assert.equal(masterServiceReportV5.systems.some((candidate) => candidate.key === "smoke_ventilation"), false, "smoke_ventilation must not exist before V7");
  assert.equal(masterServiceReportV5.systems.some((candidate) => candidate.key === "fire_intercom"), false, "fire_intercom must not exist before V7");
  assert.equal(masterServiceReportV5.systems.some((candidate) => candidate.key === "fm200_fire_suppression"), false, "fm200_fire_suppression must not exist before V7");
  assert.equal(masterServiceReportV1.systems.some((candidate) => candidate.key === "fm200_fire_suppression"), false, "fm200_fire_suppression must not exist in V1 either (V7-only, unlike CO2's own V1 entry)");
  const byKey = (key: string) => masterServiceReportV5.systems.find((candidate) => candidate.key === key)!;
  assert.equal(resolveAutomaticSprinklerControls(byKey("automatic_sprinkler"), "MFE-FSSR", 5).source.templateVersion, 1);
  assert.equal(resolveHoseReelControls(byKey("hose_reel"), "MFE-FSSR", 5).source.templateVersion, 1);
  assert.equal(resolveCo2Controls(byKey("co2_fire_extinguisher"), "MFE-FSSR", 5).source.templateVersion, 1);
  assert.equal(resolveCo2Controls(byKey("wet_chemical"), "MFE-FSSR", 5).source.templateVersion, 4);
  assert.equal(resolveFireAlarmControls(byKey("fire_alarm_detector"), "MFE-FSSR", 5).source.templateVersion, 3);
});

test("V7 Hose Reel controls report templateVersion 7 and resolve the Test Run Fire Pump block", () => {
  const v7System = masterServiceReportV7.systems.find((candidate) => candidate.key === "hose_reel")!;
  const v7Controls = resolveHoseReelControls(v7System, "MFE-FSSR", 7);
  assert.equal(v7Controls.source.templateVersion, 7);
  assert.deepEqual(v7Controls.checklist.testRunFirePump.map((item) => item.key), ["trfp_duty_pump", "trfp_standby_pump"]);
  const v5System = masterServiceReportV5.systems.find((candidate) => candidate.key === "hose_reel")!;
  assert.deepEqual(resolveHoseReelControls(v5System, "MFE-FSSR", 5).checklist.testRunFirePump, []);
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

test("FM200 is a fully independent V7-only clone of CO2's structure, not a relabeled CO2 record", () => {
  const fm200 = masterServiceReportV7.systems.find((candidate) => candidate.key === "fm200_fire_suppression")!;
  const co2 = masterServiceReportV7.systems.find((candidate) => candidate.key === "co2_fire_extinguisher")!;
  assert.ok(fm200, "fm200_fire_suppression must exist on the V7 template");
  assert.equal(systemContractVersion("fm200_fire_suppression"), 7, "FM200 has no legacy pre-V7 contract");
  assert.equal(isCompatibleSystemContract("fm200_fire_suppression", "confirmed", fm200, { id: masterServiceReportV7.id, version: 7 }), true);
  // Only the top-level displayName differs; every internal section/field label
  // stays worded exactly as CO2's (confirmed label-scope decision).
  assert.equal(fm200.displayName, "FM200 System");
  assert.notEqual(fm200.displayName, co2.displayName);
  const withCo2Identity = { ...fm200, key: "co2_fire_extinguisher", displayName: co2.displayName };
  assert.deepEqual(withCo2Identity.sections, co2.sections, "FM200's sections mirror CO2's exactly (e.g. still say 'CO2 Cylinder')");
  // FM200 must resolve as its OWN system key, never silently accepted as CO2's.
  assert.equal(isCompatibleSystemContract("co2_fire_extinguisher", "confirmed", fm200, { id: masterServiceReportV7.id, version: 7 }), false);
  assert.equal(isCompatibleSystemContract("fm200_fire_suppression", "confirmed", co2, { id: masterServiceReportV7.id, version: 7 }), false);
  const controls = resolveFm200Controls(fm200, "MFE-FSSR", 7);
  assert.equal(controls.source.systemKey, "fm200_fire_suppression");
  assert.equal(controls.source.templateVersion, 7);
  assert.throws(() => resolveFm200Controls(co2, "MFE-FSSR", 7), "resolveFm200Controls must reject a CO2 definition");
});

test("V6 selects only the frozen Fire Alarm variant and leaves V1-V5 exact", () => {
  const v5 = masterServiceReportV5.systems.find((candidate) => candidate.key === "fire_alarm_detector")!;
  const v6 = masterServiceReportV6.systems.find((candidate) => candidate.key === "fire_alarm_detector")!;
  assert.equal(isCompatibleSystemContract("fire_alarm_detector", "confirmed", v5, { id: masterServiceReportV5.id, version: 5 }), false);
  assert.equal(isCompatibleSystemContract("fire_alarm_detector", "confirmed", v6, { id: masterServiceReportV6.id, version: 6 }), true);
  assert.deepEqual(resolveFireAlarmControls(v5, "MFE-FSSR", 3).chargerAndBatteries[0].result.options.map((option) => option.value), ["good", "poor"]);
  assert.deepEqual(resolveFireAlarmV6Controls(v6).chargerAndBatteries[0].result.options.map((option) => option.value), ["good", "poor", "not_relevant"]);
  assert.deepEqual(resolveFireAlarmV6Controls(v6).primaryDeviceRows.manualCallPoint.options.map((option) => option.value), ["normal", "test", "isolation"]);
  const malformed = clone(v6) as any; malformed.sections[1].blocks[0].items[0].allowedValues = ["good", "poor"];
  assert.throws(() => resolveFireAlarmV6Controls(malformed));
});
