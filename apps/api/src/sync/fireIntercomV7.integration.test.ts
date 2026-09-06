import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../db/migrations.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { loadFinalServiceReport } from "../reports/finalServiceReport.js";
import { acceptFireIntercomV7Inspection, syncFireIntercomInspections } from "./fireIntercomV7Acceptance.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const at = "2026-09-06T00:00:00.000Z";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const lockKey = 819282;

type Value = Record<string, unknown>;
type Item = { operationId: string; entityType: string; entityId: string; action: string; payload: Value };
type Staged = { photoUuid: string; fieldPath: string; sourceSha256: string };

const rowPath = (rowUuid: string) => `station_schedule.station_schedule_rows.rows.${rowUuid}.condition`;
/** A technician write-in station row, as the web form's `addRow()` emits it. */
const intercomRow = (rowUuid: string, sortOrder: number, change: Value = {}): Value => ({ rowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", conditionResult: "good", remarks: "", fieldRemarks: {}, sortOrder, ...change });
/** Fire Intercom has NO header fields and no checklist at all - the whole
 * response is the station rows plus one section-level comments string. */
const intercomResponses = (rows: Value[], comments = ""): Value => ({ schemaVersion: 1, rows, comments });

test("Fire Intercom V7 accepts field-owned not_good/complete_repair Station Schedule evidence and freezes its manifest", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl }); const lock = await database.connect(); await lock.query(`SELECT pg_advisory_lock(${lockKey})`);
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fire_intercom'")).rows[0]!;
    assert.ok(template, "fire_intercom must be seeded on V7");
    const customer = id(), revision = id(), enabled = id(), job = id(), clientUuid = id();
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fire-intercom-v7-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Fire Intercom V7',false)", [customer, `FI-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_intercom',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "fire_intercom", displayName: "Fire Intercom System", sortOrder: 11, definitionStatus: "confirmed", zones: [], locations: [] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `FI-${customer}`, displayName: "Fire Intercom V7" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Fire Intercom V7','open',false,true,$4,$5,$6,'2026-09-06')", [job, template.id, `FI-${job}`, customer, revision, snapshot]);
    const contract = v7EvidenceContractSha256(template.definition); await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'fire_intercom',$3,7,$4,$5)", [clientUuid, job, template.id, contract, actor]);
    const rowA = id(), rowB = id();
    const stage = async (fieldPath: string, bytes: string) => { const photoUuid = id(), sourceSha256 = hash(bytes); await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'fire_intercom',$4,$5,7,$6,$7,$8,$9,$9,'image/jpeg',1,2,2,1,2,2,$10,'staged')", [photoUuid, clientUuid, job, fieldPath, template.id, contract, actor, hash(`stage:${photoUuid}`), sourceSha256, `fixtures/${photoUuid}.jpg`]); return { photoUuid, fieldPath, sourceSha256 }; };
    const evidenceA = await stage(rowPath(rowA), "A"), evidenceB = await stage(rowPath(rowB), "B");
    const manifest = [evidenceA, evidenceB].sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
    const responses = intercomResponses([
      intercomRow(rowA, 1, { assetReference: "Grd Floor", conditionResult: "not_good", fieldRemarks: { conditionResult: "Grd Floor station is silent" } }),
      intercomRow(rowB, 2, { assetReference: "Basement", conditionResult: "complete_repair", fieldRemarks: { conditionResult: "Basement handset replaced on site" } })
    ], "One handset replaced");
    const item = { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "fire_intercom", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses, evidenceManifest: manifest, performedAt: at } };
    const accepted = await acceptFireIntercomV7Inspection(item, actor); assert.equal(accepted.acceptedIds.includes(clientUuid), true, JSON.stringify(accepted));
    const stored = (await database.query<{ inspection_snapshot: { evidenceManifest: unknown }; response_payload: Value }>("SELECT inspection_snapshot,response_payload FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0]!;
    assert.deepEqual(stored.inspection_snapshot.evidenceManifest, manifest);
    assert.equal((stored.response_payload.rows as Value[])[0]!.conditionResult, "not_good");
    assert.equal((stored.response_payload.rows as Value[])[1]!.conditionResult, "complete_repair");
    assert.deepEqual((await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows.map((value) => value.status), ["accepted", "accepted"]);
    assert.deepEqual((await acceptFireIntercomV7Inspection(item, actor)).duplicateIds, [clientUuid]);
    const changed = structuredClone(item); (changed.payload.responses as Value).comments = "changed"; assert.equal((await acceptFireIntercomV7Inspection(changed, actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
  } finally { await lock.query(`SELECT pg_advisory_unlock(${lockKey})`).catch(() => undefined); lock.release(); await database.end(); }
});

/** Every case owns a cold schema.  The advisory lock is the same one the happy
 * path takes, so the suites still serialize against one disposable Postgres. */
async function withV7Database(run: (database: pg.Pool) => Promise<void>) {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query(`SELECT pg_advisory_lock(${lockKey})`);
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    await run(database);
  } finally {
    await lock.query(`SELECT pg_advisory_unlock(${lockKey})`).catch(() => undefined);
    lock.release();
    await database.end();
  }
}

/** Mirrors the happy path's seed exactly; only the per-case Jobs, reservations,
 * staged rows and payloads differ. */
async function seedFireIntercomV7(database: pg.Pool, label: string) {
  const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fire_intercom'")).rows[0]!;
  const customer = id(), revision = id(), enabled = id();
  const user = async (role: string) => (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id", [`fire-intercom-v7-${label}-${id()}`, role])).rows[0]!.id;
  const actor = await user("inspector"), foreign = await user("inspector");
  await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,false)", [customer, `FI-${customer}`, `Fire Intercom V7 ${label}`]);
  await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
  await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_intercom',1,'{}')", [enabled, revision, template.id]);
  const system = { enabledSystemId: enabled, systemKey: "fire_intercom", displayName: "Fire Intercom System", sortOrder: 11, definitionStatus: "confirmed", zones: [], locations: [] };
  const snapshot = { schemaVersion: 1, customer: { id: customer, code: `FI-${customer}`, displayName: `Fire Intercom V7 ${label}` }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
  const contract = v7EvidenceContractSha256(template.definition);

  /** `locations` freezes configured station rows into the Job snapshot, the way
   * `serviceVisits.ts` does for a customer that has been given structure. Every
   * other case deliberately leaves it empty - a customer with no configured
   * locations is legal, and per this system's `confirmationNotes` a Fire
   * Intercom customer with no preset rows starts with an empty table. */
  const makeJob = async (options: { status?: "open" | "closed"; technicianVisible?: boolean; locations?: Value[] } = {}) => {
    const job = id(); const closed = options.status === "closed";
    const jobSnapshot = options.locations
      ? { ...snapshot, enabledSystems: [{ ...system, locations: options.locations }] }
      : snapshot;
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,completed_at,completed_by_user_id,completed_by_display_name) VALUES($1,$2,$3,$4,$5,false,$6,$7,$8,$9,'2026-09-06',$10,$11,$12)", [job, template.id, `FI-${job}`, `Fire Intercom V7 ${label}`, options.status ?? "open", options.technicianVisible ?? true, customer, revision, jobSnapshot, closed ? at : null, closed ? actor : null, closed ? "Fire Intercom V7 closer" : null]);
    return job;
  };
  const configuredLocation = (values: { displayName: string; presetRowCount: number; assetReference: string; sortOrder: number }) => ({
    id: id(), enabledSystemId: enabled, zoneId: null, key: `station-${values.sortOrder}`,
    displayName: values.displayName, presetRowCount: values.presetRowCount,
    rowPreset: { assetReference: values.assetReference }, sortOrder: values.sortOrder
  });
  const reserve = async (clientUuid: string, job: string, reservedBy = actor) => {
    await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,'fire_intercom',$3,7,$4,$5)", [clientUuid, job, template.id, contract, reservedBy]);
  };
  const stage = async (options: { clientUuid: string; job: string; fieldPath: string; sourceSha256?: string; storedSha256?: string }): Promise<Staged> => {
    const photoUuid = id();
    const sourceSha256 = options.sourceSha256 ?? hash(`source:${photoUuid}`);
    const storedSha256 = options.storedSha256 ?? sourceSha256;
    await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,'fire_intercom',$4,$5,7,$6,$7,$8,$9,$10,'image/jpeg',1,2,2,1,2,2,$11,'staged')", [photoUuid, options.clientUuid, options.job, options.fieldPath, template.id, contract, actor, hash(`stage:${photoUuid}`), sourceSha256, storedSha256, `fixtures/${photoUuid}.jpg`]);
    return { photoUuid, fieldPath: options.fieldPath, sourceSha256 };
  };
  const envelope = (options: { clientUuid: string; job: string; responses: unknown; evidenceManifest: unknown }): Item => ({
    operationId: id(), entityType: "masterSystemInspection", entityId: options.clientUuid, action: "create",
    payload: { clientUuid: options.clientUuid, jobId: options.job, systemKey: "fire_intercom", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: options.job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" } }, responses: options.responses, evidenceManifest: options.evidenceManifest, performedAt: at }
  });
  const statuses = async (clientUuid: string) => (await database.query<{ status: string }>("SELECT status FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows.map((value) => value.status);

  return { template, actor, foreign, contract, makeJob, configuredLocation, reserve, stage, envelope, statuses };
}

/** A configured row as the web's `configuredRows()` emits it. */
const configuredRow = (location: Value, ordinal: number, sortOrder: number, change: Value = {}): Value => ({
  rowUuid: id(), source: "configured", configuredLocationId: location.id, configuredRowOrdinal: ordinal,
  zoneSnapshot: null, locationSnapshot: { id: location.id, displayName: location.displayName },
  assetReference: (location.rowPreset as Value).assetReference, conditionResult: "good",
  remarks: "", fieldRemarks: {}, sortOrder, ...change
});

// Case 9 — every other case runs with `locations: []`, which never exercises
// the configured-row path at all.  A customer that HAS been given preset
// station rows must have them authenticated against the frozen snapshot:
// retained exactly, not dropped, and not re-labelled by the client.
test("Fire Intercom V7 authenticates configured Station rows against the frozen snapshot", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "configured-rows");
    const ground = fixture.configuredLocation({ displayName: "Grd Floor", presetRowCount: 2, assetReference: "Grd Floor", sortOrder: 1 });
    const basement = fixture.configuredLocation({ displayName: "Basement", presetRowCount: 1, assetReference: "Basement", sortOrder: 2 });
    const job = await fixture.makeJob({ locations: [ground, basement] });

    // Happy path: all three configured rows retained in frozen order, plus one write-in row.
    const retained = () => [configuredRow(ground, 1, 1), configuredRow(ground, 2, 2), configuredRow(basement, 1, 3)];
    const clean = id();
    const accepted = await syncFireIntercomInspections([fixture.envelope({ clientUuid: clean, job, responses: intercomResponses([...retained(), intercomRow(id(), 4)]), evidenceManifest: [] })], fixture.actor);
    assert.deepEqual(accepted.acceptedIds, [clean], JSON.stringify(accepted));

    // Dropping a configured row is refused (C3 invariant 1: configured rows are retained).
    const dropped = id();
    const droppedOutcome = await syncFireIntercomInspections([fixture.envelope({ clientUuid: dropped, job, responses: intercomResponses(retained().slice(0, 2)), evidenceManifest: [] })], fixture.actor);
    assert.equal(droppedOutcome.failed[0]?.code, "VALIDATION_ERROR", JSON.stringify(droppedOutcome));

    // A client that re-labels the authoritative location name is refused.
    const renamed = id();
    const tampered = retained();
    (tampered[0]!.locationSnapshot as Value).displayName = "Somewhere Else";
    const renamedOutcome = await syncFireIntercomInspections([fixture.envelope({ clientUuid: renamed, job, responses: intercomResponses(tampered), evidenceManifest: [] })], fixture.actor);
    assert.equal(renamedOutcome.failed[0]?.code, "VALIDATION_ERROR", JSON.stringify(renamedOutcome));

    // A client that rewrites the frozen station label is refused.
    const reAssetted = id();
    const swapped = retained();
    swapped[2]!.assetReference = "Genset";
    const assetOutcome = await syncFireIntercomInspections([fixture.envelope({ clientUuid: reAssetted, job, responses: intercomResponses(swapped), evidenceManifest: [] })], fixture.actor);
    assert.equal(assetOutcome.failed[0]?.code, "VALIDATION_ERROR", JSON.stringify(assetOutcome));

    // A technician write-in row claiming configured provenance is refused.
    const forged = id();
    const fake = [...retained(), intercomRow(id(), 4, { source: "configured", configuredLocationId: ground.id, configuredRowOrdinal: 9 })];
    const forgedOutcome = await syncFireIntercomInspections([fixture.envelope({ clientUuid: forged, job, responses: intercomResponses(fake), evidenceManifest: [] })], fixture.actor);
    assert.equal(forgedOutcome.failed[0]?.code, "VALIDATION_ERROR", JSON.stringify(forgedOutcome));

    assert.equal((await database.query("SELECT 1 FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$1", [job])).rowCount ?? 0, 1, "only the clean submission was accepted");
  });
});

