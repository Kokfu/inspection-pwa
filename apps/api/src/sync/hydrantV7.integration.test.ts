import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { acceptHydrantV7Inspection } from "./hydrantV7Acceptance.js";
import { syncHydrantInspections } from "./hydrantInspectionSync.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const at = "2026-09-04T00:00:00.000Z";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("Hydrant V7 accepts field-owned not_good and complete_repair evidence and freezes its manifest", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl }); const lock = await database.connect(); await lock.query("SELECT pg_advisory_lock(819276)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='hydrant'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`hydrant-v7-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Hydrant V7',false)", [customer, `HY-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'hydrant',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "hydrant", displayName: "Hydrant System", sortOrder: 7, definitionStatus: "confirmed", zones: [], locations: [] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `HY-${customer}`, displayName: "Hydrant V7" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Hydrant V7','open',false,true,$4,$5,$6,'2026-09-04')", [job, template.id, `HY-${job}`, customer, revision, snapshot]);
    const contract = v7EvidenceContractSha256(template.definition); await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'hydrant',$3,7,$4,$5)", [clientUuid, job, template.id, contract, actor]);
    const rowA = id(), rowB = id(); const pathA = `hydrant_set.hydrant_rows.rows.${rowA}.canvas_hose_1`, pathB = `hydrant_set.hydrant_rows.rows.${rowB}.landing_valve`;
    const stage = async (fieldPath: string, bytes: string) => { const photoUuid = id(), sourceSha256 = hash(bytes); await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'hydrant',$4,$5,7,$6,$7,$8,$9,$9,'image/jpeg',1,2,2,1,2,2,$10,'staged')", [photoUuid, clientUuid, job, fieldPath, template.id, contract, actor, hash(`stage:${photoUuid}`), sourceSha256, `fixtures/${photoUuid}.jpg`]); return { photoUuid, fieldPath, sourceSha256 }; };
    const evidenceA = await stage(pathA, "A"), evidenceB = await stage(pathB, "B");
    // `v7HydrantManifest` on the web emits the manifest fieldPath-sorted, and the
    // accepted snapshot stores it in exactly that order.  Row UUIDs are random, so
    // submitting `[evidenceA, evidenceB]` raw made the retry below a coin flip:
    // acceptance compares the retry manifest positionally, and half the seeds
    // reordered it into an IDEMPOTENCY_CONFLICT.  Submit what the client submits.
    const manifest = [evidenceA, evidenceB].sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
    const row = (rowUuid: string, change: Record<string, unknown>) => ({ rowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "Bank", canvasHose1Result: "good", canvasHose2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", landingValveHandleResult: "good", hoseCabinetResult: "na", keyLockResult: "good", remarks: "", fieldRemarks: {}, sortOrder: rowUuid === rowA ? 1 : 2, ...change });
    const responses = { schemaVersion: 1, hydrantType: "pressurize", rows: [row(rowA, { canvasHose1Result: "not_good", fieldRemarks: { canvasHose1Result: "Canvas hose damaged" } }), row(rowB, { landingValveResult: "complete_repair", fieldRemarks: { landingValveResult: "Valve repaired" } })], comments: "" };
    const item = { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "hydrant", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses, evidenceManifest: manifest, performedAt: at } };
    const accepted = await acceptHydrantV7Inspection(item, actor); assert.equal(accepted.acceptedIds.includes(clientUuid), true, JSON.stringify(accepted));
    const stored = (await database.query<{ inspection_snapshot: { evidenceManifest: unknown }; response_payload: typeof responses }>("SELECT inspection_snapshot,response_payload FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0]!;
    assert.deepEqual(stored.inspection_snapshot.evidenceManifest, manifest);
    assert.equal(stored.response_payload.rows[0]!.canvasHose1Result, "not_good"); assert.equal(stored.response_payload.rows[1]!.landingValveResult, "complete_repair");
    assert.deepEqual((await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows.map((value) => value.status), ["accepted", "accepted"]);
    assert.deepEqual((await acceptHydrantV7Inspection(item, actor)).duplicateIds, [clientUuid]);
    const changed = structuredClone(item); changed.payload.responses.comments = "changed"; assert.equal((await acceptHydrantV7Inspection(changed, actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
  } finally { await lock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); lock.release(); await database.end(); }
});

type Value = Record<string, unknown>;
type Item = { operationId: string; entityType: string; entityId: string; action: string; payload: Value };
type Staged = { photoUuid: string; fieldPath: string; sourceSha256: string };

const rowPath = (rowUuid: string, column: string) => `hydrant_set.hydrant_rows.rows.${rowUuid}.${column}`;
const hydrantRow = (rowUuid: string, sortOrder: number, change: Value = {}): Value => ({ rowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "Bank", canvasHose1Result: "good", canvasHose2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", landingValveHandleResult: "good", hoseCabinetResult: "na", keyLockResult: "good", remarks: "", fieldRemarks: {}, sortOrder, ...change });
const hydrantResponses = (rows: Value[]): Value => ({ schemaVersion: 1, hydrantType: "pressurize", rows, comments: "" });

/** Every case owns a cold schema.  The advisory lock is the same one the happy
 * path takes, so the suites still serialize against one disposable Postgres. */
async function withV7Database(run: (database: pg.Pool) => Promise<void>) {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819276)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    await run(database);
  } finally {
    await lock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined);
    lock.release();
    await database.end();
  }
}

/** Mirrors the happy path's seed exactly; only the per-case Jobs, reservations,
 * staged rows and payloads differ. */
async function seedHydrantV7(database: pg.Pool, label: string) {
  const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='hydrant'")).rows[0]!;
  const customer = id(), revision = id(), enabled = id();
  const user = async (role: string) => (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id", [`hydrant-v7-${label}-${id()}`, role])).rows[0]!.id;
  const actor = await user("inspector"), foreign = await user("inspector");
  await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,false)", [customer, `HY-${customer}`, `Hydrant V7 ${label}`]);
  await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
  await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'hydrant',1,'{}')", [enabled, revision, template.id]);
  const system = { enabledSystemId: enabled, systemKey: "hydrant", displayName: "Hydrant System", sortOrder: 7, definitionStatus: "confirmed", zones: [], locations: [] };
  const snapshot = { schemaVersion: 1, customer: { id: customer, code: `HY-${customer}`, displayName: `Hydrant V7 ${label}` }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
  const contract = v7EvidenceContractSha256(template.definition);

  const makeJob = async (options: { status?: "open" | "closed"; technicianVisible?: boolean } = {}) => {
    const job = id(); const closed = options.status === "closed";
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,completed_at,completed_by_user_id,completed_by_display_name) VALUES($1,$2,$3,$4,$5,false,$6,$7,$8,$9,'2026-09-04',$10,$11,$12)", [job, template.id, `HY-${job}`, `Hydrant V7 ${label}`, options.status ?? "open", options.technicianVisible ?? true, customer, revision, snapshot, closed ? at : null, closed ? actor : null, closed ? "Hydrant V7 closer" : null]);
    return job;
  };
  const reserve = async (clientUuid: string, job: string, reservedBy = actor) => {
    await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'hydrant',$3,7,$4,$5)", [clientUuid, job, template.id, contract, reservedBy]);
  };
  const stage = async (options: { clientUuid: string; job: string; fieldPath: string; sourceSha256?: string; storedSha256?: string }): Promise<Staged> => {
    const photoUuid = id();
    const sourceSha256 = options.sourceSha256 ?? hash(`source:${photoUuid}`);
    const storedSha256 = options.storedSha256 ?? sourceSha256;
    await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'hydrant',$4,$5,7,$6,$7,$8,$9,$10,'image/jpeg',1,2,2,1,2,2,$11,'staged')", [photoUuid, options.clientUuid, options.job, options.fieldPath, template.id, contract, actor, hash(`stage:${photoUuid}`), sourceSha256, storedSha256, `fixtures/${photoUuid}.jpg`]);
    return { photoUuid, fieldPath: options.fieldPath, sourceSha256 };
  };
  const envelope = (options: { clientUuid: string; job: string; responses: unknown; evidenceManifest: unknown }): Item => ({
    operationId: id(), entityType: "masterSystemInspection", entityId: options.clientUuid, action: "create",
    payload: { clientUuid: options.clientUuid, jobId: options.job, systemKey: "hydrant", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: options.job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses: options.responses, evidenceManifest: options.evidenceManifest, performedAt: at }
  });
  const statuses = async (clientUuid: string) => (await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows.map((value) => value.status);

  return { template, actor, foreign, contract, makeJob, reserve, stage, envelope, statuses };
}

