import { requireTechnicianOwnership } from "../jobs/technicianOwnership.js";
import { visitHasCorrections } from "./managerCorrections.js";
import { deriveReportApproval, loadLatestCorrectionAt, loadReportApprovalEvents, visitReportApproval } from "../reports/reportApproval.js";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { auditLog } from "../audit/auditLog.js";
import { pool } from "../db/pool.js";
import {
  closeInspectionJob,
  loadJobCompletion
} from "../jobs/jobCompletion.js";
import { createServiceVisit, ServiceVisitError, type CreateServiceVisitInput } from "../jobs/serviceVisits.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  FinalReportError,
  finalReportFilename,
  loadFinalServiceReport,
  renderFinalServiceReportPdf
} from "../reports/finalServiceReport.js";

type InspectionJobRow = {
  id: string;
  reference: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
  configurationSnapshot: unknown;
  serviceDate: string | null;
  serviceTime: string | null;
  site: { id: string; displayName: string } | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const inspectionJobsRouter = Router();

export async function listTechnicianInspectionJobs(
  database: Pick<typeof pool, "query"> = pool,
  ownerUserId?: number
) {
  const result = await database.query<InspectionJobRow>(`
    SELECT
      inspection_jobs.id,
      inspection_jobs.job_reference AS reference,
      inspection_jobs.title,
      inspection_jobs.status,
      inspection_jobs.created_at AS "createdAt",
      inspection_jobs.configuration_snapshot AS "configurationSnapshot",
      inspection_jobs.service_date::text AS "serviceDate",
      to_char(inspection_jobs.service_time, 'HH24:MI') AS "serviceTime",
      CASE WHEN site.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', site.id, 'displayName', site.display_name
      ) END AS site
    FROM inspection_jobs
    LEFT JOIN customer_sites site ON site.id = inspection_jobs.site_id
    WHERE inspection_jobs.master_template_version_id IS NOT NULL
      AND inspection_jobs.technician_visible = true
      AND inspection_jobs.archived_at IS NULL
      AND ($1::bigint IS NULL OR inspection_jobs.created_by_user_id = $1)
    ORDER BY inspection_jobs.created_at DESC, inspection_jobs.id
  `, [ownerUserId ?? null]);

  return Promise.all(result.rows.map(async (job) => {
    const completion = await loadJobCompletion(job.id, database);
    if (!completion) throw new Error("Listed inspection job disappeared");
    return { ...job, completion };
  }));
}

export async function loadCanonicalInspectionJob(
  jobId: string,
  database: Pick<typeof pool, "query"> = pool
) {
  const result = await database.query<InspectionJobRow>(`
    SELECT inspection_jobs.id, inspection_jobs.job_reference AS reference,
      inspection_jobs.title, inspection_jobs.status,
      inspection_jobs.created_at AS "createdAt",
      inspection_jobs.configuration_snapshot AS "configurationSnapshot",
      inspection_jobs.service_date::text AS "serviceDate",
      to_char(inspection_jobs.service_time, 'HH24:MI') AS "serviceTime",
      CASE WHEN site.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', site.id, 'displayName', site.display_name
      ) END AS site
    FROM inspection_jobs
    LEFT JOIN customer_sites site ON site.id = inspection_jobs.site_id
    WHERE inspection_jobs.id = $1 AND master_template_version_id IS NOT NULL
    LIMIT 1`, [jobId]);
  const job = result.rows[0];
  if (!job) return undefined;
  const completion = await loadJobCompletion(job.id, database);
  if (!completion) throw new Error("Inspection job completion disappeared");
  return { ...job, completion };
}

inspectionJobsRouter.get(
  "/inspection-jobs",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      response.json({ jobs: await listTechnicianInspectionJobs(pool, request.currentUser!.role === "inspector" ? request.currentUser!.id : undefined) });
    } catch (error) {
      next(error);
    }
  }
);

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// Optional cover-page fields: undefined/null/"" all mean "not provided" (the paper form marks
// no header field mandatory - docs/paper-forms/README.md:102-103). Returns `undefined` as a
// sentinel for "the field was present but malformed", distinct from `null` ("validly absent"),
// so the caller can still fail closed on a genuinely bad value.
function optionalTrimmedText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > maxLength) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function optionalTime(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return timePattern.test(trimmed) ? trimmed : undefined;
}

