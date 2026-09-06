import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../db/migrations.js";
import { automaticSprinklerPsiEvidencePolicyV1, automaticSprinklerPsiFieldPaths } from "../inspections/evidence/automaticSprinklerPsiEvidencePolicyV1.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { syncAutomaticSprinklerInspections } from "./automaticSprinklerInspectionSync.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";
import { loadFinalServiceReport } from "../reports/finalServiceReport.js";

const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const at = "2026-09-04T00:00:00.000Z";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions", "breaching_inlet", "alarm_gong", "flow_meter_valve_positions", "trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"];
const checkPath = (key: string) => `automatic_sprinkler_checks.${key}`;
const measurementPath = (key: string) => `automatic_sprinkler_measurements.${key}`;
type Value = Record<string, unknown>;
type Staged = { photoUuid: string; fieldPath: string; sourceSha256: string };

function responses(change: Value = {}) {
  const checklist = Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])) as Record<string, Value>;
  const psi = (values: Value, result = "good") => ({ values, unit: "PSI", result, remarks: "" });
  return {
    schemaVersion: 2, checklist,
    measurements: {
      jockey_pump_pressure: psi({ cut_in: 80, cut_out: 100 }),
      duty_pump_cut_in: psi({ value: 70 }),
      standby_pump_cut_in: psi({ value: 60 }, "na"),
      water_supply_gauge: psi({ value: 90 }),
      installation_gauge: psi({ value: 95 })
    },
    comments: "", ...change
  };
}

async function withDatabase(run: (database: pg.Pool) => Promise<void>) {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819277)");
  try { await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database); await run(database); }
  finally { await lock.query("SELECT pg_advisory_unlock(819277)").catch(() => undefined); lock.release(); await database.end(); }
}

async function seed(database: pg.Pool, label: string) {
  const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='automatic_sprinkler'")).rows[0]!;
  const customer = id(), revision = id(), enabled = id();
  const user = async () => (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`asp-v7-${label}-${id()}`])).rows[0]!.id;
  const actor = await user(), foreign = await user();
  await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,false)", [customer, `AS-${customer}`, `Sprinkler V7 ${label}`]);
  await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
  await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'automatic_sprinkler',1,'{}')", [enabled, revision, template.id]);
  const system = { enabledSystemId: enabled, systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] };
  const snapshot = { schemaVersion: 1, customer: { id: customer, code: `AS-${customer}`, displayName: `Sprinkler V7 ${label}` }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE", version: 7 }, enabledSystems: [system] };
  const contract = v7EvidenceContractSha256(template.definition);
  const job = async (options: { closed?: boolean; visible?: boolean } = {}) => { const value = id(), closed = options.closed === true; await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,completed_at,completed_by_user_id,completed_by_display_name) VALUES($1,$2,$3,$4,$5,false,$6,$7,$8,$9,'2026-09-04',$10,$11,$12)", [value, template.id, `AS-${value}`, `Sprinkler V7 ${label}`, closed ? "closed" : "open", options.visible ?? true, customer, revision, snapshot, closed ? at : null, closed ? actor : null, closed ? "Sprinkler V7 closer" : null]); return value; };
  const reserve = async (clientUuid: string, jobId: string, by = actor) => { await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'automatic_sprinkler',$3,7,$4,$5)", [clientUuid, jobId, template.id, contract, by]); };
  const stage = async (clientUuid: string, jobId: string, fieldPath: string, sourceSha256 = hash(`source:${fieldPath}:${id()}`), storedSha256 = sourceSha256): Promise<Staged> => { const photoUuid = id(); await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'automatic_sprinkler',$4,$5,7,$6,$7,$8,$9,$10,'image/jpeg',1,2,2,1,2,2,$11,'staged')", [photoUuid, clientUuid, jobId, fieldPath, template.id, contract, actor, hash(`stage:${photoUuid}`), sourceSha256, storedSha256, `fixtures/${photoUuid}.jpg`]); return { photoUuid, fieldPath, sourceSha256 }; };
  const envelope = (clientUuid: string, jobId: string, body: Value, evidenceManifest: unknown) => ({ operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId, systemKey: "automatic_sprinkler", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: snapshot.configuration, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: jobId, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses: body, evidenceManifest, performedAt: at } });
  const statuses = async (clientUuid: string) => (await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows.map((row) => row.status);
  return { template, actor, foreign, snapshot, job, reserve, stage, envelope, statuses };
}

