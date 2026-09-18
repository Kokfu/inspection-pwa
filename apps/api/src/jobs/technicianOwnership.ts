import type { Request, RequestHandler } from "express";
import { pool } from "../db/pool.js";
import { auditLog } from "../audit/auditLog.js";

export const jobNotFound = { error: "JOB_NOT_FOUND" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type OwnershipIdentity = "job" | "form" | "attachment" | "evidence";

/** Creator is immutable. Check before replay/acceptance as well as before reads. */
export async function technicianOwns(
  request: Pick<Request, "currentUser">, kind: OwnershipIdentity, id: unknown,
  database: Pick<typeof pool, "query"> = pool
) {
  if (request.currentUser?.role === "admin") return true;
  if (!request.currentUser || typeof id !== "string" || !uuid.test(id)) return false;
  const source = {
    job: "SELECT job.id FROM inspection_jobs job WHERE job.id = $1",
    form: `SELECT job.id FROM master_system_form_instances form
      JOIN master_system_inspections parent ON parent.id = form.inspection_group_id
      JOIN inspection_jobs job ON job.id = parent.job_id WHERE form.client_uuid = $1`,
    attachment: `SELECT job.id FROM inspection_attachments photo
      JOIN master_system_form_instances form ON form.id = photo.form_instance_id
      JOIN master_system_inspections parent ON parent.id = form.inspection_group_id
      JOIN inspection_jobs job ON job.id = parent.job_id WHERE photo.client_uuid = $1`,
    evidence: `SELECT job.id FROM staged_inspection_evidence photo
      JOIN inspection_jobs job ON job.id = photo.job_id WHERE photo.photo_uuid = $1`
  }[kind];
  const result = await database.query(`${source}
    AND job.created_by_user_id = $2`, [id, request.currentUser.id]);
  return result.rows.length > 0;
}

/** A caller cannot disguise an existing foreign form UUID with an owned jobId. */
export async function ownsExistingSyncIdentity(request: Pick<Request, "currentUser">, id: unknown) {
  if (request.currentUser?.role === "admin" || typeof id !== "string" || !uuid.test(id)) return true;
  if (!request.currentUser) return false;
  const result = await pool.query(`SELECT job.id FROM inspection_jobs job
    JOIN (
      SELECT parent.job_id FROM master_system_form_instances form
        JOIN master_system_inspections parent ON parent.id=form.inspection_group_id WHERE form.client_uuid=$1
      UNION SELECT job_id FROM inspections WHERE client_uuid=$1
    ) existing ON existing.job_id=job.id
    WHERE job.created_by_user_id IS DISTINCT FROM $2`, [id, request.currentUser.id]);
  return result.rows.length === 0;
}

/** A tab may still send another account's queued work after a cross-tab login. */
export function requireExpectedActor(action: string, entityType: string): RequestHandler {
  return async (request, response, next) => {
    try {
      const expected = request.header("x-expected-user-id");
      if (expected === undefined || expected === String(request.currentUser?.id)) return next();
      await auditLog({ actorUserId: request.currentUser?.id, action, entityType,
        result: "failure", reason: "IDENTITY_MISMATCH" });
      response.status(409).json({ error: "IDENTITY_MISMATCH" });
    } catch (error) { next(error); }
  };
}

export function requireTechnicianOwnership(
  kind: OwnershipIdentity, identity: (request: Request) => unknown, action?: string
): RequestHandler {
  return async (request, response, next) => {
    try {
      if (await technicianOwns(request, kind, identity(request))) return next();
      if (action) await auditLog({ actorUserId: request.currentUser?.id, action,
        entityType: "inspectionJob", result: "failure", reason: "JOB_NOT_FOUND" });
      response.status(404).json(jobNotFound);
    } catch (error) { next(error); }
  };
}
