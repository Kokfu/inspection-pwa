import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { syncPortableFireExtinguishers, validatePortableHistoricalPayload } from "./portableFireExtinguisherSync.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

// FR-12: current jobs freeze an eight-key customer snapshot (id, code, displayName plus the five
// contact/contract fields). Portable sync must accept it, stay idempotent, and still accept the
// legacy three-key snapshot older queued records carry.
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const at = "2026-09-05T00:00:00.000Z";
type Value = Record<string, unknown>;
const detail = { contactPhone: "03-111", contactPerson: "Contact A", fax: "03-222", contractNumber: "C-42", serviceFrequency: "QUARTERLY" };

async function withDatabase(run: (database: pg.Pool) => Promise<void>) {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819279)");
  try { await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database); await run(database); }
  finally { await lock.query("SELECT pg_advisory_unlock(819279)").catch(() => undefined); lock.release(); await database.end(); }
}

async function seed(database: pg.Pool, label: string, customerDetail: Value | undefined) {
  const v7 = (await database.query<{ id: string; definition: unknown }>(
    "SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='portable_fire_extinguisher'"
  )).rows[0]!;
  const customer = id(), revision = id(), enabled = id();
  const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`pfe-cs-${label}-${id()}`])).rows[0]!.id;
  await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,false)", [customer, `PFE-${customer}`, `Portable ${label}`]);
  await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, v7.id]);
  await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order) VALUES($1,$2,$3,'portable_fire_extinguisher',9)", [enabled, revision, v7.id]);
  const system = { enabledSystemId: enabled, systemKey: "portable_fire_extinguisher", displayName: "Portable Fire Extinguisher", sortOrder: 9, definitionStatus: "confirmed" as const, zones: [] as unknown[], locations: [] as unknown[] };
  const configuration = { revisionId: revision, revisionNumber: 1 };
  const template = { id: v7.id, code: "MFE-FSSR", name: "MFE", version: 7 };
  const customerSnapshot = { id: customer, code: `PFE-${customer}`, displayName: `Portable ${label}`, ...customerDetail };
  const snapshot = { schemaVersion: 1, customer: customerSnapshot, configuration, template, enabledSystems: [system] };
  const job = async () => { const value = id(); await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,$4,'open',false,true,$5,$6,$7,'2026-09-05')", [value, v7.id, `PFE-${value}`, `Portable ${label}`, customer, revision, snapshot]); return value; };
  const envelope = (clientUuid: string, jobId: string, responses: Value) => ({ operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: {
    clientUuid, jobId, systemKey: "portable_fire_extinguisher", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: null, masterTemplate: { id: v7.id, code: "MFE-FSSR", version: 7 }, configuration,
    inspectionSnapshot: {
      schemaVersion: 1, capturedAt: at, job: { id: jobId, reference: "client", title: "client" }, customer: customerSnapshot, configuration, template,
      system: { ...system, definition: v7.definition, repetitionMode: "single_quantity_summary" }
    },
    responses, performedAt: at
  } });
  return { actor, job, envelope };
}

const responses = (change: Value = {}): Value => ({ schemaVersion: 1, total: 3, dryPowder9kg: 2, co2_2kg: 1, others: "", comments: "ok", ...change });
const rowCount = async (database: pg.Pool, clientUuid: string) => (await database.query("SELECT count(*)::int AS n FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0]!.n as number;

test("Portable accepts the current customer snapshot with contact details and stores the frozen customer", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "detailed", detail), job = await f.job(), client = id();
    const result = await syncPortableFireExtinguishers([f.envelope(client, job, responses())], f.actor);
    assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));
    assert.equal(await rowCount(database, client), 1);
    const row = (await database.query("SELECT response_payload,inspection_snapshot FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]!;
    assert.deepEqual(Object.keys((row.inspection_snapshot as Value).customer as Value).sort(), ["code", "contactPerson", "contactPhone", "contractNumber", "displayName", "fax", "id", "serviceFrequency"]);
    assert.equal(validatePortableHistoricalPayload(row.response_payload, row.inspection_snapshot), true, "the accepted record must still pass the report-side validator");
  });
});

test("Portable accepts a customer with every detail null and the legacy three-key snapshot", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const nulls = await seed(database, "nulls", { contactPhone: null, contactPerson: null, fax: null, contractNumber: null, serviceFrequency: null });
    const nullClient = id();
    assert.deepEqual((await syncPortableFireExtinguishers([nulls.envelope(nullClient, await nulls.job(), responses())], nulls.actor)).acceptedIds, [nullClient]);
    const legacy = await seed(database, "legacy", undefined);
    const legacyClient = id();
    const legacyResult = await syncPortableFireExtinguishers([legacy.envelope(legacyClient, await legacy.job(), responses())], legacy.actor);
    assert.deepEqual(legacyResult.acceptedIds, [legacyClient], JSON.stringify(legacyResult));
    const stored = (await database.query("SELECT response_payload,inspection_snapshot FROM master_system_form_instances WHERE client_uuid=$1", [legacyClient])).rows[0]!;
    assert.equal(validatePortableHistoricalPayload(stored.response_payload, stored.inspection_snapshot), true);
  });
});

test("Portable retry of an accepted detailed record is one row; a changed body is an idempotency conflict", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "retry", detail), job = await f.job(), client = id(), item = f.envelope(client, job, responses());
    assert.deepEqual((await syncPortableFireExtinguishers([item], f.actor)).acceptedIds, [client]);
    const retry = await syncPortableFireExtinguishers([item], f.actor);
    assert.deepEqual({ accepted: retry.acceptedIds, duplicate: retry.duplicateIds, failed: retry.failed }, { accepted: [], duplicate: [client], failed: [] });
    const changed = await syncPortableFireExtinguishers([f.envelope(client, job, responses({ total: 9 }))], f.actor);
    assert.equal(changed.failed[0]?.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(await rowCount(database, client), 1);
    assert.equal((await database.query("SELECT count(*)::int AS n FROM master_system_inspections WHERE job_id=$1", [job])).rows[0]!.n, 1);
  });
});

test("Portable concurrent duplicate deliveries of a detailed record create exactly one row", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "race", detail), job = await f.job(), client = id(), item = f.envelope(client, job, responses());
    const [a, b] = await Promise.all([syncPortableFireExtinguishers([item], f.actor), syncPortableFireExtinguishers([item], f.actor)]);
    assert.equal(a.acceptedIds.length + b.acceptedIds.length, 1, JSON.stringify([a, b]));
    // Pre-existing behaviour, deliberately not changed here: the loser of a true race reports
    // ACTIVE_INSPECTION_EXISTS rather than a duplicate (it checks the UUID before taking the job lock).
    const loser = [...a.failed, ...b.failed];
    assert.equal(a.duplicateIds.length + b.duplicateIds.length + loser.length, 1, JSON.stringify([a, b]));
    assert.ok(loser.every((failure) => failure.code === "ACTIVE_INSPECTION_EXISTS"), JSON.stringify(loser));
    assert.equal(await rowCount(database, client), 1);
  });
});

test("Portable still refuses an unknown extra customer key at the sync boundary without writing", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "extra", { ...detail, surprise: "x" }), job = await f.job(), client = id();
    const result = await syncPortableFireExtinguishers([f.envelope(client, job, responses())], f.actor);
    assert.equal(result.failed[0]?.code, "VALIDATION_ERROR", JSON.stringify(result));
    assert.equal(await rowCount(database, client), 0);
  });
});
