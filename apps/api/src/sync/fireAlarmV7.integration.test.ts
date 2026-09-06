import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../db/migrations.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { closeInspectionJob } from "../jobs/jobCompletion.js";
import { loadFinalServiceReport, renderFinalServiceReportPdf } from "../reports/finalServiceReport.js";
import { acceptFireAlarmV7Inspection } from "./fireAlarmV7Acceptance.js";
import { masterSystemInspectionsRouter } from "../routes/masterSystemInspections.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID(); const timestamp = "2026-09-02T00:00:00.000Z";
const result = (value: "good" | "not_good" | "complete_repair" | "na", remarks = "") => ({ result: value, remarks });

test("Fire Alarm V7 accepts frozen current-Poor evidence, retries after closure, and PDF-embeds accepted image", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl }); const isolationLock = await database.connect(); await isolationLock.query("SELECT pg_advisory_lock(819276)"); const uploads = path.join(tmpdir(), `phase8f-fire-alarm-v7-${id()}`); process.env.UPLOADS_PATH = uploads;
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fire_alarm_detector'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id(); const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fire-v7-${id()}`])).rows[0]!.id; const foreign = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fire-v7-foreign-${id()}`])).rows[0]!.id; const admin = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','admin') RETURNING id", [`fire-v7-admin-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Fire Alarm V7',false)", [customer, `FA-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_alarm_detector',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System", sortOrder: 5, definitionStatus: "confirmed", zones: [], locations: [] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `FA-${customer}`, displayName: "Fire Alarm V7" }, site: { id: id(), displayName: "Fire Alarm V7 Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Fire Alarm V7','open',false,true,$4,$5,$6,'2026-09-02')", [job, template.id, `FA-${job}`, customer, revision, snapshot]);
    const photoUuid = id(); const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().toBuffer(); const sourceSha256 = createHash("sha256").update(image).digest("hex"); const relative = `inspections/${clientUuid}/${photoUuid}.jpg`; await mkdir(path.dirname(path.join(uploads, ...relative.split("/"))), { recursive: true }); await writeFile(path.join(uploads, ...relative.split("/")), image);
    const contract = v7EvidenceContractSha256(template.definition); await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3,7,$4,$5)", [clientUuid, job, template.id, contract, actor]);
    await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'fire_alarm_detector','charger_batteries.charger_battery_checks.battery',$4,7,$5,$6,$7,$8,$8,'image/jpeg',$9,2,2,$9,2,2,$10,'staged')", [photoUuid, clientUuid, job, template.id, contract, actor, createHash("sha256").update(`stage:${photoUuid}`).digest("hex"), sourceSha256, image.length, relative]);
    const response = { schemaVersion: 2, controlPanelLocation: "Lobby", primaryDeviceRows: [{ rowUuid: id(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", alarmZone: "Lobby", location: "Lobby", manualCallPoint: ["normal", "test"], flowSwitch: ["test"], heatDetector: ["isolation"], smokeDetector: ["normal"], remarks: "" }], chargerAndBatteries: { main_supply: result("good"), battery: result("not_good", "Battery requires replacement"), charger: result("na") }, mainFunctionKeys: { main_alarm_reset: result("good"), lamp_test: result("good"), evacuate: result("good"), ac_supply: result("good"), dc_supply: result("good"), spka_system: result("good"), alarm_lift_trip: result("good"), signal_gas_discharge: result("good") }, secondaryAlarmDeviceRows: [], comments: "V7 Fire Alarm" };
    const item = { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "fire_alarm_detector", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: timestamp, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses: response, evidenceManifest: [{ photoUuid, fieldPath: "charger_batteries.charger_battery_checks.battery", sourceSha256 }], performedAt: timestamp } };
    const accepted = await acceptFireAlarmV7Inspection(item, actor); assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
    const reorderedRetry = structuredClone(item); reorderedRetry.operationId = id(); reorderedRetry.payload.responses.primaryDeviceRows[0].manualCallPoint = ["test", "normal"];
    assert.deepEqual((await acceptFireAlarmV7Inspection(reorderedRetry, actor)).duplicateIds, [clientUuid], "a reordered V7 detector-state retry is normalized to the accepted authority");
    assert.deepEqual((await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE photo_uuid=$1", [photoUuid])).rows.map((row) => row.status), ["accepted"]);
    const app = express(); app.use((request, _response, next) => { const mode = request.header("x-test-actor"); request.currentUser = mode === "foreign" ? { id: foreign, username: "foreign", role: "inspector" } : mode === "admin" ? { id: admin, username: "admin", role: "admin" } : { id: actor, username: "fire-v7", role: "inspector" }; next(); }); app.use(masterSystemInspectionsRouter); const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    try { const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/fire-alarm-inspections/${clientUuid}`; const detail = await fetch(origin); assert.equal(detail.status, 200, "Accepted Detail resolves the frozen V7 authority"); assert.equal((await fetch(origin, { headers: { "x-test-actor": "foreign" } })).status, 404, "a different inspector cannot read Fire Alarm V7 accepted detail"); assert.equal((await fetch(origin, { headers: { "x-test-actor": "admin" } })).status, 200, "admin can read Fire Alarm V7 accepted detail"); await database.query("UPDATE inspection_jobs SET technician_visible=false WHERE id=$1", [job]); assert.equal((await fetch(origin)).status, 200, "owner retains accepted detail after the job is hidden"); assert.equal((await fetch(origin, { headers: { "x-test-actor": "admin" } })).status, 200, "admin retains accepted detail after the job is hidden"); await database.query("UPDATE inspection_jobs SET technician_visible=true WHERE id=$1", [job]); } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    const probe = structuredClone(item); probe.operationId = id(); probe.entityId = id(); probe.payload.clientUuid = probe.entityId; await database.query("UPDATE inspection_jobs SET technician_visible=false WHERE id=$1", [job]); const hiddenFailure = (await acceptFireAlarmV7Inspection(probe, actor)).failed[0]; const unknown = structuredClone(probe); unknown.payload.jobId = id(); const unknownFailure = (await acceptFireAlarmV7Inspection(unknown, actor)).failed[0]; await database.query("UPDATE inspection_jobs SET technician_visible=true WHERE id=$1", [job]); const closed = await closeInspectionJob(job, { id: actor, username: "fire-v7" }, database as never); assert.equal(closed.kind, "closed"); assert.deepEqual((await acceptFireAlarmV7Inspection(item, actor)).duplicateIds, [clientUuid], "exact retry succeeds after closure"); const closedFailure = (await acceptFireAlarmV7Inspection(probe, actor)).failed[0]; assert.deepEqual(hiddenFailure, closedFailure, "hidden and closed new V7 requests share one failure response"); assert.deepEqual(unknownFailure, closedFailure, "unknown and closed new V7 requests share one failure response");
    const report = await loadFinalServiceReport(job, database); const section = report.sections.find((value) => value.systemKey === "fire_alarm_detector")!; assert.equal(section.evidence.length, 1); assert.equal(section.evidence[0]!.content.equals(image), true); const pdf = await renderFinalServiceReportPdf(report); assert.equal(pdf.includes(image), true, "accepted Fire Alarm V7 JPEG is embedded in PDF");
  } finally { await isolationLock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); isolationLock.release(); await database.end(); await rm(uploads, { recursive: true, force: true }); }
});

