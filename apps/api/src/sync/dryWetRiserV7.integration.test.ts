import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { syncDryWetRiserInspections } from "./dryWetRiserInspectionSync.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const at = "2026-09-05T00:00:00.000Z";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];
const checkPath = (key: string) => `dry_wet_riser_checks.${key}`;
const measurementPath = (key: string) => `dry_wet_riser_measurements.${key}`;
const rowPath = (rowUuid: string, column: string) => `riser_outlet.riser_outlet_rows.rows.${rowUuid}.${column}`;
type Value = Record<string, unknown>;
type Staged = { photoUuid: string; fieldPath: string; sourceSha256: string };

function riserRow(locationId: string, displayName: string, rowUuid = id(), change: Value = {}) {
  return {
    rowUuid, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1,
    zoneSnapshot: null, locationSnapshot: { id: locationId, displayName },
    assetReference: "", locationText: displayName,
    canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good",
    remarks: "", fieldRemarks: {}, sortOrder: 1, ...change
  };
}

function responses(row: Value, change: Value = {}) {
  const checklist = Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])) as Record<string, Value>;
  const psi = (values: Value, result = "good") => ({ values, unit: "PSI", result, remarks: "" });
  return {
    schemaVersion: 2, mode: "dry", checklist,
    measurements: {
      jockey_psi: psi({ cut_in: 80, cut_out: 100 }),
      duty_psi: psi({ cut_in: 70 }),
      standby_psi: psi({ cut_in: 60 }, "na")
    },
    riserOutlets: [row],
    comments: "", ...change
  };
}

async function withDatabase(run: (database: pg.Pool) => Promise<void>) {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819278)");
  try { await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database); await run(database); }
  finally { await lock.query("SELECT pg_advisory_unlock(819278)").catch(() => undefined); lock.release(); await database.end(); }
}

async function seed(database: pg.Pool, label: string) {
  const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='dry_wet_riser'")).rows[0]!;
  const customer = id(), revision = id(), enabled = id(), locationId = id();
  const user = async () => (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`dwr-v7-${label}-${id()}`])).rows[0]!.id;
  const actor = await user(), foreign = await user();
  await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,false)", [customer, `DWR-${customer}`, `Riser V7 ${label}`]);
  await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
  await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'dry_wet_riser',1,$4)", [enabled, revision, template.id, JSON.stringify({ riserMode: "dry" })]);
  const location = { id: locationId, zoneId: null, displayName: "Riser Outlet 1", presetRowCount: 1, rowPreset: {}, sortOrder: 1 };
  const system = { enabledSystemId: enabled, systemKey: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 1, definitionStatus: "confirmed", systemConfiguration: { riserMode: "dry" }, zones: [], locations: [location] };
  const snapshot = { schemaVersion: 1, customer: { id: customer, code: `DWR-${customer}`, displayName: `Riser V7 ${label}` }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE", version: 7 }, enabledSystems: [system] };
  const contract = v7EvidenceContractSha256(template.definition);
  const job = async (options: { closed?: boolean; visible?: boolean } = {}) => { const value = id(), closed = options.closed === true; await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,completed_at,completed_by_user_id,completed_by_display_name) VALUES($1,$2,$3,$4,$5,false,$6,$7,$8,$9,'2026-09-05',$10,$11,$12)", [value, template.id, `DWR-${value}`, `Riser V7 ${label}`, closed ? "closed" : "open", options.visible ?? true, customer, revision, snapshot, closed ? at : null, closed ? actor : null, closed ? "Riser V7 closer" : null]); return value; };
  const reserve = async (clientUuid: string, jobId: string, by = actor) => { await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'dry_wet_riser',$3,7,$4,$5)", [clientUuid, jobId, template.id, contract, by]); };
  const stage = async (clientUuid: string, jobId: string, fieldPath: string, sourceSha256 = hash(`source:${fieldPath}:${id()}`), storedSha256 = sourceSha256): Promise<Staged> => { const photoUuid = id(); await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'dry_wet_riser',$4,$5,7,$6,$7,$8,$9,$10,'image/jpeg',1,2,2,1,2,2,$11,'staged')", [photoUuid, clientUuid, jobId, fieldPath, template.id, contract, actor, hash(`stage:${photoUuid}`), sourceSha256, storedSha256, `fixtures/${photoUuid}.jpg`]); return { photoUuid, fieldPath, sourceSha256 }; };
  const envelope = (clientUuid: string, jobId: string, body: Value, evidenceManifest: unknown) => ({ operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId, systemKey: "dry_wet_riser", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: snapshot.configuration, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: jobId, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses: body, evidenceManifest, performedAt: at } });
  const statuses = async (clientUuid: string) => (await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows.map((row) => row.status);
  return { template, actor, foreign, snapshot, location, job, reserve, stage, envelope, statuses };
}

