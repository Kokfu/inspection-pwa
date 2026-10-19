/** Portable wire contract. Mirrored by web/repairVisits/repairVisitTypes.ts;
 * parity tests keep the two trust boundaries aligned. Before is server-owned. */
export const repairVisitSystems = ["automatic_sprinkler", "fire_alarm_detector", "hydrant", "hose_reel", "dry_wet_riser",
  "co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression", "smoke_ventilation", "fire_intercom", "fire_rated_roller_shutter"] as const;
export type RepairVisitSystem = typeof repairVisitSystems[number];
export type RepairVisitStatus = "draft" | "awaiting_approval" | "returned" | "approved";
export type RepairVisitOutcome = "done_repair" | "not_done";
export type RepairVisitPrevious = { kind: "service" | "repair"; visitId: string };
export type RepairVisitFieldIdentity = {
  // All unit dimensions null = singleton system checklist (existing V7 shape).
  systemKey: RepairVisitSystem; rowUuid: string | null; locationId: string | null; zoneId: string | null;
  sectionKey: string; fieldKey: string;
};
export type RepairVisitPhoto = {
  photoUuid: string; sourceSha256: string; storedSha256: string; sizeBytes: number; width: number; height: number;
};
export type RepairVisitBeforeSnapshot = {
  previousVisit: RepairVisitPrevious; visitNumber: string; visitDate: string;
  result: "good" | "not_good" | "complete_repair" | "na" | RepairVisitOutcome;
  remark: string; photo: RepairVisitPhoto | null;
};
export type RepairVisitItem = {
  clientUuid: string; visitUuid: string; identity: RepairVisitFieldIdentity;
  systemLabel: string; unitLabel: string; sectionLabel: string; fieldLabel: string;
  before: RepairVisitBeforeSnapshot | null; outcome: RepairVisitOutcome | null;
  remark: string; photoUuid: string | null; sortOrder: number;
};
export type RepairVisit = {
  clientUuid: string; visitNumber: string; customerId: string; siteId: string; createdByUserId: number;
  configurationRevisionId: string; serviceCallNumber: string | null; arrivalTime: string; visitDate: string;
  deviceCreatedAt: string; previousVisit: RepairVisitPrevious | null; status: RepairVisitStatus; revision: number;
  reportNumber: string | null; approvedByUserId: number | null; approvedAt: string | null;
  createdAt: string; updatedAt: string;
};
export type RepairVisitEvent = {
  clientUuid: string; visitUuid: string; revision: number; type: "submitted" | "returned" | "resubmitted" | "approved";
  actorUserId: number; reason: string | null; occurredAt: string; requestFingerprint: string;
};
export const rvObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const rvKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  keys.length === Object.keys(v).length && keys.every(k => Object.hasOwn(v, k));
export const rvUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const rvTimestamp = (v: unknown): v is string => typeof v === "string"
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && !v.startsWith("0000-")
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const rvDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v)
  && rvTimestamp(`${v}T00:00:00.000Z`);
