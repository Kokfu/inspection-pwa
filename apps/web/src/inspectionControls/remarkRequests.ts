import { currentWorkspaceUserId, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { commentsSectionKey, isSectionRemarkKey, isSectionRemarkSystemKey, type SectionRemarkSystemKey } from "./remarkSections";
import { normaliseSectionRemarkWording, sectionRemarkCompareKey } from "./sectionRemarkText";

/**
 * R3: "Add to common remarks" on a Sprinkler checklist / measurement row creates a REMARK REQUEST for that service + section.
 * The wording stays in the visit row exactly as typed; the request only asks an Admin/Manager to offer it in that section for
 * every customer. This module owns the device side:
 *   - `remark-requests:local`  (referenceData): this device's requests that the server has not confirmed yet;
 *   - `remark-requests:own`    (referenceData): the server's read-back of the signed-in technician's requests (decisions + notes);
 *   - `service-approved-section-remarks:<systemKey>` (referenceData): the approved, active choices every customer is offered;
 *   - one `remarkRequest` outbox item per request (client UUID = outbox entity id = server request id).
 * The local entry and the outbox item are written in ONE Dexie transaction, so a request can never be shown without being queued.
 * No Dexie schema change: `referenceData` and `syncOutbox` already exist. A pending request is never offered as a choice.
 */
const maxCachedItems = 2000;
const maxApprovedWordingLength = 300;
const changedEvent = "remark-requests-changed";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const approvedSectionRemarksCacheKey = (systemKey: string) => `service-approved-section-remarks:${systemKey}`;
export const ownRemarkRequestsCacheKey = "remark-requests:own";
export const localRemarkRequestsCacheKey = "remark-requests:local";

export type RemarkRequestStatus = "pending" | "approved" | "rejected";
export type RemarkRequestDecision = {
  id: string; decision: "approved" | "rejected"; reviewerUserId: number; reviewer: string;
  reviewerRole: "admin" | "supervisor"; note: string | null; approvedWording: string | null; createdAt: string;
};
export type RemarkRequest = {
  id: string; systemKey: SectionRemarkSystemKey; sectionKey: string; wording: string;
  customerId: string; customerDisplayName: string; jobId: string | null; jobReference: string | null;
  requestedByUserId: number; requestedBy: string; createdAt: string;
  status: RemarkRequestStatus; decision: RemarkRequestDecision | null;
};
export type ApprovedSectionRemark = {
  id: string; systemKey: SectionRemarkSystemKey; sectionKey: string; wording: string; active: boolean; sourceRequestId: string;
};
/** A request that exists on this device and has not been confirmed by the server yet. */
export type LocalRemarkRequest = {
  id: string; customerId: string; systemKey: SectionRemarkSystemKey; sectionKey: string; wording: string; createdAt: string; jobId?: string;
};

/** A refusal the technician can read, raised before anything is stored. */
export class RemarkRequestInputError extends Error {
  constructor(readonly code: "INVALID" | "DUPLICATE_CATALOG" | "DUPLICATE_APPROVED" | "DUPLICATE_PENDING", message: string) { super(message); }
}
/** The server's reply did not confirm the exact request that was sent (HTTP 200 alone is never enough). */
export class RemarkRequestNotConfirmedError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const isInstant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const isNullableText = (value: unknown, max: number) => value === null || (typeof value === "string" && value.length <= max);
const isWording = (value: unknown): value is string => {
  const text = normaliseSectionRemarkWording(value);
  return text.ok && text.wording === value;
};

/** Sprinkler checklist / measurement rows only: the Comments box is not part of the request flow. */
export function isRequestableSection(systemKey: unknown, sectionKey: unknown): sectionKey is string {
  return isSectionRemarkSystemKey(systemKey) && sectionKey !== commentsSectionKey && isSectionRemarkKey(systemKey, sectionKey);
}

function isDecision(value: unknown): value is RemarkRequestDecision {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "decision", "reviewerUserId", "reviewer", "reviewerRole", "note", "approvedWording", "createdAt"])) return false;
  return isUuid(value.id) && (value.decision === "approved" || value.decision === "rejected")
    && Number.isSafeInteger(value.reviewerUserId) && Number(value.reviewerUserId) > 0 && isText(value.reviewer, 300)
    && (value.reviewerRole === "admin" || value.reviewerRole === "supervisor") && isNullableText(value.note, 500)
    && (value.approvedWording === null || isWording(value.approvedWording)) && isInstant(value.createdAt)
    && (value.decision === "approved" || (value.approvedWording === null && typeof value.note === "string" && value.note.trim().length > 0));
}

