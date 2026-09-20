import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express, { type Router } from "express";
import { hashPassword } from "../auth/passwords.js";
import { loadConfig } from "../config/env.js";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { currentUser } from "../middleware/currentUser.js";
import { authRouter } from "./auth.js";
import { inspectionAttachmentsRouter } from "./inspectionAttachments.js";
import { inspectionJobsRouter } from "./inspectionJobs.js";
import { inspectionReferenceRouter } from "./inspectionReference.js";
import { inspectionsRouter } from "./inspections.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";
import { createManagerCorrectionsRouter } from "./managerCorrections.js";
import { createManagerServiceVisitsRouter } from "./managerServiceVisits.js";
import { createManagerTechniciansRouter, ManagerTechnicianError } from "./managerTechnicians.js";
import { masterSystemInspectionsRouter } from "./masterSystemInspections.js";
import { stagedEvidenceRouter } from "./stagedEvidence.js";
import { syncRouter } from "./sync.js";
import { testRecordsRouter } from "./testRecords.js";

/**
 * T4 supervisor role (docs/autopilot/designs/T4.md). Every route of every role-guarded router is
 * enumerated from the routers themselves, so a new route cannot be added without being classified:
 * a supervisor may call exactly the review reads below and receives 403 everywhere else (a Manager
 * refusal also leaves an `authz.denied` audit row).
 */
const supervisorReads = new Set([
  "GET /manager/service-visits",
  "GET /manager/service-visits/:jobId",
  "GET /manager/service-visits/:jobId/final-report",
  "GET /manager/service-visits/:jobId/final-report.pdf",
  "GET /manager/technicians",
  "GET /manager/customers",
  // T5a: corrections are review work, so a supervisor may read and write these.
  "GET /manager/inspections/:clientUuid/corrections",
  "POST /manager/inspections/:clientUuid/corrections",
  "GET /manager/service-visits/:jobId/corrections",
  "GET /manager/service-visits/:jobId/accepted-records",
  // T5c: review reads of accepted records, their evidence photos and their corrections.
  "GET /inspections/:clientUuid/corrections",
  "GET /hose-reel-inspections/:clientUuid",
  "GET /co2-inspections/:clientUuid",
  "GET /wet-chemical-inspections/:clientUuid",
  "GET /fire-alarm-inspections/:clientUuid",
  "GET /dry-wet-riser-inspections/:clientUuid",
  "GET /master-system-inspections",
  "GET /master-system-inspections/:clientUuid",
  "GET /inspection-attachments",
  "GET /inspection-attachments/:photoUuid/content",
  "GET /v6-evidence/accepted",
  "GET /v6-evidence/accepted/:photoUuid/content",
  "GET /v7-evidence/accepted",
  "GET /v7-evidence/accepted/:photoUuid/content"
]);
const unknownJob = "00000000-0000-4000-8000-00000000f404";
const params: Record<string, string> = { jobId: unknownJob, customerId: unknownJob, clientUuid: unknownJob, photoUuid: unknownJob, id: unknownJob, technicianId: "2147480000", systemKey: "hose_reel" };

function routesOf(router: Router) {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack;
  return stack.flatMap((layer) => layer.route ? Object.keys(layer.route.methods).map((method) => ({ method: method.toUpperCase(), path: layer.route!.path })) : []);
}

