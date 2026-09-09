import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import type { Server } from "node:http";
import { createFinalReportPdfHandler } from "../routes/inspectionJobs.js";
import { requireRole } from "../middleware/requireRole.js";
import { deriveSystemCondition, finalReportFontAssetPath, FinalReportError, loadFinalServiceReport, renderFinalServiceReportPdf, sectionRemarkLines, type FinalReportSection, type FinalServiceReport } from "./finalServiceReport.js";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";
import { masterServiceReportV2 } from "../inspections/templates/masterServiceReportV2.js";
import { fireAlarmDetectorV3, masterServiceReportV3 } from "../inspections/templates/masterServiceReportV3.js";
import { masterServiceReportV4, wetChemicalV4 } from "../inspections/templates/masterServiceReportV4.js";
import { masterServiceReportV5 } from "../inspections/templates/masterServiceReportV5.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { validateCo2Responses } from "../sync/co2FormInstanceSync.js";
import { resolveFireAlarmControls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { createHash } from "node:crypto";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { resolveHoseReelControls } from "../inspections/templates/definitionControls.js";
import { applyLabelOverrides, collectResolvedLabelPaths } from "../inspections/labelOverrides.js";
import { parseV7EvidenceManifest, resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import sharp from "sharp";

const ids = Array.from({ length: 30 }, (_, index) => `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const jobId = ids[0]!;
const systems = [["co2_fire_extinguisher", "CO2"]] as const;
const co2Location = ids[20]!;
const co2Definition = masterServiceReportV1.systems.find((system) => system.key === "co2_fire_extinguisher")!;
const co2Controls = resolveCo2Controls(co2Definition, "MFE-FSSR", 1);
const checked = (items: typeof co2Controls.chargerAndBatteries) => Object.fromEntries(items.map((item) => [item.key, { result: item.result.options[0]!.value, remarks: "" }]));
const acceptedCo2Response = {
  controlPanelLocation: "Control Room", detectorRows: [{ rowUuid: ids[22], displaySequence: 1, alarmZone: "Zone A", location: "CO2 Room", heatDetectorStatus: co2Controls.detectorRows.heatDetector.result.options[0]!.value, smokeDetectorStatus: null, remarks: "" }],
  chargerAndBatteries: checked(co2Controls.chargerAndBatteries), physicalOutlook: checked(co2Controls.physicalOutlook), mainFunctionKeys: checked(co2Controls.mainFunctionKeys), comments: "Historical accepted response"
};
const configurationSnapshot = {
  schemaVersion: 1, customer: { id: ids[1], code: "ACME", displayName: "Acme Fire Safety" }, site: { id: ids[2], displayName: "Main Tower" },
  configuration: { revisionId: ids[25], revisionNumber: 1 }, template: { id: ids[26], code: "MFE-FSSR", name: "Master", version: 1 },
  enabledSystems: systems.map(([systemKey, displayName], index) => ({ enabledSystemId: ids[index + 3], systemKey, displayName, definitionStatus: "confirmed", sortOrder: index + 1, zones: [],
    locations: [{ id: co2Location, zoneId: null, key: "co2-room", displayName: "CO2 Room", sortOrder: 1 }] }))
};
const primary = (systemKey: string, clientUuid: string) => ({ system_key: systemKey, instance_key: "primary", zone_id: null, location_id: null, display_sequence: 1, client_uuid: clientUuid,
  evidence_policy_id: null, evidence_policy_version: null, evidence_policy_snapshot: null, evidence_policy_sha256: null, evidence_policy_matches: null,
  attachment_field_path: null, attachment_evidence_policy_id: null, attachment_mime_type: null, attachment_source_sha256: null, attachment_stored_sha256: null,
  attachment_source_size_bytes: null, attachment_stored_size_bytes: null, attachment_source_width: null, attachment_source_height: null, attachment_width: null, attachment_height: null });
function form(systemKey: string, clientUuid: string, locationId: string | null = null) {
  const system = configurationSnapshot.enabledSystems.find((item) => item.systemKey === systemKey)!;
  return { ...primary(systemKey, clientUuid), instance_key: locationId ? `location:${locationId}` : "primary", location_id: locationId, display_sequence: 1,
    master_template_version_id: ids[26], customer_configuration_revision_id: ids[25],
    inspection_snapshot: { schemaVersion: 1, acceptedAt: "2026-08-19T08:00:00.000Z", job: { id: jobId, reference: "SV/2026:08", title: "Main Tower" }, customer: configurationSnapshot.customer, configuration: configurationSnapshot.configuration, template: { id: ids[26], code: "MFE-FSSR", version: 1 }, system: { key: systemKey, displayName: "CO2", definition: co2Definition, resolvedControls: co2Controls, repetitionMode: "per_location" }, instance: { instanceKey: `location:${locationId}`, displaySequence: 1, zone: null, location: { id: locationId, key: "co2-room", displayName: "CO2 Room", sortOrder: 1 } } }, response_payload: acceptedCo2Response,
    stored_sha256: null, storage_relative_path: null, width: null, height: null };
}
const forms = systems.map(([systemKey], index) => form(systemKey, ids[index + 10]!, co2Location));
class Database {
  closed = true; writes = 0;
  async query(sql: string) {
    if (sql.includes("FROM inspection_jobs job")) return { rowCount: 1, rows: [{ id: jobId, status: this.closed ? "closed" : "open", configuration_snapshot: configurationSnapshot,
      completed_at: this.closed ? "2026-08-19T08:00:00.000Z" : null, completed_by_user_id: this.closed ? 7 : null, completed_by_username: null, completed_by_display_name: this.closed ? "inspector-one" : null,
      reference: "SV/2026:08", title: "Main Tower", service_date: "2026-08-19" }] };
    if (sql.includes("FROM master_system_form_instances instance")) return { rowCount: forms.length, rows: forms };
    throw new Error(`Unexpected query: ${sql}`);
  }
}

test("completed service visit report uses accepted server history, preserves per-location sections, and produces a valid PDF", async () => {
  const database = new Database();
  const report = await loadFinalServiceReport(jobId, database as never);
  assert.equal(report.customer, "Acme Fire Safety");
  assert.equal(report.site, "Main Tower");
  assert.equal(report.jobReference, "SV/2026:08");
  assert.equal(report.completedBy, "inspector-one");
  assert.equal(report.sections.length, 1);
  assert.equal(report.sections.find((section) => section.systemKey === "co2_fire_extinguisher")?.location?.locationLabel, "CO2 Room");
  assert.match(report.sections[0]!.fields.map((field) => field.value).join(" "), /Historical accepted response/);
  // Historical immutability, explicit (Sol P1): this fixture is a legacy
  // `schemaVersion === 1` CO2 accepted record. `v7DisplayLabelLookup` bails at its
  // first guard for `snapshot.schemaVersion !== 2`, so `flatten` runs with NO
  // `lookup` and every label is the raw prettified response key — the alias table
  // and the frozen/overridden definition wording never touch this path. Proven
  // two ways: the detector column renders as the prettified key, NOT its curated
  // "Heat Detector" wording, and the whole section shape is byte-pinned.
  assert.equal((forms[0] as { inspection_snapshot: { schemaVersion: number } }).inspection_snapshot.schemaVersion, 1);
  const legacyLabels = new Set(report.sections[0]!.fields.map((field) => field.label));
  assert.ok(legacyLabels.has("Detector Rows 1 - Heat Detector Status"), "legacy path prettifies the raw response key");
  assert.ok(!legacyLabels.has("Detector Rows 1 - Heat Detector"), "legacy path never applies the V7 curated detector wording");
  assert.equal(
    createHash("sha256").update(JSON.stringify(report.sections)).digest("hex"),
    "4204832f76dfd71e515b01615c90b6112a114980bd83148738c13014ef3d16ce",
    "legacy schemaVersion===1 CO2 report section shape is byte-identical (no 1a-iv / alias-table influence)"
  );
  // Derived "Summary of Testing" roll-up (DoD case c): an all-good/na system.
  assert.equal(report.systems[0]?.condition, "GOOD CONDITIONS");
  assert.equal(report.systems[0]?.conditionDetail, "");
  const pdf = await renderFinalServiceReportPdf(report);
  assert.equal(pdf.subarray(0, 5).toString("binary"), "%PDF-");
  assert.ok(pdf.length > 900);
  assert.equal(readFileSync(finalReportFontAssetPath).subarray(0, 4).toString("hex"), "00010000", "PDF report font is a TrueType SFNT, not a web WOFF/WOFF2 asset");
  assert.match(pdf.toString("latin1"), /\/FontFile2\b/);
  assert.match(pdf.toString("latin1"), /\/ToUnicode\b/);
  await loadFinalServiceReport(jobId, database as never);
  assert.equal(database.writes, 0, "report generation is read-only and idempotent");
});

test("historical Fire Alarm V3/V4/V5 accepted authority remains readable through the final-report and PDF path", async () => {
  for (const template of [masterServiceReportV3, masterServiceReportV4, masterServiceReportV5] as const) { const controls = resolveFireAlarmControls(fireAlarmDetectorV3, "MFE-FSSR", template.version); const historicalSystem = { enabledSystemId: ids[3]!, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System", definitionStatus: "confirmed", sortOrder: 1, zones: [], locations: [] }; const configuration = { schemaVersion: 1, customer: configurationSnapshot.customer, site: configurationSnapshot.site, configuration: { revisionId: ids[25]!, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "Master", version: template.version }, enabledSystems: [historicalSystem] }; const check = () => ({ result: "good", remarks: "" }); const response = { schemaVersion: 1, controlPanelLocation: "Historical panel", primaryDeviceRows: [{ rowUuid: ids[22]!, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", alarmZone: "Zone A", location: "Lobby", manualCallPoint: "normal", flowSwitch: "test", heatDetector: "isolation", smokeDetector: "normal", remarks: "Historical row remark" }], chargerAndBatteries: { main_supply: check(), battery: check(), charger: check() }, mainFunctionKeys: { main_alarm_reset: check(), lamp_test: check(), evacuate: check(), ac_supply: check(), dc_supply: check(), spka_system: check(), alarm_lift_trip: check(), signal_gas_discharge: check() }, secondaryAlarmDeviceRows: [], comments: "Historical Fire Alarm comments" }; const snapshot = { schemaVersion: 1, acceptedAt: "2026-08-19T08:00:00.000Z", job: { id: jobId, reference: "SV/2026:08", title: "Main Tower" }, customer: configuration.customer, configuration: configuration.configuration, template: { id: template.id, code: "MFE-FSSR", version: template.version }, system: { ...historicalSystem, definition: fireAlarmDetectorV3, resolvedControls: controls, repetitionMode: "single_with_two_repeatable_tables" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null } }; const row = { ...primary("fire_alarm_detector", ids[10]!), master_template_version_id: template.id, customer_configuration_revision_id: ids[25]!, inspection_snapshot: snapshot, response_payload: response, stored_sha256: null, storage_relative_path: null, width: null, height: null }; const database = { async query(sql: string) { if (sql.includes("FROM inspection_jobs job")) return { rowCount: 1, rows: [{ id: jobId, status: "closed", configuration_snapshot: configuration, completed_at: "2026-08-19T08:00:00.000Z", completed_by_user_id: 7, completed_by_username: null, completed_by_display_name: "inspector-one", reference: "SV/2026:08", title: "Main Tower", service_date: "2026-08-19" }] }; if (sql.includes("FROM master_system_form_instances instance")) return { rowCount: 1, rows: [row] }; throw new Error(`Unexpected query: ${sql}`); } }; const report = await loadFinalServiceReport(jobId, database as never); assert.equal(report.sections[0]?.systemKey, "fire_alarm_detector", `V${template.version} preserves frozen historical dispatch`); assert.equal(report.sections[0]?.fields.find((field) => field.label === "Control Panel Location")?.value, "Historical panel"); const pdf = await renderFinalServiceReportPdf(report); assert.equal(pdf.subarray(0, 5).toString(), "%PDF-"); }
});

test("historical V2 Dry/Wet Riser accepted authority remains readable through the final-report and PDF path", async () => {
  const definition = masterServiceReportV2.systems.find((system) => system.key === "dry_wet_riser")!; const locationId = ids[21]!, rowId = ids[22]!; const checks = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, { result: "good", remarks: "" }])); const system = { enabledSystemId: ids[3]!, systemKey: "dry_wet_riser", displayName: "Dry / Wet Riser System", definitionStatus: "confirmed", sortOrder: 1, definition, systemConfiguration: { riserMode: "dry" }, zones: [], locations: [{ id: locationId, zoneId: null, key: "outlet-a", displayName: "Outlet A", presetRowCount: 1, rowPreset: { assetReference: "DW-01" }, sortOrder: 1 }] }; const configuration = { schemaVersion: 1, customer: configurationSnapshot.customer, site: configurationSnapshot.site, configuration: { revisionId: ids[25]!, revisionNumber: 1 }, template: { id: masterServiceReportV2.id, code: "MFE-FSSR", name: "Master", version: 2 }, enabledSystems: [system] }; const responses = { schemaVersion: 1, mode: "dry", waterTank: checks(["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"]), pumpHouse: checks(["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"]), measurements: { jockeyCutIn: 10, jockeyCutOut: 11, dutyCutIn: 12, standbyCutIn: 13, unit: "PSI" }, riserOutlets: [{ rowUuid: rowId, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1, zoneSnapshot: null, locationSnapshot: { id: locationId, displayName: "Outlet A" }, assetReference: "DW-01", locationText: "Outlet A", canvasHoseAt2Result: "poor", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good", remarks: "Historical V2 poor outlet", sortOrder: 1 }], comments: "Historical V2 comments" }; const snapshot = { schemaVersion: 1, acceptedAt: "2026-08-19T08:00:00.000Z", job: { id: jobId, reference: "SV/2026:08", title: "Main Tower" }, customer: configuration.customer, configuration: configuration.configuration, template: { id: masterServiceReportV2.id, code: "MFE-FSSR", version: 2 }, system: { ...system, repetitionMode: "single_with_repeatable_rows" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null } }; const row = { ...primary("dry_wet_riser", ids[10]!), master_template_version_id: masterServiceReportV2.id, customer_configuration_revision_id: ids[25]!, inspection_snapshot: snapshot, response_payload: responses, stored_sha256: null, storage_relative_path: null, width: null, height: null }; const database = { async query(sql: string) { if (sql.includes("FROM inspection_jobs job")) return { rowCount: 1, rows: [{ id: jobId, status: "closed", configuration_snapshot: configuration, completed_at: "2026-08-19T08:00:00.000Z", completed_by_user_id: 7, completed_by_username: null, completed_by_display_name: "inspector-one", reference: "SV/2026:08", title: "Main Tower", service_date: "2026-08-19" }] }; if (sql.includes("FROM master_system_form_instances instance")) return { rowCount: 1, rows: [row] }; throw new Error(`Unexpected query: ${sql}`); } }; const report = await loadFinalServiceReport(jobId, database as never); assert.equal(report.sections[0]?.systemKey, "dry_wet_riser"); assert.match(report.sections[0]!.fields.map((field) => field.value).join(" "), /poor/i);
  // Derived "Summary of Testing" roll-up (DoD case d): a legacy schemaVersion-1 `poor` field -> FAILED.
  assert.equal(report.systems[0]?.condition, "FAILED");
  assert.match(report.systems[0]!.conditionDetail, /^.+: Poor$/);
  const pdf = await renderFinalServiceReportPdf(report); assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("open service visits and missing accepted results fail closed", async () => {
  const database = new Database(); database.closed = false;
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), (error: unknown) => error instanceof FinalReportError && error.code === "FINAL_REPORT_NOT_AVAILABLE");
  database.closed = true;
  const missing = forms.pop();
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), (error: unknown) => error instanceof FinalReportError && error.code === "FINAL_REPORT_DATA_INVALID");
  if (missing) forms.push(missing);
});

test("empty, malformed, or mismatched accepted historical content fails closed", async () => {
  const database = new Database(); const original = forms[0]!;
  forms[0] = { ...original, response_payload: {} as never };
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), FinalReportError);
  forms[0] = { ...original, response_payload: { schemaVersion: 2, overallResult: "good" } as never };
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), FinalReportError);
  forms[0] = { ...original, inspection_snapshot: { ...original.inspection_snapshot, template: { ...configurationSnapshot.template, id: ids[27] } } };
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), FinalReportError);
  forms[0] = { ...original, inspection_snapshot: { ...original.inspection_snapshot, system: { ...original.inspection_snapshot.system, resolvedControls: { corrupt: true } as never } } };
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), FinalReportError);
  forms[0] = { ...original, inspection_snapshot: { ...original.inspection_snapshot, instance: { ...original.inspection_snapshot.instance, location: { ...original.inspection_snapshot.instance.location, displayName: "Forged CO2 room" } } } };
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), FinalReportError);
  forms[0] = { ...original, inspection_snapshot: { ...original.inspection_snapshot, system: { ...original.inspection_snapshot.system, definition: { ...co2Definition, displayName: "Corrupt CO2 contract" } } } };
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), FinalReportError);
  forms[0] = original;
});

test("CO2 reports reject isolated frozen template-version and configuration-revision-number corruption", async () => {
  const database = new Database(); const original = forms[0]!;
  forms[0] = { ...original, inspection_snapshot: { ...original.inspection_snapshot, template: { ...original.inspection_snapshot.template, version: 2 } } };
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), FinalReportError);
  forms[0] = { ...original, inspection_snapshot: { ...original.inspection_snapshot, configuration: { ...original.inspection_snapshot.configuration, revisionNumber: 2 } } };
  await assert.rejects(() => loadFinalServiceReport(jobId, database as never), FinalReportError);
  forms[0] = original;
});

test("Wet Chemical reports require frozen definition, controls, and accepted location authority", async () => {
  const definition = wetChemicalV4;
  const controls = resolveCo2Controls(definition, "MFE-FSSR", 4);
  const zoneId = ids[3]!, locationId = ids[4]!;
  const wetSystem = { enabledSystemId: ids[5], systemKey: "wet_chemical", displayName: "Wet Chemical System", definitionStatus: "confirmed", sortOrder: 1,
    zones: [{ id: zoneId, key: "kitchen", displayName: "Kitchen", sortOrder: 1 }],
    locations: [{ id: locationId, zoneId, key: "hood", displayName: "Kitchen Hood", sortOrder: 1 }] };
  const checklist = (items: typeof controls.chargerAndBatteries) => Object.fromEntries(items.map((item) => [item.key, { result: item.result.options[0]!.value, remarks: "" }]));
  const response = { controlPanelLocation: "Kitchen Panel", detectorRows: [{ rowUuid: ids[22], displaySequence: 1, alarmZone: "Kitchen", location: "Kitchen Hood", heatDetectorStatus: controls.detectorRows.heatDetector.result.options[0]!.value, smokeDetectorStatus: null, remarks: "" }], chargerAndBatteries: checklist(controls.chargerAndBatteries), physicalOutlook: checklist(controls.physicalOutlook), mainFunctionKeys: checklist(controls.mainFunctionKeys), comments: "Historical Wet Chemical response" };
  const snapshot = { schemaVersion: 1, acceptedAt: "2026-08-19T08:00:00.000Z", job: { id: jobId, reference: "SV/2026:08", title: "Main Tower" }, customer: configurationSnapshot.customer, configuration: configurationSnapshot.configuration, template: { id: ids[26], code: "MFE-FSSR", version: 4 }, system: { key: "wet_chemical", displayName: "Wet Chemical System", definition, resolvedControls: controls, repetitionMode: "per_location" }, instance: { instanceKey: `location:${locationId}`, displaySequence: 1, zone: wetSystem.zones[0], location: { id: locationId, key: "hood", displayName: "Kitchen Hood", sortOrder: 1 } } };
  const row = { ...primary("wet_chemical", ids[10]!), instance_key: `location:${locationId}`, zone_id: zoneId, location_id: locationId, display_sequence: 1, master_template_version_id: ids[26]!, customer_configuration_revision_id: ids[25]!, inspection_snapshot: snapshot, response_payload: response, stored_sha256: null, storage_relative_path: null, width: null, height: null };
  const configuration = { ...configurationSnapshot, template: { ...configurationSnapshot.template, version: 4 }, enabledSystems: [wetSystem] };
  const database = { async query(sql: string) {
    if (sql.includes("FROM inspection_jobs job")) return { rowCount: 1, rows: [{ id: jobId, status: "closed", configuration_snapshot: configuration, completed_at: "2026-08-19T08:00:00.000Z", completed_by_user_id: 7, completed_by_username: null, completed_by_display_name: "inspector-one", reference: "SV/2026:08", title: "Main Tower", service_date: "2026-08-19" }] };
    if (sql.includes("FROM master_system_form_instances instance")) return { rowCount: 1, rows: [row] };
    throw new Error(`Unexpected query: ${sql}`);
  } };
  await loadFinalServiceReport(jobId, database as never);
  for (const corrupt of [
    { ...row, inspection_snapshot: { ...snapshot, system: { ...snapshot.system, definition: { ...definition, displayName: "Corrupt Wet Chemical contract" } } } },
    { ...row, inspection_snapshot: { ...snapshot, system: { ...snapshot.system, resolvedControls: { corrupt: true } as never } } },
    { ...row, inspection_snapshot: { ...snapshot, instance: { ...snapshot.instance, zone: { ...snapshot.instance.zone, displayName: "Forged kitchen" } } } },
    { ...row, inspection_snapshot: { ...snapshot, template: { ...snapshot.template, version: 5 } } },
    { ...row, inspection_snapshot: { ...snapshot, configuration: { ...snapshot.configuration, revisionNumber: 2 } } }
  ]) {
    const corruptDatabase = { ...database, async query(sql: string) { if (sql.includes("FROM inspection_jobs job")) return database.query(sql); if (sql.includes("FROM master_system_form_instances instance")) return { rowCount: 1, rows: [corrupt] }; throw new Error(`Unexpected query: ${sql}`); } };
    await assert.rejects(() => loadFinalServiceReport(jobId, corruptDatabase as never), FinalReportError);
  }
});

test("final-report PDF route requires authentication and returns a safe PDF download", async () => {
  const database = new Database(); const app = express();
  app.use((request, _response, next) => { if (request.headers["x-test-auth"] === "inspector") request.currentUser = { id: 7, username: "inspector-one", role: "inspector" }; next(); });
  app.get("/inspection-jobs/:jobId/final-report.pdf", requireRole("admin", "inspector"), createFinalReportPdfHandler({ database: database as never }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
  try {
    const unauthenticated = await fetch(`http://127.0.0.1:${address.port}/inspection-jobs/${jobId}/final-report.pdf`);
    assert.equal(unauthenticated.status, 401);
    const authenticated = await fetch(`http://127.0.0.1:${address.port}/inspection-jobs/${jobId}/final-report.pdf`, { headers: { "x-test-auth": "inspector" } });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.headers.get("content-type"), "application/pdf");
    assert.match(authenticated.headers.get("content-disposition") ?? "", /^attachment; filename="Service-Report_SV-2026-08_2026-08-19\.pdf"$/);
    assert.equal((await authenticated.arrayBuffer()).byteLength > 900, true);
  } finally { await new Promise<void>((resolve, reject) => (server as Server).close((error) => error ? reject(error) : resolve())); }
});