// G7: the case above never submitted `complete_repair`, never carried a
// secondary alarm-device row, and never reused one image across two findings —
// the exact shape the owner's browser run failed on, which acceptance then
// reported as "This V7 inspection is unavailable".
test("Fire Alarm V7 accepts complete_repair and alarm-device row evidence, and names a reused photo", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl }); const isolationLock = await database.connect(); await isolationLock.query("SELECT pg_advisory_lock(819276)"); const uploads = path.join(tmpdir(), `phase8f-fire-alarm-v7-4state-${id()}`); process.env.UPLOADS_PATH = uploads;
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fire_alarm_detector'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id(), alarmRow = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fire-v7-4state-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Fire Alarm V7 4-state',false)", [customer, `FA4-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_alarm_detector',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System", sortOrder: 5, definitionStatus: "confirmed", zones: [], locations: [] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `FA4-${customer}`, displayName: "Fire Alarm V7 4-state" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Fire Alarm V7 4-state','open',false,true,$4,$5,$6,'2026-09-04')", [job, template.id, `FA4-${job}`, customer, revision, snapshot]);
    const contract = v7EvidenceContractSha256(template.definition);
    await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3,7,$4,$5)", [clientUuid, job, template.id, contract, actor]);
    // Two visually different JPEGs: the accepted path needs distinct bytes per finding.
    const stage = async (fieldPath: string, colour: "red" | "blue") => {
      const photoUuid = id(); const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: colour } }).jpeg().toBuffer();
      const sourceSha256 = createHash("sha256").update(image).digest("hex"); const relative = `inspections/${clientUuid}/${photoUuid}.jpg`;
      await mkdir(path.dirname(path.join(uploads, ...relative.split("/"))), { recursive: true }); await writeFile(path.join(uploads, ...relative.split("/")), image);
      await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'fire_alarm_detector',$4,$5,7,$6,$7,$8,$9,$9,'image/jpeg',$10,2,2,$10,2,2,$11,'staged')", [photoUuid, clientUuid, job, fieldPath, template.id, contract, actor, createHash("sha256").update(`stage:${photoUuid}`).digest("hex"), sourceSha256, image.length, relative]);
      return { photoUuid, fieldPath, sourceSha256, image };
    };
    const repairPhoto = await stage("main_function_key.function_checks.main_alarm_reset", "red");
    const bellPath = `alarm_devices.alarm_device_rows.rows.${alarmRow}.alarm_bell`;
    const bellPhoto = await stage(bellPath, "blue");
    const secondaryRow = { rowUuid: alarmRow, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", location: "Level 2 Corridor", alarmBell: "complete_repair", manualCallPoint: "na", remarks: "", fieldRemarks: { alarmBell: "Bell rewired and retested on site" } };
    const response = { schemaVersion: 2, controlPanelLocation: "Lobby", primaryDeviceRows: [{ rowUuid: id(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", alarmZone: "Lobby", location: "Lobby", manualCallPoint: ["normal"], flowSwitch: ["normal"], heatDetector: ["normal"], smokeDetector: ["normal"], remarks: "" }], chargerAndBatteries: { main_supply: result("good"), battery: result("na"), charger: result("good") }, mainFunctionKeys: { main_alarm_reset: result("complete_repair", "Reset board replaced"), lamp_test: result("good"), evacuate: result("good"), ac_supply: result("good"), dc_supply: result("good"), spka_system: result("good"), alarm_lift_trip: result("good"), signal_gas_discharge: result("good") }, secondaryAlarmDeviceRows: [secondaryRow], comments: "" };
    const manifest = [repairPhoto, bellPhoto].map((photo) => ({ photoUuid: photo.photoUuid, fieldPath: photo.fieldPath, sourceSha256: photo.sourceSha256 }));
    const envelope = (responses: unknown, evidenceManifest: unknown, uuidValue = clientUuid) => ({ operationId: id(), entityType: "masterSystemInspection", entityId: uuidValue, action: "create", payload: { clientUuid: uuidValue, jobId: job, systemKey: "fire_alarm_detector", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: timestamp, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses, evidenceManifest, performedAt: timestamp } });

    // A reused photo must be refused by name, and must never read as a Job problem.
    const reused = (await acceptFireAlarmV7Inspection(envelope(response, [manifest[0], { ...manifest[1], sourceSha256: manifest[0]!.sourceSha256 }]), actor)).failed[0];
    assert.equal(reused?.code, "VALIDATION_ERROR", JSON.stringify(reused));
    assert.match(String(reused?.message), /same image is attached to more than one finding/);

    // A finding without its own remark is still refused, and still not as a Job problem.
    const unremarked = structuredClone(response); unremarked.secondaryAlarmDeviceRows[0]!.fieldRemarks = { alarmBell: "   " };
    const missingRemark = (await acceptFireAlarmV7Inspection(envelope(unremarked, manifest), actor)).failed[0];
    assert.equal(missingRemark?.code, "VALIDATION_ERROR", JSON.stringify(missingRemark));

    const accepted = await acceptFireAlarmV7Inspection(envelope(response, manifest), actor);
    assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
    assert.deepEqual((await database.query<{ field_path: string; status: string }>("SELECT field_path,status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows,
      [{ field_path: bellPath, status: "accepted" }, { field_path: "main_function_key.function_checks.main_alarm_reset", status: "accepted" }],
      "complete_repair evidence on both a checklist field and an alarm-device row is accepted");
    const stored = (await database.query<{ response_payload: { mainFunctionKeys: Record<string, { result: string }>; chargerAndBatteries: Record<string, { result: string }>; secondaryAlarmDeviceRows: Array<{ alarmBell: string; manualCallPoint: string }> } }>("SELECT response_payload FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0]!.response_payload;
    assert.equal(stored.mainFunctionKeys.main_alarm_reset!.result, "complete_repair");
    assert.equal(stored.chargerAndBatteries.battery!.result, "na");
    assert.equal(stored.secondaryAlarmDeviceRows[0]!.alarmBell, "complete_repair");
    assert.equal(stored.secondaryAlarmDeviceRows[0]!.manualCallPoint, "na");
  } finally { await isolationLock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); isolationLock.release(); await database.end(); await rm(uploads, { recursive: true, force: true }); }
});

// A fully clean draft (every field Good/Normal, nothing repaired or missing)
// never stages a photo, so it never gets a reservation row. Acceptance must
// not require one when the frozen evidence manifest is empty.
test("Fire Alarm V7 accepts a fully clean draft with zero findings and no reservation", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl }); const isolationLock = await database.connect(); await isolationLock.query("SELECT pg_advisory_lock(819276)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fire_alarm_detector'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fire-v7-clean-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Fire Alarm V7 Clean',false)", [customer, `FAC-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_alarm_detector',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System", sortOrder: 5, definitionStatus: "confirmed", zones: [], locations: [] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `FAC-${customer}`, displayName: "Fire Alarm V7 Clean" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Fire Alarm V7 Clean','open',false,true,$4,$5,$6,'2026-09-05')", [job, template.id, `FAC-${job}`, customer, revision, snapshot]);
    const response = { schemaVersion: 2, controlPanelLocation: "Lobby", primaryDeviceRows: [{ rowUuid: id(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", alarmZone: "Lobby", location: "Lobby", manualCallPoint: ["normal"], flowSwitch: ["normal"], heatDetector: ["normal"], smokeDetector: ["normal"], remarks: "" }], chargerAndBatteries: { main_supply: result("good"), battery: result("good"), charger: result("good") }, mainFunctionKeys: { main_alarm_reset: result("good"), lamp_test: result("good"), evacuate: result("good"), ac_supply: result("good"), dc_supply: result("good"), spka_system: result("good"), alarm_lift_trip: result("good"), signal_gas_discharge: result("good") }, secondaryAlarmDeviceRows: [], comments: "" };
    const item = { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "fire_alarm_detector", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: timestamp, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses: response, evidenceManifest: [], performedAt: timestamp } };
    const accepted = await acceptFireAlarmV7Inspection(item, actor);
    assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
  } finally { await isolationLock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); isolationLock.release(); await database.end(); }
});

// G10 — the accepted snapshot stores the PARSED (fieldPath-sorted) manifest, but a
// retry carries whatever order the client sent and the API accepts any order.  An
// unsorted-but-identical retry must still be duplicate success, not
// IDEMPOTENCY_CONFLICT — after Job closure that is unrecoverable for the technician.
// Proven to fail against the old positional comparison: reverting the one-line
// `sameManifest` swap in `fireAlarmV7Acceptance.ts` makes the first retry
// assertion below fail with IDEMPOTENCY_CONFLICT (the `alarm_devices…` path sorts
// before `main_function_key…`, so the reverse-order retry never matches positionally).
test("Fire Alarm V7 exact retry with an unsorted manifest is still duplicate success", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl }); const isolationLock = await database.connect(); await isolationLock.query("SELECT pg_advisory_lock(819276)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fire_alarm_detector'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id(), alarmRow = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fire-v7-unsorted-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Fire Alarm V7 Unsorted',false)", [customer, `FAU-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_alarm_detector',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System", sortOrder: 5, definitionStatus: "confirmed", zones: [], locations: [] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `FAU-${customer}`, displayName: "Fire Alarm V7 Unsorted" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Fire Alarm V7 Unsorted','open',false,true,$4,$5,$6,'2026-09-05')", [job, template.id, `FAU-${job}`, customer, revision, snapshot]);
    const contract = v7EvidenceContractSha256(template.definition);
    await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3,7,$4,$5)", [clientUuid, job, template.id, contract, actor]);
    // Acceptance never reads the file — a staged row with distinct hashes is enough.
    const stage = async (fieldPath: string, bytes: string) => {
      const photoUuid = id(), sourceSha256 = createHash("sha256").update(bytes).digest("hex");
      await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'fire_alarm_detector',$4,$5,7,$6,$7,$8,$9,$9,'image/jpeg',1,2,2,1,2,2,$10,'staged')", [photoUuid, clientUuid, job, fieldPath, template.id, contract, actor, createHash("sha256").update(`stage:${photoUuid}`).digest("hex"), sourceSha256, `fixtures/${photoUuid}.jpg`]);
      return { photoUuid, fieldPath, sourceSha256 };
    };
    const repairPhoto = await stage("main_function_key.function_checks.main_alarm_reset", "A");
    const bellPhoto = await stage(`alarm_devices.alarm_device_rows.rows.${alarmRow}.alarm_bell`, "B");
    // "alarm_devices…" sorts before "main_function_key…"; submit the reverse.
    const unsorted = [repairPhoto, bellPhoto];
    assert.ok(unsorted[0]!.fieldPath.localeCompare(unsorted[1]!.fieldPath) > 0, "fixture must actually be unsorted");
    const secondaryRow = { rowUuid: alarmRow, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", location: "Level 2 Corridor", alarmBell: "complete_repair", manualCallPoint: "na", remarks: "", fieldRemarks: { alarmBell: "Bell rewired and retested on site" } };
    const response = { schemaVersion: 2, controlPanelLocation: "Lobby", primaryDeviceRows: [{ rowUuid: id(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", alarmZone: "Lobby", location: "Lobby", manualCallPoint: ["normal"], flowSwitch: ["normal"], heatDetector: ["normal"], smokeDetector: ["normal"], remarks: "" }], chargerAndBatteries: { main_supply: result("good"), battery: result("na"), charger: result("good") }, mainFunctionKeys: { main_alarm_reset: result("complete_repair", "Reset board replaced"), lamp_test: result("good"), evacuate: result("good"), ac_supply: result("good"), dc_supply: result("good"), spka_system: result("good"), alarm_lift_trip: result("good"), signal_gas_discharge: result("good") }, secondaryAlarmDeviceRows: [secondaryRow], comments: "" };
    const envelope = (evidenceManifest: unknown) => ({ operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "fire_alarm_detector", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: timestamp, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses: response, evidenceManifest, performedAt: timestamp } });
    const manifest = unsorted.map((photo) => ({ photoUuid: photo.photoUuid, fieldPath: photo.fieldPath, sourceSha256: photo.sourceSha256 }));

    assert.deepEqual((await acceptFireAlarmV7Inspection(envelope(manifest), actor)).acceptedIds, [clientUuid], "first submit accepts");

    const retry = await acceptFireAlarmV7Inspection(envelope(manifest), actor);
    assert.deepEqual(retry.duplicateIds, [clientUuid], `unsorted retry must be duplicate success: ${JSON.stringify(retry)}`);
    assert.deepEqual(retry.failed, []);

    await database.query("UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Closer' WHERE id=$1", [job, timestamp, actor]);
    assert.deepEqual((await acceptFireAlarmV7Inspection(envelope(manifest), actor)).duplicateIds, [clientUuid], "duplicate success survives Job closure");

    // A genuinely different manifest is still a conflict — one entry dropped
    // (length differs) and one entry's bytes changed (same length, different content).
    assert.equal((await acceptFireAlarmV7Inspection(envelope([manifest[0]]), actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
    assert.equal((await acceptFireAlarmV7Inspection(envelope([manifest[0], { ...manifest[1]!, sourceSha256: createHash("sha256").update("g10-different-bytes").digest("hex") }]), actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
  } finally { await isolationLock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); isolationLock.release(); await database.end(); }
});
