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
type Value = Record<string, unknown>;
type Staged = { photoUuid: string; fieldPath: string; sourceSha256: string };

function responses(rowUuid = id(), change: Value = {}) {
  const checklist = Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])) as Record<string, Value>;
  return { schemaVersion: 2, checklist, measurements: { jockey_pump_pressure: { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "good", remarks: "" }, standby_pump_cut_in: { values: { value: 70 }, unit: "PSI", result: "na", remarks: "" } }, drumTypes: { swing: true, fixed: false }, rows: [{ rowUuid, source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: "Bank", assetReference: null, sortOrder: 1, drumResult: "good", hoseResult: "good", nozzleResult: "good", valveResult: "na", nozzleBoxResult: "good", remarks: "", fieldRemarks: {} }], comments: "", ...change };
}

// STEP 1.2 schema 3: the technician declares `drumCount` and every drum row
// carries its own `drumType` label ("swing" | "fixed"). The global `drumTypes`
// multi-select is gone.
function responsesV3(drums: Array<{ rowUuid: string; drumType: "swing" | "fixed"; change?: Value }>) {
  const checklist = Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])) as Record<string, Value>;
  return {
    schemaVersion: 3,
    checklist,
    measurements: { jockey_pump_pressure: { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "good", remarks: "" }, standby_pump_cut_in: { values: { value: 70 }, unit: "PSI", result: "na", remarks: "" } },
    drumCount: drums.length,
    rows: drums.map((drum, index) => ({ rowUuid: drum.rowUuid, source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: `Drum ${index + 1}`, assetReference: null, sortOrder: index + 1, drumResult: "good", hoseResult: "good", nozzleResult: "good", valveResult: "na", nozzleBoxResult: "good", remarks: "", fieldRemarks: {}, drumType: drum.drumType, ...drum.change })),
    comments: ""
  } as Value;
}

async function withDatabase(run: (database: pg.Pool) => Promise<void>) {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819276)");
  try { await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database); await run(database); }
  finally { await lock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); lock.release(); await database.end(); }
}

async function seed(database: pg.Pool, label: string) {
  const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='hose_reel'")).rows[0]!;
  const customer = id(), revision = id(), enabled = id();
  const user = async () => (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`hose-v7-${label}-${id()}`])).rows[0]!.id;
  const actor = await user(), foreign = await user();
  await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,false)", [customer, `HR-${customer}`, `Hose V7 ${label}`]);
  await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
  await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'hose_reel',1,'{}')", [enabled, revision, template.id]);
  const system = { enabledSystemId: enabled, systemKey: "hose_reel", displayName: "Hose Reel System", sortOrder: 3, definitionStatus: "confirmed", zones: [], locations: [] };
  const snapshot = { schemaVersion: 1, customer: { id: customer, code: `HR-${customer}`, displayName: `Hose V7 ${label}` }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE", version: 7 }, enabledSystems: [system] };
  const contract = v7EvidenceContractSha256(template.definition);
  const job = async (options: { closed?: boolean; visible?: boolean } = {}) => { const value = id(), closed = options.closed === true; await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,completed_at,completed_by_user_id,completed_by_display_name) VALUES($1,$2,$3,$4,$5,false,$6,$7,$8,$9,'2026-09-04',$10,$11,$12)", [value, template.id, `HR-${value}`, `Hose V7 ${label}`, closed ? "closed" : "open", options.visible ?? true, customer, revision, snapshot, closed ? at : null, closed ? actor : null, closed ? "Hose V7 closer" : null]); return value; };
  const reserve = async (clientUuid: string, jobId: string, by = actor) => { await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'hose_reel',$3,7,$4,$5)", [clientUuid, jobId, template.id, contract, by]); };
  const stage = async (clientUuid: string, jobId: string, fieldPath: string, sourceSha256 = hash(`source:${fieldPath}:${id()}`), storedSha256 = sourceSha256): Promise<Staged> => { const photoUuid = id(); await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'hose_reel',$4,$5,7,$6,$7,$8,$9,$10,'image/jpeg',1,2,2,1,2,2,$11,'staged')", [photoUuid, clientUuid, jobId, fieldPath, template.id, contract, actor, hash(`stage:${photoUuid}`), sourceSha256, storedSha256, `fixtures/${photoUuid}.jpg`]); return { photoUuid, fieldPath, sourceSha256 }; };
  const envelope = (clientUuid: string, jobId: string, body: Value, evidenceManifest: unknown) => ({ operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId, systemKey: "hose_reel", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: snapshot.configuration, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: jobId, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses: body, evidenceManifest, performedAt: at } });
  const statuses = async (clientUuid: string) => (await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows.map((row) => row.status);
  return { template, actor, foreign, snapshot, job, reserve, stage, envelope, statuses };
}

