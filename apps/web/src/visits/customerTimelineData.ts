import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";
import type { AuthUser } from "../auth/authApi";
import { isGatewayUnreachableStatus } from "../jobs/serverReachability";
import type { VisitRowSummary } from "./VisitRow";
import { getCachedReferenceCustomers } from "../referenceData/referenceDataCache";

export type TimelineVisit = VisitRowSummary & {
  id: string; siteId: string | null; siteName: string | null;
  technicianId: number | null; ownedByCaller: boolean;
};
export type TimelineFilters = { kind: "all" | "service" | "repair"; status: string; dateFrom: string; dateTo: string; siteId: string };
export const timelineStatuses = { open: "Open", closed: "Completed", draft: "Draft", awaiting_approval: "Awaiting approval", returned: "Returned", approved: "Approved" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const invalid = (): never => { throw new Error("Customer history contains invalid summary data. Reconnect and refresh."); };

/** Only failures of the transport itself may use an older customer catalog. */
export async function loadTimelineCustomers(actor: AuthUser) {
  let response: Response;
  try {
    response = await fetch("/api/customers", { credentials: "same-origin", cache: "no-store",
      headers: { "X-Expected-User-Id": String(actor.id) } });
  } catch { return getCachedReferenceCustomers(); }
  if (isGatewayUnreachableStatus(response.status)) return getCachedReferenceCustomers();
  if (!response.ok) throw new Error(`Customer catalog could not be refreshed (${response.status}). Sign in or retry.`);
  const data: unknown = await response.json();
  if (!record(data) || !Array.isArray(data.customers) || data.customers.some(c => !record(c)
    || typeof c.id !== "string" || !uuid.test(c.id) || typeof c.displayName !== "string")
    || new Set(data.customers.map(c => c.id)).size !== data.customers.length) throw new Error("Customer catalog contains invalid data.");
  return data.customers as Array<{ id: string; displayName: string }>;
}
export const validTimelineDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && v >= "0001-01-01" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** Strict allowlist on both network and device reads; never persist detail payloads. */
export function parseTimelinePage(value: unknown, actor: AuthUser): { visits: TimelineVisit[]; nextCursor: string | null } {
  if (!record(value) || Object.keys(value).sort().join() !== "nextCursor,visits" || !Array.isArray(value.visits)
    || !(value.nextCursor === null || typeof value.nextCursor === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(value.nextCursor))) return invalid();
  const visits = value.visits.map((row): TimelineVisit => {
    if (!record(row) || Object.keys(row).sort().join() !== "date,id,kind,ownedByCaller,siteId,siteName,status,technicianId,technicianName"
      || typeof row.id !== "string" || !uuid.test(row.id) || !validTimelineDate(row.date)
      || (row.kind !== "service" && row.kind !== "repair")
      || typeof row.status !== "string" || !(row.kind === "service" ? ["open", "closed"] : ["draft", "awaiting_approval", "returned", "approved"]).includes(row.status)
      || !(row.siteId === null || typeof row.siteId === "string" && uuid.test(row.siteId))
      || !(row.siteName === null || typeof row.siteName === "string")
      || !(row.technicianName === null || typeof row.technicianName === "string")
      || !(row.technicianId === null || Number.isSafeInteger(row.technicianId) && Number(row.technicianId) > 0)
      || typeof row.ownedByCaller !== "boolean" || row.ownedByCaller !== (row.technicianId === actor.id)) return invalid();
    return { id: row.id, kind: row.kind, date: row.date, status: row.status as TimelineVisit["status"],
      siteId: row.siteId, siteName: row.siteName, technicianId: row.technicianId as number | null,
      technicianName: row.technicianName, ownedByCaller: row.ownedByCaller };
  });
  if (new Set(visits.map(v => `${v.kind}:${v.id}`)).size !== visits.length) return invalid();
  return { visits, nextCursor: value.nextCursor as string | null };
}
export function filterTimeline(visits: TimelineVisit[], f: TimelineFilters) {
  return visits.filter(v => (f.kind === "all" || v.kind === f.kind) && (!f.status || v.status === f.status || f.status === "closed" && v.kind === "repair" && v.status === "approved")
    && (!f.dateFrom || v.date >= f.dateFrom) && (!f.dateTo || v.date <= f.dateTo) && (!f.siteId || v.siteId === f.siteId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.kind.localeCompare(a.kind) || b.id.localeCompare(a.id));
}
export const canOpenTimelineVisit = (actor: AuthUser, visit: TimelineVisit) => actor.role === "admin" || actor.role === "supervisor"
  || actor.role === "inspector" && visit.ownedByCaller && visit.technicianId === actor.id;

export async function readCustomerTimeline(customerId: string, actor: AuthUser, mode: "server" | "offline", canCommit = () => true) {
  if (!uuid.test(customerId) || !["admin", "inspector"].includes(actor.role)) throw new Error("Customer history is unavailable for this account.");
  const database = localDatabase;
  const key = `customer-timeline:v1:${actor.id}:${customerId}`;
  const current = () => canCommit() && database === localDatabase && currentWorkspaceUserId() === actor.id;
  const fromDevice = async () => {
    if (!current()) throw new Error("Customer history session changed.");
    const cached = await database.referenceData.get(key);
    if (!current()) throw new Error("Customer history session changed.");
    if (!cached) return { visits: [], offline: true, cached: false };
    return { visits: parseTimelinePage(cached.payload, actor).visits, offline: true, cached: true };
  };
  if (mode === "offline") return fromDevice();
  const visits: TimelineVisit[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(`/api/customers/${encodeURIComponent(customerId)}/visit-summaries?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { "X-Expected-User-Id": String(actor.id) } });
    } catch { return fromDevice(); } finally { clearTimeout(timer); }
    if (!current()) throw new Error("Customer history session changed.");
    if (isGatewayUnreachableStatus(response.status)) return fromDevice();
    if (!response.ok) throw new Error(`Customer history could not be refreshed (${response.status}). Sign in or retry.`);
    // JSON/parsing failures deliberately do not fall back to an older cache.
    const page = parseTimelinePage(await response.json(), actor);
    visits.push(...page.visits); cursor = page.nextCursor;
    if (cursor && (cursors.has(cursor) || cursors.size >= 1000)) return invalid();
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const payload = parseTimelinePage({ visits, nextCursor: null }, actor);
  if (!current()) throw new Error("Customer history session changed.");
  const at = new Date().toISOString();
  await database.referenceData.put({ key, payload, version: "1", fetchedAt: at, expiresAt: at });
  if (!current()) throw new Error("Customer history session changed.");
  return { visits: payload.visits, offline: false, cached: true };
}
