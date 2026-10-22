import type { InspectionJob } from "../jobs/jobTypes";
import type { AuthUser } from "../auth/authApi";
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const uuid = (v: unknown) => text(v) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const named = (v: unknown) => record(v) && uuid(v.id) && text(v.displayName);
const timestamp = (v: unknown) => text(v) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

/** Validate the existing canonical job before handing it to the existing job screen.
 * No customer copy or detail is written to IndexedDB by this history-opening path. */
export function parseTimelineServiceJob(value: unknown, jobId: string, customerId: string): InspectionJob {
  const invalid = (): never => { throw new Error("The server sent invalid service visit details. Refresh and retry."); };
  if (!record(value) || !record(value.job)) return invalid();
  const j = value.job, c = j.configurationSnapshot;
  if (j.id !== jobId || !text(j.reference) || !text(j.title) || !["open", "closed"].includes(String(j.status)) || !timestamp(j.createdAt)
    || !(j.serviceDate === null || text(j.serviceDate) && /^\d{4}-\d{2}-\d{2}$/.test(j.serviceDate) && timestamp(`${j.serviceDate}T00:00:00.000Z`))
    || !(j.serviceTime === null || text(j.serviceTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(j.serviceTime))
    || !(j.site === null || named(j.site)) || !record(c) || c.schemaVersion !== 1
    || !named(c.customer) || !record(c.customer) || c.customer.id !== customerId || !text(c.customer.code)
    || !record(c.configuration) || !uuid(c.configuration.revisionId) || !Number.isSafeInteger(c.configuration.revisionNumber) || Number(c.configuration.revisionNumber) < 1
    || !record(c.template) || !uuid(c.template.id) || !text(c.template.code) || !text(c.template.name) || !Number.isSafeInteger(c.template.version) || Number(c.template.version) < 1
    || !Array.isArray(c.enabledSystems)) return invalid();
  for (const s of c.enabledSystems) {
    if (!record(s) || !uuid(s.enabledSystemId) || !text(s.systemKey) || !text(s.displayName) || !finite(s.sortOrder)
      || s.definitionStatus !== "confirmed" || !Array.isArray(s.zones) || !Array.isArray(s.locations)) return invalid();
    for (const z of s.zones) if (!record(z) || !uuid(z.id) || z.enabledSystemId !== s.enabledSystemId || !text(z.key) || !text(z.displayName) || !finite(z.sortOrder)) return invalid();
    for (const l of s.locations) if (!record(l) || !uuid(l.id) || l.enabledSystemId !== s.enabledSystemId || !(l.zoneId === null || uuid(l.zoneId))
      || !text(l.key) || !text(l.displayName) || !finite(l.sortOrder) || !Number.isSafeInteger(l.presetRowCount) || Number(l.presetRowCount) < 0) return invalid();
  }
  const completion = j.completion;
  if (!record(completion) || completion.jobId !== jobId || completion.jobStatus !== j.status || typeof completion.eligible !== "boolean"
    || !timestamp(completion.checkedAt) || !Number.isSafeInteger(completion.requiredUnitCount) || Number(completion.requiredUnitCount) < 0
    || !Number.isSafeInteger(completion.acceptedUnitCount) || Number(completion.acceptedUnitCount) < 0
    || !(completion.completedAt === null || timestamp(completion.completedAt))
    || !(completion.completedBy === null || record(completion.completedBy) && Number.isSafeInteger(completion.completedBy.id) && text(completion.completedBy.username))
    || !Array.isArray(completion.systems)) return invalid();
  for (const s of completion.systems) {
    if (!record(s) || !text(s.systemKey) || !text(s.systemLabel) || !["accepted", "incomplete"].includes(String(s.status)) || !Array.isArray(s.units)) return invalid();
    for (const u of s.units) if (!record(u) || !text(u.authorityKey) || !text(u.label) || !["accepted", "incomplete"].includes(String(u.status))) return invalid();
  }
  return j as InspectionJob;
}
export class ServiceVisitNotAuthorisedError extends Error {
  constructor(message: string) { super(message); this.name = "ServiceVisitNotAuthorisedError"; }
}
export async function loadTimelineServiceJob(jobId: string, customerId: string, actor: AuthUser, signal: AbortSignal) {
  const response = await fetch(`/api/inspection-jobs/${encodeURIComponent(jobId)}`, { credentials: "same-origin", cache: "no-store", signal,
    headers: { "X-Expected-User-Id": String(actor.id) } });
  if (response.status === 403) {
    // FR-09: another technician's visit. Show the server's own wording, not a generic "server unavailable".
    let message = "";
    try { const data = await response.json() as { message?: unknown }; if (typeof data.message === "string") message = data.message.trim(); } catch { /* fall back below */ }
    throw new ServiceVisitNotAuthorisedError(message || "You are not authorised to open this service visit. You can only open your own service visits.");
  }
  if (!response.ok) throw new Error(`Service visit details could not be opened (${response.status}). Reconnect or sign in and retry.`);
  return parseTimelineServiceJob(await response.json(), jobId, customerId);
}
