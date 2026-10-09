import type { NextFunction, Request, Response } from "express";
import { loadConfig } from "../config/env.js";
import { pool } from "../db/pool.js";
import { hashSessionToken } from "../auth/sessionTokens.js";
import type { UserRole } from "../auth/authTypes.js";
import "../auth/authTypes.js";

export function sessionCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  let token: string | undefined;
  let seen = false;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== name) continue;
    // Ambiguous duplicates fail closed, including identical duplicates.
    if (seen || rawValue.length === 0) return undefined;
    seen = true;
    try { token = decodeURIComponent(rawValue.join("=")); } catch { return undefined; }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  }
  return token;
}

export async function currentUser(
  request: Request,
  _response: Response,
  next: NextFunction
) {
  try {
    const config = loadConfig();
    _response.setHeader("Cache-Control", "private, no-store");
    const token = sessionCookie(request.headers.cookie, config.sessionCookieName);

    if (!token) {
      next();
      return;
    }

    const tokenHash = hashSessionToken(token);
    const result = await pool.query<{
      session_id: string;
      user_id: string;
      username: string;
      role: UserRole;
    }>(
      `
        SELECT
          s.id AS session_id,
          u.id AS user_id,
          u.username,
          u.role
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.is_active = true
        LIMIT 1;
      `,
      [tokenHash]
    );

    const row = result.rows[0];
    if (row) {
      request.currentUser = {
        id: Number(row.user_id),
        username: row.username,
        role: row.role
      };
      request.sessionId = Number(row.session_id);
      request.sessionTokenHash = tokenHash;
    }

    next();
  } catch (error) {
    next(error);
  }
}