const conditionSection = (fields: Array<{ label: string; value: string }>): FinalReportSection =>
  ({ systemKey: "system", label: "System", fields: fields.map((field) => ({ ...field, depth: 0 })), evidence: [] });

test("derived Summary of Testing condition maps the 4-state and legacy result models onto the client 3-state roll-up", () => {
  // (a) any not_good -> FAILED; conditionDetail is the first Not Good/Poor finding.
  assert.deepEqual(
    deriveSystemCondition([conditionSection([{ label: "Cabinet", value: "Good" }, { label: "Hose", value: "Not Good" }, { label: "Nozzle", value: "Complete Repair" }])]),
    { condition: "FAILED", conditionDetail: "Hose: Not Good" }
  );
  // (b) only complete_repair (no not_good/poor) -> REFER DETAIL PAGE.
  assert.deepEqual(
    deriveSystemCondition([conditionSection([{ label: "Valve", value: "Good" }, { label: "Gauge", value: "Complete Repair" }])]),
    { condition: "REFER DETAIL PAGE", conditionDetail: "Gauge: Complete Repair" }
  );
  // (c) only good / N.A. / Not Relevant -> GOOD CONDITIONS, empty detail, no finding.
  assert.deepEqual(
    deriveSystemCondition([conditionSection([{ label: "Cylinder", value: "Good" }, { label: "Seal", value: "No Need Checking / N.A." }, { label: "Label", value: "Not Relevant" }])]),
    { condition: "GOOD CONDITIONS", conditionDetail: "" }
  );
  // (d) legacy schemaVersion-1 `poor` -> FAILED.
  assert.deepEqual(
    deriveSystemCondition([conditionSection([{ label: "Canvas Hose", value: "Poor" }])]),
    { condition: "FAILED", conditionDetail: "Canvas Hose: Poor" }
  );
  // Sol P1-1: the detail tracks the FINAL condition's worst severity, not the first finding seen.
  // A "Not Good" in a LATER section escalates REFER -> FAILED and the detail becomes that Not Good,
  // not the earlier Complete Repair.
  assert.deepEqual(
    deriveSystemCondition([conditionSection([{ label: "Unit A Gauge", value: "Complete Repair" }]), conditionSection([{ label: "Unit B Hose", value: "Not Good" }])]),
    { condition: "FAILED", conditionDetail: "Unit B Hose: Not Good" }
  );
  // A "Not Good" BEFORE a "Complete Repair" -> the detail is the Not Good either way (worst wins).
  assert.deepEqual(
    deriveSystemCondition([conditionSection([{ label: "Hose", value: "Not Good" }, { label: "Gauge", value: "Complete Repair" }])]),
    { condition: "FAILED", conditionDetail: "Hose: Not Good" }
  );
  // The failed detail is the FIRST Not Good/Poor across all sections, in scan order.
  assert.deepEqual(
    deriveSystemCondition([conditionSection([{ label: "Unit A Hose", value: "Not Good" }]), conditionSection([{ label: "Unit B Hose", value: "Not Good" }])]),
    { condition: "FAILED", conditionDetail: "Unit A Hose: Not Good" }
  );
  // conditionDetail is hard-capped at 200 chars; a system with no sections is GOOD CONDITIONS,
  // and so is a section that carries no fields (Sol noted this has no direct regression).
  assert.equal(deriveSystemCondition([conditionSection([{ label: "L".repeat(500), value: "Not Good" }])]).conditionDetail.length, 200);
  assert.deepEqual(deriveSystemCondition([]), { condition: "GOOD CONDITIONS", conditionDetail: "" });
  assert.deepEqual(deriveSystemCondition([conditionSection([])]), { condition: "GOOD CONDITIONS", conditionDetail: "" });
});

