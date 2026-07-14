import { Router } from "express";
import { auditLog } from "../audit/auditLog.js";
import { createSession, clearSessionCookie, setSessionCookie } from "../auth/sessionTokens.js";
import { verifyPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { requireAuthenticated } from "../middleware/authRequired.js";

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "inspector";
  is_active: boolean;
};

export const authRouter = Router();

authRouter.post("/auth/login", async (request, response, next) => {
  try {
    const { username, password } = request.body as {
      username?: unknown;
      password?: unknown;
    };

    if (typeof username !== "string" || typeof password !== "string") {
      await auditLog({
        action: "login",
        result: "failure",
        reason: "Invalid login payload"
      });
      response.status(400).json({ error: "INVALID_LOGIN" });
      return;
    }

    const userResult = await pool.query<UserRow>(
      `
        SELECT id, username, password_hash, role, is_active
        FROM users
        WHERE username = $1
        LIMIT 1;
      `,
      [username.trim()]
    );
    const user = userResult.rows[0];

    if (!user || !user.is_active) {
      await auditLog({
        action: "login",
        entityType: "user",
        entityId: username.trim(),
        result: "failure",
        reason: "User not found or inactive"
      });
      response.status(401).json({ error: "INVALID_CREDENTIALS" });
      return;
    }

    const passwordValid = await verifyPassword(user.password_hash, password);
    if (!passwordValid) {
      await auditLog({
        actorUserId: Number(user.id),
        action: "login",
        entityType: "user",
        entityId: user.id,
        result: "failure",
        reason: "Invalid password"
      });
      response.status(401).json({ error: "INVALID_CREDENTIALS" });
      return;
    }

    const session = await createSession(Number(user.id));
    setSessionCookie(response, session.token);
    await auditLog({
      actorUserId: Number(user.id),
      action: "login",
      entityType: "user",
      entityId: user.id,
      result: "success"
    });

    response.json({
      user: {
        id: Number(user.id),
        username: user.username,
        role: user.role
      },
      expiresAt: session.expiresAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/auth/me", requireAuthenticated, (request, response) => {
  response.json({ user: request.currentUser });
});

authRouter.post(
  "/auth/logout",
  requireAuthenticated,
  async (request, response, next) => {
    try {
      if (request.sessionId) {
        await pool.query(
          `
            UPDATE user_sessions
            SET revoked_at = now()
            WHERE id = $1;
          `,
          [request.sessionId]
        );
      }

      clearSessionCookie(response);
      await auditLog({
        actorUserId: request.currentUser?.id,
        action: "logout",
        entityType: "user",
        entityId: String(request.currentUser?.id ?? ""),
        result: "success"
      });
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

