import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "../db/pool.js";
import { loadJobCompletion } from "../jobs/jobCompletion.js";
import { requireRole } from "../middleware/requireRole.js";
import { isImplementedSystemKey } from "../inspections/templates/systemContractCompatibility.js";
import { createFinalReportHandler, createFinalReportPdfHandler } from "./inspectionJobs.js";
import { loadFinalServiceReport, renderFinalServiceReportPdf } from "../reports/finalServiceReport.js";

type OperationalJobRow = {
  id: string;
  reference: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
  serviceDate: string | null;
  serviceTime: string | null;
  site: { id: string; displayName: string } | null;
  technician?: ManagerServiceVisitTechnician | null;
  configurationSnapshot: unknown;
  totalCount: number;
};

/** The service visit's creating user (`inspection_jobs.created_by_user_id`); null for legacy NULL-creator rows. */
export type ManagerServiceVisitTechnician = { id: number; displayName: string };

/**
 * The row shape `buildOperationalListQuery`'s SQL actually returns. `totalCount` is read off a
 * `summary` derived table that always has exactly one row (a plain `count(*)` has no GROUP BY, so
 * it never returns zero rows) LEFT JOINed onto the cursor+limit-scoped `paged` rows. When `paged`
 * itself is empty — a valid cursor positioned at or past the end of an otherwise non-empty
 * filtered set, which can legitimately happen (a concurrent delete, or simply the last page) —
 * the LEFT JOIN still yields exactly one row: `totalCount` populated, every other column NULL.
 * `id` is the discriminator for that placeholder row, since a real job's `id` is never null.
 */
type OperationalListRow = Omit<OperationalJobRow, "id"> & { id: string | null };

export type ManagerServiceVisit = {
  id: string;
  reference: string;
  customer: string;
  site: string;
  createdAt: string;
  serviceDate: string | null;
  serviceTime: string | null;
  status: "open" | "closed";
  technician: ManagerServiceVisitTechnician | null;
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
      inspection_jobs.created_at AS "createdAt",
      inspection_jobs.service_date::text AS "serviceDate",
      to_char(inspection_jobs.service_time, 'HH24:MI') AS "serviceTime",
      inspection_jobs.configuration_snapshot AS "configurationSnapshot",
      CASE WHEN site.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', site.id, 'displayName', site.display_name
      ) END AS site,
      CASE WHEN creator.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', creator.id, 'displayName', creator.username
      ) END AS technician
    FROM inspection_jobs
    LEFT JOIN customer_sites site ON site.id = inspection_jobs.site_id
    LEFT JOIN users creator ON creator.id = inspection_jobs.created_by_user_id
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
    createdAt: job.createdAt,
    serviceDate: job.serviceDate,
    serviceTime: job.serviceTime,
    status: job.status,
    technician: job.technician ?? null,
    systems: presentation.systems,
    inspectionProgress: {
      accepted: completion.acceptedUnitCount,
      required: completion.requiredUnitCount
    },
    completion
  };
}

export type ManagerServiceVisitList = {
  serviceVisits: ManagerServiceVisit[];
  nextCursor: string | null;
  totalCount: number;
};

/**
 * Admin-only business view. Samples/regression fixtures are excluded in SQL. Filters are
 * optional and additive: zero filters produce the exact same rows, order, and shape as before
 * this slice, plus a `nextCursor` that is `null` whenever the whole set fits on one page, and a
 * `totalCount` — the full count of rows matching the filters, independent of `cursor`/`limit`, so
 * it can never drift from (and never be lost by) the list's own pagination. See
 * `OperationalListRow` for why the placeholder (`id === null`) row must be filtered out first.
 */
