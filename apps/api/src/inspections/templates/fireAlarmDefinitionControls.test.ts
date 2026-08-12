import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  parseFireAlarmRowPreset,
  parseFireAlarmSystemDefinition,
  resolveFireAlarmControls
} from "./fireAlarmDefinitionControls.js";
import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import { masterServiceReportV2 } from "./masterServiceReportV2.js";
import { fireAlarmDetectorV3, masterServiceReportV3 } from "./masterServiceReportV3.js";

const semanticHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const mutableDefinition = () => JSON.parse(JSON.stringify(fireAlarmDetectorV3));
const rejectsDefinition = (mutate: (definition: any) => void) => {
  const definition = mutableDefinition();
  mutate(definition);
  assert.equal(parseFireAlarmSystemDefinition(definition), undefined);
  assert.throws(() => resolveFireAlarmControls(definition));
};

test("published MFE-FSSR V1 and V2 semantic definitions remain unchanged", () => {
  assert.equal(semanticHash(masterServiceReportV1), "14971b991d49e5045d7e85506220253003b896c64761b457517fc8b88c625914");
  assert.equal(semanticHash(masterServiceReportV2), "d78365e36b6f3684cd68c9d5013147f52cc6bd0262899a30627bc1c9ec934a8b");
});

test("V3 is forward-only and preserves the intended mixed-system catalog", () => {
  assert.equal(masterServiceReportV3.version, 3);
  assert.notEqual(masterServiceReportV3.id, masterServiceReportV1.id);
  assert.notEqual(masterServiceReportV3.id, masterServiceReportV2.id);
  assert.deepEqual(masterServiceReportV3.systems.map((system) => system.key), [
    "automatic_sprinkler", "dry_wet_riser", "hose_reel", "co2_fire_extinguisher",
    "fire_alarm_detector", "wet_chemical", "hydrant", "fm200", "portable_fire_extinguisher"
  ]);
  assert.deepEqual(masterServiceReportV3.systems.map((system) => system.definitionStatus), [
    "confirmed", "confirmed", "confirmed", "confirmed", "confirmed",
    "requires_confirmation", "confirmed", "requires_confirmation", "requires_confirmation"
  ]);
  const v1 = (key: string) => masterServiceReportV1.systems.find((system) => system.key === key);
  for (const key of ["automatic_sprinkler", "hose_reel", "co2_fire_extinguisher"]) {
    assert.deepEqual(masterServiceReportV3.systems.find((system) => system.key === key), v1(key));
  }
  assert.deepEqual(
    masterServiceReportV3.systems.find((system) => system.key === "dry_wet_riser"),
    { ...masterServiceReportV2.systems[0], sortOrder: 2 }
  );
});

