import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "../db/pool.js";
import { loadJobCompletion } from "../jobs/jobCompletion.js";
import { requireRole } from "../middleware/requireRole.js";
import { createFinalReportHandler, createFinalReportPdfHandler } from "./inspectionJobs.js";
import { loadFinalServiceReport, renderFinalServiceReportPdf } from "../reports/finalServiceReport.js";

type OperationalJobRow = {
  id: string;
  reference: string;
  title: string;
  status: "open" | "closed";
  serviceDate: string | null;
  site: { id: string; displayName: string } | null;
  configurationSnapshot: unknown;
};

export type ManagerServiceVisit = {
  id: string;
  reference: string;
  customer: string;
  site: string;
  serviceDate: string | null;
  status: "open" | "closed";
  systems: string[];
  inspectionProgress: { accepted: number; required: number };
  completion: NonNullable<Awaited<ReturnType<typeof loadJobCompletion>>>;
};

const operationalWhere = `
  inspection_jobs.master_template_version_id IS NOT NULL
  AND inspection_jobs.is_sample = false
`;

function operationalJobQuery(byId = false) {
  return `
    SELECT
      inspection_jobs.id,
      inspection_jobs.job_reference AS reference,
      inspection_jobs.title,
      inspection_jobs.status,
      inspection_jobs.service_date::text AS "serviceDate",
      inspection_jobs.configuration_snapshot AS "configurationSnapshot",
      CASE WHEN site.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', site.id, 'displayName', site.display_name
      ) END AS site
    FROM inspection_jobs
    LEFT JOIN customer_sites site ON site.id = inspection_jobs.site_id
    WHERE ${operationalWhere}${byId ? " AND inspection_jobs.id = $1" : ""}
    ORDER BY inspection_jobs.service_date DESC NULLS LAST, inspection_jobs.job_reference DESC, inspection_jobs.id DESC
  `;
}

function readOperationalPresentation(snapshot: unknown) {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    throw new Error("Operational job has an invalid configuration snapshot");
  }
  const candidate = snapshot as { customer?: { displayName?: unknown }; enabledSystems?: unknown };
  if (typeof candidate.customer?.displayName !== "string" || !Array.isArray(candidate.enabledSystems)) {
    throw new Error("Operational job has an invalid configuration snapshot");
  }
  const systems = candidate.enabledSystems.map((system) => {
    if (typeof system !== "object" || system === null || Array.isArray(system)
      || typeof (system as { displayName?: unknown }).displayName !== "string") {
      throw new Error("Operational job has an invalid configured system");
    }
    return (system as { displayName: string }).displayName;
  });
  return { customer: candidate.customer.displayName, systems };
}

async function presentOperationalJob(
  job: OperationalJobRow,
  database: Pick<typeof pool, "query">
): Promise<ManagerServiceVisit> {
  const presentation = readOperationalPresentation(job.configurationSnapshot);
  const completion = await loadJobCompletion(job.id, database);
  if (!completion || completion.jobStatus !== job.status) {
    throw new Error("Operational job completion is unavailable");
  }
  return {
    id: job.id,
    reference: job.reference,
    customer: presentation.customer,
    site: job.site?.displayName ?? job.title,
    serviceDate: job.serviceDate,
    status: job.status,
    systems: presentation.systems,
    inspectionProgress: {
      accepted: completion.acceptedUnitCount,
      required: completion.requiredUnitCount
    },
    completion
  };
}

/** Admin-only business view. Samples/regression fixtures are excluded in SQL. */
export async function listManagerServiceVisits(
  database: Pick<typeof pool, "query"> = pool
) {
  const result = await database.query<OperationalJobRow>(operationalJobQuery());
  return Promise.all(result.rows.map((job) => presentOperationalJob(job, database)));
}

/** Returns undefined for any non-operational or unknown job, preventing ID probing. */
export async function loadManagerServiceVisit(
  jobId: string,
  database: Pick<typeof pool, "query"> = pool
) {
  const result = await database.query<OperationalJobRow>(operationalJobQuery(true), [jobId]);
  const job = result.rows[0];
  return job ? presentOperationalJob(job, database) : undefined;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ManagerRouteDependencies = {
  database?: Pick<typeof pool, "query">;
  loadReport?: typeof loadFinalServiceReport;
  renderPdf?: typeof renderFinalServiceReportPdf;
};

function managerReportHandler(
  database: Pick<typeof pool, "query">,
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      if (!await loadManagerServiceVisit(jobId, database)) {
        response.status(404).json({ error: "SERVICE_VISIT_NOT_FOUND" });
        return;
      }
      await handler(request, response, next);
    } catch (error) {
      next(error);
    }
  };
}

export function createManagerServiceVisitsRouter({
  database = pool,
  loadReport = loadFinalServiceReport,
  renderPdf = renderFinalServiceReportPdf
}: ManagerRouteDependencies = {}) {
  const router = Router();

  router.get("/manager/service-visits", requireRole("admin"), async (_request, response, next) => {
  try {
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ serviceVisits: await listManagerServiceVisits(database) });
  } catch (error) {
    next(error);
  }
  });

// These are deliberately thin authorization wrappers around the accepted
// Phase 7 report handlers; report authority and PDF rendering are not copied.
  router.get(
  "/manager/service-visits/:jobId/final-report",
  requireRole("admin"),
  managerReportHandler(database, createFinalReportHandler({ database, loadReport }))
  );

  router.get(
  "/manager/service-visits/:jobId/final-report.pdf",
  requireRole("admin"),
  managerReportHandler(database, createFinalReportPdfHandler({ database, loadReport, renderPdf }))
  );

  router.get("/manager/service-visits/:jobId", requireRole("admin"), async (request, response, next) => {
  try {
    const jobId = request.params.jobId;
    if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
      response.status(400).json({ error: "INVALID_JOB_ID" });
      return;
    }
    const serviceVisit = await loadManagerServiceVisit(jobId, database);
    if (!serviceVisit) {
      // Use the same result for a sample fixture and an unknown ID.
      response.status(404).json({ error: "SERVICE_VISIT_NOT_FOUND" });
      return;
    }
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ serviceVisit });
  } catch (error) {
    next(error);
  }
  });

  return router;
}

export const managerServiceVisitsRouter = createManagerServiceVisitsRouter();
