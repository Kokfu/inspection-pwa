import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import test from "node:test";
import express from "express";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { runMigrations } from "../db/migrations.js";
import { createManagerComplianceRemindersRouter } from "./managerComplianceReminders.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("manager compliance reminders: boundary days, time zone, role auth", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).hostname, "127.0.0.1");
  assert.equal(new URL(databaseUrl!).port, "55432");
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "compliance reminders integration only permits its dedicated database");
  const database = new pg.Pool({ connectionString: databaseUrl });
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const admin = await database.query<{ id: number }>("INSERT INTO users (username,password_hash,role) VALUES ('compliance-admin','not-used','admin') RETURNING id");
    const adminId = admin.rows[0]!.id;
    const supervisor = await database.query<{ id: number }>("INSERT INTO users (username,password_hash,role) VALUES ('compliance-supervisor','not-used','supervisor') RETURNING id");
    const supervisorId = supervisor.rows[0]!.id;
    const inspector = await database.query<{ id: number }>("INSERT INTO users (username,password_hash,role) VALUES ('compliance-inspector','not-used','inspector') RETURNING id");
    const inspectorId = inspector.rows[0]!.id;

    // The same "today" the route itself computes -- never the test's own JS Date/local clock, so
    // the boundary assertions below hold regardless of the host running this test's own time zone.
    const today = (await database.query<{ today: string }>(`SELECT to_char((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'YYYY-MM-DD') AS today`)).rows[0]!.today;
    const offsetDate = async (days: number) => (await database.query<{ value: string }>(`SELECT to_char($1::date + $2::int, 'YYYY-MM-DD') AS value`, [today, days])).rows[0]!.value;

    const customers: Record<string, { id: string; days: number | null }> = {
      farOverdue: { id: randomUUID(), days: -30 },
      yesterday: { id: randomUUID(), days: -1 },
      dueToday: { id: randomUUID(), days: 0 },
      windowEdge: { id: randomUUID(), days: 7 },
      justOutsideWindow: { id: randomUUID(), days: 8 },
      farFuture: { id: randomUUID(), days: 60 },
      unscheduled: { id: randomUUID(), days: null },
      inactive: { id: randomUUID(), days: 0 },
      demo: { id: randomUUID(), days: 0 }
    };
    for (const [key, customer] of Object.entries(customers)) {
      const dueDate = customer.days === null ? null : await offsetDate(customer.days);
      const isActive = key !== "inactive";
      const isDemo = key === "demo";
      await database.query(
        `INSERT INTO customers (id, customer_code, display_name, next_service_due_date, is_active, is_demo) VALUES ($1,$2,$3,$4,$5,$6)`,
        [customer.id, `COMP-${key.toUpperCase()}`, `Compliance ${key}`, dueDate, isActive, isDemo]
      );
    }

    const app = express();
    app.use((request, _response, next) => {
      const role = request.headers["x-role"];
      if (role === "admin") request.currentUser = { id: adminId, username: "compliance-admin", role: "admin" };
      else if (role === "supervisor") request.currentUser = { id: supervisorId, username: "compliance-supervisor", role: "supervisor" };
      else if (role === "inspector") request.currentUser = { id: inspectorId, username: "compliance-inspector", role: "inspector" };
      next();
    });
    app.use(createManagerComplianceRemindersRouter(database));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as { port: number };
    const request = (role?: "admin" | "supervisor" | "inspector") =>
      fetch(`http://127.0.0.1:${port}/manager/customers/compliance-reminders`, { headers: role ? { "x-role": role } : {} });

    try {
      assert.equal((await request()).status, 401, "unauthenticated is refused");
      assert.equal((await request("supervisor")).status, 403, "supervisor is refused (T7 is admin-only, matching Next Upcoming Service)");
      assert.equal((await request("inspector")).status, 403, "inspector (technician) is refused");

      const response = await request("admin");
      assert.equal(response.status, 200);
      const body = await response.json() as {
        overdue: Array<{ id: string; code: string; displayName: string; nextServiceDueDate: string }>;
        dueSoon: Array<{ id: string; code: string; displayName: string; nextServiceDueDate: string }>;
        dueSoonWindowDays: number;
      };
      assert.equal(body.dueSoonWindowDays, 7);

      const overdueIds = body.overdue.map((row) => row.id);
      const dueSoonIds = body.dueSoon.map((row) => row.id);
      const allIds = [...overdueIds, ...dueSoonIds];

      // Overdue: strictly before today, no lower bound.
      assert.deepEqual(overdueIds, [customers.farOverdue.id, customers.yesterday.id], "overdue is ordered oldest-due-date first");
      // Due soon: today through today + 7 days inclusive, both boundaries included.
      assert.ok(dueSoonIds.includes(customers.dueToday.id), "a customer due exactly today is due soon, not overdue");
      assert.ok(dueSoonIds.includes(customers.windowEdge.id), "a customer due exactly at the window edge (+7 days) is included");
      // Outside the window entirely: never appears in either bucket.
      assert.ok(!allIds.includes(customers.justOutsideWindow.id), "a customer due one day past the window is excluded entirely");
      assert.ok(!allIds.includes(customers.farFuture.id), "a customer due far in the future is excluded entirely");
      // No due date at all: never appears.
      assert.ok(!allIds.includes(customers.unscheduled.id), "an unscheduled customer never appears");
      // Inactive / demo customers are excluded even with a due date inside the window.
      assert.ok(!allIds.includes(customers.inactive.id), "an inactive customer is excluded");
      assert.ok(!allIds.includes(customers.demo.id), "a demo customer is excluded");

      // Response never mixes a customer into both buckets.
      assert.equal(new Set(allIds).size, allIds.length, "no customer appears in both buckets");
    } finally {
      await close(server);
    }
  } finally {
    await database.end();
  }
});