// Case 10 (G10, carried in from day one) — the accepted snapshot stores the
// PARSED (fieldPath-sorted) manifest while a retry carries whatever order the
// client sent, and the API accepts any order.  An unsorted-but-identical retry
// must still be duplicate success, not IDEMPOTENCY_CONFLICT — after Job closure
// that would be unrecoverable for the technician.
test("Fire Intercom V7 exact retry with an unsorted manifest is still duplicate success", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "unsorted-retry");
    const job = await fixture.makeJob(), clientUuid = id();
    await fixture.reserve(clientUuid, job);
    // Two row UUIDs whose derived fieldPaths sort in a known order, then submit
    // the manifest deliberately reversed.
    const rowLow = "00000000-0000-4000-8000-00000000000a";
    const rowHigh = "ffffffff-ffff-4fff-8fff-ffffffffff0f";
    const low = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowLow) });
    const high = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowHigh) });
    const unsorted = [high, low];
    assert.ok(unsorted[0]!.fieldPath.localeCompare(unsorted[1]!.fieldPath) > 0, "fixture must actually be unsorted");
    const responses = intercomResponses([
      intercomRow(rowLow, 1, { conditionResult: "not_good", fieldRemarks: { conditionResult: "Station is silent" } }),
      intercomRow(rowHigh, 2, { conditionResult: "complete_repair", fieldRemarks: { conditionResult: "Handset replaced on site" } })
    ]);
    const item = fixture.envelope({ clientUuid, job, responses, evidenceManifest: unsorted });
    const first = await syncFireIntercomInspections([item], fixture.actor);
    assert.deepEqual(first.acceptedIds, [clientUuid], JSON.stringify(first));

    const retry = await syncFireIntercomInspections([item], fixture.actor);
    assert.deepEqual(retry.duplicateIds, [clientUuid], `unsorted retry must be duplicate success: ${JSON.stringify(retry)}`);
    assert.deepEqual(retry.failed, []);

    // Same again once the Job is closed — the case a technician actually hits.
    await database.query("UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Closer' WHERE id=$1", [job, at, fixture.actor]);
    const afterClose = await syncFireIntercomInspections([item], fixture.actor);
    assert.deepEqual(afterClose.duplicateIds, [clientUuid], JSON.stringify(afterClose));

    // A dropped manifest entry is still a conflict, not a false duplicate.
    const droppedEntry = fixture.envelope({ clientUuid, job, responses, evidenceManifest: [low] });
    assert.equal((await syncFireIntercomInspections([droppedEntry], fixture.actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");

    // So is a changed sourceSha256 on an otherwise identical entry.
    const changedSource = fixture.envelope({ clientUuid, job, responses, evidenceManifest: [{ ...high, sourceSha256: hash("different-bytes") }, low] });
    assert.equal((await syncFireIntercomInspections([changedSource], fixture.actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
  });
});

// Case 1 — a photo staged for a finding the technician then reverted is stale.
// It must never reach `accepted`: not while it is still named by the manifest,
// and not while it merely lingers as a staged row the manifest has dropped.
test("Fire Intercom V7 never accepts evidence for a finding reverted to good or na", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "stale");
    const job = await fixture.makeJob(), clientUuid = id(), rowA = id(), rowB = id();
    await fixture.reserve(clientUuid, job);
    const photoA = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowA) });
    const photoB = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowB) });
    // Reverted: rowA back to `good`, rowB back to `na`.
    const reverted = intercomResponses([intercomRow(rowA, 1), intercomRow(rowB, 2, { conditionResult: "na" })]);

    const stillNamed = (await acceptFireIntercomV7Inspection(fixture.envelope({ clientUuid, job, responses: reverted, evidenceManifest: [photoA, photoB] }), fixture.actor)).failed[0];
    assert.equal(stillNamed?.code, "VALIDATION_ERROR", JSON.stringify(stillNamed));
    assert.equal(stillNamed?.message, "V7 evidence photos do not match the current findings");

    const dropped = (await acceptFireIntercomV7Inspection(fixture.envelope({ clientUuid, job, responses: reverted, evidenceManifest: [] }), fixture.actor)).failed[0];
    assert.equal(dropped?.code, "EVIDENCE_NOT_STAGED", JSON.stringify(dropped));
    assert.deepEqual(await fixture.statuses(clientUuid), ["staged", "staged"], "stale evidence is never accepted");

    // Once the client prunes the stale rows the same reverted payload accepts with no evidence at all.
    await database.query("DELETE FROM staged_inspection_evidence WHERE inspection_client_uuid=$1", [clientUuid]);
    const accepted = await acceptFireIntercomV7Inspection(fixture.envelope({ clientUuid, job, responses: reverted, evidenceManifest: [] }), fixture.actor);
    assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
    assert.equal((await database.query("SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1 AND status='accepted'", [job])).rowCount, 0);
    assert.deepEqual((await database.query<{ inspection_snapshot: { evidenceManifest: unknown[] } }>("SELECT inspection_snapshot FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0]!.inspection_snapshot.evidenceManifest, []);
  });
});