test("Automatic Sprinkler V7 accepts checklist, test-run, and measurement evidence with its own remarks", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "happy"), job = await f.job(), client = id();
    await f.reserve(client, job);
    const a = await f.stage(client, job, checkPath("water_level")), b = await f.stage(client, job, checkPath("trfp_jockey_pump")), c = await f.stage(client, job, measurementPath("water_supply_gauge"));
    const body = responses();
    (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
    (body.checklist as Record<string, Value>).trfp_jockey_pump = { result: "complete_repair", remarks: "Jockey pump repaired on the 30 minute run" };
    body.measurements.water_supply_gauge = { values: { value: 90 }, unit: "PSI", result: "not_good", remarks: "Gauge reads low" };
    const result = await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [a, b, c])], f.actor);
    assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));
    assert.deepEqual(await f.statuses(client), ["accepted", "accepted", "accepted"]);
  });
});

test("Automatic Sprinkler V7 never accepts evidence for a finding reverted to good or na", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "stale"), job = await f.job(), client = id();
    await f.reserve(client, job);
    const check = await f.stage(client, job, checkPath("water_level")), gauge = await f.stage(client, job, measurementPath("installation_gauge"));
    const body = responses();
    assert.equal((await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [check, gauge])], f.actor)).failed[0]?.code, "VALIDATION_ERROR");
    assert.equal((await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [])], f.actor)).failed[0]?.code, "EVIDENCE_NOT_STAGED");
    assert.deepEqual(await f.statuses(client), ["staged", "staged"]);
    await database.query("DELETE FROM staged_inspection_evidence WHERE inspection_client_uuid=$1", [client]);
    assert.deepEqual((await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [])], f.actor)).acceptedIds, [client]);
  });
});

test("Automatic Sprinkler V7 refuses a checklist and measurement finding that reuse one named image", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "reuse"), job = await f.job(), client = id();
    await f.reserve(client, job);
    const check = await f.stage(client, job, checkPath("water_level")), gauge = await f.stage(client, job, measurementPath("installation_gauge"));
    const body = responses();
    (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
    body.measurements.installation_gauge = { values: { value: 95 }, unit: "PSI", result: "complete_repair", remarks: "Gauge replaced" };
    const failure = (await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [check, { ...gauge, sourceSha256: check.sourceSha256 }])], f.actor)).failed[0];
    assert.equal(failure?.code, "VALIDATION_ERROR");
    assert.match(String(failure?.message), /same image is attached to more than one finding/);
    assert.notEqual(failure?.message, "This V7 inspection is unavailable");
  });
});

test("Automatic Sprinkler V7 refuses two sources normalizing to the same stored bytes", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "stored"), job = await f.job(), client = id(), stored = hash("normalized");
    await f.reserve(client, job);
    const check = await f.stage(client, job, checkPath("water_level"), hash("source-a"), stored), gauge = await f.stage(client, job, measurementPath("installation_gauge"), hash("source-b"), stored);
    const body = responses();
    (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
    body.measurements.installation_gauge = { values: { value: 95 }, unit: "PSI", result: "not_good", remarks: "Gauge reads low" };
    const failure = (await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [check, gauge])], f.actor)).failed[0];
    assert.equal(failure?.code, "EVIDENCE_NOT_STAGED");
    assert.match(String(failure?.message), /same stored image/);
  });
});

test("Automatic Sprinkler V7 accepts the same image bytes in a different Job", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "cross-job"), one = await f.job(), two = await f.job(), source = hash("shared-source"), stored = hash("shared-stored");
    const submit = async (job: string) => {
      const client = id(); await f.reserve(client, job);
      const photo = await f.stage(client, job, checkPath("water_level"), source, stored);
      const body = responses(); (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
      return { client, result: await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [photo])], f.actor) };
    };
    const first = await submit(one), second = await submit(two);
    assert.deepEqual(first.result.acceptedIds, [first.client]);
    assert.deepEqual(second.result.acceptedIds, [second.client]);
  });
});