test("sectionRemarkLines folds each finding's OWN remark by label structure, never by adjacency", () => {
  // Rule 1 — Fire Alarm: `${label} Remark` sibling.
  assert.deepEqual(
    sectionRemarkLines(conditionSection([
      { label: "Charger & Batteries - Main Supply", value: "Not Good" },
      { label: "Charger & Batteries - Main Supply Remark", value: "Supply dead" }
    ])),
    ["1. Charger & Batteries - Main Supply: Not Good — Supply dead"]
  );
  // Rule 2 — V7 flat checklist: `<x> - Result` pairs with `<x> - Remarks` sibling.
  assert.deepEqual(
    sectionRemarkLines(conditionSection([
      { label: "Water Tank - Saj Main Water Supply - Result", value: "Not Good" },
      { label: "Water Tank - Saj Main Water Supply - Remarks", value: "Valve seized" }
    ])),
    ["1. Water Tank - Saj Main Water Supply - Result: Not Good — Valve seized"]
  );
  // Rule 3 — V7 repeatable row: the finding's own `fieldRemarks` entry flattens NON-ADJACENTLY as
  // "<head> - Field Remarks - <tail>". A non-empty ROW-LEVEL "Rows 1 - Remarks" sitting between the
  // finding and its owned remark must NOT be folded; the owned one MUST be.
  assert.deepEqual(
    sectionRemarkLines(conditionSection([
      { label: "Rows 1 - Canvas Hose1Result", value: "Not Good" },
      { label: "Rows 1 - Canvas Hose2Result", value: "Good" },
      { label: "Rows 1 - Key Lock Result", value: "Good" },
      { label: "Rows 1 - Remarks", value: "row-level free text" },
      { label: "Rows 1 - Field Remarks - Canvas Hose1Result", value: "Canvas hose damaged" },
      { label: "Rows 1 - Sort Order", value: "1" }
    ])),
    ["1. Rows 1 - Canvas Hose1Result: Not Good — Canvas hose damaged"]
  );
  // Two consecutive findings each get their OWN remark.
  assert.deepEqual(
    sectionRemarkLines(conditionSection([
      { label: "Rows 1 - Canvas Hose1Result", value: "Not Good" },
      { label: "Rows 1 - Landing Valve Result", value: "Complete Repair" },
      { label: "Rows 1 - Field Remarks - Canvas Hose1Result", value: "Hose split" },
      { label: "Rows 1 - Field Remarks - Landing Valve Result", value: "Valve repaired on site" }
    ])),
    [
      "1. Rows 1 - Canvas Hose1Result: Not Good — Hose split",
      "2. Rows 1 - Landing Valve Result: Complete Repair — Valve repaired on site"
    ]
  );
  // A finding with no remark field anywhere -> no " — remark" suffix.
  assert.deepEqual(
    sectionRemarkLines(conditionSection([{ label: "Duty Pump", value: "Complete Repair" }])),
    ["1. Duty Pump: Complete Repair"]
  );
  // An empty-string remark sibling does not count -> no suffix.
  assert.deepEqual(
    sectionRemarkLines(conditionSection([
      { label: "Rows 1 - Auto Result", value: "Not Good" },
      { label: "Rows 1 - Field Remarks - Auto Result", value: "   " }
    ])),
    ["1. Rows 1 - Auto Result: Not Good"]
  );
  // No finding -> no lines (caller renders no "Remarks:" heading).
  assert.deepEqual(sectionRemarkLines(conditionSection([{ label: "Cabinet", value: "Good" }])), []);
});