test("Dry/Wet Riser V7 accepts checklist, measurement, and row evidence with its own remarks", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "happy"), job = await f.job(), client = id();
    await f.reserve(client, job);
    const row = riserRow(f.location.id, f.location.displayName);
    const a = await f.stage(client, job, checkPath("water_level")), b = await f.stage(client, job, measurementPath("jockey_psi")), c = await f.stage(client, job, rowPath(row.rowUuid, "doorResult"));
    const body = responses(row);
    (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
    body.measurements.jockey_psi = { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "complete_repair", remarks: "Jockey pressure repaired" };
    (body.riserOutlets[0] as Value).doorResult = "not_good";
    (body.riserOutlets[0] as Value).fieldRemarks = { doorResult: "Door will not close" };
    const result = await syncDryWetRiserInspections([f.envelope(client, job, body, [a, b, c])], f.actor);
    assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));
    assert.deepEqual(await f.statuses(client), ["accepted", "accepted", "accepted"]);
  });
});

test("Dry/Wet Riser V7 never accepts evidence for a finding reverted to good or na", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "stale"), job = await f.job(), client = id();
    await f.reserve(client, job);
    const row = riserRow(f.location.id, f.location.displayName);
    const check = await f.stage(client, job, checkPath("water_level")), rowPhoto = await f.stage(client, job, rowPath(row.rowUuid, "crandleResult"));
    const body = responses(row);
    assert.equal((await syncDryWetRiserInspections([f.envelope(client, job, body, [check, rowPhoto])], f.actor)).failed[0]?.code, "VALIDATION_ERROR");
    assert.equal((await syncDryWetRiserInspections([f.envelope(client, job, body, [])], f.actor)).failed[0]?.code, "EVIDENCE_NOT_STAGED");
    assert.deepEqual(await f.statuses(client), ["staged", "staged"]);
    await database.query("DELETE FROM staged_inspection_evidence WHERE inspection_client_uuid=$1", [client]);
    assert.deepEqual((await syncDryWetRiserInspections([f.envelope(client, job, body, [])], f.actor)).acceptedIds, [client]);
  });
});

test("Dry/Wet Riser V7 refuses a checklist and row finding that reuse one named image", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "reuse"), job = await f.job(), client = id();
    await f.reserve(client, job);
    const row = riserRow(f.location.id, f.location.displayName);
    const check = await f.stage(client, job, checkPath("water_level")), rowPhoto = await f.stage(client, job, rowPath(row.rowUuid, "crandleResult"));
    const body = responses(row);
    (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
    (body.riserOutlets[0] as Value).crandleResult = "complete_repair";
    (body.riserOutlets[0] as Value).fieldRemarks = { crandleResult: "Crandle replaced" };
    const failure = (await syncDryWetRiserInspections([f.envelope(client, job, body, [check, { ...rowPhoto, sourceSha256: check.sourceSha256 }])], f.actor)).failed[0];
    assert.equal(failure?.code, "VALIDATION_ERROR");
    assert.match(String(failure?.message), /same image is attached to more than one finding/);
    assert.notEqual(failure?.message, "This V7 inspection is unavailable");
  });
});

test("Dry/Wet Riser V7 refuses two sources normalizing to the same stored bytes", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "stored"), job = await f.job(), client = id(), stored = hash("normalized");
    await f.reserve(client, job);
    const row = riserRow(f.location.id, f.location.displayName);
    const check = await f.stage(client, job, checkPath("water_level"), hash("source-a"), stored), rowPhoto = await f.stage(client, job, rowPath(row.rowUuid, "crandleResult"), hash("source-b"), stored);
    const body = responses(row);
    (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
    (body.riserOutlets[0] as Value).crandleResult = "not_good";
    (body.riserOutlets[0] as Value).fieldRemarks = { crandleResult: "Crandle bent" };
    const failure = (await syncDryWetRiserInspections([f.envelope(client, job, body, [check, rowPhoto])], f.actor)).failed[0];
    assert.equal(failure?.code, "EVIDENCE_NOT_STAGED");
    assert.match(String(failure?.message), /same stored image/);
  });
});