// Case 1 — a photo staged for a finding the technician then reverted is stale.
// It must never reach `accepted`: not while it is still named by the manifest,
// and not while it merely lingers as a staged row the manifest has dropped.
test("Hydrant V7 never accepts evidence for a finding reverted to good or na", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedHydrantV7(database, "stale");
    const job = await fixture.makeJob(), clientUuid = id(), rowA = id(), rowB = id();
    await fixture.reserve(clientUuid, job);
    const hose = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowA, "canvas_hose_1") });
    const valve = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowB, "landing_valve") });
    // Reverted: canvas hose back to `good`, landing valve back to `na`.
    const reverted = hydrantResponses([hydrantRow(rowA, 1), hydrantRow(rowB, 2, { landingValveResult: "na" })]);

    const stillNamed = (await acceptHydrantV7Inspection(fixture.envelope({ clientUuid, job, responses: reverted, evidenceManifest: [hose, valve] }), fixture.actor)).failed[0];
    assert.equal(stillNamed?.code, "VALIDATION_ERROR", JSON.stringify(stillNamed));
    assert.equal(stillNamed?.message, "V7 evidence photos do not match the current findings");

    const dropped = (await acceptHydrantV7Inspection(fixture.envelope({ clientUuid, job, responses: reverted, evidenceManifest: [] }), fixture.actor)).failed[0];
    assert.equal(dropped?.code, "EVIDENCE_NOT_STAGED", JSON.stringify(dropped));
    assert.deepEqual(await fixture.statuses(clientUuid), ["staged", "staged"], "stale evidence is never accepted");

    // Once the client prunes the stale rows the same reverted payload accepts with no evidence at all.
    await database.query("DELETE FROM staged_inspection_evidence WHERE inspection_client_uuid=$1", [clientUuid]);
    const accepted = await acceptHydrantV7Inspection(fixture.envelope({ clientUuid, job, responses: reverted, evidenceManifest: [] }), fixture.actor);
    assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
    assert.equal((await database.query("SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1 AND status='accepted'", [job])).rowCount, 0);
    assert.deepEqual((await database.query<{ inspection_snapshot: { evidenceManifest: unknown[] } }>("SELECT inspection_snapshot FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0]!.inspection_snapshot.evidenceManifest, []);
  });
});

