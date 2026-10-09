import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { acceptFireRatedRollerShutterV7Inspection } from "./fireRatedRollerShutterV7Acceptance.js";
import { loadFinalServiceReport, renderFinalServiceReportPdf } from "../reports/finalServiceReport.js";
import { extractPdfText } from "../reports/pdf/extractPdfText.testSupport.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const performedAt = "2026-09-28T00:00:00.000Z";

test("roller shutter V7 accepts a complete form exactly once and rejects a changed UUID retry", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819282)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fire_rated_roller_shutter'")).rows[0]!;
    assert.ok(template);
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id(), rowUuid = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`roller-v7-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Roller V7',false)", [customer, `RS-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_rated_roller_shutter',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "fire_rated_roller_shutter", displayName: "Fire Rated Roller Shutter", sortOrder: 13, definitionStatus: "confirmed", zones: [], locations: [] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `RS-${customer}`, displayName: "Roller V7" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Roller V7','open',false,true,$4,$5,$6,'2026-09-28')", [job, template.id, `RS-${job}`, customer, revision, snapshot]);
    const responses = { schemaVersion: 1, dateTested: "2026-09-28", zone: "Zone 1", inspectedBy: "Inspector A", rows: [{ rowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "CNC Drill", autoAlarmModeResult: "good", manualModeResult: "good", remarks: "", fieldRemarks: {}, sortOrder: 1 }], comments: "" };
    const item = { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "fire_rated_roller_shutter", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 1, capturedAt: performedAt, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses, evidenceManifest: [] as Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>, performedAt } };
    assert.deepEqual((await acceptFireRatedRollerShutterV7Inspection(item, actor)).acceptedIds, [clientUuid]);
    const accepted = (await database.query<{ response_payload: typeof responses }>("SELECT response_payload FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0]!;
    assert.equal(accepted.response_payload.rows[0]!.locationText, "CNC Drill");
    assert.deepEqual((await acceptFireRatedRollerShutterV7Inspection(item, actor)).duplicateIds, [clientUuid]);
    const changed = structuredClone(item); changed.payload.responses.comments = "changed";
    assert.equal((await acceptFireRatedRollerShutterV7Inspection(changed, actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");

    // A second Job proves the evidence-first path, including the new database
    // key constraints, independent field remark, atomic binding and retry.
    const findingJob = id(), findingUuid = id(), findingRow = id(), photoUuid = id();
    const findingSnapshot = { ...snapshot, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Roller V7 finding','open',false,true,$4,$5,$6,'2026-09-28')", [findingJob, template.id, `RS-${findingJob}`, customer, revision, findingSnapshot]);
    const contract = v7EvidenceContractSha256(template.definition);
    const fieldPath = `roller_shutter_schedule.roller_shutter_schedule_rows.rows.${findingRow}.auto_alarm_mode`;
    const digest = createHash("sha256").update("roller-v7-photo").digest("hex");
    await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'fire_rated_roller_shutter',$3,7,$4,$5)", [findingUuid, findingJob, template.id, contract, actor]);
    await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'fire_rated_roller_shutter',$4,$5,7,$6,$7,$8,$9,$9,'image/jpeg',1,2,2,1,2,2,$10,'staged')", [photoUuid, findingUuid, findingJob, fieldPath, template.id, contract, actor, createHash("sha256").update(photoUuid).digest("hex"), digest, `fixtures/${photoUuid}.jpg`]);
    const findingItem = structuredClone(item);
    findingItem.operationId = id(); findingItem.entityId = findingUuid;
    findingItem.payload.clientUuid = findingUuid; findingItem.payload.jobId = findingJob;
    findingItem.payload.inspectionSnapshot.job.id = findingJob;
    findingItem.payload.responses.rows[0]!.rowUuid = findingRow;
    findingItem.payload.responses.rows[0]!.autoAlarmModeResult = "not_good";
    findingItem.payload.responses.rows[0]!.fieldRemarks = { autoAlarmModeResult: "Motor failed" };
    findingItem.payload.evidenceManifest = [{ photoUuid, fieldPath, sourceSha256: digest }];
    assert.deepEqual((await acceptFireRatedRollerShutterV7Inspection(findingItem, actor)).acceptedIds, [findingUuid]);
    assert.deepEqual((await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE photo_uuid=$1", [photoUuid])).rows.map((row) => row.status), ["accepted"]);
    assert.deepEqual((await acceptFireRatedRollerShutterV7Inspection(findingItem, actor)).duplicateIds, [findingUuid]);
  } finally {
    await lock.query("SELECT pg_advisory_unlock(819282)").catch(() => undefined);
    lock.release();
    await database.end();
  }
});

test("roller shutter V7 schema 2 carries zone headings, enforces the frozen configured zone, and keeps schema 1 valid", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819282)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const template = (await database.query<{ id: string }>("SELECT template.id FROM master_service_report_templates template WHERE template.version=7")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), location = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`roller-zone-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Roller Zones',false)", [customer, `RZ-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_rated_roller_shutter',1,'{}')", [enabled, revision, template.id]);
    const preset = [
      { assetReference: "A1", locationText: "Lobby", zoneText: "Zone 1" },
      { assetReference: "A2", locationText: "Dock", zoneText: "Zone 1" },
      { assetReference: "B1", locationText: "Roof", zoneText: "Zone 2" }
    ];
    const system = { enabledSystemId: enabled, systemKey: "fire_rated_roller_shutter", displayName: "Fire Rated Roller Shutter", sortOrder: 13, definitionStatus: "confirmed", zones: [],
      locations: [{ id: location, enabledSystemId: enabled, zoneId: null, key: "general", displayName: "General", presetRowCount: 3, rowPreset: { rows: preset }, sortOrder: 1 }] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `RZ-${customer}`, displayName: "Roller Zones" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };

    const configuredRows = (schemaVersion: 1 | 2) => preset.map((row, index) => ({
      rowUuid: id(), source: "configured", configuredLocationId: location, configuredRowOrdinal: index + 1, zoneSnapshot: null, locationSnapshot: { id: location, displayName: "General" },
      assetReference: row.assetReference, locationText: row.locationText, ...(schemaVersion === 2 ? { zoneText: row.zoneText } : {}),
      autoAlarmModeResult: "good", manualModeResult: "good", remarks: "", fieldRemarks: {}, sortOrder: index + 1
    }));
    const technicianRow = (zoneText: string) => ({ rowUuid: id(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "Loading bay", zoneText, autoAlarmModeResult: "good", manualModeResult: "good", remarks: "", fieldRemarks: {}, sortOrder: 4 });
    async function submit(mutate: (rows: Array<Record<string, unknown>>, responses: Record<string, unknown>) => void, schemaVersion: 1 | 2 = 2) {
      const job = id(), clientUuid = id();
      await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Roller zones','open',false,true,$4,$5,$6,'2026-10-09')", [job, template.id, `RZ-${job}`, customer, revision, snapshot]);
      const rows = configuredRows(schemaVersion) as Array<Record<string, unknown>>;
      const responses: Record<string, unknown> = { schemaVersion, dateTested: "2026-10-09", zone: "", inspectedBy: "Inspector A", rows, comments: "" };
      mutate(rows, responses);
      const item = { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "fire_rated_roller_shutter", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 1, capturedAt: performedAt, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses, evidenceManifest: [] as Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>, performedAt } };
      const result = await acceptFireRatedRollerShutterV7Inspection(item, actor);
      const stored = (await database.query<{ response_schema_version: number }>("SELECT response_schema_version FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0];
      return { result, stored, clientUuid, job };
    }

    const good = await submit(() => undefined);
    assert.deepEqual(good.result.acceptedIds, [good.clientUuid]);
    assert.equal(good.stored?.response_schema_version, 2);

    // The Final Report and PDF are built from this accepted authority: each row prints its zone heading.
    await database.query("UPDATE inspection_jobs SET status='closed', completed_at=now(), completed_by_user_id=$2, completed_by_display_name='Alice Tan', report_number='TEST/' || id::text, technician_team_snapshot='[]'::jsonb WHERE id=$1", [good.job, actor]);
    const report = await loadFinalServiceReport(good.job, database);
    const pdf = await renderFinalServiceReportPdf(report);
    assert.equal(pdf.subarray(0, 5).toString("binary"), "%PDF-");
    const pdfText = (await extractPdfText(pdf)).join(" ");
    for (const heading of ["Zone 1 — Lobby", "Zone 1 — Dock", "Zone 2 — Roof"]) assert.ok(pdfText.replace(/\s+/g, " ").includes(heading), `PDF shows "${heading}"`);

    const withTechnicianZone = await submit((rows) => { rows.push(technicianRow("Zone 3")); });
    assert.equal(withTechnicianZone.result.acceptedIds.length, 1, "a technician row may name its own zone");

    const tampered = await submit((rows) => { rows[0]!.zoneText = "Zone 9"; });
    assert.equal(tampered.result.failed[0]?.code, "VALIDATION_ERROR", "a configured row must keep its frozen zone heading");
    assert.equal(tampered.stored, undefined);

    const missingKey = await submit((rows) => { delete rows[2]!.zoneText; });
    assert.equal(missingKey.result.failed[0]?.code, "VALIDATION_ERROR", "schema 2 requires zoneText on every row");

    const tooLong = await submit((rows) => { rows.push(technicianRow("z".repeat(201))); });
    assert.equal(tooLong.result.failed[0]?.code, "VALIDATION_ERROR");

    const futureVersion = await submit((_rows, responses) => { responses.schemaVersion = 3; });
    assert.equal(futureVersion.result.failed[0]?.code, "VALIDATION_ERROR");

    const legacy = await submit(() => undefined, 1);
    assert.equal(legacy.result.acceptedIds.length, 1, "an older client's schema 1 record stays valid against a zoned frozen layout");
    assert.equal(legacy.stored?.response_schema_version, 1);

    const legacyWithZone = await submit((rows) => { rows[0]!.zoneText = "Zone 1"; }, 1);
    assert.equal(legacyWithZone.result.failed[0]?.code, "VALIDATION_ERROR", "schema 1 keeps its exact key set");
  } finally {
    await lock.query("SELECT pg_advisory_unlock(819282)").catch(() => undefined);
    lock.release();
    await database.end();
  }
});
