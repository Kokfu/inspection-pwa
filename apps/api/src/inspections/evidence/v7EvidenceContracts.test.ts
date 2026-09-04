import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../templates/masterServiceReportV7.js";
import { parseV7EvidenceManifest, resolveV7EvidenceContract, v7EvidenceContractSha256 } from "./v7EvidenceContracts.js";

const system = (key: "co2_fire_extinguisher" | "wet_chemical" | "fire_alarm_detector" | "hydrant" | "hose_reel") => masterServiceReportV7.systems.find((candidate) => candidate.key === key)!;
const response = (key: "co2_fire_extinguisher" | "wet_chemical", result: "good" | "not_good" | "complete_repair" | "na", remarks = "") => {
  const definition = system(key); const value = () => ({ result, remarks });
  const section = (sectionKey: string, blockKey: string) => definition.sections.find((candidate) => candidate.key === sectionKey)!.blocks.find((candidate) => candidate.key === blockKey)!;
  const checklist = (sectionKey: string, blockKey: string) => Object.fromEntries((section(sectionKey, blockKey) as { items: Array<{ key: string }> }).items.map((item) => [item.key, value()]));
  return { chargerAndBatteries: checklist("charger_batteries", "charger_battery_checks"), physicalOutlook: checklist("physical_outlook", "physical_outlook_checks"), mainFunctionKeys: checklist("main_function_key", "function_checks") };
};

test("V7 adapters resolve only exact CO2/Wet tuples and derive field-specific Poor evidence", () => {
  const definition = system("co2_fire_extinguisher");
  const adapter = resolveV7EvidenceContract({ systemKey: "co2_fire_extinguisher", templateId: masterServiceReportV7.id, templateVersion: 7, definition, contractSha256: v7EvidenceContractSha256(definition) });
  assert.ok(adapter);
  assert.deepEqual(adapter.derivePoorFieldPaths(response("co2_fire_extinguisher", "na")), []);
  const poor = response("co2_fire_extinguisher", "not_good", "Own field remark");
  const paths = adapter.derivePoorFieldPaths(poor)!;
  assert.equal(paths.length, 19);
  assert.equal(adapter.ownPoorRemark(poor, paths[0]!), "Own field remark");
  assert.equal(parseV7EvidenceManifest([], adapter, poor), undefined);
  const manifest = paths.map((fieldPath, index) => ({ photoUuid: `00000000-0000-4000-8000-${String(900000000000 + index).slice(-12)}`, fieldPath, sourceSha256: `${index.toString(16).padStart(2, "0")}${"a".repeat(62)}` }));
  assert.equal(parseV7EvidenceManifest(manifest, adapter, poor)?.length, paths.length);
  assert.equal(resolveV7EvidenceContract({ systemKey: "co2_fire_extinguisher", templateId: masterServiceReportV7.id, templateVersion: 6, definition, contractSha256: v7EvidenceContractSha256(definition) }), undefined);
});

test("V7 Wet Chemical adapter preserves static-only evidence scope", () => {
  const definition = system("wet_chemical");
  const adapter = resolveV7EvidenceContract({ systemKey: "wet_chemical", templateId: masterServiceReportV7.id, templateVersion: 7, definition, contractSha256: v7EvidenceContractSha256(definition) });
  assert.ok(adapter);
  assert.equal(adapter.isCanonicalFieldPath("physical_outlook.physical_outlook_checks.unconfirmed_second_heat_detector"), false);
  assert.equal(adapter.acceptedEvidenceCaption("physical_outlook.physical_outlook_checks.discharge_nozzle"), "Physical Outlook - Discharge Nozzle");
});