export function isRemarkRequest(value: unknown): value is RemarkRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "systemKey", "sectionKey", "wording", "customerId", "customerDisplayName", "jobId", "jobReference",
    "requestedByUserId", "requestedBy", "createdAt", "status", "decision"])) return false;
  if (!isUuid(value.id) || !isUuid(value.customerId) || !isRequestableSection(value.systemKey, value.sectionKey) || !isWording(value.wording)) return false;
  if (!isText(value.customerDisplayName, 500) || !(value.jobId === null || isUuid(value.jobId)) || !isNullableText(value.jobReference, 200)) return false;
  if (!Number.isSafeInteger(value.requestedByUserId) || Number(value.requestedByUserId) <= 0 || !isText(value.requestedBy, 300) || !isInstant(value.createdAt)) return false;
  if (value.status !== "pending" && value.status !== "approved" && value.status !== "rejected") return false;
  if (value.status === "pending") return value.decision === null;
  return isDecision(value.decision) && value.decision.decision === value.status;
}

/** Strict: any malformed element, an over-size list or a repeated id rejects the WHOLE list (fail closed). */
export function parseRemarkRequests(value: unknown): RemarkRequest[] {
  if (!Array.isArray(value) || value.length > maxCachedItems || !value.every(isRemarkRequest)
    || new Set(value.map((request) => request.id.toLowerCase())).size !== value.length) {
    throw new Error("Remark requests are malformed");
  }
  return value as RemarkRequest[];
}

export function isApprovedSectionRemark(value: unknown): value is ApprovedSectionRemark {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "systemKey", "sectionKey", "wording", "active", "sourceRequestId"])) return false;
  return isUuid(value.id) && isRequestableSection(value.systemKey, value.sectionKey) && isWording(value.wording)
    && [...String(value.wording)].length <= maxApprovedWordingLength && typeof value.active === "boolean" && isUuid(value.sourceRequestId);
}

/**
 * The technician list: ACTIVE choices of one system only. A foreign system, an inactive row, a repeated id or a repeated
 * section + wording rejects the whole list, so a half-trusted reply can never reach a dropdown.
 */
export function parseApprovedSectionRemarks(value: unknown, systemKey: string): ApprovedSectionRemark[] {
  if (!Array.isArray(value) || value.length > maxCachedItems || !value.every(isApprovedSectionRemark)
    || value.some((remark) => remark.systemKey !== systemKey || !remark.active)
    || new Set(value.map((remark) => remark.id.toLowerCase())).size !== value.length
    || new Set(value.map((remark) => JSON.stringify([remark.sectionKey, sectionRemarkCompareKey(remark.wording)]))).size !== value.length) {
    throw new Error("Approved section remarks are malformed");
  }
  return value as ApprovedSectionRemark[];
}

/** The approved remarks one row offers: its own section, every customer. */
export function approvedChoicesForSection(all: readonly ApprovedSectionRemark[], systemKey: string, sectionKey: string): ApprovedSectionRemark[] {
  return all.filter((remark) => remark.systemKey === systemKey && remark.sectionKey === sectionKey && remark.active);
}

function parseLocalRequest(value: unknown): LocalRemarkRequest | undefined {
  if (!isRecord(value)) return undefined;
  const { jobId, ...rest } = value;
  if (jobId !== undefined && !isUuid(jobId)) return undefined;
  if (!hasExactKeys(rest, ["id", "customerId", "systemKey", "sectionKey", "wording", "createdAt"])) return undefined;
  if (!isUuid(rest.id) || !isUuid(rest.customerId) || !isRequestableSection(rest.systemKey, rest.sectionKey) || !isWording(rest.wording) || !isInstant(rest.createdAt)) return undefined;
  return { ...(rest as Omit<LocalRemarkRequest, "jobId">), ...(jobId === undefined ? {} : { jobId }) };
}

export function parseLocalRemarkRequests(value: unknown): LocalRemarkRequest[] {
  if (!Array.isArray(value) || value.length > maxCachedItems) throw new Error("Local remark requests are malformed");
  const parsed = value.map(parseLocalRequest);
  if (parsed.some((item) => item === undefined) || new Set(parsed.map((item) => item!.id.toLowerCase())).size !== parsed.length) throw new Error("Local remark requests are malformed");
  return parsed as LocalRemarkRequest[];
}

