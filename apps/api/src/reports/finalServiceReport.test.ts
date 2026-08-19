import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { createFinalReportPdfHandler } from "../routes/inspectionJobs.js";
import { requireRole } from "../middleware/requireRole.js";
import { finalReportFontAssetPath, FinalReportError, loadFinalServiceReport, renderFinalServiceReportPdf } from "./finalServiceReport.js";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";
import { wetChemicalV4 } from "../inspections/templates/masterServiceReportV4.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";

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
  const pdf = await renderFinalServiceReportPdf(report);
  assert.equal(pdf.subarray(0, 5).toString("binary"), "%PDF-");
  assert.ok(pdf.length > 900);
  assert.equal(readFileSync(finalReportFontAssetPath).subarray(0, 4).toString("hex"), "00010000", "PDF report font is a TrueType SFNT, not a web WOFF/WOFF2 asset");
  assert.match(pdf.toString("latin1"), /\/FontFile2\b/);
  assert.match(pdf.toString("latin1"), /\/ToUnicode\b/);
  await loadFinalServiceReport(jobId, database as never);
  assert.equal(database.writes, 0, "report generation is read-only and idempotent");
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