export function parseCreateServiceVisit(value: unknown): CreateServiceVisitInput | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  const required = ["requestId", "customerId", "siteId", "systemKeys"];
  const optional = ["serviceCallNumber", "arrivalTime", "departureTime"];
  if (!required.every((key) => key in body) || Object.keys(body).some((key) => !required.includes(key) && !optional.includes(key))
    || typeof body.requestId !== "string" || !uuidPattern.test(body.requestId)
    || typeof body.customerId !== "string" || !uuidPattern.test(body.customerId)
    || typeof body.siteId !== "string" || !uuidPattern.test(body.siteId)
    || !Array.isArray(body.systemKeys) || body.systemKeys.length === 0
    || body.systemKeys.some((key) => typeof key !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(key))
    || new Set(body.systemKeys).size !== body.systemKeys.length) return undefined;

  const serviceCallNumber = optionalTrimmedText(body.serviceCallNumber, 80);
  const arrivalTime = optionalTime(body.arrivalTime);
  const departureTime = optionalTime(body.departureTime);
  if (serviceCallNumber === undefined || arrivalTime === undefined || departureTime === undefined) return undefined;

  return {
    requestId: body.requestId, customerId: body.customerId, siteId: body.siteId, systemKeys: body.systemKeys,
    serviceCallNumber, arrivalTime, departureTime
  } as CreateServiceVisitInput;
}

type ServiceVisitRouteDependencies = {
  database?: Pick<typeof pool, "connect" | "query">;
  writeAudit?: typeof auditLog;
};

type FinalReportRouteDependencies = {
  database?: Pick<typeof pool, "query">;
  loadReport?: typeof loadFinalServiceReport;
  renderPdf?: typeof renderFinalServiceReportPdf;
};

function reportAccessFor(request: Request) {
  // Every caller is already protected by requireRole. The product-facing Manager is
  // the admin, or (T4) a supervisor on the Manager report routes, which see the same
  // visits as the admin; the technician report routes never admit a supervisor.
  const role = request.currentUser?.role;
  return role === "admin" || role === "supervisor" ? "manager" as const : "technician" as const;
}

function finalReportFailure(error: unknown, response: Response) {
  if (!(error instanceof FinalReportError)) return false;
  response.status(error.status).json({ error: error.code, message: error.message });
  return true;
}

export function createFinalReportHandler({ database = pool, loadReport = loadFinalServiceReport }: FinalReportRouteDependencies = {}) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      const report = await loadReport(jobId, database, reportAccessFor(request));
      type CaptureSourceRow = { systemKey: string; instanceKey: string; field: string; captureSource: string | null };
      const sourceRows = report.sections.some((section) => section.evidence.length > 0)
        ? (await database.query<CaptureSourceRow>(`SELECT inspection.system_key AS "systemKey", instance.instance_key AS "instanceKey",
            evidence_row.field_path AS "field", evidence_row.capture_source AS "captureSource"
          FROM (
            SELECT form_instance_id, field_path, capture_source FROM inspection_attachments
            UNION ALL
            SELECT form_instance_id, field_path, capture_source FROM staged_inspection_evidence WHERE status='accepted'
          ) evidence_row
          JOIN master_system_form_instances instance ON instance.id=evidence_row.form_instance_id
          JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id
          WHERE inspection.job_id=$1 AND instance.status='submitted'`, [jobId])).rows
        : [];
      const sources = new Map<string, CaptureSourceRow["captureSource"]>();
      for (const row of sourceRows) {
        if (row.captureSource !== null && row.captureSource !== "camera" && row.captureSource !== "gallery" && row.captureSource !== "unknown") {
          throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted photo source is invalid.");
        }
        const key = JSON.stringify([row.systemKey, row.instanceKey, row.field]);
        if (sources.has(key)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted photo source is ambiguous.");
        sources.set(key, row.captureSource);
      }
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ report: {
        ...report,
        sections: report.sections.map(({ evidence, ...section }) => ({
          ...section,
          evidence: evidence.map((item) => ({ field: item.field, available: true,
            captureSource: sources.get(JSON.stringify([section.systemKey, section.location?.instanceKey ?? "primary", item.field])) ?? null }))
        }))
      } });
    } catch (error) {
      if (!finalReportFailure(error, response)) next(error);
    }
  };
}