// Case 2 (G7) — one photo on two findings is the technician's own mistake, so
// the refusal must name it through the sync entry point and must NOT masquerade
// as "This V7 inspection is unavailable".
test("Fire Intercom V7 refuses one photo reused across two findings and names the reused image", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "reuse");
    const job = await fixture.makeJob(), clientUuid = id(), rowA = id(), rowB = id();
    await fixture.reserve(clientUuid, job);
    const photoA = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowA) });
    const photoB = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowB) });
    const responses = intercomResponses([
      intercomRow(rowA, 1, { conditionResult: "not_good", fieldRemarks: { conditionResult: "Station is silent" } }),
      intercomRow(rowB, 2, { conditionResult: "complete_repair", fieldRemarks: { conditionResult: "Handset replaced" } })
    ]);
    const reused = [photoA, { ...photoB, sourceSha256: photoA.sourceSha256 }];

    const outcome = await syncFireIntercomInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: reused })], fixture.actor);
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
test("Fire Intercom V7 refuses two source images that normalize to the same stored bytes", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "stored");
    const job = await fixture.makeJob(), clientUuid = id(), rowA = id(), rowB = id();
    await fixture.reserve(clientUuid, job);
    const stored = hash("one-normalized-jpeg");
    const photoA = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowA), sourceSha256: hash("camera-a"), storedSha256: stored });
    const photoB = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowB), sourceSha256: hash("camera-b"), storedSha256: stored });
    assert.notEqual(photoA.sourceSha256, photoB.sourceSha256, "the manifest itself cannot detect this collision");
    const responses = intercomResponses([
      intercomRow(rowA, 1, { conditionResult: "not_good", fieldRemarks: { conditionResult: "Station is silent" } }),
      intercomRow(rowB, 2, { conditionResult: "not_good", fieldRemarks: { conditionResult: "Call button jammed" } })
    ]);

    const failure = (await syncFireIntercomInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [photoA, photoB] })], fixture.actor)).failed[0];
    assert.equal(failure?.code, "EVIDENCE_NOT_STAGED", JSON.stringify(failure));
    assert.match(String(failure?.message), /same stored image/);
    assert.deepEqual(await fixture.statuses(clientUuid), ["staged", "staged"]);
  });
});

