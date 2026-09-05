import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { syncPortableFireExtinguishers } from "./portableFireExtinguisherSync.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

// STEP 1.5: Portable Fire Extinguisher gets no V7 evidence contract (owner decision C4).
// Its definition has been byte-identical since masterServiceReportV5.ts, so a V7-templated
// job's Portable Fire Extinguisher system is expected to already resolve, sync, and accept
// with zero code changes, purely via the structural (non-version-gated) match in
// isCompatibleSystemContract. This proves that end to end against a real Postgres database
// seeded by the real runMigrations()/seedMasterServiceReport() path.
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const at = "2026-09-05T00:00:00.000Z";
type Value = Record<string, unknown>;

async function withDatabase(run: (database: pg.Pool) => Promise<void>) {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819279)");
  try { await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database); await run(database); }
  finally { await lock.query("SELECT pg_advisory_unlock(819279)").catch(() => undefined); lock.release(); await database.end(); }
}

async function seed(database: pg.Pool, label: string) {
  const v7 = (await database.query<{ id: string; definition: unknown }>(
    "SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='portable_fire_extinguisher'"
  )).rows[0]!;
  const v5 = (await database.query<{ id: string; definition: unknown }>(
    "SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=5 AND system.system_key='portable_fire_extinguisher'"
  )).rows[0]!;
  assert.deepEqual(v7.definition, v5.definition, "Portable Fire Extinguisher's V7 definition must stay byte-identical to V5's");
  const customer = id(), revision = id(), enabled = id();
  const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`pfe-v7-${label}-${id()}`])).rows[0]!.id;
  await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,false)", [customer, `PFE-${customer}`, `Portable V7 ${label}`]);
  await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, v7.id]);
  await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order) VALUES($1,$2,$3,'portable_fire_extinguisher',9)", [enabled, revision, v7.id]);
  const system = { enabledSystemId: enabled, systemKey: "portable_fire_extinguisher", displayName: "Portable Fire Extinguisher", sortOrder: 9, definitionStatus: "confirmed" as const, zones: [] as unknown[], locations: [] as unknown[] };
  const configuration = { revisionId: revision, revisionNumber: 1 };
  const template = { id: v7.id, code: "MFE-FSSR", name: "MFE", version: 7 };
  const snapshot = { schemaVersion: 1, customer: { id: customer, code: `PFE-${customer}`, displayName: `Portable V7 ${label}` }, configuration, template, enabledSystems: [system] };
  const job = async () => { const value = id(); await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,$4,'open',false,true,$5,$6,$7,'2026-09-05')", [value, v7.id, `PFE-${value}`, `Portable V7 ${label}`, customer, revision, snapshot]); return value; };
  const envelope = (clientUuid: string, jobId: string, responses: Value) => ({ operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: {
    clientUuid, jobId, systemKey: "portable_fire_extinguisher", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: null, masterTemplate: { id: v7.id, code: "MFE-FSSR", version: 7 }, configuration,
    inspectionSnapshot: {
      schemaVersion: 1, capturedAt: at, job: { id: jobId, reference: "client", title: "client" }, customer: snapshot.customer, configuration, template,
      system: { enabledSystemId: enabled, systemKey: "portable_fire_extinguisher", displayName: "Portable Fire Extinguisher", sortOrder: 9, definitionStatus: "confirmed", zones: [], locations: [], definition: v7.definition, repetitionMode: "single_quantity_summary" }
    },
    responses, performedAt: at
  } });
  return { v7, v5, actor, job, envelope };
}

const responses = (change: Value = {}): Value => ({ schemaVersion: 1, total: 3, dryPowder9kg: 2, co2_2kg: 1, others: "2 wall-mounted units", comments: "All units within expiry", ...change });

test("Portable Fire Extinguisher on a V7-templated job accepts via the unmodified sync path with zero code changes", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "happy"), job = await f.job(), client = id();
    const result = await syncPortableFireExtinguishers([f.envelope(client, job, responses())], f.actor);
    assert.deepEqual(result.acceptedIds, [client], JSON.stringify(result));
    const row = (await database.query("SELECT response_payload,inspection_snapshot FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]!;
    assert.equal((row.response_payload as Value).total, 3);
    assert.equal(((row.inspection_snapshot as Value).template as Value).version, 7, "the accepted snapshot keeps the frozen V7 template identity");
  });
});

test("Portable Fire Extinguisher V7 exact idempotent retry returns duplicate, not a second row", { skip: !databaseUrl }, async () => {
  await withDatabase(async (database) => {
    const f = await seed(database, "retry"), job = await f.job(), client = id(), item = f.envelope(client, job, responses());
    const first = await syncPortableFireExtinguishers([item], f.actor);
    assert.deepEqual(first.acceptedIds, [client]);
    const retry = await syncPortableFireExtinguishers([item], f.actor);
    assert.deepEqual(retry.duplicateIds, [client], JSON.stringify(retry));
    const count = (await database.query("SELECT count(*)::int AS n FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]!.n;
    assert.equal(count, 1);
  });
});
