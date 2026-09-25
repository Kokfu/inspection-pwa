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
    await database.query("CREATE TABLE inspection_jobs (master_template_version_id uuid, is_sample boolean NOT NULL, archived_at timestamptz, service_date date)");
    await database.query("INSERT INTO customers VALUES (true,false),(true,false),(true,true),(false,false)");
    await database.query("INSERT INTO inspection_jobs VALUES ('00000000-0000-4000-8000-000000000807',false,NULL,'2026-09-02'),('00000000-0000-4000-8000-000000000807',false,NULL,'2026-09-02'),('00000000-0000-4000-8000-000000000807',false,NULL,'2026-09-04'),('00000000-0000-4000-8000-000000000807',true,NULL,'2026-09-03'),(NULL,false,NULL,'2026-09-03'),('00000000-0000-4000-8000-000000000807',false,now(),'2026-09-03')");
    const app = express();
    app.use((request, _response, next) => { request.currentUser = { id: 1, username: "test", role: "admin" }; next(); });
    app.use(createManagerDashboardRouter(database));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address() as { port: number };
    try {
      const base = `http://127.0.0.1:${address.port}/manager/dashboard`;
      assert.deepEqual(await (await fetch(`${base}/clients`)).json(), { totalClients: 2 });
      assert.deepEqual(await (await fetch(`${base}/inspections-per-day?from=2026-09-01&to=2026-09-30`)).json(), { days: [{ day: "2026-09-02", count: 2 }, { day: "2026-09-04", count: 1 }] });
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  } finally { await database.end(); }
});
