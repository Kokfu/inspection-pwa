import type { Pool } from "pg";
import type { CurrentUser } from "../auth/authTypes.js";

export type VisitSummary = {
  id: string; kind: "service" | "repair"; date: string; status: string;
  siteId: string | null; siteName: string | null;
  technicianId: number | null; technicianName: string | null; ownedByCaller: boolean;
};
type Cursor = Pick<VisitSummary, "date" | "kind" | "id">;
export type VisitSummaryFilters = {
  kind?: "service" | "repair"; status?: string; dateFrom?: string; dateTo?: string;
  siteId?: string; cursor?: Cursor; limit: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = ["open", "closed", "draft", "awaiting_approval", "returned", "approved"];
export class VisitSummaryError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const invalid = (): never => { throw new VisitSummaryError(400, "INVALID_VISIT_SUMMARY_QUERY"); };
export function validVisitDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= "0001-01-01" && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}
export function parseVisitSummaryFilters(customerId: unknown, query: Record<string, unknown>): VisitSummaryFilters {
  if (typeof customerId !== "string" || !uuid.test(customerId)) invalid();
  const allowed = ["kind", "status", "dateFrom", "dateTo", "siteId", "cursor", "limit"];
  if (Object.keys(query).some(key => !allowed.includes(key))
    || Object.values(query).some(value => typeof value !== "string")) invalid();
  const { kind, status, dateFrom, dateTo, siteId, limit, cursor } = query as Record<string, string | undefined>;
  if (kind !== undefined && kind !== "service" && kind !== "repair") invalid();
  if (status !== undefined && !statuses.includes(status)) invalid();
  if (dateFrom !== undefined && !validVisitDate(dateFrom)) invalid();
  if (dateTo !== undefined && !validVisitDate(dateTo)) invalid();
  if (dateFrom && dateTo && dateFrom > dateTo) invalid();
  if (siteId !== undefined && !uuid.test(siteId)) invalid();
  if (limit !== undefined && (!/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100)) invalid();
  let parsedCursor: Cursor | undefined;
  if (cursor !== undefined) {
    if (cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) invalid();
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)
        || Object.keys(decoded).sort().join(",") !== "date,id,kind"
        || !validVisitDate(decoded.date) || !["service", "repair"].includes(decoded.kind)
        || typeof decoded.id !== "string" || !uuid.test(decoded.id)) invalid();
      parsedCursor = { date: decoded.date, kind: decoded.kind, id: decoded.id.toLowerCase() };
    } catch { invalid(); }
  }
  return { kind: kind as VisitSummaryFilters["kind"], status, dateFrom, dateTo,
    siteId, cursor: parsedCursor, limit: limit === undefined ? 50 : Number(limit) };
}

/** Explicit projection is also a wire allowlist: details never leave this module. */
function summary(row: VisitSummary): VisitSummary {
  const service = row.kind === "service";
  if (typeof row.id !== "string" || !uuid.test(row.id) || !["service", "repair"].includes(row.kind)
    || !validVisitDate(row.date) || !(service ? ["open", "closed"] : statuses.slice(2)).includes(row.status)
    || !(row.siteId === null || typeof row.siteId === "string" && uuid.test(row.siteId))
    || !(row.siteName === null || typeof row.siteName === "string")
    || !(row.technicianId === null || Number.isSafeInteger(row.technicianId) && row.technicianId > 0)
    || !(row.technicianName === null || typeof row.technicianName === "string")
    || typeof row.ownedByCaller !== "boolean") throw new VisitSummaryError(500, "INVALID_VISIT_SUMMARY_DATA");
  return { id: row.id, kind: row.kind, date: row.date, status: row.status,
    siteId: row.siteId, siteName: row.siteName, technicianId: row.technicianId,
    technicianName: row.technicianName, ownedByCaller: row.ownedByCaller };
}

export async function listVisitSummaries(database: Pick<Pool, "query">, actor: CurrentUser,
  customerId: string, filters: VisitSummaryFilters) {
  if (actor.role !== "admin" && actor.role !== "inspector") throw new VisitSummaryError(403, "FORBIDDEN");
  // Same customer visibility as GET /customers. Unknown and forbidden customers are indistinguishable.
  const customer = await database.query(`SELECT id FROM customers WHERE id=$1
    AND ($2::boolean OR (is_active=true AND is_demo=false))`, [customerId, actor.role === "admin"]);
  if (!customer.rows.length) throw new VisitSummaryError(404, "CUSTOMER_NOT_FOUND");
  const result = await database.query<VisitSummary>(`
    WITH visits AS (
      SELECT j.id, 'service'::text AS kind, COALESCE(j.service_date, j.created_at::date) AS date,
        j.status, j.site_id, j.created_by_user_id
      FROM inspection_jobs j
      WHERE j.customer_id=$1 AND j.master_template_version_id IS NOT NULL AND j.is_sample=false
      UNION ALL
      SELECT r.client_uuid, 'repair', r.visit_date, r.status, r.site_id, r.created_by_user_id
      FROM repair_visits r WHERE r.customer_id=$1
    )
    SELECT v.id, v.kind, v.date::text AS date, v.status, v.site_id AS "siteId",
      s.display_name AS "siteName", u.id::int AS "technicianId",
      COALESCE(NULLIF(btrim(u.display_name), ''), u.username) AS "technicianName",
      COALESCE(v.created_by_user_id=$2, false) AS "ownedByCaller"
    FROM visits v LEFT JOIN customer_sites s ON s.id=v.site_id
      LEFT JOIN users u ON u.id=v.created_by_user_id
    WHERE ($3::text IS NULL OR v.kind=$3) AND ($4::text IS NULL OR v.status=$4)
      AND ($5::date IS NULL OR v.date >= $5) AND ($6::date IS NULL OR v.date <= $6)
      AND ($7::uuid IS NULL OR v.site_id=$7)
      AND ($8::date IS NULL OR (v.date,v.kind COLLATE "C",v.id) < ($8::date,$9::text COLLATE "C",$10::uuid))
    ORDER BY v.date DESC, v.kind COLLATE "C" DESC, v.id DESC LIMIT $11`,
  [customerId, actor.id, filters.kind ?? null, filters.status ?? null,
    filters.dateFrom ?? null, filters.dateTo ?? null, filters.siteId ?? null,
    filters.cursor?.date ?? null, filters.cursor?.kind ?? null, filters.cursor?.id ?? null, filters.limit + 1]);
  const rows = result.rows.map(summary);
  const visits = rows.slice(0, filters.limit);
  const last = visits.at(-1);
  const nextCursor = rows.length > filters.limit && last
    ? Buffer.from(JSON.stringify({ date: last.date, kind: last.kind, id: last.id })).toString("base64url") : null;
  return { visits, nextCursor };
}
