import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";
import { loadConfig } from "../config/env.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { runMigrations } from "../db/migrations.js";
import {
  createAdminAccount, resetAdminAccountPassword, resolveAdminCredentials, runAdminCli,
  validateAdminPassword, AdminCliError
} from "./adminCli.js";

const execFileAsync = promisify(execFile);
const oldPassword = "old-admin-password-1";
const newPassword = "new-admin-password-2";

async function insertUser(username: string, role: "admin" | "inspector" | "supervisor", active = true, password = oldPassword) {
  const row = (await pool.query<{ id: string }>(
    "INSERT INTO users (username, password_hash, role, is_active) VALUES ($1,$2,$3,$4) RETURNING id",
    [username, await hashPassword(password), role, active]
  )).rows[0]!;
  return Number(row.id);
}
async function insertSession(userId: number, revoked = false) {
  await pool.query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at, revoked_at) VALUES ($1,$2, now() + interval '1 hour', ${revoked ? "now()" : "NULL"})`,
    [userId, randomBytes(16).toString("hex")]
  );
}
const hashOf = async (username: string) => (await pool.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE username=$1", [username])).rows[0]?.password_hash;
const activeSessions = async (userId: number) => (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL", [userId])).rows[0]!.n;
const auditRows = async (action: string) => (await pool.query<{ entity_id: string; result: string; reason: string; actor_user_id: string | null; entity_type: string }>(
  "SELECT entity_id, result, reason, actor_user_id, entity_type FROM audit_events WHERE action=$1 ORDER BY id", [action])).rows;

test("offline admin recovery CLI", { skip: !process.env.SEED_INTEGRATION_DATABASE_URL }, async (t) => {
  const url = new URL(loadConfig().databaseUrl);
  assert.equal(process.env.NODE_ENV, "test"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/phase6_seed_integration");
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);

    await t.test("a. create-admin creates a new admin; a second run fails and leaves the hash unchanged", async () => {
      const created = await createAdminAccount(pool, { username: "  ops-admin  ", password: oldPassword, displayName: " Ops Admin " });
      assert.equal(created.ok, true);
      const row = (await pool.query("SELECT role, is_active, display_name, password_hash FROM users WHERE username='ops-admin'")).rows[0];
      assert.equal(row.role, "admin"); assert.equal(row.is_active, true); assert.equal(row.display_name, "Ops Admin");
      assert.ok(await verifyPassword(row.password_hash, oldPassword));
      const before = row.password_hash;
      const again = await createAdminAccount(pool, { username: "ops-admin", password: newPassword });
      assert.equal(again.ok, false);
      assert.match((again as { message: string }).message, /reset-admin-password/);
      assert.equal(await hashOf("ops-admin"), before);
      // An existing non-admin username is never promoted or overwritten.
      await insertUser("field-tech", "inspector");
      const techBefore = await hashOf("field-tech");
      assert.equal((await createAdminAccount(pool, { username: "field-tech", password: newPassword })).ok, false);
      assert.equal(await hashOf("field-tech"), techBefore);
      assert.equal((await pool.query("SELECT role FROM users WHERE username='field-tech'")).rows[0].role, "inspector");
    });

    await t.test("b. reset updates the hash: old password no longer verifies, new one does", async () => {
      const result = await resetAdminAccountPassword(pool, { username: "ops-admin", password: newPassword });
      assert.equal(result.ok, true);
      const hash = (await hashOf("ops-admin"))!;
      assert.equal(await verifyPassword(hash, oldPassword), false);
      assert.equal(await verifyPassword(hash, newPassword), true);
    });

    await t.test("c. reset revokes all of that admin's sessions and no one else's", async () => {
      const adminId = Number((await pool.query("SELECT id FROM users WHERE username='ops-admin'")).rows[0].id);
      const otherAdminId = await insertUser("other-admin", "admin");
      const techId = Number((await pool.query("SELECT id FROM users WHERE username='field-tech'")).rows[0].id);
      await insertSession(adminId); await insertSession(adminId); await insertSession(adminId, true);
      await insertSession(otherAdminId); await insertSession(techId);
      const result = await resetAdminAccountPassword(pool, { username: "ops-admin", password: oldPassword });
      assert.deepEqual(result, { ok: true, userId: adminId, sessionsRevoked: 2 });
      assert.equal(await activeSessions(adminId), 0);
      assert.equal(await activeSessions(otherAdminId), 1);
      assert.equal(await activeSessions(techId), 1);
    });

    await t.test("d. reset refuses technicians, supervisors and missing users and changes nothing", async () => {
      const supervisorId = await insertUser("review-lead", "supervisor");
      const techId = Number((await pool.query("SELECT id FROM users WHERE username='field-tech'")).rows[0].id);
      await insertSession(supervisorId);
      const snapshot = async () => JSON.stringify((await pool.query("SELECT username, password_hash, role, is_active, updated_at FROM users ORDER BY id")).rows);
      const sessionsBefore = (await pool.query("SELECT id, revoked_at FROM user_sessions ORDER BY id")).rows;
      const before = await snapshot();
      for (const username of ["field-tech", "review-lead", "no-such-user"]) {
        const result = await resetAdminAccountPassword(pool, { username, password: newPassword });
        assert.equal(result.ok, false, username);
      }
      assert.equal(await snapshot(), before);
      assert.deepEqual((await pool.query("SELECT id, revoked_at FROM user_sessions ORDER BY id")).rows, sessionsBefore);
      assert.equal(await activeSessions(techId), 1); assert.equal(await activeSessions(supervisorId), 1);
    });

    await t.test("e. reset reactivates an inactive admin", async () => {
      await insertUser("locked-admin", "admin", false);
      assert.equal((await resetAdminAccountPassword(pool, { username: "locked-admin", password: newPassword })).ok, true);
      assert.equal((await pool.query("SELECT is_active FROM users WHERE username='locked-admin'")).rows[0].is_active, true);
    });

    await t.test("f. password length bounds and confirmation are enforced", async () => {
      for (const bad of ["", "a".repeat(11), "a".repeat(1025), undefined, 12345678901234]) assert.throws(() => validateAdminPassword(bad), AdminCliError);
      assert.equal(validateAdminPassword("a".repeat(12)).length, 12); assert.equal(validateAdminPassword("a".repeat(1024)).length, 1024);
      const before = await hashOf("ops-admin");
      for (const password of ["a".repeat(11), "a".repeat(1025)]) {
        await assert.rejects(resetAdminAccountPassword(pool, { username: "ops-admin", password }), AdminCliError);
        await assert.rejects(createAdminAccount(pool, { username: "fresh-admin", password }), AdminCliError);
      }
      assert.equal(await hashOf("ops-admin"), before); assert.equal(await hashOf("fresh-admin"), undefined);
      // Non-TTY: password from ADMIN_PASSWORD, username from argument else ADMIN_USERNAME.
      assert.deepEqual(await resolveAdminCredentials({ argv: [" ops-admin "], env: { ADMIN_USERNAME: "ignored", ADMIN_PASSWORD: newPassword }, isTty: false }), { username: "ops-admin", password: newPassword });
      assert.equal((await resolveAdminCredentials({ argv: [], env: { ADMIN_USERNAME: "from-env", ADMIN_PASSWORD: newPassword }, isTty: false })).username, "from-env");
      await assert.rejects(resolveAdminCredentials({ argv: ["x"], env: {}, isTty: false }), AdminCliError);
      await assert.rejects(resolveAdminCredentials({ argv: [], env: { ADMIN_PASSWORD: newPassword }, isTty: false }), AdminCliError);
      // TTY: prompts twice and ignores ADMIN_PASSWORD; mismatch and short entries are rejected.
      const answers = (...values: string[]) => { const queue = [...values]; return async () => queue.shift()!; };
      assert.deepEqual(await resolveAdminCredentials({ argv: ["ops-admin"], env: { ADMIN_PASSWORD: "ignored-env-password" }, isTty: true, prompt: answers(newPassword, newPassword) }), { username: "ops-admin", password: newPassword });
      await assert.rejects(resolveAdminCredentials({ argv: ["ops-admin"], env: {}, isTty: true, prompt: answers(newPassword, `${newPassword}x`) }), /do not match/);
      await assert.rejects(resolveAdminCredentials({ argv: ["ops-admin"], env: {}, isTty: true, prompt: answers("short", "short") }), AdminCliError);
      // The command reports an exit code and never prints the password.
      const out: string[] = []; const err: string[] = [];
      const log = { out: (line: string) => out.push(line), err: (line: string) => err.push(line) };
      assert.equal(await runAdminCli("reset", pool, { argv: ["ops-admin"], env: { ADMIN_PASSWORD: "a".repeat(11) }, isTty: false }, log), 1);
      assert.equal(await runAdminCli("reset", pool, { argv: ["field-tech"], env: { ADMIN_PASSWORD: newPassword }, isTty: false }, log), 1);
      assert.equal(await runAdminCli("reset", pool, { argv: ["ops-admin"], env: { ADMIN_PASSWORD: newPassword }, isTty: false }, log), 0);
      assert.ok(![...out, ...err].some((line) => line.includes(newPassword) || line.includes("argon2")), "no output line contains the password or a hash");
    });

    await t.test("g. audit rows exist for success and refusal and never carry the password or hash", async () => {
      const created = await auditRows("admin_create_cli");
      assert.deepEqual(created.map((row) => [row.result, row.entity_type, row.actor_user_id]), [["success", "user", null], ["failure", "user", null], ["failure", "user", null]]);
      assert.equal(created[0]!.reason, "offline operator CLI");
      const resets = await auditRows("admin_password_reset_cli");
      assert.ok(resets.some((row) => row.result === "success" && row.reason === "offline operator CLI"));
      const refusals = resets.filter((row) => row.result === "failure");
      const techId = String((await pool.query("SELECT id FROM users WHERE username='field-tech'")).rows[0].id);
      assert.ok(refusals.some((row) => row.entity_id === techId && /not an admin/.test(row.reason)));
      assert.ok(refusals.some((row) => row.entity_id === "no-such-user" && /not found/.test(row.reason)));
      const text = (await pool.query<{ t: string }>("SELECT audit_events::text AS t FROM audit_events")).rows.map((row) => row.t).join("\n");
      for (const secret of [oldPassword, newPassword, "argon2", ...(await pool.query<{ password_hash: string }>("SELECT password_hash FROM users")).rows.map((row) => row.password_hash)]) {
        assert.equal(text.includes(secret), false, "audit trail leaks a secret");
      }
    });

    await t.test("h. a failure after the password UPDATE rolls back the password and the session revocation", async () => {
      const adminId = Number((await pool.query("SELECT id FROM users WHERE username='ops-admin'")).rows[0].id);
      await insertSession(adminId);
      const hashBefore = await hashOf("ops-admin"); const sessionsBefore = await activeSessions(adminId);
      const auditBefore = (await auditRows("admin_password_reset_cli")).length;
      assert.ok(sessionsBefore >= 1);
      await pool.query(`CREATE FUNCTION reject_cli_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='admin_password_reset_cli' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_cli_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_cli_audit();`);
      try {
        await assert.rejects(resetAdminAccountPassword(pool, { username: "ops-admin", password: "rollback-password-3" }), /test audit failure/);
        const err: string[] = [];
        assert.equal(await runAdminCli("reset", pool, { argv: ["ops-admin"], env: { ADMIN_PASSWORD: "rollback-password-3" }, isTty: false }, { out: () => undefined, err: (line) => err.push(line) }), 1);
        assert.ok(err.every((line) => !line.includes("rollback-password-3") && !line.includes("test audit failure")), "unexpected failures do not echo messages");
      } finally { await pool.query("DROP TRIGGER reject_cli_audit ON audit_events; DROP FUNCTION reject_cli_audit();"); }
      assert.equal(await hashOf("ops-admin"), hashBefore);
      assert.equal(await activeSessions(adminId), sessionsBefore);
      assert.equal((await auditRows("admin_password_reset_cli")).length, auditBefore);
    });

    await t.test("i. the real commands exit non-zero on refusal and zero on success without printing the password", async () => {
      const run = async (script: string, args: string[], password: string) => {
        try {
          const { stdout, stderr } = await execFileAsync(process.execPath, ["--import", "tsx", script, ...args], { env: { ...process.env, ADMIN_PASSWORD: password } });
          return { code: 0, stdout, stderr };
        } catch (error) {
          const failure = error as { code: number; stdout: string; stderr: string };
          return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
        }
      };
      const techBefore = await hashOf("field-tech");
      const refused = await run("src/cli/resetAdminPassword.ts", ["field-tech"], "child-process-password-4");
      assert.equal(refused.code, 1); assert.match(refused.stderr, /not an admin/);
      assert.equal(await hashOf("field-tech"), techBefore);
      const ok = await run("src/cli/resetAdminPassword.ts", ["ops-admin"], "child-process-password-4");
      assert.equal(ok.code, 0);
      assert.ok(await verifyPassword((await hashOf("ops-admin"))!, "child-process-password-4"));
      const duplicate = await run("src/cli/createAdmin.ts", ["ops-admin"], "child-process-password-4");
      assert.equal(duplicate.code, 1); assert.match(duplicate.stderr, /reset-admin-password/);
      const fresh = await run("src/cli/createAdmin.ts", ["child-admin"], "child-process-password-4");
      assert.equal(fresh.code, 0);
      for (const result of [refused, ok, duplicate, fresh]) assert.ok(!`${result.stdout}${result.stderr}`.includes("child-process-password-4"));
    });
  } finally { await pool.end(); }
});
