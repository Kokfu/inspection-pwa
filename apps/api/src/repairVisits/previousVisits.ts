import type { Pool, PoolClient } from "pg";
import type { CurrentUser } from "../auth/authTypes.js";
import { visitReportApproval } from "../reports/reportApproval.js";
import { RepairError } from "./fieldCatalogReaders.js";
import { rvUuid, type RepairVisitPrevious } from "./repairVisitContract.js";

export type CatalogDatabase = Pick<Pool | PoolClient, "query">;
export const catalogUuid = (value: unknown): string => {
  if (!rvUuid(value)) throw new RepairError("INVALID_REPAIR_VISIT_REQUEST", "A UUID is required.", 400);
  return value;
};
export const catalogNotFound = (): never => { throw new RepairError("REPAIR_VISIT_NOT_FOUND", "Visit is unavailable.", 404); };
export async function catalogActor(db: CatalogDatabase, actor: CurrentUser) {
  if (!["inspector", "admin", "supervisor"].includes(actor.role)) throw new RepairError("FORBIDDEN", "Permission denied.", 403);
  if (!(await db.query("SELECT id FROM users WHERE id=$1 AND role=$2 AND is_active=true", [actor.id, actor.role])).rows.length)
    throw new RepairError("AUTH_REQUIRED", "Sign in required.", 401);
}
export type PreviousVisit = RepairVisitPrevious & { visitNumber: string; visitDate: string; createdAt: string; createdByUserId: number };

/** Reviewers may inspect other creators; technicians can never widen their own scope. */
export async function listPreviousVisits(db: CatalogDatabase, actor: CurrentUser, customerId: string, siteId: string): Promise<PreviousVisit[]> {
  catalogUuid(customerId); catalogUuid(siteId); await catalogActor(db, actor);
  const result = await db.query(`
    SELECT 'service' AS kind,j.id AS "visitId",j.job_reference AS "visitNumber",j.service_date::text AS "visitDate",
      j.created_at AS "createdAt",j.created_by_user_id AS "createdByUserId"
    FROM inspection_jobs j JOIN master_service_report_templates t ON t.id=j.master_template_version_id
    WHERE j.customer_id=$1 AND j.site_id=$2 AND j.is_sample=false AND j.status='closed' AND t.version=7
      AND j.configuration_snapshot->'template'->>'version'='7'
      AND j.configuration_snapshot->'template'->>'id'=j.master_template_version_id::text
      AND ($3::bigint IS NULL OR j.created_by_user_id=$3)
    UNION ALL
    SELECT 'repair',r.client_uuid,r.visit_number,r.visit_date::text,r.created_at,r.created_by_user_id
    FROM repair_visits r WHERE r.customer_id=$1 AND r.site_id=$2 AND r.status='approved'
      AND ($3::bigint IS NULL OR r.created_by_user_id=$3)
    ORDER BY "visitDate" DESC,"createdAt" DESC,"visitId" DESC`, [customerId, siteId, actor.role === "inspector" ? actor.id : null]);
  const visits: PreviousVisit[] = [];
  for (const row of result.rows) {
    if (row.kind === "service" && (await visitReportApproval(db, row.visitId))?.status !== "approved") continue;
    visits.push({ ...row, createdAt: new Date(row.createdAt).toISOString(), createdByUserId: Number(row.createdByUserId) });
  }
  return visits;
}

export async function requirePreviousVisit(db: CatalogDatabase, actor: CurrentUser, customerId: string, siteId: string, previous: RepairVisitPrevious) {
  catalogUuid(previous.visitId);
  if (!["service", "repair"].includes(previous.kind)) throw new RepairError("INVALID_REPAIR_VISIT_REQUEST", "Invalid visit kind.", 400);
  return (await listPreviousVisits(db, actor, customerId, siteId)).find(v => v.kind === previous.kind && v.visitId === previous.visitId) ?? catalogNotFound();
}
