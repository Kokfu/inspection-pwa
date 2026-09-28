import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import type { UserRole } from "../auth/authTypes.js";
import { requireRoleAudited } from "../middleware/requireRole.js";

export class ManagerTechnicianError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

const technicianColumns = `id::int AS id, username, display_name AS "displayName", role, is_active AS "isActive", created_at AS "createdAt"`;
const assignedSupervisorColumns = `ARRAY(
  SELECT assignment.supervisor_id::int
  FROM technician_supervisor_assignments assignment
  WHERE assignment.technician_id = users.id AND assignment.archived_at IS NULL
  ORDER BY assignment.supervisor_id
) AS "supervisorIds"`;
/** Field accounts this screen manages: technicians and (T4) supervisors. Admins are never listed or changed here. */
const managedRoles = ["inspector", "supervisor"] as const;
type ManagedRole = typeof managedRoles[number];

function displayName(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 160) {
    throw new ManagerTechnicianError("INVALID_DISPLAY_NAME", "Display name must contain 1–160 characters, or be null.");
  }
  return value.trim();
}

function numericUserId(value: unknown, code: string): number {
  if (typeof value !== "string" && (typeof value !== "number" || !Number.isInteger(value))) {
    throw new ManagerTechnicianError(code, "User ID must be a positive numeric ID.");
  }
  const raw = String(value);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 2147483647) {
    throw new ManagerTechnicianError(code, "User ID must be a positive numeric ID.");
  }
  return Number(raw);
}