export function parseRemarkRequestOutboxPayload(value: unknown, entityId: string): LocalRemarkRequest | undefined {
  const request = parseLocalRequest(value);
  return request && request.id === entityId ? request : undefined;
}

export type RemarkRequestConfirmation = { request: RemarkRequest; duplicate: boolean };

/**
 * The only way a queued request becomes Completed. The reply must echo the exact UUID that was sent and carry a valid
 * request for the same customer + system + section + wording (+ visit); anything else is "not confirmed".
 */
export function parseRemarkRequestConfirmation(body: unknown, sent: LocalRemarkRequest): RemarkRequestConfirmation {
  const fail = (reason: string) => new RemarkRequestNotConfirmedError(`The server did not confirm this request (${reason}).`);
  if (!isRecord(body)) throw fail("no reply body");
  if (body.requestedId !== sent.id) throw fail("it named a different request id");
  if (!hasExactKeys(body, ["requestedId", "duplicate", "request"]) || typeof body.duplicate !== "boolean") throw fail("unexpected reply shape");
  const request = body.request;
  if (!isRemarkRequest(request)) throw fail("the request was malformed");
  if (request.id.toLowerCase() !== sent.id.toLowerCase() || request.customerId.toLowerCase() !== sent.customerId.toLowerCase()
    || request.systemKey !== sent.systemKey || request.sectionKey !== sent.sectionKey || request.wording !== sent.wording
    || (request.jobId?.toLowerCase() ?? null) !== (sent.jobId?.toLowerCase() ?? null)) throw fail("it described different content");
  return { request, duplicate: body.duplicate };
}

function announce() { window.dispatchEvent(new Event(changedEvent)); }
/** The sync engine calls this after a send attempt so an open row / read-back re-reads the delivery state. */
export function announceRemarkRequestsChanged() { announce(); }
/** The server's reason when it definitely refused this request (for example a duplicate); undefined otherwise. */
export async function remarkRequestRefusal(id: string): Promise<string | undefined> {
  const items = await localDatabase.syncOutbox.where("entityId").equals(id).toArray();
  const failed = items.find((item) => item.entityType === "remarkRequest" && item.status === "Failed");
  return failed ? failed.lastError ?? "The server did not accept this request." : undefined;
}
export function onRemarkRequestsChanged(listener: () => void) {
  window.addEventListener(changedEvent, listener);
  return () => window.removeEventListener(changedEvent, listener);
}

async function writeCache(key: string, payload: unknown) {
  const at = new Date().toISOString();
  await localDatabase.referenceData.put({ key, payload, version: at, fetchedAt: at, expiresAt: at });
}

/** The cached approved choices of one system ([] when never fetched). Throws when the stored list is malformed. */
export async function cachedApprovedSectionRemarks(systemKey: string): Promise<ApprovedSectionRemark[]> {
  const stored = await localDatabase.referenceData.get(approvedSectionRemarksCacheKey(systemKey));
  return stored ? parseApprovedSectionRemarks(stored.payload, systemKey) : [];
}
export async function cachedOwnRemarkRequests(): Promise<RemarkRequest[]> {
  const stored = await localDatabase.referenceData.get(ownRemarkRequestsCacheKey);
  return stored ? parseRemarkRequests(stored.payload) : [];
}
export async function cachedLocalRemarkRequests(): Promise<LocalRemarkRequest[]> {
  const stored = await localDatabase.referenceData.get(localRemarkRequestsCacheKey);
  return stored ? parseLocalRemarkRequests(stored.payload) : [];
}

/**
 * Fetch the approved choices for a system. A failed or malformed reply throws and leaves the previous cache exactly as it
 * was (never a silent fall back to an emptied list, never a half-trusted list).
 */