// Case 4 — the accepted-evidence identity is scoped to one Job + system.  The
// same bytes in a different Job are a different site visit, and are accepted.
test("Fire Intercom V7 accepts the same image bytes in a different Job", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "cross-job");
    const firstJob = await fixture.makeJob(), secondJob = await fixture.makeJob();
    const source = hash("shared-source"), stored = hash("shared-stored");
    const submit = async (job: string) => {
      const clientUuid = id(), rowUuid = id();
      await fixture.reserve(clientUuid, job);
      const photo = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowUuid), sourceSha256: source, storedSha256: stored });
      const responses = intercomResponses([intercomRow(rowUuid, 1, { conditionResult: "not_good", fieldRemarks: { conditionResult: "Station is silent" } })]);
      return { clientUuid, outcome: await syncFireIntercomInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [photo] })], fixture.actor) };
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
test("Fire Intercom V7 concurrent acceptance binds one image once and fails the loser with EVIDENCE_CONFLICT", { skip: !databaseUrl, timeout: 30_000 }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "race");
    const job = await fixture.makeJob();
    const source = hash("race-source"), stored = hash("race-stored");
    const contender = async () => {
      const clientUuid = id(), rowUuid = id();
      await fixture.reserve(clientUuid, job);
      const photo = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowUuid), sourceSha256: source, storedSha256: stored });
      const responses = intercomResponses([intercomRow(rowUuid, 1, { conditionResult: "not_good", fieldRemarks: { conditionResult: "Station is silent" } })]);
      return { clientUuid, item: fixture.envelope({ clientUuid, job, responses, evidenceManifest: [photo] }) };
    };
    const left = await contender(), right = await contender();
    const [leftResult, rightResult] = await Promise.all([
      syncFireIntercomInspections([left.item], fixture.actor),
      syncFireIntercomInspections([right.item], fixture.actor)
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
test("Fire Intercom V7 collapses closed, hidden, unknown and forbidden Jobs into one JOB_ACCESS_DENIED", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "denied");
    const closedJob = await fixture.makeJob({ status: "closed" });
    const hiddenJob = await fixture.makeJob({ technicianVisible: false });
    const forbiddenJob = await fixture.makeJob();
    const unknownJob = id();
    const probe = async (job: string, reservedBy?: number) => {
      const clientUuid = id(), rowUuid = id();
      if (reservedBy !== undefined) await fixture.reserve(clientUuid, job, reservedBy);
      const responses = intercomResponses([intercomRow(rowUuid, 1)]);
      const outcome = await syncFireIntercomInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [] })], fixture.actor);
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