// Case 2 (G7) — one photo on two findings is the technician's own mistake, so
// the refusal must name it through the sync entry point and must NOT masquerade
// as "This V7 inspection is unavailable".
test("Hydrant V7 refuses one photo reused across two findings and names the reused image", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedHydrantV7(database, "reuse");
    const job = await fixture.makeJob(), clientUuid = id(), rowA = id(), rowB = id();
    await fixture.reserve(clientUuid, job);
    const hose = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowA, "canvas_hose_1") });
    const valve = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowB, "landing_valve") });
    const responses = hydrantResponses([
      hydrantRow(rowA, 1, { canvasHose1Result: "not_good", fieldRemarks: { canvasHose1Result: "Canvas hose damaged" } }),
      hydrantRow(rowB, 2, { landingValveResult: "complete_repair", fieldRemarks: { landingValveResult: "Valve repaired" } })
    ]);
    const reused = [hose, { ...valve, sourceSha256: hose.sourceSha256 }];

    const outcome = await syncHydrantInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: reused })], fixture.actor);
    const failure = outcome.failed[0];
    assert.deepEqual(outcome.acceptedIds, []);
    assert.equal(failure?.id, clientUuid);
    assert.equal(failure?.code, "VALIDATION_ERROR", JSON.stringify(failure));
    assert.notEqual(failure?.code, "JOB_ACCESS_DENIED");
    assert.notEqual(failure?.message, "This V7 inspection is unavailable");
    assert.match(String(failure?.message), /same image is attached to more than one finding/);
    assert.deepEqual(await fixture.statuses(clientUuid), ["staged", "staged"]);
  });
});

