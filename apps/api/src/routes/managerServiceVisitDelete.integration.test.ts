import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import test from "node:test";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";
import { createManagerCustomersRouter } from "./managerCustomers.js";
import { buildOperationalListQuery, createManagerServiceVisitsRouter } from "./managerServiceVisits.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const close = (server: Server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

test("admin deletion rechecks every system under the job lock and preserves accepted records", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/phase6_seed_integration");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const actorId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('delete-visit-admin','not-used','admin') RETURNING id::int AS id"
    )).rows[0]!.id;
    let role: "admin" | "inspector" = "admin";
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: actorId, username: "delete-visit-admin", role }; next(); });
    app.use(createManagerCustomersRouter(pool));
    app.use(createManagerServiceVisitsRouter({ database: pool }));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    try {
      const created = await fetch(`http://127.0.0.1:${port}/manager/customers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Delete Guard Customer", siteDisplayName: "Site", systemKeys: ["hose_reel", "automatic_sprinkler"] })
      });
      assert.equal(created.status, 201);
      const customer = (await created.json() as { customer: { customer: { id: string }; sites: Array<{ id: string }> } }).customer;
      const createVisit = async () => {
        const client = await pool.connect();
        try { return (await createServiceVisit(client, {
          requestId: randomUUID(), customerId: customer.customer.id, siteId: customer.sites[0]!.id,
          systemKeys: ["hose_reel", "automatic_sprinkler"]
        }, actorId)).id; } finally { client.release(); }
      };
      const guardedId = await createVisit();
      const cleanId = await createVisit();
      const groupId = randomUUID();
      await pool.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'automatic_sprinkler',$3)", [groupId, guardedId, actorId]);
      const job = (await pool.query<{ master_template_version_id: string; customer_configuration_revision_id: string }>(
        "SELECT master_template_version_id,customer_configuration_revision_id FROM inspection_jobs WHERE id=$1", [guardedId]
      )).rows[0]!;
      await pool.query(`INSERT INTO master_system_form_instances(
        id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,
        customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,
        response_payload,request_fingerprint,status,performed_at,synced_by_user_id
      ) VALUES($1,$2,$3,'primary',1,$4,$5,2,'{}'::jsonb,2,'{}'::jsonb,$6,'submitted',now(),$7)`,
      [randomUUID(), groupId, randomUUID(), job.master_template_version_id, job.customer_configuration_revision_id, "a".repeat(64), actorId]);
      const list = buildOperationalListQuery({});
      const listed = await pool.query<{ id: string; hasAcceptedRecords: boolean }>(list.sql, list.values);
      assert.equal(listed.rows.find((row) => row.id === guardedId)?.hasAcceptedRecords, true);
      assert.equal(listed.rows.find((row) => row.id === cleanId)?.hasAcceptedRecords, false);
      const remove = (id: string) => fetch(`http://127.0.0.1:${port}/manager/service-visits/${id}`, { method: "DELETE" });
      role = "inspector";
      assert.equal((await remove(cleanId)).status, 403);
      role = "admin";
      const refused = await remove(guardedId);
      assert.equal(refused.status, 409);
      assert.equal((await refused.json() as { error: string }).error, "SERVICE_VISIT_HAS_ACCEPTED_RECORDS");
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM master_system_form_instances WHERE inspection_group_id=$1", [groupId])).rows[0].count, 1);
      assert.equal((await remove(cleanId)).status, 200);
      const retry = await remove(cleanId);
      assert.equal(retry.status, 200);
      assert.equal((await retry.json() as { result: string }).result, "already_deleted");
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM inspection_jobs WHERE id=$1", [cleanId])).rows[0].count, 0);
      const audit = await pool.query<{ result: string }>(
        "SELECT result FROM audit_events WHERE action='manager_service_visit_deleted' AND entity_id=$1 ORDER BY id", [cleanId]
      );
      assert.deepEqual(audit.rows.map((row) => row.result), ["deleted", "already_deleted"]);
    } finally { await close(server); }
  } finally { await pool.end(); }
});