// Case 7 — a genuinely new acceptance is idempotent-retry-safe once accepted,
// even after the Job closes: the exact retry returns the SAME accepted
// authority, never JOB_CLOSED.
test("Fire Intercom V7 exact retry after Job closure returns the same accepted authority, not JOB_CLOSED", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "retry-after-close");
    const job = await fixture.makeJob(), clientUuid = id(), rowUuid = id();
    const responses = intercomResponses([intercomRow(rowUuid, 1)]);
    const item = fixture.envelope({ clientUuid, job, responses, evidenceManifest: [] });
    const first = await syncFireIntercomInspections([item], fixture.actor);
    assert.deepEqual(first.acceptedIds, [clientUuid], JSON.stringify(first));
    await database.query("UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Closer' WHERE id=$1", [job, at, fixture.actor]);
    const retry = await syncFireIntercomInspections([item], fixture.actor);
    assert.deepEqual(retry.duplicateIds, [clientUuid], JSON.stringify(retry));
    assert.deepEqual(retry.failed, []);
  });
});

test("Fire Intercom V7 accepts a fully clean draft with zero findings and no reservation", { skip: !databaseUrl }, async () => {
  await withV7Database(async (database) => {
    const fixture = await seedFireIntercomV7(database, "clean");
    const job = await fixture.makeJob(), clientUuid = id(), rowUuid = id();
    const responses = intercomResponses([intercomRow(rowUuid, 1, { assetReference: "Pump Room" })]);
    const outcome = await syncFireIntercomInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [] })], fixture.actor);
    assert.deepEqual(outcome.acceptedIds, [clientUuid], JSON.stringify(outcome));
  });
});

