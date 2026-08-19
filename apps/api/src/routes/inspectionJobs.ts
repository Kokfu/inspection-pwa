import { Router, type NextFunction, type Request, type Response } from "express";
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
  site: { id: string; displayName: string } | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const inspectionJobsRouter = Router();

export async function listTechnicianInspectionJobs(
  database: Pick<typeof pool, "query"> = pool
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
      CASE WHEN site.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', site.id, 'displayName', site.display_name
      ) END AS site
    FROM inspection_jobs
    LEFT JOIN customer_sites site ON site.id = inspection_jobs.site_id
    WHERE inspection_jobs.master_template_version_id IS NOT NULL
      AND inspection_jobs.technician_visible = true
    ORDER BY inspection_jobs.job_reference, inspection_jobs.id
  `);

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
  async (_request, response, next) => {
    try {
      response.json({ jobs: await listTechnicianInspectionJobs() });
    } catch (error) {
      next(error);
    }
  }
);

export function parseCreateServiceVisit(value: unknown): CreateServiceVisitInput | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  const expected = ["requestId", "customerId", "siteId", "serviceDate", "systemKeys"];
  if (Object.keys(body).length !== expected.length || !expected.every((key) => key in body)
    || typeof body.requestId !== "string" || !uuidPattern.test(body.requestId)
    || typeof body.customerId !== "string" || !uuidPattern.test(body.customerId)
    || typeof body.siteId !== "string" || !uuidPattern.test(body.siteId)
    || typeof body.serviceDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.serviceDate)
    || !Array.isArray(body.systemKeys) || body.systemKeys.length === 0
    || body.systemKeys.some((key) => typeof key !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(key))
    || new Set(body.systemKeys).size !== body.systemKeys.length) return undefined;
  const [year, month, day] = body.serviceDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) return undefined;
  return body as CreateServiceVisitInput;
}

type ServiceVisitRouteDependencies = {
  database?: Pick<typeof pool, "connect" | "query">;
  writeAudit?: typeof auditLog;
};

type FinalReportRouteDependencies = {
  database?: Pick<typeof pool, "query">;
};

function finalReportFailure(error: unknown, response: Response) {
  if (!(error instanceof FinalReportError)) return false;
  response.status(error.status).json({ error: error.code, message: error.message });
  return true;
}

export function createFinalReportHandler({ database = pool }: FinalReportRouteDependencies = {}) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      const report = await loadFinalServiceReport(jobId, database);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ report: {
        ...report,
        sections: report.sections.map(({ evidence, ...section }) => ({
          ...section,
          evidence: evidence.map((item) => ({ field: item.field, available: true }))
        }))
      } });
    } catch (error) {
      if (!finalReportFailure(error, response)) next(error);
    }
  };
}

export function createFinalReportPdfHandler({ database = pool }: FinalReportRouteDependencies = {}) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      const report = await loadFinalServiceReport(jobId, database);
      const filename = finalReportFilename(report);
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.send(await renderFinalServiceReportPdf(report));
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
      response.status(400).json({ error: "INVALID_SERVICE_VISIT_REQUEST", message: "A valid service date, customer, site, and one or more supported systems are required." });
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
  createFinalReportHandler()
);

inspectionJobsRouter.get(
  "/inspection-jobs/:jobId/final-report.pdf",
  requireRole("admin", "inspector"),
  createFinalReportPdfHandler()
);

inspectionJobsRouter.get(
  "/inspection-jobs/:jobId/completion",
  requireRole("admin", "inspector"),
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
      response.json({ completion });
    } catch (error) {
      next(error);
    }
  }
);

inspectionJobsRouter.post(
  "/inspection-jobs/:jobId/close",
  requireRole("admin", "inspector"),
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
