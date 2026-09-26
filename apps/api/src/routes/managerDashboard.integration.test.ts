import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { createManagerDashboardRouter } from "./managerDashboard.js";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
test("dashboard aggregates from disposable PostgreSQL", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/phase6_seed_integration");
  const database = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await database.query("CREATE TABLE customers (is_active boolean NOT NULL, is_demo boolean NOT NULL)");
    await database.query("CREATE TABLE inspection_jobs (id uuid DEFAULT gen_random_uuid(), master_template_version_id uuid, is_sample boolean NOT NULL, archived_at timestamptz, service_date date, configuration_snapshot jsonb)");
    await database.query("CREATE TABLE master_system_inspections (id uuid PRIMARY KEY, job_id uuid, system_key text)");
    await database.query("CREATE TABLE master_system_form_instances (id uuid PRIMARY KEY, inspection_group_id uuid, status text, display_sequence integer, inspection_snapshot jsonb, response_payload jsonb)");
    await database.query("CREATE TABLE inspection_corrections (form_instance_id uuid, field_path text, sequence integer, new_value jsonb)");
    await database.query("INSERT INTO customers VALUES (true,false),(true,false),(true,true),(false,false)");
    await database.query("INSERT INTO inspection_jobs(master_template_version_id,is_sample,archived_at,service_date) VALUES ('00000000-0000-4000-8000-000000000807',false,NULL,'2026-09-02'),('00000000-0000-4000-8000-000000000807',false,NULL,'2026-09-02'),('00000000-0000-4000-8000-000000000807',false,NULL,'2026-09-04'),('00000000-0000-4000-8000-000000000807',true,NULL,'2026-09-03'),(NULL,false,NULL,'2026-09-03'),('00000000-0000-4000-8000-000000000807',false,now(),'2026-09-03')");
    const acceptedIds: string[] = [];
    for (const [index, value] of ["good", "not_good", "complete_repair", "na", "good"].entries()) {
      const jobId = `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const groupId = `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const instanceId = `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      acceptedIds.push(instanceId);
      const configuration = { enabledSystems: [{ systemKey: "co2_fire_extinguisher", definitionStatus: "confirmed" }] };
      await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,is_sample,archived_at,service_date,configuration_snapshot) VALUES($1,'00000000-0000-4000-8000-000000000807',false,NULL,'2026-09-05',$2)", [jobId, configuration]);
      await database.query("INSERT INTO master_system_inspections(id,job_id,system_key) VALUES($1,$2,'co2_fire_extinguisher')", [groupId, jobId]);
      const freeText = index === 0 ? "Poor" : index === 3 ? "Good" : "";
      await database.query("INSERT INTO master_system_form_instances(id,inspection_group_id,status,display_sequence,inspection_snapshot,response_payload) VALUES($1,$2,'submitted',1,$3,$4)", [instanceId, groupId, { schemaVersion: 2 }, { checks: { one: { result: value, remarks: freeText } }, comments: freeText }]);
    }
    const app = express();
    app.use((request, _response, next) => { request.currentUser = { id: 1, username: "test", role: "admin" }; next(); });
    app.use(createManagerDashboardRouter(database));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address() as { port: number };
    try {
      const base = `http://127.0.0.1:${address.port}/manager/dashboard`;
      assert.deepEqual(await (await fetch(`${base}/clients`)).json(), { totalClients: 2 });
      assert.deepEqual(await (await fetch(`${base}/inspections-per-day?from=2026-09-01&to=2026-09-30`)).json(), { days: [{ day: "2026-09-02", count: 2 }, { day: "2026-09-04", count: 1 }, { day: "2026-09-05", count: 5 }] });
      const statusUrl = `${base}/inspection-status?from=2026-09-01&to=2026-09-30`;
      assert.deepEqual(await (await fetch(statusUrl)).json(), { passed: 2, notOk: 2, na: 1 });
      const original = (await database.query<{ response_payload: unknown }>("SELECT response_payload FROM master_system_form_instances WHERE id=$1", [acceptedIds[4]])).rows[0]!.response_payload;
      await database.query("INSERT INTO inspection_corrections(form_instance_id,field_path,sequence,new_value) VALUES($1,'checks.one.result',1,$2::jsonb)", [acceptedIds[4], JSON.stringify("not_good")]);
      assert.deepEqual(await (await fetch(statusUrl)).json(), { passed: 1, notOk: 3, na: 1 }, "dashboard reads the corrected result");
      assert.deepEqual((await database.query<{ response_payload: unknown }>("SELECT response_payload FROM master_system_form_instances WHERE id=$1", [acceptedIds[4]])).rows[0]!.response_payload, original, "accepted payload stays unchanged");
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  } finally { await database.end(); }
});