test("V7 Fire Alarm adapter derives only current Poor fields and keeps row evidence field-owned", () => {
  const definition = system("fire_alarm_detector");
  const adapter = resolveV7EvidenceContract({ systemKey: "fire_alarm_detector", templateId: masterServiceReportV7.id, templateVersion: 7, definition, contractSha256: v7EvidenceContractSha256(definition) });
  assert.ok(adapter);
  const rowUuid = "00000000-0000-4000-8000-000000000901";
  const good = { result: "good", remarks: "" } as const;
  const response = {
    chargerAndBatteries: { main_supply: { result: "not_good", remarks: "Own charger remark" }, battery: good, charger: good },
    mainFunctionKeys: { main_alarm_reset: good, lamp_test: good, evacuate: good, ac_supply: good, dc_supply: good, spka_system: good, alarm_lift_trip: good, signal_gas_discharge: good },
    secondaryAlarmDeviceRows: [{ rowUuid, alarmBell: "complete_repair", manualCallPoint: "na", fieldRemarks: { alarmBell: "Own bell remark" } }]
  };
  const paths = adapter.derivePoorFieldPaths(response);
  assert.deepEqual(paths, ["alarm_devices.alarm_device_rows.rows.00000000-0000-4000-8000-000000000901.alarm_bell", "charger_batteries.charger_battery_checks.main_supply"]);
  assert.equal(adapter.ownPoorRemark(response, paths![0]!), "Own bell remark");
  assert.equal(adapter.acceptedEvidenceCaption(paths![0]!), "Alarm Devices - Alarm Bell");
  const stale = structuredClone(response); stale.chargerAndBatteries.main_supply = { result: "good", remarks: "" };
  assert.deepEqual(adapter.derivePoorFieldPaths(stale), ["alarm_devices.alarm_device_rows.rows.00000000-0000-4000-8000-000000000901.alarm_bell"]);
});

test("V7 Hydrant adapter keeps all seven row columns, with row UUID paths and field-owned findings", () => {
  const definition = system("hydrant");
  const adapter = resolveV7EvidenceContract({ systemKey: "hydrant", templateId: masterServiceReportV7.id, templateVersion: 7, definition, contractSha256: v7EvidenceContractSha256(definition) });
  assert.ok(adapter);
  const columns = definition.sections.find((section) => section.key === "hydrant_set")!.blocks.find((block) => block.key === "hydrant_rows")!;
  assert.equal(columns.type, "repeatable_table");
  assert.deepEqual(columns.columns.filter((column) => column.key.endsWith("_1") || column.key.endsWith("_2") || ["diffuser_nozzle", "landing_valve", "landing_valve_handle", "hose_cabinet", "key_lock"].includes(column.key)).map((column) => column.allowedValues), Array.from({ length: 7 }, () => ["good", "not_good", "complete_repair", "na"]));
  const rowUuid = "00000000-0000-4000-8000-000000000902";
  const row = {
    rowUuid,
    canvasHose1Result: "not_good", canvasHose2Result: "good", diffuserNozzleResult: "na", landingValveResult: "complete_repair",
    landingValveHandleResult: "good", hoseCabinetResult: "na", keyLockResult: "good",
    fieldRemarks: { canvasHose1Result: "Canvas hose is leaking", landingValveResult: "Valve repaired on site" }
  };
  const response = { rows: [row] };
  const canvasPath = `hydrant_set.hydrant_rows.rows.${rowUuid}.canvas_hose_1`;
  const valvePath = `hydrant_set.hydrant_rows.rows.${rowUuid}.landing_valve`;
  assert.equal(adapter.isCanonicalFieldPath(canvasPath), true);
  assert.equal(adapter.isCanonicalFieldPath("hydrant_set.hydrant_rows.rows.not-a-uuid.canvas_hose_1"), false);
  assert.equal(adapter.isCanonicalFieldPath(`hydrant_set.hydrant_rows.rows.${rowUuid}.remarks`), false);
  assert.deepEqual(adapter.derivePoorFieldPaths(response), [canvasPath, valvePath]);
  assert.equal(adapter.ownPoorRemark(response, canvasPath), "Canvas hose is leaking");
  assert.equal(adapter.acceptedEvidenceCaption(valvePath), "Hydrant Set - Landing Valve");
  const stale = structuredClone(response); stale.rows[0]!.canvasHose1Result = "good"; stale.rows[0]!.landingValveResult = "na";
  assert.deepEqual(adapter.derivePoorFieldPaths(stale), []);
  const invalid = structuredClone(response); invalid.rows[0]!.canvasHose2Result = "poor";
  assert.equal(adapter.derivePoorFieldPaths(invalid), undefined);
});

