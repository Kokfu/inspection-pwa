import { Router } from "express";
import type { UserRole } from "../auth/authTypes.js";
import { auditLog } from "../audit/auditLog.js";
import { createSession, clearSessionCookie, setSessionCookie } from "../auth/sessionTokens.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { loginPeer, reserveLogin, type LoginLease } from "../auth/loginLimiter.js";
import { pool } from "../db/pool.js";
import { requireAuthenticated } from "../middleware/authRequired.js";

type UserRow = { id: string; username: string; password_hash: string; role: UserRole; is_active: boolean };
// One fixed dummy identity, initialized lazily inside the bounded hash-work lease.
let dummyHash: Promise<string> | undefined;
export const authRouter = Router();

authRouter.post("/auth/login", async (request, response, next) => {
  let lease: LoginLease | undefined;
  let transaction = false;
  try {
    const body: unknown = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).length !== 2 || !Object.hasOwn(body, "username") || !Object.hasOwn(body, "password")) {
      response.status(400).json({ error: "INVALID_LOGIN" }); return;
    }
    const { username, password } = body as { username: unknown; password: unknown };
    if (typeof username !== "string" || typeof password !== "string"
      || !username.trim() || username.length > 128 || !password.length || password.length > 1024) {
      response.status(400).json({ error: "INVALID_LOGIN" }); return;
    }
    const reserved = await reserveLogin(pool, username.trim(), loginPeer(request));
    if (typeof reserved === "number") {
      response.setHeader("Retry-After", String(reserved));
      response.status(429).json({ error: "LOGIN_COOLDOWN", retryAfterSeconds: reserved }); return;
    }
    lease = reserved;
    const user = (await lease.client.query<UserRow>(
      "SELECT id,username,password_hash,role,is_active FROM users WHERE username=$1 LIMIT 1", [username.trim()]
    )).rows[0];
    const hash = user?.is_active ? user.password_hash : await (dummyHash ??= hashPassword("dummy-login-verification-only"));
    const passwordValid = await verifyPassword(hash, password);
    if (!user?.is_active || !passwordValid) {
      response.status(401).json({ error: "INVALID_CREDENTIALS" }); return;
    }
    // Prevent reset/deactivation racing verification from minting a fresh stale session.
    await lease.client.query("BEGIN"); transaction = true;
    const confirmed = (await lease.client.query<UserRow>(
      "SELECT id,username,password_hash,role,is_active FROM users WHERE id=$1 FOR SHARE", [user.id]
    )).rows[0];
    if (!confirmed?.is_active || confirmed.password_hash !== user.password_hash) {
      await lease.client.query("ROLLBACK"); transaction = false;
      response.status(401).json({ error: "INVALID_CREDENTIALS" }); return;
    }
    const session = await createSession(Number(user.id), lease.client);
    await lease.client.query("UPDATE audit_events SET result='success',actor_user_id=$2 WHERE id=$1 AND action='login_budget_v1'", [lease.eventId, user.id]);
    await lease.client.query("COMMIT"); transaction = false;
    setSessionCookie(response, session.token);
    await auditLog({ actorUserId: Number(user.id), action: "login", entityType: "user", entityId: user.id, result: "success" });
    response.json({ user: { id: Number(confirmed.id), username: confirmed.username, role: confirmed.role }, expiresAt: session.expiresAt.toISOString() });
  } catch (error) { next(error); }
  finally {
    if (lease) {
      if (transaction) await lease.client.query("ROLLBACK").catch(() => undefined);
      await lease.release().catch(next);
    }
  }
});

authRouter.get("/auth/me", requireAuthenticated, (request, response) => {
  response.json({ user: request.currentUser });
});

authRouter.post("/auth/logout", requireAuthenticated, async (request, response, next) => {
  try {
    if (request.sessionId) await pool.query("UPDATE user_sessions SET revoked_at=now() WHERE id=$1", [request.sessionId]);
    clearSessionCookie(response);
    await auditLog({ actorUserId: request.currentUser?.id, action: "logout", entityType: "user", entityId: String(request.currentUser?.id ?? ""), result: "success" });
    response.json({ ok: true });
  } catch (error) { next(error); }
});
