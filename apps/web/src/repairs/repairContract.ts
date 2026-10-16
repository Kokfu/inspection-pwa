import type { RepairService } from "./repairTypes";

export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const isVisitDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const hash =(v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
export const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
// PostgreSQL BIGINT IDs may arrive as canonical decimal strings. Never coerce
// booleans, arrays, whitespace, fractions or values outside the supported range.
export const actorId = (v: unknown) => positive(v) || typeof v === "string" && /^[1-9]\d*$/.test(v) && positive(Number(v));
const enumValue = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const nullableUuid = (v: unknown) => v === null || uuid(v);
const keys = (v: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
export const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v && !v.startsWith("0000-");
export function requireRepair(ok: unknown, message = "INVALID_REPAIR_AUTHORITY"): asserts ok { if (!ok) throw new Error(message); }
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (object(v)) return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  requireRepair(v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v));
  return JSON.stringify(v);
}
export async function sha256(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
}
export const fingerprint = (v: unknown) => sha256(new TextEncoder().encode(canonical(v)).buffer as ArrayBuffer);
export function parseRepairService(value: unknown, jobId: string, systemKey: string): RepairService {
  requireRepair(object(value) && Object.keys(value).sort().join() === "findings,jobId,systemKey,workOrders"
    && value.jobId === jobId && value.systemKey === systemKey && uuid(jobId) && /^[a-z0-9_]{1,80}$/.test(systemKey)
    && Array.isArray(value.findings) && Array.isArray(value.workOrders));
  const findingIds = new Set<string>(), orderIds = new Set<string>(), historyIds = new Set<string>();
  for (const f of value.findings) {
    requireRepair(object(f) && Object.keys(f).sort().join() === "eligibility,findingId,history,original,reviewSequence,reviews,sourceFingerprint,sourceRevision"
      && uuid(f.findingId) && !findingIds.has(f.findingId) && hash(f.sourceFingerprint) && hash(f.sourceRevision)
      && enumValue(f.eligibility, ["eligible", "needs_review", "not_required"])
      && Number.isSafeInteger(f.reviewSequence) && Number(f.reviewSequence) >= 0 && Array.isArray(f.reviews) && Array.isArray(f.history) && object(f.original));
    findingIds.add(f.findingId);
    const o = f.original;
    requireRepair(keys(o, ["fieldPath", "responsePath", "rowUuid", "result", "remark", "caption", "sectionLabel", "fieldLabel", "unit",
      "sourceClientUuid", "jobId", "systemKey", "sourceJob", "formInstanceId", "instanceKey", "locationId", "zoneId", "template", "configuration",
      "contractSha256", "customer", "site", "system", "instance", "beforePhoto", "beforePhotoMissing", "beforePhotoLabel"])
      && o.jobId === jobId && o.systemKey === systemKey && uuid(o.formInstanceId) && uuid(o.sourceClientUuid)
      && nullableUuid(o.rowUuid) && nullableUuid(o.locationId) && nullableUuid(o.zoneId)
      && typeof o.instanceKey === "string" && o.instanceKey.length > 0
      && typeof o.fieldPath === "string" && o.fieldPath.length > 0 && o.fieldPath.length <= 300
      && typeof o.responsePath === "string" && o.responsePath.length > 0
      && [o.caption, o.sectionLabel, o.fieldLabel, o.beforePhotoLabel, o.system].every(v => typeof v === "string")
      && (o.unit === null || object(o.unit)) && (o.instance === null || object(o.instance))
      && object(o.sourceJob) && keys(o.sourceJob, ["id", "reference", "title"]) && o.sourceJob.id === jobId
      && typeof o.sourceJob.reference === "string" && typeof o.sourceJob.title === "string"
      && object(o.configuration) && keys(o.configuration, ["revisionId", "revisionNumber"])
      && uuid(o.configuration.revisionId) && positive(o.configuration.revisionNumber)
      && object(o.customer) && uuid(o.customer.id) && typeof o.customer.code === "string" && typeof o.customer.displayName === "string"
      && (o.site === null || object(o.site) && uuid(o.site.id) && typeof o.site.displayName === "string")
      && enumValue(o.result, ["not_good", "poor"]) && typeof o.remark === "string" && object(o.template)
      && keys(o.template, ["id", "code", "version"], ["name"]) && o.template.code === "MFE-FSSR"
      && (!Object.hasOwn(o.template, "name") || typeof o.template.name === "string")
      && uuid(o.template.id) && positive(o.template.version) && o.template.version <= 7
      && (o.contractSha256 === null || hash(o.contractSha256)) && typeof o.beforePhotoMissing === "boolean"
      && (o.beforePhoto === null ? o.beforePhotoMissing : !o.beforePhotoMissing && object(o.beforePhoto)));
    requireRepair(!o.beforePhotoMissing || o.template.version < 7 && !(systemKey === "fire_alarm_detector" && o.template.version === 6));
    if (object(o.beforePhoto)) {
      const p = o.beforePhoto;
      requireRepair(Object.keys(p).sort().join() === "fieldPath,height,photoUuid,sizeBytes,sourceSha256,storedSha256,width"
        && uuid(p.photoUuid) && p.fieldPath === o.fieldPath && hash(p.sourceSha256) && hash(p.storedSha256)
        && positive(p.sizeBytes) && p.sizeBytes <= 2 * 1024 * 1024 && positive(p.width) && positive(p.height));
    }
    let predecessor: string | null = null;
    for (const [i, h] of f.history.entries()) {
      requireRepair(object(h) && Object.keys(h).sort().join() === "client_uuid,cycle_sequence,performed_at,predecessor_uuid,remark,review_state,submitted_by_user_id"
        && uuid(h.client_uuid) && !historyIds.has(h.client_uuid) && h.cycle_sequence === i + 1 && h.predecessor_uuid === predecessor
        && timestamp(h.performed_at) && typeof h.remark === "string" && h.remark.trim().length > 0 && h.remark.length <= 4000 && actorId(h.submitted_by_user_id)
        && enumValue(h.review_state, ["awaiting_approval", "approved", "rejected", "withdrawn"]));
      requireRepair(h.review_state !== "awaiting_approval" || i === f.history.length - 1);
      historyIds.add(h.client_uuid);
      predecessor = h.client_uuid;
    }
    for (const [i, r] of f.reviews.entries()) requireRepair(object(r)
      && Object.keys(r).sort().join() === "decided_at,decided_by_user_id,decision,id,reason,sequence,source_revision"
      && uuid(r.id) && hash(r.source_revision) && r.sequence === i + 1 && timestamp(r.decided_at)
      && actorId(r.decided_by_user_id) && typeof r.reason === "string" && r.reason.trim().length >= 3
      && enumValue(r.decision, ["eligible", "not_required"]));
    requireRepair(f.reviewSequence === f.reviews.length);
  }
  for (const w of value.workOrders) {
    requireRepair(object(w) && Object.keys(w).sort().join() === "assignedToUserId,jobId,revision,status,systemKey,workOrderId"
      && uuid(w.workOrderId) && !orderIds.has(w.workOrderId) && w.jobId === jobId && w.systemKey === systemKey
      && positive(w.assignedToUserId) && positive(w.revision) && enumValue(w.status, ["active", "revoked"]));
    orderIds.add(w.workOrderId);
  }
  return value as unknown as RepairService;
}