export function createFinalReportPdfHandler({ database = pool, loadReport = loadFinalServiceReport, renderPdf = renderFinalServiceReportPdf }: FinalReportRouteDependencies = {}) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      const report = await loadReport(jobId, database, reportAccessFor(request));
      // T5 (owner decision): a visit corrected after submission gets no PDF until the PDF work renders the
      // corrections; a PDF silently showing the uncorrected values would be worse than none. Checked after
      // the report's own access check, so unknown and forbidden visits still look the same.
      if (await visitHasCorrections(database, jobId)) {
        response.status(409).json({ error: "FINAL_REPORT_HAS_CORRECTIONS", message: "This visit was corrected after submission. The PDF will be available once the report includes the corrections; the web report lists them." });
        return;
      }
      // T6 (owner decision): a report may not be downloaded until an admin or supervisor approves
      // it. Checked after the report's own access check and the corrections gate, so unknown and
      // forbidden visits still look the same, and composes with (does not replace) that gate.
      // `loadReport` above already required the job to be closed (or it would have thrown), so the
      // approval state is derived directly here rather than re-querying `inspection_jobs.status`.
      const [approvalEvents, latestCorrectionAt] = await Promise.all([
        loadReportApprovalEvents(database, jobId),
        loadLatestCorrectionAt(database, jobId)
      ]);
      const approval = deriveReportApproval("closed", approvalEvents, latestCorrectionAt);
      if (approval.status !== "approved") {
        response.status(409).json({ error: "REPORT_NOT_APPROVED", message: "This report has not been approved yet. It is available for download once an Admin approves it." });
        return;
      }
      const filename = finalReportFilename(report);
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.send(await renderPdf(report));
    } catch (error) {
      if (!finalReportFailure(error, response)) next(error);
    }
  };
}

export function createServiceVisitHandler({
  database = pool,
  writeAudit = auditLog
}: ServiceVisitRouteDependencies = {}) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const input = parseCreateServiceVisit(request.body);
    if (!input) {
      response.status(400).json({ error: "INVALID_SERVICE_VISIT_REQUEST", message: "A request ID, customer, site, and one or more supported systems are required. Service visit creation time is recorded by the server." });
      return;
    }
    const client = await database.connect();
    try {
      const actor = request.currentUser!;
      const created = await createServiceVisit(client, input, actor.id);
      await writeAudit({ actorUserId: actor.id,
        action: created.idempotent ? "service_visit_create_replay" : "service_visit_create",
        entityType: "inspectionJob", entityId: created.id, result: "success" });
      const job = await loadCanonicalInspectionJob(created.id, database);
      if (!job) throw new Error("Created service visit disappeared");
      response.status(created.idempotent ? 200 : 201).json({ job });
    } catch (error) {
      if (error instanceof ServiceVisitError) {
        await writeAudit({ actorUserId: request.currentUser!.id, action: "service_visit_create",
          entityType: "inspectionJob", result: "failure", reason: error.code });
        response.status(error.status).json({ error: error.code, message: error.message });
        return;
      }
      next(error);
    } finally {
      client.release();
    }
  };
}