test("V7 Hose Reel combines frozen checklist and row-scoped evidence without accepting stale findings", () => {
  const definition = system("hose_reel");
  const adapter = resolveV7EvidenceContract({ systemKey: "hose_reel", templateId: masterServiceReportV7.id, templateVersion: 7, definition, contractSha256: v7EvidenceContractSha256(definition) });
  assert.ok(adapter);
  const testRun = definition.sections.find((section) => section.key === "test_run_fire_pump_30_minutes")!;
  assert.deepEqual((testRun.blocks[0] as { items: Array<{ key: string; allowedValues: readonly string[] }> }).items.map((item) => [item.key, item.allowedValues]), [
    ["trfp_duty_pump", ["good", "not_good", "complete_repair", "na"]],
    ["trfp_standby_pump", ["good", "not_good", "complete_repair", "na"]]
  ]);
  const rowUuid = "00000000-0000-4000-8000-000000000903";
  const checklist = Object.fromEntries([
    "saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions",
    "pump_house_clean", "standby_pump_service_items", "charger_power_failure_alarm", "battery_serviceable", "pump_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions",
    "trfp_duty_pump", "trfp_standby_pump"
  ].map((key) => [key, { result: "good", remarks: "" }]));
  checklist.water_level = { result: "not_good", remarks: "Tank level needs attention" };
  checklist.trfp_duty_pump = { result: "complete_repair", remarks: "Duty pump repaired during test" };
  const response = {
    checklist,
    measurements: {
      jockey_pump_pressure: { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "good", remarks: "" },
      standby_pump_cut_in: { values: { value: 70 }, unit: "PSI", result: "na", remarks: "" }
    },
    rows: [{ rowUuid, drumResult: "na", hoseResult: "not_good", nozzleResult: "good", valveResult: "good", nozzleBoxResult: "good", fieldRemarks: { hoseResult: "Hose leaks under pressure" } }]
  };
  const waterPath = "hose_reel_checks.water_level";
  const dutyPath = "hose_reel_checks.trfp_duty_pump";
  const hosePath = `hose_reel_drum.hose_reel_rows.rows.${rowUuid}.hose`;
  assert.equal(adapter.isCanonicalFieldPath(waterPath), true);
  assert.equal(adapter.isCanonicalFieldPath(`hose_reel_drum.hose_reel_rows.rows.${rowUuid}.remarks`), false);
  assert.equal(adapter.isCanonicalFieldPath("hose_reel_checks.unknown"), false);
  assert.deepEqual(adapter.derivePoorFieldPaths(response), [hosePath, dutyPath, waterPath].sort());
  assert.equal(adapter.ownPoorRemark(response, dutyPath), "Duty pump repaired during test");
  assert.equal(adapter.ownPoorRemark(response, hosePath), "Hose leaks under pressure");
  assert.equal(adapter.acceptedEvidenceCaption(waterPath), "Water Tank - Water Level");
  assert.equal(adapter.acceptedEvidenceCaption(hosePath), "Hose Reel Drum - Hose");
  const stale = structuredClone(response); stale.checklist.water_level = { result: "na", remarks: "" }; stale.rows[0]!.hoseResult = "good";
  assert.deepEqual(adapter.derivePoorFieldPaths(stale), [dutyPath]);
  const invalid = structuredClone(response); invalid.rows[0]!.valveResult = "poor";
  assert.equal(adapter.derivePoorFieldPaths(invalid), undefined, "each frozen field validates against its own allowedValues");
});