test("Dry/Wet Riser V7 accepts the same image bytes in a different Job", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "cross-job"), one = await f.job(), two = await f.job(), source = hash("shared-source"), stored = hash("shared-stored");
    const submit = async (job: string) => {
      const client = id(); await f.reserve(client, job);
      const row = riserRow(f.location.id, f.location.displayName);
      const photo = await f.stage(client, job, checkPath("water_level"), source, stored);
      const body = responses(row); (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
      return { client, result: await syncDryWetRiserInspections([f.envelope(client, job, body, [photo])], f.actor) };
    };
    const first = await submit(one), second = await submit(two);
    assert.deepEqual(first.result.acceptedIds, [first.client]);
    assert.deepEqual(second.result.acceptedIds, [second.client]);
  });
});

test("Dry/Wet Riser V7 concurrent race has one Accepted and one retryable EVIDENCE_CONFLICT", { skip: !databaseUrl, timeout: 30_000 }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "race"), job = await f.job(), source = hash("race-source"), stored = hash("race-stored");
    const contender = async () => {
      const client = id(); await f.reserve(client, job);
      const row = riserRow(f.location.id, f.location.displayName);
      const photo = await f.stage(client, job, checkPath("water_level"), source, stored);
      const body = responses(row); (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
      return { client, item: f.envelope(client, job, body, [photo]) };
    };
    const left = await contender(), right = await contender();
    const results = await Promise.all([syncDryWetRiserInspections([left.item], f.actor), syncDryWetRiserInspections([right.item], f.actor)]);
    assert.equal(results.filter((result) => result.acceptedIds.length === 1).length, 1, JSON.stringify(results));
    assert.equal(results.find((result) => result.failed.length === 1)?.failed[0]?.code, "EVIDENCE_CONFLICT", JSON.stringify(results));
  });
});

test("Dry/Wet Riser V7 closed, hidden and forbidden Jobs are idempotent and collapse to JOB_ACCESS_DENIED", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "denied"), closed = await f.job({ closed: true }), hidden = await f.job({ visible: false }), forbidden = await f.job(), unknown = id();
    const probe = async (job: string, by?: number) => { const client = id(); if (by) await f.reserve(client, job, by); const row = riserRow(f.location.id, f.location.displayName); return (await syncDryWetRiserInspections([f.envelope(client, job, responses(row), [])], f.actor)).failed[0]; };
    for (const failure of [await probe(closed), await probe(closed), await probe(hidden), await probe(unknown), await probe(forbidden, f.foreign)]) {
      assert.deepEqual({ code: failure?.code, message: failure?.message }, { code: "JOB_ACCESS_DENIED", message: "This V7 inspection is unavailable" });
    }
  });
});

test("Dry/Wet Riser V7 accepts a fully clean draft with zero findings and no reservation", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "clean"), job = await f.job(), client = id();
    const row = riserRow(f.location.id, f.location.displayName);
    const result = await syncDryWetRiserInspections([f.envelope(client, job, responses(row), [])], f.actor);
    assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));
  });
});

