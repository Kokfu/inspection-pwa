import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { syncMasterSystemInspections } from "./masterSystemInspectionSync.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const at = "2026-09-04T00:00:00.000Z";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "standby_pump_service_items", "charger_power_failure_alarm", "battery_serviceable", "pump_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions", "trfp_duty_pump", "trfp_standby_pump"];
const rowPath = (row: string, field: string) => `hose_reel_drum.hose_reel_rows.rows.${row}.${field}`;

test("Hose Reel V7 atomically accepts its combined checklist and drum evidence, excludes stale findings, and preserves legacy dispatch", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl }); const lock = await database.connect(); await lock.query("SELECT pg_advisory_lock(819276)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='hose_reel'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id(), rowUuid = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`hose-v7-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Hose V7',false)", [customer, `HR-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'hose_reel',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "hose_reel", displayName: "Hose Reel System", sortOrder: 3, definitionStatus: "confirmed", zones: [], locations: [] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `HR-${customer}`, displayName: "Hose V7" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Hose V7','open',false,true,$4,$5,$6,'2026-09-04')", [job, template.id, `HR-${job}`, customer, revision, snapshot]);
    const contract = v7EvidenceContractSha256(template.definition); await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'hose_reel',$3,7,$4,$5)", [clientUuid, job, template.id, contract, actor]);
    const stage = async (fieldPath: string, bytes: string) => { const photoUuid = id(), sourceSha256 = hash(bytes); await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'hose_reel',$4,$5,7,$6,$7,$8,$9,$9,'image/jpeg',1,2,2,1,2,2,$10,'staged')", [photoUuid, clientUuid, job, fieldPath, template.id, contract, actor, hash(`stage:${photoUuid}`), sourceSha256, `fixtures/${photoUuid}.jpg`]); return { photoUuid, fieldPath, sourceSha256 }; };
    const water = await stage("hose_reel_checks.water_level", "water"), hose = await stage(rowPath(rowUuid, "hose"), "hose");
    const checklist = Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])); checklist.water_level = { result: "not_good", remarks: "Water level low" };
    const responses = { schemaVersion: 2, checklist, measurements: { jockey_pump_pressure: { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "good", remarks: "" }, standby_pump_cut_in: { values: { value: 70 }, unit: "PSI", result: "na", remarks: "" } }, drumTypes: { swing: true, fixed: false }, rows: [{ rowUuid, source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: "Bank", assetReference: null, sortOrder: 1, drumResult: "good", hoseResult: "complete_repair", nozzleResult: "good", valveResult: "na", nozzleBoxResult: "good", remarks: "", fieldRemarks: { hoseResult: "Hose repaired" } }], comments: "" };
    const manifest = [water, hose].sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
    const item = { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "hose_reel", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: snapshot.configuration, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses, evidenceManifest: manifest, performedAt: at } };
    const accepted = await syncMasterSystemInspections([item], actor); assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
    assert.deepEqual((await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows.map((row) => row.status), ["accepted", "accepted"]);
    assert.deepEqual((await syncMasterSystemInspections([item], actor)).duplicateIds, [clientUuid], "exact retry remains idempotent");
    const stale = structuredClone(item); stale.payload.responses.checklist.water_level = { result: "good", remarks: "" }; stale.payload.evidenceManifest = [hose];
    assert.equal((await syncMasterSystemInspections([stale], actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT", "an accepted frozen record cannot be rewritten by a later stale draft");
  } finally { await lock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); lock.release(); await database.end(); }
});