export const rvTime = (v: unknown): v is string => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
export const rvPositive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export const rvText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
export const rvHash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
export const rvEnum = (v: unknown, values: readonly string[]): v is string => typeof v === "string" && values.includes(v);
const nullableUuid = (v: unknown) => v === null || rvUuid(v);
function visitNumber(v: unknown, kind: "service" | "repair") {
  if (typeof v !== "string" || !new RegExp(`^${kind === "service" ? "SV" : "RV"}-[0-9]{8}-[1-9][0-9]*$`).test(v)) return false;
  const date = v.slice(3, 11);
  return rvDate(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`);
}
export function isRepairVisitPrevious(v: unknown): v is RepairVisitPrevious {
  return rvObject(v) && rvKeys(v, ["kind", "visitId"]) && rvEnum(v.kind, ["service", "repair"]) && rvUuid(v.visitId);
}
export function isRepairVisitFieldIdentity(v: unknown): v is RepairVisitFieldIdentity {
  return rvObject(v) && rvKeys(v, ["systemKey", "rowUuid", "locationId", "zoneId", "sectionKey", "fieldKey"])
    && rvEnum(v.systemKey, repairVisitSystems) && [v.rowUuid, v.locationId, v.zoneId].every(nullableUuid)
    && rvText(v.sectionKey, 100) && rvText(v.fieldKey, 100);
}
export function isRepairVisitPhoto(v: unknown): v is RepairVisitPhoto {
  return rvObject(v) && rvKeys(v, ["photoUuid", "sourceSha256", "storedSha256", "sizeBytes", "width", "height"])
    && rvUuid(v.photoUuid) && rvHash(v.sourceSha256) && rvHash(v.storedSha256)
    && rvPositive(v.sizeBytes) && v.sizeBytes <= 2097152 && rvPositive(v.width) && rvPositive(v.height);
}
export function isRepairVisitBeforeSnapshot(v: unknown): v is RepairVisitBeforeSnapshot {
  return rvObject(v) && rvKeys(v, ["previousVisit", "visitNumber", "visitDate", "result", "remark", "photo"])
    && isRepairVisitPrevious(v.previousVisit) && visitNumber(v.visitNumber, v.previousVisit.kind) && rvDate(v.visitDate)
    && typeof v.visitNumber === "string" && v.visitNumber.slice(3, 11) === v.visitDate.replaceAll("-", "")
    && rvEnum(v.result, v.previousVisit.kind === "service" ? ["good", "not_good", "complete_repair", "na"] : ["done_repair", "not_done"])
    && typeof v.remark === "string" && v.remark.length <= 4000 && (v.photo === null || isRepairVisitPhoto(v.photo));
}
export function isRepairVisitItem(v: unknown): v is RepairVisitItem {
  return rvObject(v) && rvKeys(v, ["clientUuid", "visitUuid", "identity", "systemLabel", "unitLabel", "sectionLabel", "fieldLabel", "before", "outcome", "remark", "photoUuid", "sortOrder"])
    && rvUuid(v.clientUuid) && rvUuid(v.visitUuid) && isRepairVisitFieldIdentity(v.identity)
    && [v.systemLabel, v.unitLabel, v.sectionLabel, v.fieldLabel].every(label => rvText(label, 300))
    && (v.before === null || isRepairVisitBeforeSnapshot(v.before)) && (v.outcome === null || rvEnum(v.outcome, ["done_repair", "not_done"]))
    && typeof v.remark === "string" && v.remark.length <= 4000 && nullableUuid(v.photoUuid)
    && typeof v.sortOrder === "number" && Number.isSafeInteger(v.sortOrder) && v.sortOrder >= 0;
}
export function isRepairVisit(v: unknown): v is RepairVisit {
  if (!rvObject(v) || !rvKeys(v, ["clientUuid", "visitNumber", "customerId", "siteId", "createdByUserId", "configurationRevisionId", "serviceCallNumber", "arrivalTime", "visitDate", "deviceCreatedAt", "previousVisit", "status", "revision", "reportNumber", "approvedByUserId", "approvedAt", "createdAt", "updatedAt"])) return false;
  return [v.clientUuid, v.customerId, v.siteId, v.configurationRevisionId].every(rvUuid) && visitNumber(v.visitNumber, "repair")
    && rvPositive(v.createdByUserId) && (v.serviceCallNumber === null || rvText(v.serviceCallNumber, 100))
    && rvTime(v.arrivalTime) && rvDate(v.visitDate) && typeof v.visitNumber === "string" && v.visitNumber.slice(3, 11) === v.visitDate.replaceAll("-", "")
    && [v.deviceCreatedAt, v.createdAt, v.updatedAt].every(rvTimestamp)
    && (v.previousVisit === null || isRepairVisitPrevious(v.previousVisit) && v.previousVisit.visitId !== v.clientUuid)
    && rvEnum(v.status, ["draft", "awaiting_approval", "returned", "approved"]) && rvPositive(v.revision)
    && (v.status === "approved" ? typeof v.reportNumber === "string" && /^MFE\/RR\/[0-9]{4}\/[0-9]{4,}$/.test(v.reportNumber)
      && rvPositive(v.approvedByUserId) && rvTimestamp(v.approvedAt)
      : v.reportNumber === null && v.approvedByUserId === null && v.approvedAt === null);
}
export function isRepairVisitEvent(v: unknown): v is RepairVisitEvent {
  return rvObject(v) && rvKeys(v, ["clientUuid", "visitUuid", "revision", "type", "actorUserId", "reason", "occurredAt", "requestFingerprint"])
    && rvUuid(v.clientUuid) && rvUuid(v.visitUuid) && rvPositive(v.revision) && rvPositive(v.actorUserId)
    && rvEnum(v.type, ["submitted", "returned", "resubmitted", "approved"]) && rvTimestamp(v.occurredAt) && rvHash(v.requestFingerprint)
    && (v.reason === null ? v.type !== "returned" : rvText(v.reason, 4000));
}
function parse<T>(value: unknown, valid: (v: unknown) => v is T): T {
  if (!valid(value)) throw new Error("INVALID_REPAIR_VISIT_CONTRACT");
  return value;
}
export const parseRepairVisit = (v: unknown) => parse(v, isRepairVisit);
export const parseRepairVisitItem = (v: unknown) => parse(v, isRepairVisitItem);
export const parseRepairVisitFieldIdentity = (v: unknown) => parse(v, isRepairVisitFieldIdentity);
export const parseRepairVisitBeforeSnapshot = (v: unknown) => parse(v, isRepairVisitBeforeSnapshot);
export const parseRepairVisitEvent = (v: unknown) => parse(v, isRepairVisitEvent);

// Local persistence envelopes are never submitted as authoritative Before data.
export type RepairVisitSyncStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";
export type LocalRepairVisit = Omit<RepairVisit, "visitNumber"> & {
  visitNumber: string | null; syncStatus: RepairVisitSyncStatus;
  localCreatedAt: string; localUpdatedAt: string; lastSyncError?: string; lastSyncedAt?: string;
  frozen?: { visit: Omit<RepairVisit, "visitNumber"> & { visitNumber: string | null }; items: RepairVisitItem[]; revision: number };
  requestFingerprint?: string;
  // Added in 4A (additive, all optional so Dexie v11 rows stay valid).
  /** "device" = created here and editable; "server" = imported read-only from the server list. */
  origin?: "device" | "server";
  lastSyncErrorCode?: string;
  /** Admin's latest Return reason, copied from the server's event log on refresh. */
  returnReason?: string | null;
  serverRefreshedAt?: string;
  /** True once the server confirmed the create (RV number assigned). */
  createConfirmed?: boolean;
  /** Display names copied when the visit was created, so the list and form work offline. */
  customerName?: string; siteName?: string; previousVisitLabel?: string;
};
export type LocalRepairVisitItem = RepairVisitItem;
export type LocalRepairVisitPhoto = {
  photoUuid: string; visitUuid: string; itemUuid: string; revision: number; blob: Blob;
  sourceSha256: string; sizeBytes: number; width: number; height: number;
  captureSource: "camera" | "gallery" | "unknown"; capturedAt: string;
  syncStatus: "Draft" | "Pending" | "Uploading" | "Synced" | "Failed";
  localUpdatedAt: string; lastSyncError?: string;
  // Added in 4A: the immutable staging request and the server's exact receipt.
  frozen?: RepairVisitPhotoMetadata; requestFingerprint?: string; storedSha256?: string;
};
export type CachedRepairPreviousVisit = {
  cacheKey: string; customerId: string; siteId: string; createdByUserId: number;
  previousVisit: RepairVisitPrevious | null; visitNumber: string | null; visitDate: string | null;
  configurationRevisionId: string; fields: Array<{
    identity: RepairVisitFieldIdentity; systemLabel: string; unitLabel: string; sectionLabel: string; fieldLabel: string;
    before: RepairVisitBeforeSnapshot | null;
  }>; fetchedAt: string; expiresAt: string;
};
export type CachedRepairBeforePhoto = {
  cacheKey: string; previousVisit: RepairVisitPrevious; photoUuid: string; storedSha256: string; blob: Blob; fetchedAt: string;
};

// ---- 4A additions: write-API request bodies and receipts (mirror apps/api repairVisitWriteContract). ----
export type RepairVisitCreateRequest = {
  clientUuid: string; customerId: string; siteId: string; configurationRevisionId: string;
  /** null = created while online: the server supplies the visit day and instant (plan A7). */
  deviceCreatedAt: string | null; visitDate: string; arrivalTime: string; serviceCallNumber: string | null;
  previousVisit: RepairVisitPrevious | null; items: Array<{ clientUuid: string; identity: RepairVisitFieldIdentity }>;
};
export type RepairVisitPhotoMetadata = {
  photoUuid: string; itemUuid: string; revision: number; sourceSha256: string; sizeBytes: number; width: number; height: number;
  captureSource: "camera" | "gallery" | "unknown"; capturedAt: string;
};
export type RepairVisitSubmitBody = {
  operationUuid: string; expectedRevision: number; revision: number;
  items: Array<{ clientUuid: string; identity: RepairVisitFieldIdentity; outcome: RepairVisitOutcome; remark: string; photoUuid: string; sourceSha256: string }>;
};
export type RepairVisitCreateReceipt = {
  clientUuid: string; visitNumber: string; configurationRevisionId: string; deviceCreatedAt: string;
  visitDate: string; arrivalTime: string; requestFingerprint: string;
};
export type RepairVisitPhotoReceipt = {
  photoUuid: string; clientUuid: string; itemUuid: string; revision: number; requestFingerprint: string; sourceSha256: string; storedSha256: string;
};
export type RepairVisitEventReceipt = {
  operationUuid: string; clientUuid: string; revision: number; event: "submitted" | "resubmitted" | "returned" | "approved";
  requestFingerprint: string; occurredAt: string;
};
/** One approved visit the technician may pick as "previous visit" (apps/api previousVisits.ts). */
export type RepairPreviousVisitListItem = RepairVisitPrevious & { visitNumber: string; visitDate: string; createdAt: string; createdByUserId: number };
export type RepairCatalogField = CachedRepairPreviousVisit["fields"][number];
export type RepairVisitOutboxPayload =
  | { kind: "create"; request: RepairVisitCreateRequest; fingerprint: string }
  | { kind: "submit"; body: RepairVisitSubmitBody; fingerprint: string }
  | { kind: "photo"; visitUuid: string; metadata: RepairVisitPhotoMetadata; fingerprint: string };