// Case 3 — two genuinely different source images can still normalize to the same
// stored bytes.  The manifest cannot see that; only the staged rows can.
test("Hydrant V7 refuses two source images that normalize to the same stored bytes", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedHydrantV7(database, "stored");
    const job = await fixture.makeJob(), clientUuid = id(), rowA = id(), rowB = id();
    await fixture.reserve(clientUuid, job);
    const stored = hash("one-normalized-jpeg");
    const hose = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowA, "canvas_hose_1"), sourceSha256: hash("camera-a"), storedSha256: stored });
    const valve = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowB, "landing_valve"), sourceSha256: hash("camera-b"), storedSha256: stored });
    assert.notEqual(hose.sourceSha256, valve.sourceSha256, "the manifest itself cannot detect this collision");
    const responses = hydrantResponses([
      hydrantRow(rowA, 1, { canvasHose1Result: "not_good", fieldRemarks: { canvasHose1Result: "Canvas hose damaged" } }),
      hydrantRow(rowB, 2, { landingValveResult: "not_good", fieldRemarks: { landingValveResult: "Valve seized" } })
    ]);

    const failure = (await syncHydrantInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [hose, valve] })], fixture.actor)).failed[0];
    assert.equal(failure?.code, "EVIDENCE_NOT_STAGED", JSON.stringify(failure));
    assert.match(String(failure?.message), /same stored image/);
    assert.deepEqual(await fixture.statuses(clientUuid), ["staged", "staged"]);
  });
});

// Case 4 — the accepted-evidence identity is scoped to one Job + system.  The
// same bytes in a different Job are a different site visit, and are accepted.
test("Hydrant V7 accepts the same image bytes in a different Job", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedHydrantV7(database, "cross-job");
    const firstJob = await fixture.makeJob(), secondJob = await fixture.makeJob();
    const source = hash("shared-source"), stored = hash("shared-stored");
    const submit = async (job: string) => {
      const clientUuid = id(), rowUuid = id();
      await fixture.reserve(clientUuid, job);
      const photo = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowUuid, "canvas_hose_1"), sourceSha256: source, storedSha256: stored });
      const responses = hydrantResponses([hydrantRow(rowUuid, 1, { canvasHose1Result: "not_good", fieldRemarks: { canvasHose1Result: "Canvas hose damaged" } })]);
      return { clientUuid, outcome: await syncHydrantInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [photo] })], fixture.actor) };
    };
    const first = await submit(firstJob);
    assert.deepEqual(first.outcome.acceptedIds, [first.clientUuid], JSON.stringify(first.outcome));
    const second = await submit(secondJob);
    assert.deepEqual(second.outcome.acceptedIds, [second.clientUuid], JSON.stringify(second.outcome));
    assert.deepEqual(await fixture.statuses(first.clientUuid), ["accepted"]);
    assert.deepEqual(await fixture.statuses(second.clientUuid), ["accepted"]);
    assert.equal((await database.query("SELECT 1 FROM staged_inspection_evidence WHERE source_sha256=$1 AND status='accepted'", [source])).rowCount, 2);
  });
});

