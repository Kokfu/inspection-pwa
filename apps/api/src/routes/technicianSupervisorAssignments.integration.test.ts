import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";
import { createManagerServiceVisitsRouter } from "./managerServiceVisits.js";
import { createManagerTechniciansRouter, ManagerTechnicianError } from "./managerTechnicians.js";
import type { UserRole } from "../auth/authTypes.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const templateId = "00000000-0000-4000-8000-000000000807";

test("admin assignments are audited and reversible; supervisor visit and technician lists stay scoped", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/phase6_seed_integration");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    await runMigrations(pool);
    const user = async (username: string, role: UserRole) => (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES($1,'not-used',$2) RETURNING id::int AS id", [username, role]
    )).rows[0]!.id;
    const admin = await user("assignment-admin", "admin");
    const supervisorA = await user("assignment-supervisor-a", "supervisor");
    const supervisorB = await user("assignment-supervisor-b", "supervisor");
    const technicianA = await user("assignment-technician-a", "inspector");
    const technicianB = await user("assignment-technician-b", "inspector");
    const actor = { role: "admin" as UserRole | undefined, id: admin };
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => {
      if (actor.role) request.currentUser = { id: actor.id, role: actor.role, username: actor.role };
      next();
    });
    app.use(createManagerCustomersRouter(pool));
    app.use(createManagerTechniciansRouter(pool));
    app.use(createManagerServiceVisitsRouter({ database: pool }));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerTechnicianError || error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const request = (path: string, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const as = (role: UserRole | undefined, id: number) => { actor.role = role; actor.id = id; };
    type TechnicianList = { technicians: Array<{ id: number; role: UserRole; supervisorIds: number[] }> };
    type VisitList = { serviceVisits: Array<{ id: string }>; totalCount: number; nextCursor: string | null };
    const technicians = async () => (await (await request("/manager/technicians")).json()) as TechnicianList;
    const visits = async (query = "") => {
      const response = await request(`/manager/service-visits${query}`);
      assert.equal(response.status, 200, query);
      return response.json() as Promise<VisitList>;
    };
    try {
      const created = await request("/manager/customers", "POST", { displayName: "Assignment Customer", siteDisplayName: "Assignment Site", systemKeys: ["hose_reel"] });
      assert.equal(created.status, 201);
      const customer = (await created.json() as { customer: { customer: { id: string; code: string; displayName: string }; sites: Array<{ id: string; displayName: string }>; configuration: { id: string } } }).customer;
      const insertJob = async (creator: number) => {
        const id = randomUUID();
        const snapshot = {
          schemaVersion: 1,
          customer: customer.customer,
          site: customer.sites[0],
          configuration: { revisionId: customer.configuration.id, revisionNumber: 1 },
          template: { id: templateId, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 },
          enabledSystems: [{ enabledSystemId: randomUUID(), systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }]
        };
        await pool.query(`INSERT INTO inspection_jobs
          (id, master_template_version_id, job_reference, title, status, is_sample, customer_id,
           customer_configuration_revision_id, configuration_snapshot, site_id, service_date, created_by_user_id)
          VALUES ($1,$2,$3,'Assignment Site','open',false,$4,$5,$6::jsonb,$7,'2026-09-20',$8)`,
        [id, templateId, `SV-ASSIGN-${id}`, customer.customer.id, customer.configuration.id, JSON.stringify(snapshot), customer.sites[0]!.id, creator]);
        return id;
      };
      const a1 = await insertJob(technicianA);
      const a2 = await insertJob(technicianA);
      const b1 = await insertJob(technicianB);
      assert.equal((await visits()).totalCount, 3, "admin stays unscoped");

      const path = `/manager/technicians/${technicianA}/assignments`;
      as(undefined, admin); assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 401);
      as("inspector", technicianA); assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 403);
      as("supervisor", supervisorA); assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 403);
      as("admin", admin);
      for (const body of [{}, { supervisorId: "x" }, { supervisorId: String(supervisorA) }, { supervisorId: supervisorA, role: "admin" }]) {
        assert.equal((await request(path, "POST", body)).status, 400);
      }
      assert.deepEqual(await (await request(path, "POST", { supervisorId: admin })).json(), { error: "INVALID_ROLE" });
      assert.deepEqual(await (await request(`/manager/technicians/${supervisorA}/assignments`, "POST", { supervisorId: supervisorB })).json(), { error: "INVALID_ROLE" });
      assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 201);
      assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 200, "retry is idempotent");
      assert.equal((await request(path, "POST", { supervisorId: supervisorB })).status, 201, "many-to-many");
      assert.deepEqual((await technicians()).technicians.find((row) => row.id === technicianA)?.supervisorIds, [supervisorA, supervisorB]);
      assert.equal((await visits()).totalCount, 3, "admin remains unscoped after assignments");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM technician_supervisor_assignments WHERE technician_id=$1", [technicianA])).rows[0].n, 2);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='technician_assignment_created'")).rows[0].n, 2);

      as("supervisor", supervisorA);
      assert.deepEqual((await technicians()).technicians.map((row) => row.id), [technicianA]);
      assert.deepEqual(new Set((await visits()).serviceVisits.map((row) => row.id)), new Set([a1, a2]));
      assert.equal((await visits()).totalCount, 2);
      assert.equal((await visits(`?technicianId=${technicianB}`)).totalCount, 0, "client filter cannot widen scope");
      const first = await visits("?limit=1");
      assert.equal(first.totalCount, 2);
      assert.ok(first.nextCursor);
      const second = await visits(`?limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`);
      assert.equal(second.totalCount, 2);
      assert.deepEqual(new Set([first.serviceVisits[0]!.id, second.serviceVisits[0]!.id]), new Set([a1, a2]));
      assert.equal((await request(`/manager/service-visits/${b1}`)).status, 404, "direct detail is scoped");
      assert.equal((await request(`/manager/service-visits/${b1}/final-report`)).status, 404, "direct report is scoped");

      as("admin", admin);
      const removal = `${path}/${supervisorA}`;
      assert.equal((await request(removal, "DELETE")).status, 200);
      assert.equal((await request(removal, "DELETE")).status, 200, "remove retry is idempotent");
      assert.equal((await pool.query("SELECT archived_at IS NOT NULL AS archived FROM technician_supervisor_assignments WHERE technician_id=$1 AND supervisor_id=$2", [technicianA, supervisorA])).rows[0].archived, true);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='technician_assignment_removed'")).rows[0].n, 1);
      as("supervisor", supervisorA);
      assert.deepEqual((await technicians()).technicians, []);
      assert.equal((await visits()).totalCount, 0);
      as("admin", admin);
      assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 201, "assigning again restores the same row");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM technician_supervisor_assignments WHERE technician_id=$1 AND supervisor_id=$2", [technicianA, supervisorA])).rows[0].n, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='technician_assignment_created'")).rows[0].n, 3);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally { await pool.end(); }
});