test("Hose Reel V7 accepts checklist, test-run, and drum-row evidence with its own remarks", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "happy"), job = await f.job(), client = id(), row = id(); await f.reserve(client, job); const a = await f.stage(client, job, "hose_reel_checks.water_level"), b = await f.stage(client, job, "hose_reel_checks.trfp_duty_pump"), c = await f.stage(client, job, rowPath(row, "hose")); const body = responses(row); body.checklist.water_level = { result: "not_good", remarks: "Water low" }; body.checklist.trfp_duty_pump = { result: "complete_repair", remarks: "Pump repaired" }; (body.rows[0] as Value).hoseResult = "not_good"; (body.rows[0] as Value).fieldRemarks = { hoseResult: "Hose damaged" }; const result = await syncMasterSystemInspections([f.envelope(client, job, body, [a, b, c])], f.actor); assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result)); assert.deepEqual(await f.statuses(client), ["accepted", "accepted", "accepted"]); });
});

test("Hose Reel V7 never accepts evidence for a finding reverted to good or na", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "stale"), job = await f.job(), client = id(), row = id(); await f.reserve(client, job); const check = await f.stage(client, job, "hose_reel_checks.water_level"), drum = await f.stage(client, job, rowPath(row, "hose")); const body = responses(row); const named = await syncMasterSystemInspections([f.envelope(client, job, body, [check, drum])], f.actor); assert.equal(named.failed[0]?.code, "VALIDATION_ERROR"); const dropped = await syncMasterSystemInspections([f.envelope(client, job, body, [])], f.actor); assert.equal(dropped.failed[0]?.code, "EVIDENCE_NOT_STAGED"); assert.deepEqual(await f.statuses(client), ["staged", "staged"]); await database.query("DELETE FROM staged_inspection_evidence WHERE inspection_client_uuid=$1", [client]); assert.deepEqual((await syncMasterSystemInspections([f.envelope(client, job, body, [])], f.actor)).acceptedIds, [client]); });
});

test("Hose Reel V7 refuses a checklist and row finding that reuse one named image", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "reuse"), job = await f.job(), client = id(), row = id(); await f.reserve(client, job); const check = await f.stage(client, job, "hose_reel_checks.water_level"), drum = await f.stage(client, job, rowPath(row, "hose")); const body = responses(row); body.checklist.water_level = { result: "not_good", remarks: "Water low" }; (body.rows[0] as Value).hoseResult = "complete_repair"; (body.rows[0] as Value).fieldRemarks = { hoseResult: "Repair hose" }; const failure = (await syncMasterSystemInspections([f.envelope(client, job, body, [check, { ...drum, sourceSha256: check.sourceSha256 }])], f.actor)).failed[0]; assert.equal(failure?.code, "VALIDATION_ERROR"); assert.match(String(failure?.message), /same image is attached to more than one finding/); assert.notEqual(failure?.message, "This V7 inspection is unavailable"); });
});

