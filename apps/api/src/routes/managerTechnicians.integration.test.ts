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

test("cold migration, technician lifecycle, concurrent uniqueness and real session invalidation", { skip: !process.env.SEED_INTEGRATION_DATABASE_URL }, async () => {
  const url = new URL(loadConfig().databaseUrl);
  assert.equal(process.env.NODE_ENV, "test"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/phase6_seed_integration");
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name IN ('next_service_due_date','contact_phone')`)).rows[0].n, 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='idx_customers_next_service_due_date'`)).rows[0].n, 1);
    await runMigrations(pool); // Startup replay must not re-add migration 028's columns.
    const admin = (await pool.query("INSERT INTO users(username,password_hash,role) VALUES('mobiletest',$1,'admin') RETURNING id", [await hashPassword("manager-test-password")])).rows[0];
    const app = express(); app.use(express.json()); app.use(currentUser); app.use(authRouter); app.use(createManagerTechniciansRouter(pool));
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
      const techLogin = await request("/auth/login", "POST", { username: "field-tech", password: "technician-test-password" }); assert.equal(techLogin.status, 200);
      const techCookie = techLogin.headers.get("set-cookie")!.split(";")[0]!;
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
      const results = await Promise.all([1, 2].map(() => request("/manager/technicians", "POST", { username: "aaa-concurrent", password: "technician-test-password" }, managerCookie)));
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const list = await request("/manager/technicians", "GET", undefined, managerCookie);
      const technicians = (await list.json() as { technicians: Array<{ username: string; isActive: boolean }> }).technicians;
      assert.deepEqual(technicians.map((t) => [t.username, t.isActive]), [["aaa-concurrent", true], ["field-tech", false]]);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_technician_created' AND entity_type='user'")).rows[0].n, 2);
      // An audit storage failure must roll back the user mutation too.
      await pool.query(`CREATE FUNCTION reject_technician_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='manager_technician_created' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_technician_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_technician_audit();`);
      assert.equal((await request("/manager/technicians", "POST", { username: "rolled-back", password: "technician-test-password" }, managerCookie)).status, 500);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE username='rolled-back'")).rows[0].n, 0);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  } finally { await pool.end(); }
});
