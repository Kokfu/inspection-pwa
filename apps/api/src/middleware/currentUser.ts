import type { NextFunction, Request, Response } from "express";
import { loadConfig } from "../config/env.js";
import { pool } from "../db/pool.js";
import { hashSessionToken } from "../auth/sessionTokens.js";
import "../auth/authTypes.js";

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

export async function currentUser(
  request: Request,
  _response: Response,
  next: NextFunction
) {
  try {
    const config = loadConfig();
    const token = parseCookies(request.headers.cookie).get(
      config.sessionCookieName
    );

    if (!token) {
      next();
      return;
    }

    const tokenHash = hashSessionToken(token);
    const result = await pool.query<{
      session_id: string;
      user_id: string;
      username: string;
      role: "admin" | "inspector";
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