// Case 5 — two concurrent acceptances competing for the same image identity in
// one Job.  Exactly one wins; the loser is a retryable EVIDENCE_CONFLICT, never
// a SERVER_ERROR and never a silent second bind.
test("Hydrant V7 concurrent acceptance binds one image once and fails the loser with EVIDENCE_CONFLICT", { skip: !databaseUrl, timeout: 30_000 }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedHydrantV7(database, "race");
    const job = await fixture.makeJob();
    const source = hash("race-source"), stored = hash("race-stored");
    const contender = async () => {
      const clientUuid = id(), rowUuid = id();
      await fixture.reserve(clientUuid, job);
      const photo = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowUuid, "canvas_hose_1"), sourceSha256: source, storedSha256: stored });
      const responses = hydrantResponses([hydrantRow(rowUuid, 1, { canvasHose1Result: "not_good", fieldRemarks: { canvasHose1Result: "Canvas hose damaged" } })]);
      return { clientUuid, item: fixture.envelope({ clientUuid, job, responses, evidenceManifest: [photo] }) };
    };
    const left = await contender(), right = await contender();
    const [leftResult, rightResult] = await Promise.all([
      syncHydrantInspections([left.item], fixture.actor),
      syncHydrantInspections([right.item], fixture.actor)
    ]);
    const results = [leftResult, rightResult];
    const winners = results.filter((value) => value.acceptedIds.length === 1);
    const losers = results.filter((value) => value.failed.length === 1);
    assert.equal(winners.length, 1, `exactly one concurrent acceptance wins: ${JSON.stringify(results)}`);
    assert.equal(losers.length, 1, `exactly one concurrent acceptance loses: ${JSON.stringify(results)}`);
    assert.equal(losers[0]!.acceptedIds.length, 0);
    assert.equal(losers[0]!.failed[0]!.code, "EVIDENCE_CONFLICT", JSON.stringify(losers[0]!.failed[0]));
    assert.equal((await database.query("SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1 AND status='accepted'", [job])).rowCount, 1, "the image is bound exactly once");
    assert.equal((await database.query("SELECT 1 FROM master_system_form_instances WHERE client_uuid=ANY($1::uuid[])", [[left.clientUuid, right.clientUuid]])).rowCount, 1);
  });
});

// Case 6 — a closed, hidden, unknown or forbidden Job must be indistinguishable.
// Any difference at all would let a technician enumerate other customers' Jobs.
test("Hydrant V7 collapses closed, hidden, unknown and forbidden Jobs into one JOB_ACCESS_DENIED", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedHydrantV7(database, "denied");
    const closedJob = await fixture.makeJob({ status: "closed" });
    const hiddenJob = await fixture.makeJob({ technicianVisible: false });
    const forbiddenJob = await fixture.makeJob();
    const unknownJob = id();
    const probe = async (job: string, reservedBy?: number) => {
      const clientUuid = id(), rowUuid = id();
      if (reservedBy !== undefined) await fixture.reserve(clientUuid, job, reservedBy);
      const responses = hydrantResponses([hydrantRow(rowUuid, 1)]);
      const outcome = await syncHydrantInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [] })], fixture.actor);
      assert.deepEqual(outcome.acceptedIds, []);
      assert.deepEqual(outcome.duplicateIds, []);
      assert.equal(outcome.failed[0]?.id, clientUuid);
      return { code: outcome.failed[0]?.code, message: outcome.failed[0]?.message };
    };
    const outcomes = [
      await probe(closedJob),
      await probe(hiddenJob),
      await probe(unknownJob),
      // Forbidden: the Job is open and visible, but the reservation belongs to another technician.
      await probe(forbiddenJob, fixture.foreign)
    ];
    for (const value of outcomes) assert.deepEqual(value, { code: "JOB_ACCESS_DENIED", message: "This V7 inspection is unavailable" }, JSON.stringify(outcomes));
    assert.equal((await database.query("SELECT 1 FROM master_system_form_instances")).rowCount, 0);
  });
});