export async function refreshApprovedSectionRemarks(systemKey: SectionRemarkSystemKey): Promise<ApprovedSectionRemark[]> {
  const response = await fetch(`/api/systems/${encodeURIComponent(systemKey)}/approved-section-remarks`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Approved section remarks could not be refreshed");
  const body: unknown = await response.json();
  if (!isRecord(body) || !hasExactKeys(body, ["remarks"])) throw new Error("Approved section remarks response is malformed");
  const remarks = parseApprovedSectionRemarks(body.remarks, systemKey);
  await writeCache(approvedSectionRemarksCacheKey(systemKey), remarks);
  announce();
  return remarks;
}

/** The signed-in technician's own requests with their decisions and notes. Keeps the last good cache on any failure. */
export async function refreshOwnRemarkRequests(): Promise<RemarkRequest[]> {
  const response = await fetch("/api/technician/remark-requests", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Remark requests could not be refreshed");
  const body: unknown = await response.json();
  if (!isRecord(body) || !hasExactKeys(body, ["requests"])) throw new Error("Remark requests response is malformed");
  const requests = parseRemarkRequests(body.requests);
  const owner = currentWorkspaceUserId();
  if (owner !== undefined && requests.some((request) => request.requestedByUserId !== owner)) throw new Error("Remark request ownership could not be verified");
  await writeCache(ownRemarkRequestsCacheKey, requests);
  announce();
  return requests;
}

export type CreateRemarkRequestInput = {
  customerId: string;
  systemKey: SectionRemarkSystemKey;
  sectionKey: string;
  wording: string;
  jobId?: string;
  /** Wordings the section already offers from the service's system-wide list (case-insensitive duplicates). */
  catalogWordings?: readonly string[];
};

/**
 * Create a remark request on this device: validate, refuse an obvious duplicate, then write the local entry AND the outbox
 * item in one transaction. Never consults navigator.onLine. The server stays the authority on duplicates.
 */
export async function createRemarkRequest(input: CreateRemarkRequestInput): Promise<LocalRemarkRequest> {
  const customerId = input.customerId.toLowerCase();
  if (!isUuid(customerId) || !isRequestableSection(input.systemKey, input.sectionKey)) {
    throw new RemarkRequestInputError("INVALID", "This row cannot take a remark request.");
  }
  if (input.jobId !== undefined && !isUuid(input.jobId)) throw new RemarkRequestInputError("INVALID", "This row cannot take a remark request.");
  const text = normaliseSectionRemarkWording(input.wording);
  if (!text.ok) throw new RemarkRequestInputError("INVALID", text.message);
  const key = sectionRemarkCompareKey(text.wording);
  if ((input.catalogWordings ?? []).some((wording) => sectionRemarkCompareKey(wording.trim()) === key)) {
    throw new RemarkRequestInputError("DUPLICATE_CATALOG", "That remark is already in the standard remarks for this service. Choose it from the list.");
  }
  const request: LocalRemarkRequest = {
    id: crypto.randomUUID(), customerId, systemKey: input.systemKey, sectionKey: input.sectionKey, wording: text.wording,
    createdAt: new Date().toISOString(), ...(input.jobId === undefined ? {} : { jobId: input.jobId })
  };
  const operation: SyncOutboxItem = {
    operationId: crypto.randomUUID(), entityType: "remarkRequest", entityId: request.id, action: "create", payload: request,
    createdAt: request.createdAt, attempts: 0, status: "Pending", activeKey: `remarkRequest:create:${request.id}`
  };
  await localDatabase.transaction("rw", localDatabase.referenceData, localDatabase.syncOutbox, async () => {
    const approved = await cachedApprovedSectionRemarks(request.systemKey).catch(() => [] as ApprovedSectionRemark[]);
    if (approvedChoicesForSection(approved, request.systemKey, request.sectionKey).some((item) => sectionRemarkCompareKey(item.wording) === key)) {
      throw new RemarkRequestInputError("DUPLICATE_APPROVED", "That remark is already approved for this row. Choose it from the list.");
    }
    const local = await cachedLocalRemarkRequests().catch(() => [] as LocalRemarkRequest[]);
    const own = await cachedOwnRemarkRequests().catch(() => [] as RemarkRequest[]);
    const waiting = local.some((item) => item.systemKey === request.systemKey && item.sectionKey === request.sectionKey && sectionRemarkCompareKey(item.wording) === key)
      || own.some((item) => item.status === "pending" && item.systemKey === request.systemKey && item.sectionKey === request.sectionKey && sectionRemarkCompareKey(item.wording) === key);
    if (waiting) throw new RemarkRequestInputError("DUPLICATE_PENDING", "A request for that remark is already waiting for approval.");
    await writeCache(localRemarkRequestsCacheKey, [...local, request]);
    await localDatabase.syncOutbox.put(operation);
  });
  announce();
  return request;
}

/**
 * Called by the sync engine once the server has confirmed the exact UUID: the outbox item is Completed, the local entry is
 * replaced by the server's request in the own-requests cache - together.
 */
export async function completeRemarkRequest(operationId: string, sent: LocalRemarkRequest, confirmation: RemarkRequestConfirmation) {
  await localDatabase.transaction("rw", localDatabase.referenceData, localDatabase.syncOutbox, async () => {
    const local = await cachedLocalRemarkRequests().catch(() => undefined);
    if (local) await writeCache(localRemarkRequestsCacheKey, local.filter((item) => item.id.toLowerCase() !== sent.id.toLowerCase()));
    const own = await cachedOwnRemarkRequests().catch(() => undefined);
    if (own) await writeCache(ownRemarkRequestsCacheKey, [confirmation.request, ...own.filter((item) => item.id.toLowerCase() !== sent.id.toLowerCase())]);
    await localDatabase.syncOutbox.update(operationId, { status: "Completed", activeKey: undefined, completedAt: new Date().toISOString(), lastError: undefined });
  });
  announce();
}

/** Remove a request the server definitely refused (the technician confirmed): its local entry and its Failed outbox item. */
export async function discardRefusedRemarkRequest(id: string) {
  await localDatabase.transaction("rw", localDatabase.referenceData, localDatabase.syncOutbox, async () => {
    const items = await localDatabase.syncOutbox.where("entityId").equals(id).toArray();
    const failed = items.filter((item) => item.entityType === "remarkRequest" && item.status === "Failed");
    if (failed.length === 0) return;
    const local = await cachedLocalRemarkRequests().catch(() => undefined);
    if (local) await writeCache(localRemarkRequestsCacheKey, local.filter((item) => item.id.toLowerCase() !== id.toLowerCase()));
    for (const item of failed) await localDatabase.syncOutbox.delete(item.operationId);
  });
  announce();
}

export type RemarkRequestRowState = "waiting" | "sending" | "failed" | "pending" | "approved" | "rejected";
export type RemarkRequestRow = {
  id: string; sectionKey: string; wording: string; createdAt: string; state: RemarkRequestRowState;
  note: string | null; approvedWording: string | null; reviewerRole: "admin" | "supervisor" | null; decidedAt: string | null;
  jobReference: string | null; error: string | null;
};

/**
 * What the technician is told about their requests for one customer + service: the server's read-back (decisions and notes)
 * plus this device's unconfirmed requests with their delivery state. Throws when a cache is malformed (fail closed).
 */
export async function loadRemarkRequestRows(customerId: string, systemKey: SectionRemarkSystemKey): Promise<RemarkRequestRow[]> {
  const customer = customerId.toLowerCase();
  const [own, local, outbox] = await Promise.all([
    cachedOwnRemarkRequests(), cachedLocalRemarkRequests(), localDatabase.syncOutbox.where("entityType").equals("remarkRequest").toArray()
  ]);
  const rows: RemarkRequestRow[] = own.filter((item) => item.customerId.toLowerCase() === customer && item.systemKey === systemKey).map((item) => ({
    id: item.id, sectionKey: item.sectionKey, wording: item.wording, createdAt: item.createdAt, state: item.status,
    note: item.decision?.note ?? null, approvedWording: item.decision?.approvedWording ?? null, reviewerRole: item.decision?.reviewerRole ?? null,
    decidedAt: item.decision?.createdAt ?? null, jobReference: item.jobReference, error: null
  }));
  const known = new Set(rows.map((row) => row.id.toLowerCase()));
  for (const item of local) {
    if (item.customerId.toLowerCase() !== customer || item.systemKey !== systemKey || known.has(item.id.toLowerCase())) continue;
    const work = outbox.find((candidate) => candidate.entityId === item.id);
    rows.push({
      id: item.id, sectionKey: item.sectionKey, wording: item.wording, createdAt: item.createdAt,
      state: work?.status === "Failed" ? "failed" : work?.status === "Syncing" ? "sending" : work?.status === "Completed" ? "pending" : "waiting",
      note: null, approvedWording: null, reviewerRole: null, decidedAt: null, jobReference: null, error: work?.status === "Failed" ? work.lastError ?? "The server did not accept this request." : null
    });
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
