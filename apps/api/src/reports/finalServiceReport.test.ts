import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { readFileSync } from "node:fs";
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
import { resolveFireAlarmControls } from "../inspections/templates/fireAlarmDefinitionControls.js";

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
