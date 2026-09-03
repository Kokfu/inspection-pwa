import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../templates/masterServiceReportV7.js";
import { parseV7EvidenceManifest, resolveV7EvidenceContract, v7EvidenceContractSha256 } from "./v7EvidenceContracts.js";

const system = (key: "co2_fire_extinguisher" | "wet_chemical" | "fire_alarm_detector") => masterServiceReportV7.systems.find((candidate) => candidate.key === key)!;
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