test("Hose Reel V7 refuses two sources normalizing to the same stored bytes", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "stored"), job = await f.job(), client = id(), row = id(), stored = hash("normalized"); await f.reserve(client, job); const check = await f.stage(client, job, "hose_reel_checks.water_level", hash("source-a"), stored), drum = await f.stage(client, job, rowPath(row, "hose"), hash("source-b"), stored); const body = responses(row); body.checklist.water_level = { result: "not_good", remarks: "Water low" }; (body.rows[0] as Value).hoseResult = "not_good"; (body.rows[0] as Value).fieldRemarks = { hoseResult: "Hose damaged" }; const failure = (await syncMasterSystemInspections([f.envelope(client, job, body, [check, drum])], f.actor)).failed[0]; assert.equal(failure?.code, "EVIDENCE_NOT_STAGED"); assert.match(String(failure?.message), /same stored image/); });
});

test("Hose Reel V7 accepts the same image bytes in a different Job", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "cross-job"), one = await f.job(), two = await f.job(), source = hash("shared-source"), stored = hash("shared-stored"); const submit = async (job: string) => { const client = id(); await f.reserve(client, job); const photo = await f.stage(client, job, "hose_reel_checks.water_level", source, stored); const body = responses(); body.checklist.water_level = { result: "not_good", remarks: "Water low" }; return { client, result: await syncMasterSystemInspections([f.envelope(client, job, body, [photo])], f.actor) }; }; const first = await submit(one), second = await submit(two); assert.deepEqual(first.result.acceptedIds, [first.client]); assert.deepEqual(second.result.acceptedIds, [second.client]); });
});

test("Hose Reel V7 concurrent race has one Accepted and one terminal EVIDENCE_CONFLICT / Needs attention through sync", { skip: !databaseUrl, timeout: 30_000 }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "race"), job = await f.job(), source = hash("race-source"), stored = hash("race-stored"); const contender = async () => { const client = id(); await f.reserve(client, job); const photo = await f.stage(client, job, "hose_reel_checks.water_level", source, stored); const body = responses(); body.checklist.water_level = { result: "not_good", remarks: "Water low" }; return { client, item: f.envelope(client, job, body, [photo]) }; }; const left = await contender(), right = await contender(); const results = await Promise.all([syncMasterSystemInspections([left.item], f.actor), syncMasterSystemInspections([right.item], f.actor)]); assert.equal(results.filter((result) => result.acceptedIds.length === 1).length, 1, JSON.stringify(results)); const loser = results.find((result) => result.failed.length === 1); assert.equal(loser?.failed[0]?.code, "EVIDENCE_CONFLICT", JSON.stringify(results)); });
});

test("Hose Reel V7 collapses closed, hidden, unknown, and forbidden Jobs to JOB_ACCESS_DENIED", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "denied"), closed = await f.job({ closed: true }), hidden = await f.job({ visible: false }), forbidden = await f.job(), unknown = id(); const probe = async (job: string, by?: number) => { const client = id(); if (by) await f.reserve(client, job, by); const result = await syncMasterSystemInspections([f.envelope(client, job, responses(), [])], f.actor); return result.failed[0]; }; for (const failure of [await probe(closed), await probe(hidden), await probe(unknown), await probe(forbidden, f.foreign)]) assert.deepEqual({ code: failure?.code, message: failure?.message }, { code: "JOB_ACCESS_DENIED", message: "This V7 inspection is unavailable" }); });
});

test("Hose Reel V7 accepts a fully clean draft with zero findings and no reservation", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "clean"), job = await f.job(), client = id(); const result = await syncMasterSystemInspections([f.envelope(client, job, responses(), [])], f.actor); assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result)); });
});