// Case 8 — the accepted record must reach the Final Report with its bound photo
// bytes.  This is the only case that executes the four separate fire_intercom
// registrations in `finalServiceReport.ts` (the `supported` set, the schema-2
// `v7Suppression` gate, the `validHistoricalUnit` branch, and the evidence
// ternary); missing any one of them silently yields a section with no evidence.
test("Fire Intercom V7 accepted inspection completes into a Final Report carrying its bound photo", { skip: !databaseUrl }, async () => {
  const uploadsPath = path.join(tmpdir(), `phase8g-fire-intercom-report-${randomUUID()}`);
  const previousUploadsPath = process.env.UPLOADS_PATH;
  process.env.UPLOADS_PATH = uploadsPath;
  try {
    await withV7Database(async (database) => {
      const fixture = await seedFireIntercomV7(database, "final-report");
      const job = await fixture.makeJob(), clientUuid = id(), rowUuid = id();
      await fixture.reserve(clientUuid, job);
      const content = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).jpeg().toBuffer();
      const digest = createHash("sha256").update(content).digest("hex");
      const photo = await fixture.stage({ clientUuid, job, fieldPath: rowPath(rowUuid), sourceSha256: digest, storedSha256: digest });
      const relative = `inspections/${photo.photoUuid}/evidence.jpg`, file = path.join(uploadsPath, ...relative.split("/"));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
      await database.query("UPDATE staged_inspection_evidence SET storage_relative_path=$2 WHERE photo_uuid=$1", [photo.photoUuid, relative]);
      const responses = intercomResponses([intercomRow(rowUuid, 1, { assetReference: "Grd Floor", conditionResult: "not_good", fieldRemarks: { conditionResult: "Grd Floor station is silent" } })]);
      const outcome = await syncFireIntercomInspections([fixture.envelope({ clientUuid, job, responses, evidenceManifest: [photo] })], fixture.actor);
      assert.deepEqual(outcome.acceptedIds, [clientUuid], JSON.stringify(outcome));
      await database.query("UPDATE inspection_jobs SET status='closed', completed_at=$2, completed_by_user_id=$3, completed_by_display_name='Fire Intercom V7 closer' WHERE id=$1", [job, at, fixture.actor]);
      const report = await loadFinalServiceReport(job, database);
      const section = report.sections.find((value) => value.systemKey === "fire_intercom");
      assert.ok(section, `Final Report must contain a Fire Intercom section: ${JSON.stringify(report.sections.map((value) => value.systemKey))}`);
      assert.equal(section.evidence.length, 1, JSON.stringify(section.evidence.map((value) => value.field)));
      assert.equal(section.evidence[0]!.field, rowPath(rowUuid));
      assert.equal(section.evidence[0]!.caption, "Station Schedule - Condition");
      assert.equal(createHash("sha256").update(section.evidence[0]!.content).digest("hex"), digest, "the Final Report embeds the accepted bytes, not a re-render");
      assert.ok(report.sections.some((value) => value.fields.some((entry) => entry.value === "Grd Floor station is silent")), "the finding's own remark reaches the report");
    });
  } finally {
    if (previousUploadsPath === undefined) delete process.env.UPLOADS_PATH; else process.env.UPLOADS_PATH = previousUploadsPath;
    await rm(uploadsPath, { recursive: true, force: true });
  }
});