test("Automatic Sprinkler V7 concurrent race has one Accepted and one terminal EVIDENCE_CONFLICT / Needs attention", { skip: !databaseUrl, timeout: 30_000 }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "race"), job = await f.job(), source = hash("race-source"), stored = hash("race-stored");
    const contender = async () => {
      const client = id(); await f.reserve(client, job);
      const photo = await f.stage(client, job, checkPath("water_level"), source, stored);
      const body = responses(); (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
      return { client, item: f.envelope(client, job, body, [photo]) };
    };
    const left = await contender(), right = await contender();
    const results = await Promise.all([syncAutomaticSprinklerInspections([left.item], f.actor), syncAutomaticSprinklerInspections([right.item], f.actor)]);
    assert.equal(results.filter((result) => result.acceptedIds.length === 1).length, 1, JSON.stringify(results));
    assert.equal(results.find((result) => result.failed.length === 1)?.failed[0]?.code, "EVIDENCE_CONFLICT", JSON.stringify(results));
  });
});

test("Automatic Sprinkler V7 closed, hidden and forbidden Jobs are idempotent and collapse to JOB_ACCESS_DENIED", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "denied"), closed = await f.job({ closed: true }), hidden = await f.job({ visible: false }), forbidden = await f.job(), unknown = id();
    const probe = async (job: string, by?: number) => { const client = id(); if (by) await f.reserve(client, job, by); return (await syncAutomaticSprinklerInspections([f.envelope(client, job, responses(), [])], f.actor)).failed[0]; };
    for (const failure of [await probe(closed), await probe(closed), await probe(hidden), await probe(unknown), await probe(forbidden, f.foreign)]) {
      assert.deepEqual({ code: failure?.code, message: failure?.message }, { code: "JOB_ACCESS_DENIED", message: "This V7 inspection is unavailable" });
    }
  });
});

test("Automatic Sprinkler V7 accepts a fully clean draft with zero findings and no reservation", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => { const f = await seed(database, "clean"), job = await f.job(), client = id(); const result = await syncAutomaticSprinklerInspections([f.envelope(client, job, responses(), [])], f.actor); assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result)); });
});

// G10 — the accepted snapshot stores the PARSED (fieldPath-sorted) manifest, but a
// retry carries whatever order the client sent and the API accepts any order.  An
// unsorted-but-identical retry must still be duplicate success, not
// IDEMPOTENCY_CONFLICT — after Job closure that is unrecoverable for the technician.
// Proven to fail against the old positional comparison: reverting the one-line
// `sameManifest` swap in `automaticSprinklerV7Acceptance.ts` makes the first retry
// assertion below fail with IDEMPOTENCY_CONFLICT.
test("Automatic Sprinkler V7 exact retry with an unsorted manifest is still duplicate success", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "unsorted-retry"), job = await f.job(), client = id();
    await f.reserve(client, job);
    const check = await f.stage(client, job, checkPath("water_level"));
    const gauge = await f.stage(client, job, measurementPath("water_supply_gauge"));
    // "automatic_sprinkler_checks…" sorts before "automatic_sprinkler_measurements…"; submit the reverse.
    const unsorted = [gauge, check];
    assert.ok(unsorted[0]!.fieldPath.localeCompare(unsorted[1]!.fieldPath) > 0, "fixture must actually be unsorted");
    const body = responses();
    (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
    body.measurements.water_supply_gauge = { values: { value: 90 }, unit: "PSI", result: "not_good", remarks: "Gauge reads low" };
    assert.deepEqual((await syncAutomaticSprinklerInspections([f.envelope(client, job, body, unsorted)], f.actor)).acceptedIds, [client], "first submit accepts");

    const retry = await syncAutomaticSprinklerInspections([f.envelope(client, job, body, unsorted)], f.actor);
    assert.deepEqual(retry.duplicateIds, [client], `unsorted retry must be duplicate success: ${JSON.stringify(retry)}`);
    assert.deepEqual(retry.failed, []);

    await database.query("UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Closer' WHERE id=$1", [job, at, f.actor]);
    assert.deepEqual((await syncAutomaticSprinklerInspections([f.envelope(client, job, body, unsorted)], f.actor)).duplicateIds, [client], "duplicate success survives Job closure");

    // A genuinely different manifest is still a conflict — one entry dropped
    // (length differs) and one entry's bytes changed (same length, different content).
    assert.equal((await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [check])], f.actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
    assert.equal((await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [gauge, { ...check, sourceSha256: hash("g10-different-bytes") }])], f.actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
  });
});

