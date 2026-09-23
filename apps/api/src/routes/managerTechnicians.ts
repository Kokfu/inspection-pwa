import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";

export class ManagerTechnicianError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

const technicianColumns = `id::int AS id, username, display_name AS "displayName", is_active AS "isActive", created_at AS "createdAt"`;

function displayName(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 160) {
    throw new ManagerTechnicianError("INVALID_DISPLAY_NAME", "Display name must contain 1–160 characters, or be null.");
  }
  return value.trim();
}

async function audit(client: PoolClient, actorUserId: number, action: string, entityType: string, entityId: string) {
  await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result) VALUES ($1,$2,$3,$4,'success')`, [actorUserId, action, entityType, entityId]);
}

export function createManagerTechniciansRouter(database: Pick<Pool, "query" | "connect"> = pool) {
  const router = Router();
  router.get("/manager/technicians", requireRole("admin"), async (_request, response, next) => {
    try {
      const result = await database.query(`SELECT ${technicianColumns} FROM users WHERE role='inspector' ORDER BY username, id`);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ technicians: result.rows });
    } catch (error) { next(error); }
  });
  router.post("/manager/technicians", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const body: unknown = request.body;
      if (!body || typeof body !== "object" || Array.isArray(body)
        || Object.keys(body).some((key) => key !== "username" && key !== "password" && key !== "displayName")) {
        throw new ManagerTechnicianError("INVALID_REQUEST", "Request body is invalid.");
      }
      const { username, password } = body as Record<string, unknown>;
      const name = Object.hasOwn(body, "displayName") ? displayName((body as Record<string, unknown>).displayName) : null;
      if (typeof username !== "string" || !username.trim() || username.trim().length > 100) {
        throw new ManagerTechnicianError("INVALID_USERNAME", "Username must contain 1–100 characters.");
      }
      if (typeof password !== "string" || password.length < 12 || password.length > 1024) {
        throw new ManagerTechnicianError("INVALID_PASSWORD", "Password must contain 12–1024 characters.");
      }
      const passwordHash = await hashPassword(password);
      client = await database.connect();
      await client.query("BEGIN");
      const duplicate = await client.query("SELECT id FROM users WHERE username=$1 FOR UPDATE", [username.trim()]);
      if (duplicate.rows[0]) throw new ManagerTechnicianError("USERNAME_TAKEN", "Username is already taken.", 409);
      // The unique constraint also arbitrates simultaneous creates of an absent username.
      const result = await client.query(`INSERT INTO users (username,password_hash,role,is_active,display_name) VALUES ($1,$2,'inspector',true,$3) ON CONFLICT (username) DO NOTHING RETURNING ${technicianColumns}`, [username.trim(), passwordHash, name]);
      const technician = result.rows[0];
      if (!technician) throw new ManagerTechnicianError("USERNAME_TAKEN", "Username is already taken.", 409);
      await audit(client, request.currentUser!.id, "manager_technician_created", "user", String(technician.id));
      await client.query("COMMIT");
      response.status(201).json({ technician });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.put("/manager/technicians/:technicianId/display-name", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = request.params.technicianId;
      if (typeof id !== "string" || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) {
        throw new ManagerTechnicianError("INVALID_TECHNICIAN_ID", "Technician ID must be a positive numeric ID.");
      }
      const body: unknown = request.body;
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "displayName")) {
        throw new ManagerTechnicianError("INVALID_REQUEST", "Request body is invalid.");
      }
      const name = displayName((body as Record<string, unknown>).displayName);
      client = await database.connect();
      await client.query("BEGIN");
      const result = await client.query(`UPDATE users SET display_name=$2, updated_at=now() WHERE id=$1 AND role='inspector' RETURNING ${technicianColumns}`, [id, name]);
      const technician = result.rows[0];
      if (!technician) throw new ManagerTechnicianError("TECHNICIAN_NOT_FOUND", "Technician was not found.", 404);
      await audit(client, request.currentUser!.id, "manager_technician_display_name_updated", "user", String(technician.id));
      await client.query("COMMIT");
      response.json({ technician });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.post("/manager/technicians/:technicianId/deactivate", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = request.params.technicianId;
      if (typeof id !== "string" || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) {
        throw new ManagerTechnicianError("INVALID_TECHNICIAN_ID", "Technician ID must be a positive numeric ID.");
      }
      if (request.body !== undefined && (!request.body || typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).length)) {
        throw new ManagerTechnicianError("INVALID_REQUEST", "Request body must be empty.");
      }
      client = await database.connect();
      await client.query("BEGIN");
      const result = await client.query(`UPDATE users SET is_active=false, updated_at=now() WHERE id=$1 AND role='inspector' RETURNING ${technicianColumns}`, [id]);
      const technician = result.rows[0];
      if (!technician) throw new ManagerTechnicianError("TECHNICIAN_NOT_FOUND", "Technician was not found.", 404);
      await audit(client, request.currentUser!.id, "manager_technician_deactivated", "user", String(technician.id));
      await client.query("COMMIT");
      response.json({ technician });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  return router;
}

export const managerTechniciansRouter = createManagerTechniciansRouter();
