import {
  parseRepairVisit, parseRepairVisitEvent, parseRepairVisitItem, rvEnum, rvKeys, rvObject, rvPositive, rvTimestamp, rvUuid,
  type RepairVisit, type RepairVisitEvent, type RepairVisitItem
} from "../repairVisits/repairVisitTypes";

/** Online-only Admin/Manager client for the 3A repair visit API (apps/api/src/repairVisits/repairVisitWriteApi.md). */
export type RepairVisitsApiErrorKind = "authorization" | "domain" | "unavailable";

export class RepairVisitsApiError extends Error {
  constructor(message: string, public readonly kind: RepairVisitsApiErrorKind, public readonly code: string | null = null) {
    super(message);
  }
}

export type RepairVisitPhotoSource = { photoUuid: string; captureSource: "camera" | "gallery" | "unknown"; capturedAt: string };
export type RepairVisitDetail = { visit: RepairVisit; items: RepairVisitItem[]; events: RepairVisitEvent[]; photoSources: RepairVisitPhotoSource[] };

function parsePhotoSource(value: unknown): RepairVisitPhotoSource {
  if (!rvObject(value) || !rvKeys(value, ["photoUuid", "captureSource", "capturedAt"]) || !rvUuid(value.photoUuid)
    || !rvEnum(value.captureSource, ["camera", "gallery", "unknown"]) || !rvTimestamp(value.capturedAt)) return unavailable();
  return value as RepairVisitPhotoSource;
}
export type RepairVisitDecisionReceipt = {
  operationUuid: string; clientUuid: string; revision: number; event: "returned" | "approved";
  reportNumber: string | null;
};

const unavailableMessage = "Repair visit data is currently unavailable. Check the connection and try again.";
const unavailable = (): never => { throw new RepairVisitsApiError(unavailableMessage, "unavailable"); };
const enc = encodeURIComponent;

const domainMessages: Record<string, string> = {
  STALE_REVISION: "This repair visit changed since you opened it. Refresh to see the latest version.",
  VISIT_NOT_AWAITING_APPROVAL: "This repair visit is no longer awaiting approval.",
  VISIT_LOCKED: "This repair visit is already approved and locked.",
  FINAL_REPORT_UNAVAILABLE: "The final report is not available for this repair visit.",
  IDEMPOTENCY_CONFLICT: "This decision conflicts with an earlier request. Refresh and try again.",
  WRITE_CONFLICT: "Another change was made at the same time. Refresh and try again.",
  REPAIR_VISIT_NOT_FOUND: "This repair visit could not be found.",
  INVALID_REPAIR_VISIT_REQUEST: "The request was not accepted. Check the details and try again."
};

async function failure(response: Response): Promise<never> {
  if (response.status === 401 || response.status === 403) {
    throw new RepairVisitsApiError("Manager access requires a verified Admin or Manager account.", "authorization");
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* non-JSON error body */ }
  if (![400, 404, 409, 422].includes(response.status) || !rvObject(body) || typeof body.error !== "string") return unavailable();
  const message = domainMessages[body.error] ?? (typeof body.message === "string" && body.message ? body.message : "The request could not be completed.");
  throw new RepairVisitsApiError(message, "domain", body.error);
}

async function send(path: string, method: "GET" | "POST", body?: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: "same-origin", cache: "no-store", signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return unavailable();
  }
  if (!response.ok) return failure(response);
  return response;
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return unavailable(); }
}

function parseOrUnavailable<T>(parse: (value: unknown) => T, value: unknown): T {
  try { return parse(value); } catch { return unavailable(); }
}

export async function loadRepairVisits(signal?: AbortSignal): Promise<RepairVisit[]> {
  const body = await json(await send("/api/repair-visits", "GET", undefined, signal));
  if (!rvObject(body) || !Array.isArray(body.visits)) return unavailable();
  return body.visits.map(visit => parseOrUnavailable(parseRepairVisit, visit));
}

