import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { createManagerDashboardRouter } from "./managerDashboard.js";

test("dashboard routes authorize reads and bind validated date filters", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const database = { async query(sql: string, values?: unknown[]) {
    queries.push({ sql, values });
    return { rows: sql.includes("FROM customers") ? [{ totalClients: 8 }] : [{ day: "2026-09-02", count: 3 }] };
  } };
  const app = express();
  app.use((request, _response, next) => {
    const role = request.headers["x-role"];
    if (role === "admin" || role === "supervisor" || role === "inspector") request.currentUser = { id: 1, username: String(role), role };
    next();
  });
  app.use(createManagerDashboardRouter(database as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address() as { port: number };
  const get = (path: string, role?: string) => fetch(`http://127.0.0.1:${address.port}${path}`, { headers: role ? { "x-role": role } : undefined });
  try {
    assert.equal((await get("/manager/dashboard/clients")).status, 401);
    assert.equal((await get("/manager/dashboard/clients", "inspector")).status, 403);
    assert.equal((await get("/manager/dashboard/clients", "supervisor")).status, 200);
    assert.equal((await get("/manager/dashboard/clients", "admin")).status, 200);
    assert.match(queries[0]!.sql, /count\(\*\).*FROM customers WHERE is_active = true AND is_demo = false/);
    assert.equal((await get("/manager/dashboard/inspections-per-day?from=2026-09-01&to=2026-09-30")).status, 401);
    assert.equal((await get("/manager/dashboard/inspections-per-day?from=2026-09-01&to=2026-09-30", "inspector")).status, 403);
    assert.equal((await get("/manager/dashboard/inspections-per-day?from=2026-02-30&to=2026-09-30", "admin")).status, 400);
    assert.equal((await get("/manager/dashboard/inspections-per-day?from=2026-09-30&to=2026-09-01", "admin")).status, 400);
    assert.equal((await get("/manager/dashboard/inspections-per-day?from=2026-09-01&to=2026-09-30", "supervisor")).status, 200);
    const trend = queries.at(-1)!;
    assert.match(trend.sql, /GROUP BY date_trunc\('day', service_date\)/);
    assert.match(trend.sql, /service_date >= \$1::date AND service_date <= \$2::date/);
    assert.deepEqual(trend.values, ["2026-09-01", "2026-09-30"]);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