// G10 — the accepted snapshot stores the PARSED (fieldPath-sorted) manifest, but a
// retry carries whatever order the client sent and the API accepts any order.  An
// unsorted-but-identical retry must still be duplicate success, not
// IDEMPOTENCY_CONFLICT — after Job closure that is unrecoverable for the technician.
// Proven to fail against the old positional comparison: reverting the one-line
// `sameManifest` swap in `hoseReelV7Acceptance.ts` makes the first retry assertion
// below fail with IDEMPOTENCY_CONFLICT.
test("Hose Reel V7 exact retry with an unsorted manifest is still duplicate success", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "unsorted-retry"), job = await f.job(), client = id(), row = id();
    await f.reserve(client, job);
    const check = await f.stage(client, job, "hose_reel_checks.water_level");
    const drum = await f.stage(client, job, rowPath(row, "hose"));
    // "hose_reel_checks…" sorts before "hose_reel_drum…"; submit the reverse.
    const unsorted = [drum, check];
    assert.ok(unsorted[0]!.fieldPath.localeCompare(unsorted[1]!.fieldPath) > 0, "fixture must actually be unsorted");
    const body = responses(row);
    body.checklist.water_level = { result: "not_good", remarks: "Water low" };
    (body.rows[0] as Value).hoseResult = "not_good";
    (body.rows[0] as Value).fieldRemarks = { hoseResult: "Hose damaged" };
    assert.deepEqual((await syncMasterSystemInspections([f.envelope(client, job, body, unsorted)], f.actor)).acceptedIds, [client], "first submit accepts");

    const retry = await syncMasterSystemInspections([f.envelope(client, job, body, unsorted)], f.actor);
    assert.deepEqual(retry.duplicateIds, [client], `unsorted retry must be duplicate success: ${JSON.stringify(retry)}`);
    assert.deepEqual(retry.failed, []);

    await database.query("UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Closer' WHERE id=$1", [job, at, f.actor]);
    assert.deepEqual((await syncMasterSystemInspections([f.envelope(client, job, body, unsorted)], f.actor)).duplicateIds, [client], "duplicate success survives Job closure");

    // A genuinely different manifest is still a conflict — one entry dropped
    // (length differs) and one entry's bytes changed (same length, different content).
    assert.equal((await syncMasterSystemInspections([f.envelope(client, job, body, [check])], f.actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
    assert.equal((await syncMasterSystemInspections([f.envelope(client, job, body, [drum, { ...check, sourceSha256: hash("g10-different-bytes") }])], f.actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
  });
});

test("Hose Reel V7 schema 3 accepts >=2 drums with mixed swing/fixed, a drum-2 finding, and idempotent retry after Job closure", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "multi-drum"), job = await f.job(), client = id(), drum1 = id(), drum2 = id();
    await f.reserve(client, job);
    const photo = await f.stage(client, job, rowPath(drum2, "hose"));
    const body = responsesV3([
      { rowUuid: drum1, drumType: "swing" },
      { rowUuid: drum2, drumType: "fixed", change: { hoseResult: "not_good", fieldRemarks: { hoseResult: "Drum 2 hose split" } } }
    ]);
    const first = await syncMasterSystemInspections([f.envelope(client, job, body, [photo])], f.actor);
    assert.deepEqual(first.acceptedIds, [client], JSON.stringify(first));
    assert.deepEqual(await f.statuses(client), ["accepted"]);
    const stored = (await database.query<{ response_payload: Value }>("SELECT response_payload FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]!.response_payload;
    assert.equal(stored.schemaVersion, 3);
    assert.equal(stored.drumCount, 2);
    assert.deepEqual((stored.rows as Value[]).map((row) => row.drumType), ["swing", "fixed"]);
    assert.equal("drumTypes" in stored, false);
    // Job closes; the exact same envelope is a duplicate success, never JOB_CLOSED.
    await database.query("UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Closer' WHERE id=$1", [job, at, f.actor]);
    const retry = await syncMasterSystemInspections([f.envelope(client, job, body, [photo])], f.actor);
    assert.deepEqual(retry.duplicateIds, [client], JSON.stringify(retry));
    assert.deepEqual(retry.failed, []);
  });
});