inspectionJobsRouter.post(
  "/inspection-jobs/service-visits",
  requireRole("admin", "inspector"),
  createServiceVisitHandler()
);

inspectionJobsRouter.get(
  "/inspection-jobs/:jobId/final-report",
  requireRole("admin", "inspector"),
  requireTechnicianOwnership("job", (request) => request.params.jobId),
  createFinalReportHandler()
);

inspectionJobsRouter.get(
  "/inspection-jobs/:jobId/final-report.pdf",
  requireRole("admin", "inspector"),
  requireTechnicianOwnership("job", (request) => request.params.jobId),
  createFinalReportPdfHandler()
);

inspectionJobsRouter.get(
  "/inspection-jobs/:jobId/completion",
  requireRole("admin", "inspector"),
  requireTechnicianOwnership("job", (request) => request.params.jobId),
  async (request, response, next) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      const completion = await loadJobCompletion(jobId);
      if (!completion) {
        response.status(404).json({ error: "JOB_NOT_FOUND" });
        return;
      }
      // §8 Q3: technicians see the approval state read-only on their own completed visit.
      const reportApproval = await visitReportApproval(pool, jobId);
      response.json({ completion, ...(reportApproval ? { reportApproval } : {}) });
    } catch (error) {
      next(error);
    }
  }
);

inspectionJobsRouter.post(
  "/inspection-jobs/:jobId/close",
  requireRole("admin", "inspector"),
  requireTechnicianOwnership("job", (request) => request.params.jobId, "inspection_job_close"),
  async (request, response, next) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      if (request.body !== undefined && (
        typeof request.body !== "object"
        || request.body === null
        || Array.isArray(request.body)
        || Object.keys(request.body).length > 0
      )) {
        response.status(400).json({
          error: "INVALID_CLOSE_COMMAND",
          message: "Job completion is evaluated by the server and accepts no client progress"
        });
        return;
      }
      const actor = request.currentUser!;
      const result = await closeInspectionJob(jobId, {
        id: actor.id,
        username: actor.username
      });
      if (result.kind === "not-found") {
        response.status(404).json({ error: "JOB_NOT_FOUND" });
        return;
      }
      if (result.kind === "incomplete") {
        await auditLog({
          actorUserId: actor.id,
          action: "inspection_job_close",
          entityType: "inspectionJob",
          entityId: jobId,
          result: "failure",
          reason: "JOB_INCOMPLETE"
        });
        response.status(409).json({
          error: "JOB_INCOMPLETE",
          message: "Required inspection work is not yet accepted by the server",
          completion: result.completion
        });
        return;
      }
      response.json({
        outcome: result.alreadyCompleted ? "already-completed" : "completed",
        completion: result.completion
      });
    } catch (error) {
      next(error);
    }
  }
);