async function audit(client: PoolClient, actorUserId: number, action: string, entityType: string, entityId: string, reason: string) {
  await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result, reason) VALUES ($1,$2,$3,$4,'success',$5)`, [actorUserId, action, entityType, entityId, reason]);
}

export function createManagerTechniciansRouter(database: Pick<Pool, "query" | "connect"> = pool) {
  const router = Router();
  // Every Manager route decision goes through the audited guard (supervisor refusals are logged).
  const requireRole = (...roles: UserRole[]) => requireRoleAudited(database, ...roles);
  router.get("/manager/technicians", requireRole("admin", "supervisor"), async (request, response, next) => {
    try {
      const supervisor = request.currentUser!.role === "supervisor";
      const result = await database.query(
        `SELECT ${technicianColumns}, ${assignedSupervisorColumns} FROM users
         WHERE ${supervisor
    ? "role='inspector' AND EXISTS (SELECT 1 FROM technician_supervisor_assignments assignment WHERE assignment.technician_id=users.id AND assignment.supervisor_id=$1 AND assignment.archived_at IS NULL)"
    : "role IN ('inspector','supervisor')"}
         ORDER BY username, id`,
        supervisor ? [request.currentUser!.id] : []
      );
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ technicians: result.rows });
    } catch (error) { next(error); }
  });

  router.post("/manager/technicians/:technicianId/assignments", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const technicianId = numericUserId(request.params.technicianId, "INVALID_TECHNICIAN_ID");
      const body: unknown = request.body;
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "supervisorId")) {
        throw new ManagerTechnicianError("INVALID_REQUEST", "Request body is invalid.");
      }
      if (typeof (body as Record<string, unknown>).supervisorId !== "number") {
        throw new ManagerTechnicianError("INVALID_SUPERVISOR_ID", "Supervisor ID must be a positive numeric ID.");
      }
      const supervisorId = numericUserId((body as Record<string, unknown>).supervisorId, "INVALID_SUPERVISOR_ID");
      client = await database.connect();
      await client.query("BEGIN");
      const users = await client.query<{ id: string; role: UserRole }>("SELECT id, role FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE", [[technicianId, supervisorId]]);
      const roles = new Map(users.rows.map((row) => [Number(row.id), row.role]));
      if (!roles.has(technicianId)) throw new ManagerTechnicianError("TECHNICIAN_NOT_FOUND", "Technician was not found.", 404);
      if (!roles.has(supervisorId)) throw new ManagerTechnicianError("SUPERVISOR_NOT_FOUND", "Supervisor was not found.", 404);
      if (roles.get(technicianId) !== "inspector" || roles.get(supervisorId) !== "supervisor") {
        throw new ManagerTechnicianError("INVALID_ROLE", "Assignment requires a technician and a supervisor.");
      }
      const assigned = await client.query(
        `INSERT INTO technician_supervisor_assignments AS assignment (technician_id, supervisor_id, created_by_user_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (technician_id, supervisor_id) DO UPDATE SET archived_at=NULL
         WHERE assignment.archived_at IS NOT NULL RETURNING id`,
        [technicianId, supervisorId, request.currentUser!.id]
      );
      if (assigned.rows[0]) await audit(client, request.currentUser!.id, "technician_assignment_created", "user", String(technicianId), `supervisorId=${supervisorId}`);
      await client.query("COMMIT");
      response.setHeader("Cache-Control", "private, no-store");
      response.status(assigned.rows[0] ? 201 : 200).json({ technicianId, supervisorId, assigned: true });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });

  router.delete("/manager/technicians/:technicianId/assignments/:supervisorId", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const technicianId = numericUserId(request.params.technicianId, "INVALID_TECHNICIAN_ID");
      const supervisorId = numericUserId(request.params.supervisorId, "INVALID_SUPERVISOR_ID");
      if (request.body !== undefined && (!request.body || typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).length)) {
        throw new ManagerTechnicianError("INVALID_REQUEST", "Request body must be empty.");
      }
      client = await database.connect();
      await client.query("BEGIN");
      const removed = await client.query(
        "UPDATE technician_supervisor_assignments SET archived_at=now() WHERE technician_id=$1 AND supervisor_id=$2 AND archived_at IS NULL RETURNING id",
        [technicianId, supervisorId]
      );
      if (removed.rows[0]) await audit(client, request.currentUser!.id, "technician_assignment_removed", "user", String(technicianId), `supervisorId=${supervisorId}`);
      await client.query("COMMIT");
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ technicianId, supervisorId, assigned: false });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.post("/manager/technicians", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const body: unknown = request.body;
      if (!body || typeof body !== "object" || Array.isArray(body)
        || Object.keys(body).some((key) => key !== "username" && key !== "password" && key !== "displayName" && key !== "role")) {
        throw new ManagerTechnicianError("INVALID_REQUEST", "Request body is invalid.");
      }
      const { username, password, role: requestedRole } = body as Record<string, unknown>;
      const name = Object.hasOwn(body, "displayName") ? displayName((body as Record<string, unknown>).displayName) : null;
      // Optional; absent keeps today's behaviour (a technician). Never "admin".
      if (requestedRole !== undefined && !managedRoles.includes(requestedRole as ManagedRole)) {
        throw new ManagerTechnicianError("INVALID_ROLE", "Role must be inspector or supervisor.");
      }
      const role: ManagedRole = requestedRole === undefined ? "inspector" : requestedRole as ManagedRole;
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
      const result = await client.query(`INSERT INTO users (username,password_hash,role,is_active,display_name) VALUES ($1,$2,$3,true,$4) ON CONFLICT (username) DO NOTHING RETURNING ${technicianColumns}`, [username.trim(), passwordHash, role, name]);
      const technician = result.rows[0];
      if (!technician) throw new ManagerTechnicianError("USERNAME_TAKEN", "Username is already taken.", 409);
      await audit(client, request.currentUser!.id, "manager_technician_created", "user", String(technician.id), `role=${role}`);
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
      const result = await client.query(`UPDATE users SET display_name=$2, updated_at=now() WHERE id=$1 AND role IN ('inspector','supervisor') RETURNING ${technicianColumns}`, [id, name]);
      const technician = result.rows[0];
      if (!technician) throw new ManagerTechnicianError("TECHNICIAN_NOT_FOUND", "Technician was not found.", 404);
      await audit(client, request.currentUser!.id, "manager_technician_display_name_updated", "user", String(technician.id), `displayName=${name ?? "(cleared)"}`);
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
      const result = await client.query(`UPDATE users SET is_active=false, updated_at=now() WHERE id=$1 AND role IN ('inspector','supervisor') RETURNING ${technicianColumns}`, [id]);
      const technician = result.rows[0];
      if (!technician) throw new ManagerTechnicianError("TECHNICIAN_NOT_FOUND", "Technician was not found.", 404);
      await audit(client, request.currentUser!.id, "manager_technician_deactivated", "user", String(technician.id), `role=${technician.role}`);
      await client.query("COMMIT");
      response.json({ technician });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  return router;
}

export const managerTechniciansRouter = createManagerTechniciansRouter();