test("Hydrant V7 accepts a fully clean draft with zero findings and no reservation", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedHydrantV7(database, "clean");
    const job = await fixture.makeJob(), clientUuid = id(), rowUuid = id();
    const responses = hydrantResponses([hydrantRow(rowUuid, 1)]);
    const outcome = await syncHydrantInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [] })], fixture.actor);
    assert.deepEqual(outcome.acceptedIds, [clientUuid], JSON.stringify(outcome));
  });
});

// Case 7 — the V7 dispatch is additive.  A V1 Hydrant record still travels the
// historical path, keeps the 2-state result model and the schemaVersion-1
// accepted snapshot, and never touches staged evidence.
test("Hydrant V1 still accepts unchanged through the historical path", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const v1 = (await database.query<{ id: string; definition: Value }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=1 AND system.system_key='hydrant'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id(), rowUuid = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`hydrant-v1-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Hydrant V1',false)", [customer, `HY1-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, v1.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'hydrant',1,'{}')", [enabled, revision, v1.id]);
    const system = { enabledSystemId: enabled, systemKey: "hydrant", displayName: "Hydrant System", sortOrder: 7, definitionStatus: "confirmed", zones: [], locations: [] };
    const customerSnapshot = { id: customer, code: `HY1-${customer}`, displayName: "Hydrant V1" };
    const configuration = { revisionId: revision, revisionNumber: 1 };
    const templateSnapshot = { id: v1.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 1 };
    const snapshot = { schemaVersion: 1, customer: customerSnapshot, site: { id: id(), displayName: "Site" }, configuration, template: templateSnapshot, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Hydrant V1','open',false,true,$4,$5,$6,'2026-09-04')", [job, v1.id, `HY1-${job}`, customer, revision, snapshot]);
    // V1 rows are 2-state (`good` / `poor`) and carry no `fieldRemarks`.
    const responses = { schemaVersion: 1, hydrantType: "meter", rows: [{ rowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "HYD-1", locationText: "North gate", canvasHose1Result: "good", canvasHose2Result: "poor", diffuserNozzleResult: "good", landingValveResult: "good", landingValveHandleResult: "poor", hoseCabinetResult: "good", keyLockResult: "good", remarks: "Checked", sortOrder: 1 }], comments: "Hydrant V1 historical" };
    const inspectionSnapshot = { schemaVersion: 1, capturedAt: at, job: { id: job, reference: `HY1-${job}`, title: "Hydrant V1" }, customer: customerSnapshot, configuration, template: templateSnapshot, system: { ...system, definition: v1.definition, repetitionMode: "single_with_repeatable_rows" } };
    const item: Item = { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "hydrant", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: v1.id, code: "MFE-FSSR", version: 1 }, configuration, inspectionSnapshot, responses, performedAt: at } };

    const accepted = await syncHydrantInspections([item], actor);
    assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
    const stored = (await database.query<{ snapshot_schema_version: number; inspection_snapshot: Value; response_payload: { rows: Array<Record<string, string>> } }>("SELECT snapshot_schema_version,inspection_snapshot,response_payload FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0]!;
    assert.equal(stored.snapshot_schema_version, 1);
    assert.equal(stored.response_payload.rows[0]!.canvasHose2Result, "poor");
    assert.equal(Object.hasOwn(stored.inspection_snapshot, "acceptedAt"), true);
    assert.equal(Object.hasOwn(stored.inspection_snapshot, "capturedAt"), false);
    assert.equal(Object.hasOwn(stored.inspection_snapshot, "evidenceManifest"), false, "the historical path stays evidence-free");
    assert.deepEqual((await syncHydrantInspections([item], actor)).duplicateIds, [clientUuid], "the historical idempotency contract is unchanged");
    assert.equal((await database.query("SELECT 1 FROM staged_inspection_evidence")).rowCount, 0);
  });
});