/**
 * Recovers the human-readable text from a PDFKit-rendered report. PDFKit 0.17
 * writes embedded-subset-font text as `<hex>` glyph-id runs inside Tj/TJ, which
 * is why a raw grep of the PDF never finds "Summary of Testing". This reverses
 * it: inflate every FlateDecode stream, parse the `/ToUnicode` CMap
 * (beginbfchar / beginbfrange) into glyph-id -> string, then map every `<hex>`
 * run in the content streams back through it.
 */
function extractPdfText(pdf: Buffer): string {
  const latin1 = pdf.toString("latin1");
  const streams: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(latin1)) !== null) {
    const preamble = latin1.slice(Math.max(0, match.index - 400), match.index);
    let body = Buffer.from(match[1]!, "latin1");
    if (/\/FlateDecode/.test(preamble)) { try { body = zlib.inflateSync(body); } catch { continue; } }
    streams.push(body.toString("latin1"));
  }
  const utf16 = (hex: string) => { let out = ""; for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return out; };
  const key = (code: number) => code.toString(16).toLowerCase().padStart(4, "0");
  const toUnicode = new Map<string, string>();
  const contentStreams: string[] = [];
  for (const stream of streams) {
    if (/beginbfchar|beginbfrange/.test(stream)) {
      for (const block of stream.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
        for (const pair of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
          toUnicode.set(pair[1]!.toLowerCase().padStart(4, "0"), utf16(pair[2]!));
        }
      }
      for (const block of stream.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
        // Array form:  <start> <end> [ <d0> <d1> ... ]  (one destination per code)
        for (const row of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
          const start = parseInt(row[1]!, 16);
          const entries = [...row[3]!.matchAll(/<([0-9A-Fa-f]+)>/g)].map((entry) => utf16(entry[1]!));
          entries.forEach((value, offset) => toUnicode.set(key(start + offset), value));
        }
        // Range form:  <start> <end> <dstStart>  (contiguous destinations). Strip the array-form
        // `[ ... ]` payloads first so their inner <hex> entries are not misread as range triples.
        for (const row of block.replace(/\[[\s\S]*?\]/g, " ").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
          const start = parseInt(row[1]!, 16), end = parseInt(row[2]!, 16), dst = parseInt(row[3]!, 16);
          for (let code = start; code <= end && code - start < 0x10000; code += 1) toUnicode.set(key(code), String.fromCodePoint(dst + (code - start)));
        }
      }
    } else if (/\bTj\b|\bTJ\b/.test(stream)) {
      contentStreams.push(stream);
    }
  }
  let text = "";
  for (const stream of contentStreams) {
    for (const run of stream.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = run[1]!;
      for (let i = 0; i + 4 <= hex.length; i += 4) text += toUnicode.get(hex.slice(i, i + 4).toLowerCase()) ?? "";
    }
  }
  return text;
}