test("supervisor role: migration 031, account lifecycle, customer summary and a closed route matrix", { skip: !process.env.SEED_INTEGRATION_DATABASE_URL }, async () => {
  const url = new URL(loadConfig().databaseUrl);
  assert.equal(process.env.NODE_ENV, "test"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/phase6_seed_integration");
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const checks = async () => (await pool.query<{ def: string }>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='users'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%role%'`)).rows.map((row) => row.def);
    const [roleCheck, ...others] = await checks();
    assert.deepEqual(others, [], "exactly one role CHECK on users");
    assert.match(roleCheck!, /'admin'.*'inspector'.*'supervisor'/);
    assert.equal((await pool.query(`SELECT conname FROM pg_constraint WHERE conrelid='users'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%role%'`)).rows[0].conname, "users_role_check");
    await runMigrations(pool); // replay: marker found, nothing re-applied
    assert.equal((await checks()).length, 1);
    await assert.rejects(pool.query("INSERT INTO users(username,password_hash,role) VALUES('bad-role','x','owner')"), /users_role_check/);

    const passwordHash = await hashPassword("manager-test-password");
    await pool.query("INSERT INTO users(username,password_hash,role) VALUES('mobiletest',$1,'admin')", [passwordHash]);
    const app = express(); app.use(express.json()); app.use(currentUser); app.use(authRouter);
    const managerRouters = [createManagerServiceVisitsRouter({ database: pool }), createManagerCustomersRouter(pool), createManagerTechniciansRouter(pool), createManagerCorrectionsRouter(pool)];
    const otherRouters = [syncRouter, testRecordsRouter, inspectionsRouter, inspectionReferenceRouter, inspectionJobsRouter, masterSystemInspectionsRouter, inspectionAttachmentsRouter, stagedEvidenceRouter];
    for (const router of [...managerRouters, ...otherRouters]) app.use(router);
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerTechnicianError || error instanceof ManagerCustomerError) { response.status(error.status).json({ error: error.code }); return; }
      response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const request = (path: string, method = "GET", body?: unknown, cookie = "") => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const loginAs = async (username: string, password: string) => {
      const login = await request("/auth/login", "POST", { username, password }); assert.equal(login.status, 200, `login ${username}`);
      return login.headers.get("set-cookie")!.split(";")[0]!;
    };
    try {
      const admin = await loginAs("mobiletest", "manager-test-password");
      // Admin creates a supervisor from the technician form; the role never defaults to anything but inspector.
      const created = await request("/manager/technicians", "POST", { username: "review-lead", password: "supervisor-test-password", role: "supervisor" }, admin);
      assert.equal(created.status, 201);
      const { technician: supervisorRow } = await created.json() as { technician: { id: number; role: string; isActive: boolean } };
      assert.equal(supervisorRow.role, "supervisor"); assert.equal(supervisorRow.isActive, true);
      const tech = await request("/manager/technicians", "POST", { username: "field-tech", password: "technician-test-password" }, admin);
      assert.equal((await tech.json() as { technician: { role: string } }).technician.role, "inspector");
      assert.equal((await request("/manager/technicians", "POST", { username: "sneaky", password: "technician-test-password", role: "admin" }, admin)).status, 400);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE username='sneaky'")).rows[0].n, 0);
      assert.deepEqual((await pool.query("SELECT reason FROM audit_events WHERE action='manager_technician_created' ORDER BY id")).rows.map((row) => row.reason), ["role=supervisor", "role=inspector"]);
      const listed = await (await request("/manager/technicians", "GET", undefined, admin)).json() as { technicians: Array<{ username: string; role: string }> };
      assert.deepEqual(listed.technicians.map((row) => [row.username, row.role]), [["field-tech", "inspector"], ["review-lead", "supervisor"]]);

      const customer = await request("/manager/customers", "POST", { displayName: "Supervisor Matrix", siteDisplayName: "Primary", systemKeys: ["hose_reel"], contactPhone: "0123", contactPerson: "Site Lead" }, admin);
      assert.equal(customer.status, 201);

      const supervisor = await loginAs("review-lead", "supervisor-test-password");
      const me = await (await request("/auth/me", "GET", undefined, supervisor)).json() as { user: { role: string } };
      assert.equal(me.user.role, "supervisor");

      // The customer list is a summary for a supervisor: identity, sites, system catalogue only.
      const summary = await (await request("/manager/customers", "GET", undefined, supervisor)).json() as { customers: Array<Record<string, unknown>> };
      const full = await (await request("/manager/customers", "GET", undefined, admin)).json() as { customers: Array<Record<string, unknown>> };
      assert.ok(summary.customers.length >= 1 && summary.customers.length === full.customers.length, "same customers, summarised");
      assert.ok(summary.customers.some((row) => (row.customer as { displayName: string }).displayName === "Supervisor Matrix"));
      for (const row of summary.customers) {
        assert.deepEqual(Object.keys(row).sort(), ["customer", "sites", "supportedSystems"]);
        assert.deepEqual(Object.keys(row.customer as object).sort(), ["code", "displayName", "id"]);
      }
      assert.ok(full.customers.every((row) => "configuration" in row), "the admin list is unchanged");

      // Closed matrix over every route of every guarded router.
      const all = [...managerRouters, ...otherRouters].flatMap((router, index) => routesOf(router).map((route) => ({ ...route, manager: index < managerRouters.length })));
      assert.ok(all.length >= 50, `enumerated ${all.length} routes`);
      for (const key of supervisorReads) assert.ok(all.some((route) => `${route.method} ${route.path}` === key), `allowed route exists: ${key}`);
      await pool.query("DELETE FROM audit_events WHERE action='authz.denied'");
      let deniedManager = 0;
      for (const route of all) {
        const key = `${route.method} ${route.path}`;
        const path = route.path.replace(/:([A-Za-z]+)/g, (_match, name: string) => params[name] ?? unknownJob);
        const response = await request(path, route.method, route.method === "GET" ? undefined : {}, supervisor);
        if (supervisorReads.has(key)) {
          assert.ok(response.status !== 401 && response.status !== 403, `${key} is open to a supervisor (got ${response.status})`);
        } else {
          assert.equal(response.status, 403, `${key} must refuse a supervisor`);
          if (route.manager) deniedManager += 1;
        }
      }
      const denials = (await pool.query("SELECT actor_user_id::int AS actor, reason, result FROM audit_events WHERE action='authz.denied' ORDER BY id")).rows;
      assert.equal(denials.length, deniedManager, "one authz.denied row per refused Manager route");
      assert.ok(denials.every((row) => row.actor === supervisorRow.id && row.result === "failure"));
      assert.ok(denials.some((row) => row.reason === "POST /manager/technicians"));
      // A supervisor reviews the same visits as the admin, including jobs hidden from technicians.
      const createdVisit = await request("/inspection-jobs/service-visits", "POST", { requestId: "00000000-0000-4000-8000-00000000c830", customerId: "00000000-0000-4000-8000-000000000750", siteId: "00000000-0000-4000-8000-000000000755", systemKeys: ["portable_fire_extinguisher"] }, admin);
      assert.equal(createdVisit.status, 201, await createdVisit.clone().text());
      const job = (await createdVisit.json() as { job: { id: string } }).job;
      await pool.query("UPDATE inspection_jobs SET technician_visible=false WHERE id=$1", [job.id]);
      for (const path of [`/manager/service-visits/${job.id}`, `/manager/service-visits/${job.id}/final-report`]) {
        const asAdmin = await request(path, "GET", undefined, admin);
        const asSupervisor = await request(path, "GET", undefined, supervisor);
        assert.notEqual(asAdmin.status, 403);
        assert.equal(asSupervisor.status, asAdmin.status, `${path}: supervisor sees what the admin sees`);
        // `checkedAt` is the per-request completion-check time; everything else must match.
        const stable = async (response: Response) => JSON.parse(await response.text(), (key, value: unknown) => key === "checkedAt" ? undefined : value) as unknown;
        assert.deepEqual(await stable(asSupervisor), await stable(asAdmin), `${path}: same payload`);
      }
      // A refused supervisor write changed nothing.
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 3);

      // Admin deactivates the supervisor; the session stops working.
      assert.equal((await request(`/manager/technicians/${supervisorRow.id}/deactivate`, "POST", undefined, admin)).status, 200);
      assert.equal((await request("/auth/me", "GET", undefined, supervisor)).status, 401);
      assert.equal((await pool.query("SELECT reason FROM audit_events WHERE action='manager_technician_deactivated'")).rows[0].reason, "role=supervisor");
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  } finally { await pool.end(); }
});