test("V3 Fire Alarm has the exact authoritative controls and limits", () => {
  assert.ok(parseFireAlarmSystemDefinition(fireAlarmDetectorV3));
  const controls = resolveFireAlarmControls(fireAlarmDetectorV3);
  assert.deepEqual(controls.source, { templateCode: "MFE-FSSR", templateVersion: 3, systemKey: "fire_alarm_detector" });
  assert.equal(controls.controlPanelLocation.maxLength, 300);
  assert.equal(controls.primaryDeviceRows.minimum, 1);
  assert.equal(controls.primaryDeviceRows.maximum, 250);
  assert.equal(controls.secondaryAlarmDeviceRows.minimum, 0);
  assert.equal(controls.secondaryAlarmDeviceRows.maximum, 250);
  assert.equal(controls.primaryDeviceRows.assetReference.maxLength, 250);
  assert.equal(controls.primaryDeviceRows.alarmZone.maxLength, 200);
  assert.equal(controls.primaryDeviceRows.location.maxLength, 300);
  assert.equal(controls.primaryDeviceRows.remarks.maxLength, 2000);
  assert.equal(controls.comments.maxLength, 4000);
  const deviceValues = controls.primaryDeviceRows.manualCallPoint.options.map((option) => option.value);
  assert.deepEqual(deviceValues, ["normal", "test", "isolation"]);
  for (const control of [controls.primaryDeviceRows.flowSwitch, controls.primaryDeviceRows.heatDetector, controls.primaryDeviceRows.smokeDetector]) {
    assert.deepEqual(control.options.map((option) => option.value), deviceValues);
  }
  assert.deepEqual(controls.chargerAndBatteries.map((item) => item.key), ["main_supply", "battery", "charger"]);
  assert.deepEqual(controls.mainFunctionKeys.map((item) => item.key), [
    "main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply",
    "spka_system", "alarm_lift_trip", "signal_gas_discharge"
  ]);
  for (const item of [...controls.chargerAndBatteries, ...controls.mainFunctionKeys]) {
    assert.deepEqual(item.result.options.map((option) => option.value), ["good", "poor"]);
  }
  assert.deepEqual(controls.secondaryAlarmDeviceRows.alarmBell.options.map((option) => option.value), ["good", "poor"]);
  assert.equal(JSON.stringify(fireAlarmDetectorV3).includes('"n/a"'), false);
});

test("both Fire Alarm tables have only the approved fields including optional asset reference", () => {
  const panel = fireAlarmDetectorV3.sections[0];
  const primary = panel.blocks[1];
  const secondary = fireAlarmDetectorV3.sections[3].blocks[0];
  assert.equal(primary.type, "repeatable_table");
  assert.equal(secondary.type, "repeatable_table");
  assert.deepEqual(primary.columns.map((field) => field.key), [
    "asset_reference", "alarm_zone", "location", "manual_call_point", "flow_switch",
    "heat_detector", "smoke_detector", "remarks"
  ]);
  assert.deepEqual(secondary.columns.map((field) => field.key), [
    "asset_reference", "location", "alarm_bell", "manual_call_point", "remarks"
  ]);
  assert.equal(primary.columns[0].required, false);
  assert.equal(secondary.columns[0].required, false);
});

test("Fire Alarm definition resolver fails closed for missing, extra, and reordered members", () => {
  rejectsDefinition((definition) => { delete definition.sections[0].blocks[1].columns[0].key; });
  rejectsDefinition((definition) => { definition.sections[0].blocks[1].columns[0].extra = true; });
  rejectsDefinition((definition) => { definition.sections[0].blocks[1].columns.reverse(); });
  rejectsDefinition((definition) => { definition.sections.reverse(); });
  rejectsDefinition((definition) => { definition.sections[1].blocks[0].items[0].allowedValues.push("n/a"); });
  rejectsDefinition((definition) => { definition.sections[0].blocks[1].columns[3].allowedValues = ["normal", "isolation", "test"]; });
  rejectsDefinition((definition) => { definition.sections[3].blocks[0].columns.splice(3, 0, { key: "extra_device" }); });
  assert.doesNotThrow(() => resolveFireAlarmControls(fireAlarmDetectorV3, "MFE-FSSR", 5));
});

test("Fire Alarm row routing is mandatory, exact, bounded, and reconstructed", () => {
  assert.deepEqual(parseFireAlarmRowPreset({ fireAlarmTable: "primary" }), { fireAlarmTable: "primary" });
  assert.deepEqual(parseFireAlarmRowPreset({ fireAlarmTable: "secondary", assetReference: "BELL-01" }), { fireAlarmTable: "secondary", assetReference: "BELL-01" });
  for (const value of [
    {}, { assetReference: "A" }, { fireAlarmTable: "unknown" },
    { fireAlarmTable: "primary", extra: true }, { fireAlarmTable: "primary", assetReference: 1 },
    { fireAlarmTable: "secondary", assetReference: "x".repeat(251) }
  ]) assert.equal(parseFireAlarmRowPreset(value), undefined);
});