test("Summary of Testing PDF block renders numbered per-system conditions and per-section Remarks", async () => {
  const report: FinalServiceReport = {
    customer: "Cond Customer", site: "Cond Site", serviceDate: "2026-09-07", jobReference: "SV-COND-1",
    completedAt: "2026-09-07T00:00:00.000Z", completedBy: "inspector-one",
    systems: [
      { systemKey: "hydrant", label: "Hydrant System", status: "Accepted", condition: "FAILED", conditionDetail: "Hose: Not Good", locations: ["Gate A"] },
      { systemKey: "hose_reel", label: "Hose Reel System", status: "Accepted", condition: "REFER DETAIL PAGE", conditionDetail: "Pump: Complete Repair", locations: ["Primary inspection"] },
      { systemKey: "co2_fire_extinguisher", label: "CO2 System", status: "Accepted", condition: "GOOD CONDITIONS", conditionDetail: "", locations: ["CO2 Room"] }
    ],
    sections: [
      { systemKey: "hydrant", label: "Hydrant System", fields: [{ label: "Cabinet", value: "Good", depth: 0 }, { label: "Hose", value: "Not Good", depth: 0 }, { label: "Hose Remark", value: "Perished", depth: 1 }], evidence: [] },
      { systemKey: "hose_reel", label: "Hose Reel System", fields: [{ label: "Duty Pump", value: "Complete Repair", depth: 0 }], evidence: [] },
      { systemKey: "co2_fire_extinguisher", label: "CO2 System", fields: [{ label: "Cylinder", value: "Good", depth: 0 }], evidence: [] }
    ]
  };
  const pdf = await renderFinalServiceReportPdf(report);
  assert.equal(pdf.subarray(0, 5).toString("binary"), "%PDF-");
  assert.ok(pdf.length > 900);
  // DoD case (a): the Summary-of-Testing line and the finding's owned "Remarks:" block are
  // PROVEN in the rendered PDF, decoded back through the embedded font's /ToUnicode CMap.
  const rendered = extractPdfText(pdf);
  assert.ok(rendered.includes("Summary of Testing"), "PDF carries the Summary of Testing heading");
  assert.ok(rendered.includes("1. Hydrant System — FAILED"), "numbered per-system FAILED line");
  assert.ok(rendered.includes("Remarks:"), "per-section Remarks block heading");
  assert.ok(rendered.includes("Perished"), "the Hydrant finding's OWN remark text is folded into the Remarks line");
  assert.ok(rendered.includes("1. Hose: Not Good — Perished"), "Remarks line = finding + its own remark");
  // DoD case (c): a clean (no-finding) system emits no "Remarks:" block at all.
  const clean: FinalServiceReport = {
    ...report,
    systems: report.systems.map((system) => ({ ...system, condition: "GOOD CONDITIONS" as const, conditionDetail: "" })),
    sections: report.sections.map((section) => ({ ...section, fields: section.fields.map((field) => ({ ...field, value: field.value === "Not Good" || field.value === "Complete Repair" ? "Good" : field.value })) }))
  };
  const cleanPdf = await renderFinalServiceReportPdf(clean);
  assert.equal(cleanPdf.subarray(0, 5).toString("binary"), "%PDF-");
  assert.ok(!extractPdfText(cleanPdf).includes("Remarks:"), "no finding anywhere -> no Remarks block");
  // Secondary: the findings + conditionDetail lines still add measurable rendered content.
  assert.ok(pdf.length > cleanPdf.length, "Remarks blocks + conditionDetail lines add rendered content beyond the clean report");
});

/* ------------------------------------------------------------------------- *
 * Slice 1a-iv — the Final Report + PDF now render the FROZEN definition
 * wording and the job's FROZEN per-customer display-label overrides for the
 * four override systems, instead of prettifying the raw response key.
 * ------------------------------------------------------------------------- */

const sprinklerV7Definition = masterServiceReportV7.systems.find((system) => system.key === "automatic_sprinkler")!;
const sprinklerV7TemplateId = masterServiceReportV7.id;
const sprinklerV7Controls = resolveAutomaticSprinklerControls(sprinklerV7Definition, "MFE-FSSR", 7);
const sprinklerV7ContractSha256 = v7EvidenceContractSha256(sprinklerV7Definition);

