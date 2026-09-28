import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { loadConfig } from "../config/env.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { authRouter } from "./auth.js";
import { currentUser } from "../middleware/currentUser.js";
import { createManagerTechniciansRouter, ManagerTechnicianError } from "./managerTechnicians.js";
import { createManagerRemindersRouter } from "./managerReminders.js";

test("cold migration, technician lifecycle, concurrent uniqueness and real session invalidation", { skip: !process.env.SEED_INTEGRATION_DATABASE_URL }, async () => {
  const url = new URL(loadConfig().databaseUrl);
  assert.equal(process.env.NODE_ENV, "test"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/phase6_seed_integration");
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name IN ('next_service_due_date','contact_phone')`)).rows[0].n, 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='idx_customers_next_service_due_date'`)).rows[0].n, 1);
    await runMigrations(pool); // Startup replay must not re-add migration 028's columns.
    const admin = (await pool.query("INSERT INTO users(username,password_hash,role) VALUES('mobiletest',$1,'admin') RETURNING id", [await hashPassword("manager-test-password")])).rows[0];
    const app = express(); app.use(express.json()); app.use(currentUser); app.use(authRouter); app.use(createManagerTechniciansRouter(pool)); app.use(createManagerRemindersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(error instanceof ManagerTechnicianError ? error.status : 500).json({ error: error instanceof ManagerTechnicianError ? error.code : "INTERNAL_SERVER_ERROR" });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const request = (path: string, method = "GET", body?: unknown, cookie = "") => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    try {
      const login = await request("/auth/login", "POST", { username: "mobiletest", password: "manager-test-password" }); assert.equal(login.status, 200);
      const managerCookie = login.headers.get("set-cookie")!.split(";")[0]!;
      assert.equal((await request("/manager/technicians")).status, 401);
      const create = await request("/manager/technicians", "POST", { username: "field-tech", password: "technician-test-password" }, managerCookie);
      assert.equal(create.status, 201); const { technician } = await create.json() as { technician: { id: number; isActive: boolean; username: string } };
      assert.equal(technician.isActive, true); assert.equal("password_hash" in technician, false);
      const row = (await pool.query("SELECT * FROM users WHERE id=$1", [technician.id])).rows[0]; assert.equal(row.role, "inspector"); assert.ok(await verifyPassword(row.password_hash, "technician-test-password"));
      assert.equal(row.display_name, null, "migration does not invent existing names");
      const namePath = `/manager/technicians/${technician.id}/display-name`;
      assert.equal((await request(namePath, "PUT", { displayName: "Alice Tan" })).status, 401);
      assert.equal((await request(namePath, "PUT", { displayName: " " }, managerCookie)).status, 400);
      assert.equal((await request(namePath, "PUT", { displayName: "x".repeat(161) }, managerCookie)).status, 400);
      assert.equal((await request(namePath, "PUT", { displayName: "Alice Tan", role: "admin" }, managerCookie)).status, 400);
      const renamed = await request(namePath, "PUT", { displayName: " Alice Tan " }, managerCookie);
      assert.equal(renamed.status, 200);
      assert.equal((await renamed.json() as { technician: { displayName: string } }).technician.displayName, "Alice Tan");
      assert.equal((await pool.query("SELECT display_name FROM users WHERE id=$1", [technician.id])).rows[0]?.display_name, "Alice Tan");
      const techLogin = await request("/auth/login", "POST", { username: "field-tech", password: "technician-test-password" }); assert.equal(techLogin.status, 200);
      const techCookie = techLogin.headers.get("set-cookie")!.split(";")[0]!;
      assert.equal((await request(namePath, "PUT", { displayName: "Forged" }, techCookie)).status, 403);
      assert.equal((await request("/auth/me", "GET", undefined, techCookie)).status, 200);
      assert.equal((await request("/manager/technicians", "GET", undefined, techCookie)).status, 403);
      assert.equal((await request(`/manager/technicians/${admin.id}/deactivate`, "POST", undefined, managerCookie)).status, 404);
      for (let i = 0; i < 2; i++) {
        const deactivated = await request(`/manager/technicians/${technician.id}/deactivate`, "POST", undefined, managerCookie); assert.equal(deactivated.status, 200);
        assert.equal((await deactivated.json() as { technician: { isActive: boolean } }).technician.isActive, false);
      }
      assert.equal((await request("/auth/me", "GET", undefined, techCookie)).status, 401, "existing session is rejected by currentUser's active-user join");
      assert.equal((await request("/auth/login", "POST", { username: "field-tech", password: "technician-test-password" })).status, 401);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL", [technician.id])).rows[0].n, 1, "deactivation needs no session revocation writes");
      const deletePath = `/manager/technicians/${technician.id}`;
      assert.equal((await request(deletePath, "DELETE", { username: "field-tech" })).status, 401);
      assert.equal((await request(deletePath, "DELETE", { username: "field-tech" }, techCookie)).status, 401);
      assert.equal((await request(deletePath, "DELETE", { username: "wrong" }, managerCookie)).status, 409);
      const linked = await request(deletePath, "DELETE", { username: "field-tech" }, managerCookie);
      assert.equal(linked.status, 200);
      assert.deepEqual(await linked.json(), { removedId: technician.id, disposition: "hidden" });
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [technician.id])).rows[0].n, 1);
      assert.equal((await pool.query("SELECT hidden_at IS NOT NULL AS hidden FROM users WHERE id=$1", [technician.id])).rows[0].hidden, true);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_sessions WHERE user_id=$1", [technician.id])).rows[0].n, 1, "linked session stays intact for history");
      assert.equal((await request("/manager/technicians", "GET", undefined, managerCookie).then((response) => response.json()) as { technicians: Array<{ id: number }> }).technicians.some((row) => row.id === technician.id), false);
      assert.equal((await request("/manager/reminders/staff", "GET", undefined, managerCookie).then((response) => response.json()) as { staff: Array<{ id: number }> }).staff.some((row) => row.id === technician.id), false);
      const unused = await request("/manager/technicians", "POST", { username: "unused-tech", password: "technician-test-password" }, managerCookie);
      assert.equal(unused.status, 201);
      const unusedId = (await unused.json() as { technician: { id: number } }).technician.id;
      assert.equal((await request(`/manager/technicians/${unusedId}`, "DELETE", { username: "unused-tech" }, managerCookie)).status, 409, "active accounts cannot be deleted");
      assert.equal((await request(`/manager/technicians/${unusedId}/deactivate`, "POST", undefined, managerCookie)).status, 200);
      const deleted = await request(`/manager/technicians/${unusedId}`, "DELETE", { username: "unused-tech" }, managerCookie);
      assert.equal(deleted.status, 200);
      assert.deepEqual(await deleted.json(), { removedId: unusedId, disposition: "deleted" });
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [unusedId])).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_technician_removed' AND entity_id=$1", [String(unusedId)])).rows[0].n, 1);
      const results = await Promise.all([1, 2].map(() => request("/manager/technicians", "POST", { username: "aaa-concurrent", password: "technician-test-password" }, managerCookie)));
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const list = await request("/manager/technicians", "GET", undefined, managerCookie);
      const technicians = (await list.json() as { technicians: Array<{ username: string; isActive: boolean }> }).technicians;
      assert.deepEqual(technicians.map((t) => [t.username, t.isActive]), [["aaa-concurrent", true]]);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_technician_created' AND entity_type='user'")).rows[0].n, 3);
      const concurrentId = (await pool.query<{ id: string }>("SELECT id FROM users WHERE username='aaa-concurrent'")).rows[0]!.id;
      assert.equal((await request(`/manager/technicians/${concurrentId}/deactivate`, "POST", undefined, managerCookie)).status, 200);
      await pool.query(`CREATE FUNCTION reject_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='manager_technician_removed' THEN RAISE EXCEPTION 'test delete audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_delete_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_delete_audit();`);
      assert.equal((await request(`/manager/technicians/${concurrentId}`, "DELETE", { username: "aaa-concurrent" }, managerCookie)).status, 500);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id=$1", [concurrentId])).rows[0].n, 1, "audit failure rolls back account deletion");
      await pool.query("DROP TRIGGER reject_delete_audit ON audit_events; DROP FUNCTION reject_delete_audit();");
      // An audit storage failure must roll back the user mutation too.
      await pool.query(`CREATE FUNCTION reject_technician_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='manager_technician_created' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_technician_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_technician_audit();`);
      assert.equal((await request("/manager/technicians", "POST", { username: "rolled-back", password: "technician-test-password" }, managerCookie)).status, 500);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE username='rolled-back'")).rows[0].n, 0);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  } finally { await pool.end(); }
});