export async function listManagerServiceVisits(
  database: Pick<typeof pool, "query"> = pool,
  filters: ManagerServiceVisitFilters = {}
): Promise<ManagerServiceVisitList> {
  const { sql, values, limit } = buildOperationalListQuery(filters);
  const result = await database.query<OperationalListRow>(sql, values);
  const totalCount = result.rows[0]?.totalCount ?? 0;
  const pagedRows = result.rows.filter((row): row is OperationalListRow & { id: string } => row.id !== null);
  const hasMore = pagedRows.length > limit;
  const rows = hasMore ? pagedRows.slice(0, limit) : pagedRows;
  const serviceVisits = await Promise.all(rows.map((job) => presentOperationalJob(job, database)));
  const lastRow = rows[rows.length - 1];
  const nextCursor = hasMore && lastRow
    ? encodeServiceVisitCursor({ serviceDate: lastRow.serviceDate, jobReference: lastRow.reference, id: lastRow.id })
    : null;
  return { serviceVisits, nextCursor, totalCount };
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
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export type ManagerServiceVisitCursor = { serviceDate: string | null; jobReference: string; id: string };

export type ManagerServiceVisitFilters = {
  customerId?: string;
  siteId?: string;
  technicianId?: number;
  status?: "open" | "closed";
  systemKey?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: ManagerServiceVisitCursor;
};

const defaultServiceVisitPageSize = 50;
const maxServiceVisitPageSize = 200;

export class ManagerServiceVisitQueryError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

/** Mirrors `masterSystemInspections.ts`'s cursor discipline: strict base64url JSON, exact key set. */
function decodeServiceVisitCursor(value: string): ManagerServiceVisitCursor | undefined {
  if (value.length === 0 || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length > 256) return undefined;
    const parsed: unknown = JSON.parse(decoded.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const cursor = parsed as { serviceDate?: unknown; jobReference?: unknown; id?: unknown };
    if (Object.keys(cursor).length !== 3
      || !("serviceDate" in cursor) || !("jobReference" in cursor) || !("id" in cursor)) return undefined;
    if (cursor.serviceDate !== null && !(typeof cursor.serviceDate === "string" && isValidCalendarDate(cursor.serviceDate))) return undefined;
    if (typeof cursor.jobReference !== "string" || cursor.jobReference.length === 0 || cursor.jobReference.length > 200) return undefined;
    if (typeof cursor.id !== "string" || !uuidPattern.test(cursor.id)) return undefined;
    return { serviceDate: cursor.serviceDate, jobReference: cursor.jobReference, id: cursor.id };
  } catch {
    return undefined;
  }
}

function encodeServiceVisitCursor(cursor: ManagerServiceVisitCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/**
 * Additive, optional query filters. Every field is validated before any SQL runs; a well-formed
 * but unknown/foreign customerId or siteId is left to the query (existence oracle: 200 []).
 */
export function parseServiceVisitFilters(query: Record<string, unknown>): ManagerServiceVisitFilters {
  const customerIdRaw = query.customerId;
  if (customerIdRaw !== undefined && (typeof customerIdRaw !== "string" || !uuidPattern.test(customerIdRaw))) {
    throw new ManagerServiceVisitQueryError("INVALID_CUSTOMER_ID", "customerId must be a valid UUID.");
  }
  const siteIdRaw = query.siteId;
  if (siteIdRaw !== undefined && (typeof siteIdRaw !== "string" || !uuidPattern.test(siteIdRaw))) {
    throw new ManagerServiceVisitQueryError("INVALID_SITE_ID", "siteId must be a valid UUID.");
  }
  const technicianIdRaw = query.technicianId;
  // Same positive-integer rule as the technician deactivate route (users.id is BIGSERIAL, capped to int4 there).
  if (technicianIdRaw !== undefined && (typeof technicianIdRaw !== "string" || !/^[1-9]\d*$/.test(technicianIdRaw)
    || Number(technicianIdRaw) > 2147483647)) {
    throw new ManagerServiceVisitQueryError("INVALID_TECHNICIAN_ID", "technicianId must be a positive numeric ID.");
  }
  const statusRaw = query.status;
  if (statusRaw !== undefined && statusRaw !== "open" && statusRaw !== "closed") {
    throw new ManagerServiceVisitQueryError("INVALID_STATUS", 'status must be "open" or "closed".');
  }
  const systemKeyRaw = query.systemKey;
  if (systemKeyRaw !== undefined && (typeof systemKeyRaw !== "string" || !isImplementedSystemKey(systemKeyRaw))) {
    throw new ManagerServiceVisitQueryError("INVALID_SYSTEM_KEY", "systemKey is not a recognised system.");
  }
  const fromRaw = query.from;
  if (fromRaw !== undefined && (typeof fromRaw !== "string" || !isValidCalendarDate(fromRaw))) {
    throw new ManagerServiceVisitQueryError("INVALID_FROM_DATE", "from must be a valid YYYY-MM-DD date.");
  }
  const toRaw = query.to;
  if (toRaw !== undefined && (typeof toRaw !== "string" || !isValidCalendarDate(toRaw))) {
    throw new ManagerServiceVisitQueryError("INVALID_TO_DATE", "to must be a valid YYYY-MM-DD date.");
  }
  if (typeof fromRaw === "string" && typeof toRaw === "string" && fromRaw > toRaw) {
    throw new ManagerServiceVisitQueryError("INVALID_DATE_RANGE", "from must not be after to.");
  }
  let limit = defaultServiceVisitPageSize;
  const limitRaw = query.limit;
  if (limitRaw !== undefined) {
    if (typeof limitRaw !== "string" || !/^[1-9][0-9]*$/.test(limitRaw)) {
      throw new ManagerServiceVisitQueryError("INVALID_LIMIT", "limit must be a positive integer.");
    }
    limit = Number.parseInt(limitRaw, 10);
    if (limit > maxServiceVisitPageSize) {
      throw new ManagerServiceVisitQueryError("INVALID_LIMIT", `limit must not exceed ${maxServiceVisitPageSize}.`);
    }
  }
  let cursor: ManagerServiceVisitCursor | undefined;
  const cursorRaw = query.cursor;
  if (cursorRaw !== undefined) {
    if (typeof cursorRaw !== "string") throw new ManagerServiceVisitQueryError("INVALID_CURSOR", "cursor is invalid.");
    cursor = decodeServiceVisitCursor(cursorRaw);
    if (!cursor) throw new ManagerServiceVisitQueryError("INVALID_CURSOR", "cursor is invalid.");
  }
  return {
    ...(typeof customerIdRaw === "string" ? { customerId: customerIdRaw } : {}),
    ...(typeof siteIdRaw === "string" ? { siteId: siteIdRaw } : {}),
    ...(typeof technicianIdRaw === "string" ? { technicianId: Number(technicianIdRaw) } : {}),
    ...(statusRaw === "open" || statusRaw === "closed" ? { status: statusRaw } : {}),
    ...(typeof systemKeyRaw === "string" ? { systemKey: systemKeyRaw } : {}),
    ...(typeof fromRaw === "string" ? { from: fromRaw } : {}),
    ...(typeof toRaw === "string" ? { to: toRaw } : {}),
    limit,
    ...(cursor ? { cursor } : {})
  };
}

/**
 * Builds the parameterized SQL for the filtered, keyset-paginated operational list. Every
 * caller-controlled value is bound as its own `$n` parameter — never string-interpolated.
 *
 * `totalCount` must read the same value on every page of the same filtered set, INCLUDING a page
 * whose cursor+limit slice is itself empty (the last page, or a cursor positioned past the end of
 * an otherwise non-empty filtered set — both reachable in normal operation, not just adversarial
 * input). A plain `COUNT(*) OVER()` on the paginated rows cannot satisfy this: if the cursor
 * predicate filters out every row, there is no row left to carry the window value on.
 *
 * So `totalCount` is computed by a `summary` derived table — `count(*)` with no `GROUP BY`, which
 * therefore always returns exactly one row, even over zero matches — LEFT JOINed onto the
 * cursor+limit-scoped `paged` rows. Both `summary` and `paged` read the SAME `filtered` CTE (the
 * filter-only WHERE, never the cursor), so the count can never drift from the list's own filters,
 * and it is never lost just because a particular page happens to be empty. `paged.id` is `NULL`
 * on the LEFT JOIN's placeholder row when `paged` is empty; `id` is never `NULL` for a real job,
 * so it is the caller's discriminator (see `OperationalListRow`). Still exactly one round trip —
 * one `SELECT`, with `filtered` referenced twice and materialized once.
 */
export function buildOperationalListQuery(filters: ManagerServiceVisitFilters) {
  const values: unknown[] = [];
  const filterConditions: string[] = [operationalWhere];

  if (filters.customerId) {
    values.push(filters.customerId);
    filterConditions.push(`inspection_jobs.customer_id = $${values.length}`);
  }
  if (filters.siteId) {
    values.push(filters.siteId);
    filterConditions.push(`inspection_jobs.site_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    filterConditions.push(`inspection_jobs.status = $${values.length}`);
  }
  if (filters.systemKey) {
    values.push(filters.systemKey);
    filterConditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(inspection_jobs.configuration_snapshot -> 'enabledSystems') AS enabled_system
      WHERE enabled_system ->> 'systemKey' = $${values.length}
    )`);
  }
  if (filters.from) {
    values.push(filters.from);
    filterConditions.push(`inspection_jobs.service_date >= $${values.length}::date`);
  }
  if (filters.to) {
    values.push(filters.to);
    filterConditions.push(`inspection_jobs.service_date <= $${values.length}::date`);
  }
  if (filters.technicianId !== undefined) {
    // An unknown technician simply matches nothing; NULL-creator legacy visits never match.
    values.push(filters.technicianId);
    filterConditions.push(`inspection_jobs.created_by_user_id = $${values.length}::bigint`);
  }

  let cursorCondition = "";
  if (filters.cursor) {
    values.push(filters.cursor.serviceDate, filters.cursor.jobReference, filters.cursor.id);
    const serviceDateParam = values.length - 2;
    const jobReferenceParam = values.length - 1;
    const idParam = values.length;
    // Mirrors ORDER BY "serviceDate" DESC NULLS LAST, reference DESC, id DESC: rows with a
    // NULL service date sort after every non-null date, so a non-null cursor's "after" set
    // includes all NULL-date rows; a NULL cursor only tie-breaks among other NULL-date rows.
    // References the inner subquery's OUTPUT columns (unqualified / quoted aliases), since this
    // predicate is applied in the outer query, over the already-projected rows.
    cursorCondition = `(
      (
        $${serviceDateParam}::date IS NOT NULL AND (
          ("serviceDate" IS NOT NULL AND "serviceDate"::date < $${serviceDateParam}::date)
          OR ("serviceDate"::date = $${serviceDateParam}::date
              AND (reference, id) < ($${jobReferenceParam}, $${idParam}::uuid))
          OR "serviceDate" IS NULL
        )
      )
      OR (
        $${serviceDateParam}::date IS NULL AND "serviceDate" IS NULL
        AND (reference, id) < ($${jobReferenceParam}, $${idParam}::uuid)
      )
    )`;
  }

  const limit = filters.limit ?? defaultServiceVisitPageSize;
  values.push(limit + 1);
  const limitParam = values.length;

  const sql = `
    WITH filtered AS MATERIALIZED (
      SELECT
        inspection_jobs.id,
        inspection_jobs.job_reference AS reference,
        inspection_jobs.title,
        inspection_jobs.status,
        inspection_jobs.created_at AS "createdAt",
        inspection_jobs.service_date::text AS "serviceDate",
        to_char(inspection_jobs.service_time, 'HH24:MI') AS "serviceTime",
        inspection_jobs.configuration_snapshot AS "configurationSnapshot",
        CASE WHEN site.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', site.id, 'displayName', site.display_name
        ) END AS site,
        CASE WHEN creator.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', creator.id, 'displayName', creator.username
        ) END AS technician
      FROM inspection_jobs
      LEFT JOIN customer_sites site ON site.id = inspection_jobs.site_id
      LEFT JOIN users creator ON creator.id = inspection_jobs.created_by_user_id
      WHERE ${filterConditions.join(" AND ")}
    )
    SELECT summary."totalCount", paged.*
    FROM (SELECT count(*)::int AS "totalCount" FROM filtered) summary
    LEFT JOIN (
      SELECT * FROM filtered
      ${cursorCondition ? `WHERE ${cursorCondition}` : ""}
      ORDER BY "serviceDate" DESC NULLS LAST, reference DESC, id DESC
      LIMIT $${limitParam}
    ) paged ON true
    ORDER BY paged."serviceDate" DESC NULLS LAST, paged.reference DESC NULLS LAST, paged.id DESC NULLS LAST
  `;
  return { sql, values, limit };
}

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

  router.get("/manager/service-visits", requireRole("admin"), async (request, response, next) => {
  try {
    let filters: ManagerServiceVisitFilters;
    try {
      filters = parseServiceVisitFilters(request.query as Record<string, unknown>);
    } catch (error) {
      if (error instanceof ManagerServiceVisitQueryError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      throw error;
    }
    response.setHeader("Cache-Control", "private, no-store");
    const { serviceVisits, nextCursor, totalCount } = await listManagerServiceVisits(database, filters);
    response.json({ serviceVisits, nextCursor, totalCount });
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
