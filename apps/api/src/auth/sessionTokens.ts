import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { loadConfig } from "../config/env.js";
import { pool } from "../db/pool.js";

export function createRawSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number) {
  const config = loadConfig();
  const token = createRawSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(
    Date.now() + config.sessionDurationHours * 60 * 60 * 1000
  );

  await pool.query(
    `
      INSERT INTO user_sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3);
    `,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return { token, tokenHash, expiresAt };
}

export function setSessionCookie(response: Response, token: string) {
  const config = loadConfig();
  response.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionDurationHours * 60 * 60 * 1000
  });
}

export function clearSessionCookie(response: Response) {
  const config = loadConfig();
  response.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/"
  });
}