// G10 — the accepted snapshot stores the PARSED (fieldPath-sorted) manifest, but a
// retry carries whatever order the client sent and the API accepts any order.  An
// unsorted-but-identical retry must still be duplicate success, not
// IDEMPOTENCY_CONFLICT — after Job closure that is unrecoverable for the technician.
// Proven to fail against the old positional comparison: reverting the one-line
// `sameManifest` swap in `dryWetRiserV7Acceptance.ts` makes the first retry
// assertion below fail with IDEMPOTENCY_CONFLICT.
test("Dry/Wet Riser V7 exact retry with an unsorted manifest is still duplicate success", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "unsorted-retry"), job = await f.job(), client = id();
    await f.reserve(client, job);
    const row = riserRow(f.location.id, f.location.displayName);
    const check = await f.stage(client, job, checkPath("water_level"));
    const meas = await f.stage(client, job, measurementPath("jockey_psi"));
    // "dry_wet_riser_checks…" sorts before "dry_wet_riser_measurements…"; submit the reverse.
    const unsorted = [meas, check];
    assert.ok(unsorted[0]!.fieldPath.localeCompare(unsorted[1]!.fieldPath) > 0, "fixture must actually be unsorted");
    const body = responses(row);
    (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
    body.measurements.jockey_psi = { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "complete_repair", remarks: "Jockey pressure repaired" };
    assert.deepEqual((await syncDryWetRiserInspections([f.envelope(client, job, body, unsorted)], f.actor)).acceptedIds, [client], "first submit accepts");

    const retry = await syncDryWetRiserInspections([f.envelope(client, job, body, unsorted)], f.actor);
    assert.deepEqual(retry.duplicateIds, [client], `unsorted retry must be duplicate success: ${JSON.stringify(retry)}`);
    assert.deepEqual(retry.failed, []);

    await database.query("UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Closer' WHERE id=$1", [job, at, f.actor]);
    assert.deepEqual((await syncDryWetRiserInspections([f.envelope(client, job, body, unsorted)], f.actor)).duplicateIds, [client], "duplicate success survives Job closure");

    // A genuinely different manifest is still a conflict — one entry dropped
    // (length differs) and one entry's bytes changed (same length, different content).
    assert.equal((await syncDryWetRiserInspections([f.envelope(client, job, body, [check])], f.actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
    assert.equal((await syncDryWetRiserInspections([f.envelope(client, job, body, [meas, { ...check, sourceSha256: hash("g10-different-bytes") }])], f.actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
  });
});

test("Dry/Wet Riser V1-V6 historical path still accepts through canonicalDryWetRiserResponses", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const v2 = (await database.query<{ id: string; definition: Value }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=2 AND system.system_key='dry_wet_riser'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), job = id(), client = id(), locationId = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`dwr-v2-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Riser V2',false)", [customer, `DWR2-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, v2.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'dry_wet_riser',1,$4)", [enabled, revision, v2.id, JSON.stringify({ riserMode: "wet" })]);
    const location = { id: locationId, zoneId: null, displayName: "Riser Outlet 1", presetRowCount: 1, rowPreset: {}, sortOrder: 1 };
    const configuration = { revisionId: revision, revisionNumber: 1 }, template = { id: v2.id, code: "MFE-FSSR", name: "MFE", version: 2 };
    const system = { enabledSystemId: enabled, systemKey: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 1, definitionStatus: "confirmed", systemConfiguration: { riserMode: "wet" }, zones: [], locations: [location] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `DWR2-${customer}`, displayName: "Riser V2" }, site: { id: id(), displayName: "Site" }, configuration, template, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Riser V2','open',false,true,$4,$5,$6,'2026-09-05')", [job, v2.id, `DWR2-${job}`, customer, revision, snapshot]);

    const historicalChecklist = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, { result: "good", remarks: "" }]));
    const pumpHouseKeys = ["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];
    const body = {
      schemaVersion: 1, mode: "wet",
      waterTank: historicalChecklist(["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"]),
      pumpHouse: historicalChecklist(pumpHouseKeys),
      measurements: { jockeyCutIn: 80, jockeyCutOut: 100, dutyCutIn: 70, standbyCutIn: 60, unit: "PSI" },
      riserOutlets: [{ rowUuid: id(), source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1, zoneSnapshot: null, locationSnapshot: { id: locationId, displayName: "Riser Outlet 1" }, assetReference: "", locationText: "Riser Outlet 1", canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good", remarks: "", sortOrder: 1 }],
      comments: ""
    };
    const item = { operationId: id(), entityType: "masterSystemInspection", entityId: client, action: "create", payload: { clientUuid: client, jobId: job, systemKey: "dry_wet_riser", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: v2.id, code: "MFE-FSSR", version: 2 }, configuration, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration, template, system: { systemConfiguration: { riserMode: "wet" } } }, responses: body, performedAt: at } };
    const result = await syncDryWetRiserInspections([item], actor);
    assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));

    const accepted = (await database.query<{ response_schema_version: number }>("SELECT response_schema_version FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]!;
    assert.equal(accepted.response_schema_version, 1, "the legacy V1-V6 riser response schema is untouched");
    assert.equal((await database.query("SELECT 1 FROM staged_inspection_evidence WHERE inspection_client_uuid=$1", [client])).rowCount, 0, "the historical riser path never touches V7 staged evidence");
  });
});