export async function loadRepairVisit(visitId: string, signal?: AbortSignal): Promise<RepairVisitDetail> {
  const body = await json(await send(`/api/repair-visits/${enc(visitId)}`, "GET", undefined, signal));
  if (!rvObject(body) || !rvKeys(body, ["visit", "items", "events", "photoSources"]) || !Array.isArray(body.items) || !Array.isArray(body.events) || !Array.isArray(body.photoSources)) return unavailable();
  const detail: RepairVisitDetail = {
    visit: parseOrUnavailable(parseRepairVisit, body.visit),
    items: body.items.map(item => parseOrUnavailable(parseRepairVisitItem, item)),
    events: body.events.map(event => parseOrUnavailable(parseRepairVisitEvent, event)),
    photoSources: body.photoSources.map(parsePhotoSource)
  };
  const sourceIds = new Set(detail.photoSources.map(source => source.photoUuid));
  if (sourceIds.size !== detail.photoSources.length || detail.items.some(item => item.photoUuid !== null && !sourceIds.has(item.photoUuid))) return unavailable();
  // Fail closed: the server must answer for exactly the visit that was asked for.
  if (detail.visit.clientUuid !== visitId || detail.items.some(item => item.visitUuid !== visitId) || detail.events.some(event => event.visitUuid !== visitId)) return unavailable();
  return detail;
}

function parseDecisionReceipt(value: unknown, expected: { operationUuid: string; visitId: string; event: "returned" | "approved" }): RepairVisitDecisionReceipt {
  const approved = expected.event === "approved";
  if (!rvObject(value) || !rvKeys(value, approved ? ["operationUuid", "clientUuid", "revision", "event", "requestFingerprint", "occurredAt", "reportNumber"]
    : ["operationUuid", "clientUuid", "revision", "event", "requestFingerprint", "occurredAt"])) return unavailable();
  // Success is the exact UUID and event being confirmed; HTTP 200 alone proves nothing.
  if (!rvUuid(value.operationUuid) || value.operationUuid !== expected.operationUuid || value.clientUuid !== expected.visitId
    || !rvPositive(value.revision) || !rvEnum(value.event, ["returned", "approved"]) || value.event !== expected.event) return unavailable();
  let reportNumber: string | null = null;
  if (approved) {
    if (typeof value.reportNumber !== "string" || !/^MFE\/RR\/[0-9]{4}\/[0-9]{4,}$/.test(value.reportNumber)) return unavailable();
    reportNumber = value.reportNumber;
  }
  return { operationUuid: value.operationUuid, clientUuid: value.clientUuid, revision: value.revision, event: expected.event, reportNumber };
}

export async function returnRepairVisit(visitId: string, input: { operationUuid: string; expectedRevision: number; reason: string }): Promise<RepairVisitDecisionReceipt> {
  const body = await json(await send(`/api/repair-visits/${enc(visitId)}/return`, "POST", input));
  return parseDecisionReceipt(body, { operationUuid: input.operationUuid, visitId, event: "returned" });
}

export async function approveRepairVisit(visitId: string, input: { operationUuid: string; expectedRevision: number }): Promise<RepairVisitDecisionReceipt> {
  const body = await json(await send(`/api/repair-visits/${enc(visitId)}/approve`, "POST", input));
  return parseDecisionReceipt(body, { operationUuid: input.operationUuid, visitId, event: "approved" });
}

/** "preview" is only served while awaiting approval (watermarked); "final" only after approval. */
export type RepairVisitPdfKind = "preview" | "final";

export async function fetchRepairVisitPdf(visitId: string, revision: number, kind: RepairVisitPdfKind, signal?: AbortSignal): Promise<Blob> {
  const file = kind === "preview" ? "preview.pdf" : "report.pdf";
  const response = await send(`/api/repair-visits/${enc(visitId)}/revisions/${revision}/${file}`, "GET", undefined, signal);
  if (!(response.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/pdf")) return unavailable();
  let blob: Blob;
  try { blob = await response.blob(); } catch { return unavailable(); }
  if (blob.size === 0) return unavailable();
  return blob;
}

/** Authorised same-origin image URLs; the server verifies bytes and role on every request. */
export const repairVisitAfterPhotoUrl = (visitId: string, photoUuid: string) =>
  `/api/repair-visits/${enc(visitId)}/photos/${enc(photoUuid)}/content`;
export const repairVisitBeforePhotoUrl = (customerId: string, siteId: string, previous: { kind: "service" | "repair"; visitId: string }, photoUuid: string) =>
  `/api/repair-visits/customers/${enc(customerId)}/sites/${enc(siteId)}/previous-visits/${previous.kind}/${enc(previous.visitId)}/photos/${enc(photoUuid)}/content`;