test("Automatic Sprinkler V7 accepted inspection completes into a Final Report", { skip: !databaseUrl }, async () => {
  const uploadsPath = path.join(tmpdir(), `phase8g-sprinkler-report-${randomUUID()}`);
  const previousUploadsPath = process.env.UPLOADS_PATH;
  process.env.UPLOADS_PATH = uploadsPath;
  try {
    await withDatabase(async (database) => {
      const f = await seed(database, "final-report"), job = await f.job(), client = id();
      await f.reserve(client, job);
      const content = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).jpeg().toBuffer();
      const digest = createHash("sha256").update(content).digest("hex");
      const a = await f.stage(client, job, checkPath("water_level"), digest, digest);
      const relative = `inspections/${a.photoUuid}/evidence.jpg`, file = path.join(uploadsPath, ...relative.split("/"));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
      await database.query("UPDATE staged_inspection_evidence SET storage_relative_path=$2 WHERE photo_uuid=$1", [a.photoUuid, relative]);
      const body = responses();
      (body.checklist as Record<string, Value>).water_level = { result: "not_good", remarks: "Water low" };
      const result = await syncAutomaticSprinklerInspections([f.envelope(client, job, body, [a])], f.actor);
      assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));
      await database.query(
        "UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Sprinkler V7 closer' WHERE id=$1",
        [job, at, f.actor]
      );
      const report = await loadFinalServiceReport(job, database);
      assert.equal(report.sections.some((section) => section.systemKey === "automatic_sprinkler"), true, JSON.stringify(report.sections.map((s) => s.systemKey)));
      assert.equal(report.sections[0]?.evidence.length, 1, JSON.stringify(report.sections[0]));
    });
  } finally {
    if (previousUploadsPath === undefined) delete process.env.UPLOADS_PATH; else process.env.UPLOADS_PATH = previousUploadsPath;
    await rm(uploadsPath, { recursive: true, force: true });
  }
});