function sprinklerV7ReportDatabase(labelOverrides?: Record<string, string>) {
  const revisionId = ids[25]!;
  const checklistItems = [
    ...sprinklerV7Controls.checklist.waterTank, ...sprinklerV7Controls.checklist.pumpHouse,
    ...sprinklerV7Controls.checklist.mainAlarmValve, ...(sprinklerV7Controls.checklist.testRunFirePump ?? [])
  ];
  const response = {
    schemaVersion: 2,
    checklist: Object.fromEntries(checklistItems.map((item) => [item.key, { result: "good", remarks: "" }])),
    measurements: Object.fromEntries(sprinklerV7Controls.measurements.map((row) => [row.key, {
      values: Object.fromEntries(row.values.map((value) => [value.key, 10])), unit: "PSI", result: "good", remarks: ""
    }])),
    comments: ""
  };
  const enabledSystem = {
    enabledSystemId: ids[3]!, systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler System",
    definitionStatus: "confirmed", sortOrder: 1, zones: [], locations: [],
    ...(labelOverrides ? { labelOverrides } : {})
  };
  const configuration = {
    schemaVersion: 1, customer: { id: ids[1], code: "ACME", displayName: "Acme Fire Safety" },
    site: { id: ids[2], displayName: "Main Tower" }, configuration: { revisionId, revisionNumber: 1 },
    template: { id: sprinklerV7TemplateId, code: "MFE-FSSR", name: "Master", version: 7 },
    enabledSystems: [enabledSystem]
  };
  const snapshot = {
    schemaVersion: 2, acceptedAt: "2026-08-19T08:00:00.000Z",
    job: { id: jobId, reference: "SV/2026:08", title: "Main Tower" },
    customer: configuration.customer, configuration: configuration.configuration,
    template: { id: sprinklerV7TemplateId, code: "MFE-FSSR", version: 7 },
    system: {
      key: "automatic_sprinkler", systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler System",
      definition: sprinklerV7Definition, repetitionMode: "single"
    },
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null },
    contractSha256: sprinklerV7ContractSha256, evidenceManifest: []
  };
  const row = {
    ...primary("automatic_sprinkler", ids[10]!), master_template_version_id: sprinklerV7TemplateId,
    customer_configuration_revision_id: revisionId, inspection_snapshot: snapshot, response_payload: response,
    stored_sha256: null, storage_relative_path: null, width: null, height: null
  };
  return {
    async query(sql: string) {
      if (sql.includes("FROM inspection_jobs job")) return { rowCount: 1, rows: [{ id: jobId, status: "closed", configuration_snapshot: configuration, completed_at: "2026-08-19T08:00:00.000Z", completed_by_user_id: 7, completed_by_username: null, completed_by_display_name: "inspector-one", reference: "SV/2026:08", title: "Main Tower", service_date: "2026-08-19" }] };
      if (sql.includes("FROM master_system_form_instances instance")) return { rowCount: 1, rows: [row] };
      if (sql.includes("staged_inspection_evidence")) return { rowCount: 0, rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

test("V7 Automatic Sprinkler final report renders frozen definition wording, not the prettified response key", async () => {
  const report = await loadFinalServiceReport(jobId, sprinklerV7ReportDatabase() as never);
  const labels = new Set(report.sections[0]!.fields.map((field) => field.label));
  // Definition wording reaches the report: "trfp_jockey_pump" -> "Jockey Pump", not "Trfp Jockey Pump".
  assert.ok(labels.has("Checklist - Jockey Pump - Result"));
  assert.ok(!report.sections[0]!.fields.some((field) => field.label.includes("Trfp Jockey Pump")));
  // A curated label from the frozen definition's own map, not a key prettification.
  assert.ok(labels.has("Checklist - S.A.J Main Water Supply - Result"));
  assert.ok(!report.sections[0]!.fields.some((field) => field.label.includes("Saj Main Water Supply")));
  // The structural " - Result" / " - Remarks" suffix pairs survive (sectionRemarkLines depends on them).
  for (const field of report.sections[0]!.fields) {
    if (field.label.endsWith(" - Result")) {
      assert.ok(labels.has(`${field.label.slice(0, -" - Result".length)} - Remarks`), `${field.label} keeps its Remarks sibling`);
    }
  }
  // The generic measurement value key `value` resolves to two different definition
  // labels, so it is dropped from the lookup and prettifies exactly as before.
  assert.ok(labels.has("Measurements - Correct Duty Pump Cut In - Values - Value"));
});

test("V7 Automatic Sprinkler final report with NO frozen override map is stable (pinned report-section digest)", async () => {
  const report = await loadFinalServiceReport(jobId, sprinklerV7ReportDatabase() as never);
  // Pin the full report-section shape (labels, values, depths, evidence). Any
  // drift in the 1a-iv label pipeline for a no-override V7 sprinkler job trips
  // this deliberately. PDFKit stamps a random `/ID` so the PDF is not
  // byte-stable; its CONTENT is asserted through the decoded text below.
  assert.equal(
    createHash("sha256").update(JSON.stringify(report.sections)).digest("hex"),
    "2e415ad2857dfd76e221772a5994979f98a74409048ce70ca61454ccd159f356"
  );
  // The PDF renders `section.fields[].label` verbatim, so the pinned digest above
  // already fixes its business content; PDFKit's embedded-subset glyph IDs are not
  // reversible enough to assert the exact label strings out of the PDF bytes.
  const pdf = await renderFinalServiceReportPdf(report);
  assert.equal(pdf.subarray(0, 5).toString("binary"), "%PDF-");
  assert.ok(pdf.length > 900);
});

test("V7 Automatic Sprinkler override renames exactly one field; every sibling label is byte-identical", async () => {
  const base = await loadFinalServiceReport(jobId, sprinklerV7ReportDatabase() as never);
  const renamed = await loadFinalServiceReport(
    jobId,
    sprinklerV7ReportDatabase({ "checklist.testRunFirePump.trfp_jockey_pump": "Fire Pump Jockey (annual)" }) as never
  );
  assert.equal(renamed.sections.length, base.sections.length);
  assert.equal(renamed.sections[0]!.fields.length, base.sections[0]!.fields.length);
  let changed = 0;
  for (const [index, field] of base.sections[0]!.fields.entries()) {
    const after = renamed.sections[0]!.fields[index]!;
    // value and depth NEVER move — labels only.
    assert.equal(after.value, field.value, `field ${index} value unchanged`);
    assert.equal(after.depth, field.depth, `field ${index} depth unchanged`);
    if (after.label === field.label) continue;
    changed += 1;
    // The ONLY labels allowed to move are the renamed field's own Result / Remarks rows.
    assert.ok(field.label === "Checklist - Jockey Pump - Result" || field.label === "Checklist - Jockey Pump - Remarks", `unexpected label change at ${index}: ${field.label}`);
    assert.equal(after.label, field.label.replace("Jockey Pump", "Fire Pump Jockey (annual)"));
  }
  assert.equal(changed, 2, "exactly the renamed field's Result and Remarks rows changed");
  // Every other section-field label is byte-identical to the no-override report.
  const unchangedBase = base.sections[0]!.fields.filter((field) => !field.label.startsWith("Checklist - Jockey Pump - "));
  const unchangedRenamed = renamed.sections[0]!.fields.filter((field) => !field.label.startsWith("Checklist - Fire Pump Jockey (annual) - "));
  assert.deepEqual(unchangedRenamed, unchangedBase);
  // The PDF changes, and only because the renamed label is longer text.
  const basePdf = await renderFinalServiceReportPdf(base);
  const renamedPdf = await renderFinalServiceReportPdf(renamed);
  assert.ok(!basePdf.equals(renamedPdf), "the rename reaches the PDF");
  assert.ok(renamedPdf.length > basePdf.length, "the only content delta is the longer renamed label");
});

/* ------------------------------------------------------------------------- *
 * V7 response-key aliases.  These systems deliberately serialize a handful
 * of resolved control keys under contract-specific response names.
 * ------------------------------------------------------------------------- */

const hoseReelV7Definition = masterServiceReportV7.systems.find((system) => system.key === "hose_reel")!;
const hoseReelV7Controls = resolveHoseReelControls(hoseReelV7Definition, "MFE-FSSR", 7);
// Frozen JSON in PostgreSQL cannot carry TypeScript's `undefined` properties.
const co2V7Definition = JSON.parse(JSON.stringify(masterServiceReportV7.systems.find((system) => system.key === "co2_fire_extinguisher")!)) as typeof masterServiceReportV7.systems[number];
const co2V7Controls = resolveCo2Controls(co2V7Definition, "MFE-FSSR", 7);
const wetChemicalV7Definition = JSON.parse(JSON.stringify(masterServiceReportV7.systems.find((system) => system.key === "wet_chemical")!)) as typeof masterServiceReportV7.systems[number];
const wetChemicalV7Controls = resolveCo2Controls(wetChemicalV7Definition, "MFE-FSSR", 7);

function v7AliasReportDatabase(
  systemKey: "hose_reel" | "co2_fire_extinguisher" | "wet_chemical",
  definition: typeof hoseReelV7Definition | typeof co2V7Definition | typeof wetChemicalV7Definition,
  response: Record<string, unknown>,
  labelOverrides?: Record<string, string>,
  evidenceRows: Array<{ field_path: string; stored_sha256: string; storage_relative_path: string; width: number; height: number }> = []
) {
  const revisionId = ids[25]!;
  const isSuppression = systemKey !== "hose_reel";
  const suppressionControls = systemKey === "wet_chemical" ? wetChemicalV7Controls : co2V7Controls;
  const displayName = systemKey === "hose_reel" ? "Hose Reel System" : systemKey === "wet_chemical" ? "Wet Chemical System" : "CO2 System";
  const location = isSuppression ? { id: co2Location, zoneId: null, key: "co2-room", displayName: "CO2 Room", sortOrder: 1 } : undefined;
  const enabledSystem = {
    enabledSystemId: ids[3]!, systemKey, displayName,
    definitionStatus: "confirmed", sortOrder: 1, zones: [], locations: location ? [location] : [],
    ...(labelOverrides ? { labelOverrides } : {})
  };
  const configuration = {
    schemaVersion: 1, customer: { id: ids[1]!, code: "ACME", displayName: "Acme Fire Safety" }, site: { id: ids[2]!, displayName: "Main Tower" },
    configuration: { revisionId, revisionNumber: 1 }, template: { id: masterServiceReportV7.id, code: "MFE-FSSR", name: "Master", version: 7 }, enabledSystems: [enabledSystem]
  };
  const instanceKey = location ? `location:${location.id}` : "primary";
  const locationSnapshot = location ? { id: location.id, key: location.key, displayName: location.displayName, sortOrder: location.sortOrder } : null;
  const authority = {
    schemaVersion: 2, acceptedAt: "2026-08-19T08:00:00.000Z", job: { id: jobId, reference: "SV/2026:08", title: "Main Tower" },
    customer: configuration.customer, configuration: configuration.configuration, template: { id: masterServiceReportV7.id, code: "MFE-FSSR", version: 7 }, instance: { instanceKey, displaySequence: 1, zone: null, location: locationSnapshot }
  };
  const snapshot = isSuppression
    ? { ...authority, system: { key: systemKey, displayName, definition, resolvedControls: suppressionControls, repetitionMode: "per_location" } }
    : { ...authority, system: { key: systemKey, systemKey, displayName, definition, repetitionMode: "single_with_repeatable_rows" }, contractSha256: v7EvidenceContractSha256(definition), evidenceManifest: evidenceRows.map((item, index) => ({ photoUuid: ids[index + 23]!, fieldPath: item.field_path, sourceSha256: "a".repeat(64) })) };
  const row = {
    ...primary(systemKey, ids[10]!), form_instance_id: ids[24]!, instance_key: instanceKey, location_id: location?.id ?? null,
    master_template_version_id: masterServiceReportV7.id, customer_configuration_revision_id: revisionId, inspection_snapshot: snapshot, response_payload: response,
    stored_sha256: null, storage_relative_path: null, width: null, height: null
  };
  return {
    async query(sql: string) {
      if (sql.includes("FROM inspection_jobs job")) return { rowCount: 1, rows: [{ id: jobId, status: "closed", configuration_snapshot: configuration, completed_at: "2026-08-19T08:00:00.000Z", completed_by_user_id: 7, completed_by_username: null, completed_by_display_name: "inspector-one", reference: "SV/2026:08", title: "Main Tower", service_date: "2026-08-19" }] };
      if (sql.includes("FROM master_system_form_instances instance")) return { rowCount: 1, rows: [row] };
      if (sql.includes("staged_inspection_evidence")) return { rowCount: evidenceRows.length, rows: evidenceRows };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

function hoseReelV7Response(hoseResult = "good") {
  const checklistItems = [...hoseReelV7Controls.checklist.waterTank, ...hoseReelV7Controls.checklist.pumpHouse, ...hoseReelV7Controls.checklist.testRunFirePump];
  const rowUuid = ids[22]!;
  return {
    schemaVersion: 3,
    checklist: Object.fromEntries(checklistItems.map((item) => [item.key, { result: "good", remarks: "" }])),
    measurements: Object.fromEntries(hoseReelV7Controls.measurements.map((item) => [item.key, { values: Object.fromEntries(item.values.map((value) => [value.key, 10])), unit: "PSI", result: "good", remarks: "" }])),
    drumCount: 1,
    rows: [{ rowUuid, source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: "Lobby", assetReference: null, sortOrder: 1, drumType: "swing", drumResult: "good", hoseResult, nozzleResult: "good", valveResult: "good", nozzleBoxResult: "good", remarks: "", fieldRemarks: hoseResult === "good" ? {} : { hoseResult: "Hose is perished" } }],
    comments: ""
  };
}

/** Shared CO2 / Wet Chemical V7 accepted response — same resolved-controls shape,
 * different per-system checklist keys.  Both detector columns are
 * `normal_test_isolation_multi`, so the response serializes them as arrays. */
function suppressionV7Response(controls: typeof co2V7Controls) {
  const checklist = (items: typeof controls.chargerAndBatteries) => Object.fromEntries(items.map((item) => [item.key, { result: "good", remarks: "" }]));
  return {
    controlPanelLocation: "Control Room",
    detectorRows: [{ rowUuid: ids[22]!, displaySequence: 1, alarmZone: "Zone A", location: "CO2 Room", heatDetectorStatus: ["normal"], smokeDetectorStatus: ["normal"], remarks: "" }],
    chargerAndBatteries: checklist(controls.chargerAndBatteries), physicalOutlook: checklist(controls.physicalOutlook), mainFunctionKeys: checklist(controls.mainFunctionKeys), comments: ""
  };
}
const co2V7Response = () => suppressionV7Response(co2V7Controls);

test("V7 Hose Reel response aliases keep a mismatched field label and its bound-evidence caption in lockstep", async () => {
  const uploadsPath = await mkdtemp(path.join(tmpdir(), "phase8e-hose-report-"));
  const previousUploadsPath = process.env.UPLOADS_PATH;
  process.env.UPLOADS_PATH = uploadsPath;
  try {
    const content = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).jpeg().toBuffer();
    const digest = createHash("sha256").update(content).digest("hex");
    const relative = "inspections/hose/evidence.jpg";
    await mkdir(path.join(uploadsPath, "inspections", "hose"), { recursive: true });
    await writeFile(path.join(uploadsPath, ...relative.split("/")), content);
    const fieldPath = `hose_reel_drum.hose_reel_rows.rows.${ids[22]}.hose`;
    const evidenceRows = [{ field_path: fieldPath, stored_sha256: digest, storage_relative_path: relative, width: 2, height: 2 }];
    const adapter = resolveV7EvidenceContract({ systemKey: "hose_reel", templateId: masterServiceReportV7.id, templateVersion: 7, definition: hoseReelV7Definition, contractSha256: v7EvidenceContractSha256(hoseReelV7Definition) });
    assert.ok(adapter && parseV7EvidenceManifest([{ photoUuid: ids[23]!, fieldPath, sourceSha256: "a".repeat(64) }], adapter, hoseReelV7Response("not_good")));
    // Freeze `repeatableRows.resultColumns.hose = "Flexible Hose"`; accept one row with
    // `hoseResult: "not_good"` and one bound accepted photo on `…rows.<uuid>.hose`.
    const base = await loadFinalServiceReport(jobId, v7AliasReportDatabase("hose_reel", hoseReelV7Definition, hoseReelV7Response("not_good"), undefined, evidenceRows) as never);
    const renamed = await loadFinalServiceReport(jobId, v7AliasReportDatabase("hose_reel", hoseReelV7Definition, hoseReelV7Response("not_good"), { "repeatableRows.resultColumns.hose": "Flexible Hose" }, evidenceRows) as never);
    // Sol P1 re-pin: post-1a-iv definition-wording baseline for a no-override V7 job — NOT
    // equal to the pre-alias prettified output ("Rows 1 - Hose Result"); the alias table
    // intentionally extends 1a-iv's definition-wording behaviour to the key-mismatched fields.
    assert.equal(createHash("sha256").update(JSON.stringify(base.sections)).digest("hex"), "75e80bc4bbd4a943a316051ab86de0975a38e11a027bd7d8334abd9c62f7649f");

    // The `hose` result column flattens under the `hoseResult` response key. The label
    // EXISTS in both reports — assert it directly, never gated on "if it changed".
    const baseHoseField = base.sections[0]!.fields.find((field) => field.value === "Not Good" && field.label === "Rows 1 - Hose");
    assert.ok(baseHoseField, "no-override job renders the frozen definition wording 'Hose'");
    const renamedHoseField = renamed.sections[0]!.fields.find((field) => field.value === "Not Good" && field.label === "Rows 1 - Flexible Hose");
    assert.ok(renamedHoseField, "overridden job renders the flattened row column as 'Rows 1 - Flexible Hose'");

    // The bound-evidence caption moves in lockstep with the field label.
    assert.equal(base.sections[0]!.evidence[0]?.caption, "Hose Reel Drum - Hose");
    assert.equal(renamed.sections[0]!.evidence[0]?.caption, "Hose Reel Drum - Flexible Hose");

    // EXACT changed-label set: the `hoseResult` result column AND its own `fieldRemarks`
    // entry (both carry the aliased segment) — and nothing else. value/depth never move.
    assert.equal(renamed.sections[0]!.fields.length, base.sections[0]!.fields.length);
    const changedIndexes: number[] = [];
    for (const [index, before] of base.sections[0]!.fields.entries()) {
      const after = renamed.sections[0]!.fields[index]!;
      assert.equal(after.value, before.value, `field ${index} value unmoved`);
      assert.equal(after.depth, before.depth, `field ${index} depth unmoved`);
      if (after.label !== before.label) changedIndexes.push(index);
    }
    assert.deepEqual(
      changedIndexes.map((index) => [base.sections[0]!.fields[index]!.label, renamed.sections[0]!.fields[index]!.label]),
      [
        ["Rows 1 - Hose", "Rows 1 - Flexible Hose"],
        ["Rows 1 - Field Remarks - Hose", "Rows 1 - Field Remarks - Flexible Hose"]
      ]
    );
    // Per-field (not substring) equality of the entire untouched subset.
    const untouched = (fields: FinalReportSection["fields"]) => fields.filter((_, index) => !changedIndexes.includes(index));
    assert.deepEqual(untouched(renamed.sections[0]!.fields), untouched(base.sections[0]!.fields));

    // A mutation that registers the alias into the definition map but NOT the display
    // map fails here twice over: the no-override base digest moves (the `hose` column
    // falls back to the prettified "Hose Result"), and the exact changed-label set
    // collapses to [] because base and renamed would both prettify identically.
  } finally {
    if (previousUploadsPath === undefined) delete process.env.UPLOADS_PATH; else process.env.UPLOADS_PATH = previousUploadsPath;
    await rm(uploadsPath, { recursive: true, force: true });
  }
});

test("V7 CO2 response aliases apply frozen detector wording without moving any sibling field", async () => {
  // The V7 CO2 evidence contract (`co2AdapterFields`) carries only checklist paths —
  // the detector columns are `normal_test_isolation_multi`, never Poor-capable, so
  // there is NO detector-row evidence path. This proves the field-label side only.
  assert.ok(validateCo2Responses(co2V7Response(), co2V7Controls));
  assert.equal(collectResolvedLabelPaths(applyLabelOverrides(co2V7Controls, { "detectorRows.heatDetector": "Heat Sensor" })).find((entry) => entry.key === "heat_detector")?.definitionLabel, "Heat Sensor");
  const adapter = resolveV7EvidenceContract({ systemKey: "co2_fire_extinguisher", templateId: masterServiceReportV7.id, templateVersion: 7, definition: co2V7Definition, contractSha256: v7EvidenceContractSha256(co2V7Definition) });
  assert.deepEqual(adapter?.derivePoorFieldPaths(co2V7Response()), []);
  const base = await loadFinalServiceReport(jobId, v7AliasReportDatabase("co2_fire_extinguisher", co2V7Definition, co2V7Response()) as never);
  const renamed = await loadFinalServiceReport(jobId, v7AliasReportDatabase("co2_fire_extinguisher", co2V7Definition, co2V7Response(), { "detectorRows.heatDetector": "Heat Sensor" }) as never);
  // Sol P1 re-pin: post-1a-iv definition-wording baseline for a no-override V7 job — NOT
  // equal to the pre-alias prettified output ("Detector Rows 1 - Heat Detector Status 1");
  // the alias table intentionally extends 1a-iv's definition-wording behaviour to the
  // key-mismatched detector columns.
  assert.equal(createHash("sha256").update(JSON.stringify(base.sections)).digest("hex"), "dd2e04e001e6caaafadc6bf3a3fdc8dcea3d72f75ced0de2b1976bd38d8dc1f1");
  // The frozen heat-detector wording reaches the no-override report verbatim.
  assert.ok(base.sections[0]!.fields.some((field) => field.label === "Detector Rows 1 - Heat Detector"));
  let changed = 0;
  for (const [index, before] of base.sections[0]!.fields.entries()) {
    const after = renamed.sections[0]!.fields[index]!;
    assert.equal(after.value, before.value, `field ${index} value is unchanged`);
    assert.equal(after.depth, before.depth, `field ${index} depth is unchanged`);
    if (after.label !== before.label) {
      changed += 1;
      assert.equal(before.label, "Detector Rows 1 - Heat Detector");
      assert.equal(after.label, "Detector Rows 1 - Heat Sensor");
    }
  }
  assert.equal(changed, 1, "only the heat-detector response-key alias is renamed");
  const untouched = (fields: FinalReportSection["fields"]) =>
    fields.filter((field) => field.label !== "Detector Rows 1 - Heat Detector" && field.label !== "Detector Rows 1 - Heat Sensor");
  assert.deepEqual(untouched(renamed.sections[0]!.fields), untouched(base.sections[0]!.fields));
});

test("V7 Wet Chemical response aliases move the second-detector column to the frozen override; siblings byte-identical", async () => {
  // The Wet Chemical V7 evidence contract (`wetChemicalAdapterFields`) carries only
  // checklist paths — the detector columns are `normal_test_isolation_multi`, never
  // Poor-capable, so there is NO detector-row evidence path. Like the CO2 case, this
  // proves the field-label side only.
  assert.ok(validateCo2Responses(suppressionV7Response(wetChemicalV7Controls), wetChemicalV7Controls));
  // Wet Chemical's second source column is deliberately preserved under the V1 field
  // key `unconfirmed_second_heat_detector` (NOT normalised to `smoke_detector`); its
  // response key is still `smokeDetectorStatus`. The alias table bridges the two.
  assert.equal(
    collectResolvedLabelPaths(applyLabelOverrides(wetChemicalV7Controls, { "detectorRows.smokeDetector": "Deep Fryer Heat Probe" })).find((entry) => entry.key === "unconfirmed_second_heat_detector")?.definitionLabel,
    "Deep Fryer Heat Probe"
  );
  const adapter = resolveV7EvidenceContract({ systemKey: "wet_chemical", templateId: masterServiceReportV7.id, templateVersion: 7, definition: wetChemicalV7Definition, contractSha256: v7EvidenceContractSha256(wetChemicalV7Definition) });
  assert.deepEqual(adapter?.derivePoorFieldPaths(suppressionV7Response(wetChemicalV7Controls)), []);
  const base = await loadFinalServiceReport(jobId, v7AliasReportDatabase("wet_chemical", wetChemicalV7Definition, suppressionV7Response(wetChemicalV7Controls)) as never);
  const renamed = await loadFinalServiceReport(jobId, v7AliasReportDatabase("wet_chemical", wetChemicalV7Definition, suppressionV7Response(wetChemicalV7Controls), { "detectorRows.smokeDetector": "Deep Fryer Heat Probe" }) as never);
  // Sol P1 re-pin: post-1a-iv definition-wording baseline for a no-override V7 job — NOT
  // equal to the pre-alias prettified output ("Detector Rows 1 - Smoke Detector Status 1");
  // the alias table intentionally extends 1a-iv's definition-wording behaviour to the
  // key-mismatched second-detector column.
  assert.equal(createHash("sha256").update(JSON.stringify(base.sections)).digest("hex"), "49472a8e38d01b461afeb4be08d807c40baf408d6b484680f857dc9430b42875");
  // The frozen second-detector wording reaches the no-override report verbatim.
  assert.ok(base.sections[0]!.fields.some((field) => field.label === "Detector Rows 1 - Heat Detector (Second Source Column - Unconfirmed)"));
  let changed = 0;
  for (const [index, before] of base.sections[0]!.fields.entries()) {
    const after = renamed.sections[0]!.fields[index]!;
    assert.equal(after.value, before.value, `field ${index} value is unchanged`);
    assert.equal(after.depth, before.depth, `field ${index} depth is unchanged`);
    if (after.label !== before.label) {
      changed += 1;
      assert.equal(before.label, "Detector Rows 1 - Heat Detector (Second Source Column - Unconfirmed)");
      assert.equal(after.label, "Detector Rows 1 - Deep Fryer Heat Probe");
    }
  }
  assert.equal(changed, 1, "only the second-detector response-key alias is renamed; every sibling label byte-identical");
  const untouched = (fields: FinalReportSection["fields"]) =>
    fields.filter((field) => !field.label.includes("Second Source Column") && !field.label.includes("Deep Fryer Heat Probe"));
  assert.deepEqual(untouched(renamed.sections[0]!.fields), untouched(base.sections[0]!.fields));
});