test("Hose Reel V7 schema 3 rejects a drum row missing its swing/fixed label and a mismatched drumCount", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "schema3-invalid"), job = await f.job();
    const missingLabel = responsesV3([{ rowUuid: id(), drumType: "swing" }, { rowUuid: id(), drumType: "fixed" }]);
    delete (missingLabel.rows as Value[])[1]!.drumType;
    assert.equal((await syncMasterSystemInspections([f.envelope(id(), job, missingLabel, [])], f.actor)).failed[0]?.code, "VALIDATION_ERROR");
    const badCount = responsesV3([{ rowUuid: id(), drumType: "swing" }, { rowUuid: id(), drumType: "fixed" }]);
    badCount.drumCount = 5;
    assert.equal((await syncMasterSystemInspections([f.envelope(id(), job, badCount, [])], f.actor)).failed[0]?.code, "VALIDATION_ERROR");
  });
});

test("Hose Reel V7 schema 2 records still accept byte-for-byte after the schema-3 rollout", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "schema2-regression"), job = await f.job(), client = id(), row = id();
    const body = responses(row);
    const result = await syncMasterSystemInspections([f.envelope(client, job, body, [])], f.actor);
    assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));
    const stored = (await database.query<{ response_payload: Value }>("SELECT response_payload FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]!.response_payload;
    assert.equal(stored.schemaVersion, 2);
    assert.deepEqual(stored.drumTypes, { swing: true, fixed: false });
    assert.equal("drumCount" in stored, false);
  });
});

test("Hose Reel V1 still accepts through the historical path", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const v1 = (await database.query<{ id: string; definition: Value }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=1 AND system.system_key='hose_reel'")).rows[0]!; const customer = id(), revision = id(), enabled = id(), job = id(), client = id(), row = id(); const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`hose-v1-${id()}`])).rows[0]!.id; await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Hose V1',false)", [customer, `HV1-${customer}`]); await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, v1.id]); await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'hose_reel',1,'{}')", [enabled, revision, v1.id]); const configuration = { revisionId: revision, revisionNumber: 1 }, template = { id: v1.id, code: "MFE-FSSR", name: "MFE", version: 1 }, system = { enabledSystemId: enabled, systemKey: "hose_reel", displayName: "Hose Reel System", sortOrder: 3, definitionStatus: "confirmed", zones: [], locations: [] }, snapshot = { schemaVersion: 1, customer: { id: customer, code: `HV1-${customer}`, displayName: "Hose V1" }, site: { id: id(), displayName: "Site" }, configuration, template, enabledSystems: [system] }; await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Hose V1','open',false,true,$4,$5,$6,'2026-09-04')", [job, v1.id, `HV1-${job}`, customer, revision, snapshot]); const legacyChecklist = Object.fromEntries(checklistKeys.slice(0, 11).map((key) => [key, { result: "good", remarks: "" }])); const body = { checklist: legacyChecklist, measurements: { jockey_pump_pressure: { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "good", remarks: "" }, standby_pump_cut_in: { values: { value: 70 }, unit: "PSI", result: "good", remarks: "" } }, drumTypes: { swing: true, fixed: false }, rows: [{ rowUuid: row, source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: "Bank", assetReference: null, sortOrder: 1, drumResult: "good", hoseResult: "poor", nozzleResult: "good", valveResult: "good", nozzleBoxResult: "good", remarks: "" }], comments: "" }; const item = { operationId: id(), entityType: "masterSystemInspection", entityId: client, action: "create", payload: { clientUuid: client, jobId: job, systemKey: "hose_reel", originalCreatorSnapshot: null, masterTemplate: { id: v1.id, code: "MFE-FSSR", version: 1 }, configuration, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration, template, system: { ...system, definition: v1.definition, repetitionMode: "single_with_repeatable_rows" } }, responses: body, performedAt: at } }; const result = await syncMasterSystemInspections([item], actor); assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result)); assert.equal((await database.query<{ snapshot_schema_version: number }>("SELECT snapshot_schema_version FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]?.snapshot_schema_version, 1); });
});
