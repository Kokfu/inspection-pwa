import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { loadConfig } from "../config/env.js";
import { hashPassword } from "../auth/passwords.js";
import { authRouter } from "./auth.js";
import { currentUser } from "../middleware/currentUser.js";
import { createManagerTechniciansRouter, ManagerTechnicianError } from "./managerTechnicians.js";

test("FR-08 reactivation: authority, lifecycle, concurrency, clashes and atomic audit", async (t) => {
  const url = new URL(loadConfig().databaseUrl);
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SEED_INTEGRATION_DATABASE_URL, url.href.replace(/\/$/, ""));
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/phase6_seed_integration");
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const password = "throwaway-fr08-password";
    const hash = await hashPassword(password);
    const add = async (username: string, role: string, active = true, name: string | null = null) => Number((await pool.query(
      "INSERT INTO users(username,password_hash,role,is_active,display_name) VALUES($1,$2,$3,$4,$5) RETURNING id", [username, hash, role, active, name])).rows[0].id);
    const manager = await add("fr08-manager", "admin");
    const caller = await add("fr08-caller", "inspector");
    const supervisor = await add("fr08-reviewer", "supervisor");
    const app = express(); app.use(express.json()); app.use(currentUser); app.use(authRouter); app.use(createManagerTechniciansRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof SyntaxError && "status" in error && error.status === 400) { response.status(400).json({ error: "INVALID_JSON" }); return; }
      response.status(error instanceof ManagerTechnicianError ? error.status : 500).json({ error: error instanceof ManagerTechnicianError ? error.code : "INTERNAL_SERVER_ERROR", ...(error instanceof ManagerTechnicianError ? { message: error.message } : {}) });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const request = (path: string, method = "GET", body?: unknown, cookie = "") => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const login = (username: string, pw = password) => request("/auth/login", "POST", { username, password: pw });
    const cookie = async (username: string) => { const r = await login(username); assert.equal(r.status, 200); return r.headers.get("set-cookie")!.split(";")[0]!; };
    const managerCookie = await cookie("fr08-manager");
    const activate = (id: number, auth = managerCookie, body?: unknown) => request(`/manager/technicians/${id}/reactivate`, "POST", body, auth);
    const row = async (id: number) => (await pool.query("SELECT * FROM users WHERE id=$1", [id])).rows[0];
    try {
      await t.test("401/403, strict input, unknown/manager/hidden/deleted 404", async () => {
        assert.equal((await activate(caller, "")).status, 401);
        for (const username of ["fr08-caller", "fr08-reviewer"]) assert.equal((await activate(caller, await cookie(username))).status, 403);
        for (const id of [0, -1, 1.5, 2147483648]) assert.equal((await activate(id)).status, 400);
        for (const body of [null, [], { isActive: true }]) assert.equal((await activate(caller, managerCookie, body)).status, 400);
        const hidden = await add("fr08-hidden", "inspector", false);
        await pool.query("UPDATE users SET hidden_at=now() WHERE id=$1", [hidden]);
        const deleted = await add("fr08-deleted", "inspector", false);
        assert.equal((await request(`/manager/technicians/${deleted}`, "DELETE", { username: "fr08-deleted" }, managerCookie)).status, 200);
        for (const id of [manager, hidden, deleted, 2147483647]) assert.equal((await activate(id)).status, 404);
      });
      await t.test("both roles recover login, preserve hash/assignments, never revive old sessions; retries audit once", async () => {
        for (const role of ["inspector", "supervisor"]) {
          const username = `fr08-target-${role}`;
          const id = await add(username, role);
          if (role === "inspector") await pool.query("INSERT INTO technician_supervisor_assignments(technician_id,supervisor_id,created_by_user_id) VALUES($1,$2,$3)", [id, supervisor, manager]);
          const oldCookie = await cookie(username);
          assert.equal((await request(`/manager/technicians/${id}/deactivate`, "POST", undefined, managerCookie)).status, 200);
          const denied = await login(username); assert.equal(denied.status, 401); assert.equal((await denied.json() as { error: string }).error, "INVALID_CREDENTIALS");
          // Simulate a lingering legacy session: activation must still require fresh login.
          await pool.query("UPDATE user_sessions SET revoked_at=NULL WHERE user_id=$1", [id]);
          const before = await row(id);
          const results = await Promise.all([activate(id), activate(id)]);
          for (const r of results) { assert.equal(r.status, 200); const body = await r.json() as { technician: { id: number; isActive: boolean } }; assert.equal(body.technician.id, id); assert.equal(body.technician.isActive, true); }
          const after = await row(id);
          assert.equal(after.password_hash, before.password_hash);
          assert.equal((await request("/auth/me", "GET", undefined, oldCookie)).status, 401);
          assert.equal((await login(username)).status, 200);
          assert.equal((await activate(id)).status, 200);
          assert.equal((await row(id)).updated_at.getTime(), after.updated_at.getTime(), "active retry changes nothing");
          const audit = (await pool.query("SELECT * FROM audit_events WHERE action='manager_technician_reactivated' AND entity_id=$1", [String(id)])).rows;
          assert.equal(audit.length, 1); assert.equal(Number(audit[0].actor_user_id), manager); assert.equal(audit[0].reason, `role=${role}`); assert.equal(audit[0].result, "success"); assert.ok(audit[0].created_at);
          if (role === "inspector") assert.equal((await pool.query("SELECT count(*)::int AS n FROM technician_supervisor_assignments WHERE technician_id=$1 AND supervisor_id=$2 AND archived_at IS NULL", [id, supervisor])).rows[0].n, 1);
        }
      });
      await t.test("409 active name clash, inactive duplicate allowed, concurrent same-name activation has one winner", async () => {
        await add("fr08-active-name", "inspector", true, "Shared Name");
        const id = await add("fr08-inactive-name", "supervisor", false, "Shared Name");
        const refused = await activate(id); assert.equal(refused.status, 409);
        assert.match((await refused.json() as { message: string }).message, /Another active account/);
        assert.equal((await row(id)).is_active, false);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_technician_reactivated' AND entity_id=$1", [String(id)])).rows[0].n, 0);
        const a = await add("fr08-race-a", "inspector", false, "Race Name");
        const b = await add("fr08-race-b", "inspector", false, "Race Name");
        assert.deepEqual((await Promise.all([activate(a), activate(b)])).map((r) => r.status).sort(), [200, 409]);
      });
      await t.test("password reset stays inactive; audit failure rolls activation back", async () => {
        const id = await add("fr08-reset", "inspector", false);
        const newPw = "throwaway-fr08-reset-password";
        assert.equal((await request(`/manager/technicians/${id}/password`, "POST", { password: newPw }, managerCookie)).status, 200);
        assert.equal((await row(id)).is_active, false); assert.equal((await login("fr08-reset", newPw)).status, 401);
        await pool.query(`CREATE FUNCTION reject_reactivate_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='manager_technician_reactivated' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_reactivate_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_reactivate_audit();`);
        const before = await row(id);
        try { assert.equal((await activate(id)).status, 500); }
        finally { await pool.query("DROP TRIGGER reject_reactivate_audit ON audit_events; DROP FUNCTION reject_reactivate_audit();"); }
        assert.deepEqual(await row(id), before);
        assert.equal((await activate(id)).status, 200); assert.equal((await login("fr08-reset", newPw)).status, 200);
      });
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  } finally { await pool.end(); }
});