inspectionJobsRouter.delete("/inspection-jobs/:jobId", requireRole("inspector"), async (request, response, next) => {
  const jobId = request.params.jobId;
  if (typeof jobId !== "string" || !uuidPattern.test(jobId)) { response.status(400).json({ error: "INVALID_JOB_ID" }); return; }
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const job = (await client.query<{ status: string }>(
      `SELECT status FROM inspection_jobs WHERE id=$1 AND created_by_user_id=$2
        AND technician_visible=true AND master_template_version_id IS NOT NULL AND COALESCE(is_sample,false)=false FOR UPDATE`,
      [jobId, request.currentUser!.id]
    )).rows[0];
    if (!job) {
      const prior = (await client.query<{ exists: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM audit_events WHERE actor_user_id=$2 AND action='technician_service_visit_deleted'
          AND entity_type='inspection_job' AND entity_id=$1 AND result='success'
      ) AS exists`, [jobId, request.currentUser!.id])).rows[0]?.exists;
      await client.query("ROLLBACK");
      if (prior) { response.json({ jobId, result: "already_deleted" }); return; }
      response.status(404).json({ error: "JOB_NOT_FOUND" }); return;
    }
    if (job.status !== "open") { await client.query("ROLLBACK"); response.status(409).json({ error: "SERVICE_VISIT_NOT_OPEN" }); return; }
    const accepted = (await client.query<{ exists: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM master_system_form_instances instance
        JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$1
      UNION ALL SELECT 1 FROM inspections WHERE job_id=$1
      UNION ALL SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1 AND status='accepted'
    ) AS exists`, [jobId])).rows[0]?.exists;
    if (accepted !== false) { await client.query("ROLLBACK"); response.status(409).json({ error: "SERVICE_VISIT_HAS_ACCEPTED_RECORDS" }); return; }
    const pendingEvidence = (await client.query<{ exists: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM inspection_evidence_reservations WHERE job_id=$1
      UNION ALL SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1
    ) AS exists`, [jobId])).rows[0]?.exists;
    if (pendingEvidence !== false) { await client.query("ROLLBACK"); response.status(409).json({ error: "SERVICE_VISIT_HAS_PENDING_EVIDENCE" }); return; }
    await client.query("DELETE FROM master_system_inspections WHERE job_id=$1", [jobId]);
    await client.query("DELETE FROM inspection_jobs WHERE id=$1", [jobId]);
    await client.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result)
      VALUES($1,'technician_service_visit_deleted','inspection_job',$2,'success')`, [request.currentUser!.id, jobId]);
    await client.query("COMMIT");
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ jobId, result: "deleted" });
  } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
  finally { client?.release(); }
});

// A technician soft-deletes their OWN in-progress (not yet submitted) job. Reuses
// inspection_jobs.archived_at (migration 036) -- never a hard delete, unlike the DELETE route
// above, which only ever applies to a job nothing has been entered into yet. This soft-delete
// applies to a job with in-progress work, and is fully recoverable through the existing
// admin-only PUT /manager/service-visits/:jobId/restore route (managerServiceVisits.ts), which
// already works "regardless of job status". An admin calling this route is scoped by the same
// status='open' WHERE clause, so it is not a substitute for a manager's own tooling -- it exists
// purely to let a technician undo their own mistake before anything is submitted.
inspectionJobsRouter.put("/inspection-jobs/:jobId/archive", requireRole("admin", "inspector"),
  requireTechnicianOwnership("job", (request) => request.params.jobId, "technician_service_job_archived"),
  async (request, response, next) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      const actor = request.currentUser!;
      const result = await pool.query<{ id: string }>(
        `UPDATE inspection_jobs SET archived_at = now()
         WHERE id = $1 AND status = 'open' AND archived_at IS NULL
         RETURNING id`,
        [jobId]
      );
      if (!result.rows[0]) {
        await auditLog({
          actorUserId: actor.id, action: "technician_service_job_archived",
          entityType: "inspectionJob", entityId: jobId, result: "failure", reason: "JOB_NOT_OPEN"
        });
        response.status(409).json({
          error: "JOB_NOT_OPEN",
          message: "Only an in-progress job that has not yet been submitted can be deleted this way"
        });
        return;
      }
      await auditLog({
        actorUserId: actor.id, action: "technician_service_job_archived",
        entityType: "inspectionJob", entityId: jobId, result: "success"
      });
      response.json({ outcome: "archived" });
    } catch (error) { next(error); }
  }
);

inspectionJobsRouter.get("/inspection-jobs/:jobId", requireRole("admin", "inspector"),
  requireTechnicianOwnership("job", (request) => request.params.jobId),
  async (request, response, next) => {
    try {
      const job = await loadCanonicalInspectionJob(String(request.params.jobId));
      if (!job) { response.status(404).json({ error: "JOB_NOT_FOUND" }); return; }
      response.json({ job });
    } catch (error) { next(error); }
  });