test("Automatic Sprinkler V1 legacy PSI photo lifecycle is unchanged by the V7 contract", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const v1 = (await database.query<{ id: string; definition: Value }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=1 AND system.system_key='automatic_sprinkler'")).rows[0]!;
    const policy = (await database.query<{ id: string; code: string; version: number; schema_version: number; definition: Value; definition_sha256: string }>("SELECT id,code,version,schema_version,definition,definition_sha256 FROM inspection_evidence_policies WHERE system_key='automatic_sprinkler' AND publication_status='published'")).rows[0]!;
    assert.deepEqual(policy.definition, automaticSprinklerPsiEvidencePolicyV1, "the frozen legacy PSI policy is published unchanged");
    assert.deepEqual(Object.keys((policy.definition as { points: Value }).points).sort(), [...automaticSprinklerPsiFieldPaths].sort(), "the legacy PSI field paths are unchanged");

    const customer = id(), revision = id(), enabled = id(), job = id(), client = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`asp-v1-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Sprinkler V1',false)", [customer, `AV1-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, v1.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'automatic_sprinkler',1,'{}')", [enabled, revision, v1.id]);
    const evidencePolicy = { id: policy.id, code: policy.code, version: policy.version, schemaVersion: policy.schema_version, definition: policy.definition, definitionSha256: policy.definition_sha256 };
    const configuration = { revisionId: revision, revisionNumber: 1 }, template = { id: v1.id, code: "MFE-FSSR", name: "MFE", version: 1 };
    const system = { enabledSystemId: enabled, systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [], evidencePolicy };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `AV1-${customer}`, displayName: "Sprinkler V1" }, site: { id: id(), displayName: "Site" }, configuration, template, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Sprinkler V1','open',false,true,$4,$5,$6,'2026-09-04')", [job, v1.id, `AV1-${job}`, customer, revision, snapshot]);

    const controls = resolveAutomaticSprinklerControls(v1.definition, "MFE-FSSR", 1);
    const checklist = (items: typeof controls.checklist.waterTank) => Object.fromEntries(items.map((item) => [item.key, { result: item.result.options[0]!.value, remarks: "" }]));
    const body = {
      schemaVersion: 1, waterTank: checklist(controls.checklist.waterTank), pumpHouse: checklist(controls.checklist.pumpHouse),
      measurements: Object.fromEntries(controls.measurements.map((item) => [item.key, { values: Object.fromEntries(item.values.map((value) => [value.key, 80])), unit: item.values[0]!.unit, result: item.result.options[0]!.value, remarks: "" }])),
      mainAlarmValve: checklist(controls.checklist.mainAlarmValve), comments: ""
    };
    const item = { operationId: id(), entityType: "masterSystemInspection", entityId: client, action: "create", payload: { clientUuid: client, jobId: job, systemKey: "automatic_sprinkler", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: v1.id, code: "MFE-FSSR", version: 1 }, configuration, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration, template, system }, responses: body, performedAt: at } };
    const result = await syncAutomaticSprinklerInspections([item], actor);
    assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));

    const accepted = (await database.query<{ id: string; evidence_policy_id: string; evidence_policy_sha256: string; snapshot_schema_version: number }>("SELECT id,evidence_policy_id,evidence_policy_sha256,snapshot_schema_version FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]!;
    assert.equal(accepted.evidence_policy_id, policy.id, "the legacy form still binds its frozen PSI policy");
    assert.equal(accepted.evidence_policy_sha256, policy.definition_sha256);
    assert.equal(accepted.snapshot_schema_version, 1, "the legacy snapshot schema is untouched");

    // The legacy PSI photo binds AFTER acceptance, on its own table and path.
    const digest = hash("legacy-psi-photo");
    await database.query("INSERT INTO inspection_attachments(id,client_uuid,form_instance_id,evidence_policy_id,field_path,capture_source,storage_relative_path,source_sha256,stored_sha256,request_fingerprint,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,captured_at,uploaded_by_user_id) VALUES($1,$2,$3,$4,'measurements.jockey_pump_pressure.cut_in','camera',$5,$6,$6,$6,'image/jpeg',8,8,8,8,8,8,now(),$7)", [id(), id(), accepted.id, policy.id, `inspections/${client}/psi.jpg`, digest, actor]);
    const bound = (await database.query<{ field_path: string; evidence_policy_id: string }>("SELECT field_path,evidence_policy_id FROM inspection_attachments WHERE form_instance_id=$1", [accepted.id])).rows;
    assert.deepEqual(bound, [{ field_path: "measurements.jockey_pump_pressure.cut_in", evidence_policy_id: policy.id }]);

    // The two lifecycles never share a row, an index or a policy.
    assert.equal((await database.query("SELECT 1 FROM staged_inspection_evidence WHERE inspection_client_uuid=$1", [client])).rowCount, 0, "a legacy PSI photo never lands in staged V7 evidence");
    const v7 = await seed(database, "coexist"), v7Job = await v7.job(), v7Client = id();
    await v7.reserve(v7Client, v7Job);
    const photo = await v7.stage(v7Client, v7Job, measurementPath("jockey_pump_pressure"), digest, digest);
    const v7Body = responses();
    v7Body.measurements.jockey_pump_pressure = { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "not_good", remarks: "Cut-in pressure is out of range" };
    assert.deepEqual((await syncAutomaticSprinklerInspections([v7.envelope(v7Client, v7Job, v7Body, [photo])], v7.actor)).acceptedIds, [v7Client],
      "a V7 finding photo on the same measurement field is accepted alongside the identical legacy PSI image bytes");
    assert.equal((await database.query("SELECT 1 FROM inspection_attachments WHERE client_uuid=$1", [v7Client])).rowCount, 0, "a V7 finding photo never lands in legacy attachments");
  });
});
