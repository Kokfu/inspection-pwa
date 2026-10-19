import { currentWorkspaceUserId } from "../db/localDatabase";
import { isGatewayUnreachableStatus, ServerUnreachableError } from "../jobs/serverReachability";
import {
  parseCreateReceipt, parseCurrentCatalog, parseEventReceipt, parsePhotoReceipt, parsePreviousCatalog, parsePreviousVisitList,
  parseVisitDetail, parseVisitList
} from "./repairVisitParsers";
import type {
  RepairVisitCreateRequest, RepairVisitPhotoMetadata, RepairVisitPrevious, RepairVisitSubmitBody
} from "./repairVisitTypes";

const requestTimeoutMs = 30_000;

/** A definite answer from the server. `code` is the machine-readable refusal (for example CONFIGURATION_CHANGED). */
export class RepairVisitApiError extends Error {
  readonly status: number; readonly code: string | undefined;
  constructor(status: number, code: string | undefined, message: string) {
    super(message); this.name = "RepairVisitApiError"; this.status = status; this.code = code;
  }
}

const refusalText: Record<string, string> = {
  CONFIGURATION_CHANGED: "This customer's setup changed on the server after it was downloaded. Reconnect, refresh, then create the repair visit again.",
  SITE_INACTIVE: "This site is no longer active on the server.",
  CUSTOMER_INACTIVE: "This customer is no longer active on the server.",
  CUSTOMER_NOT_FOUND: "This customer was not found on the server.",
  DEVICE_DATE_OUT_OF_WINDOW: "This device's date is more than a day ahead or 30 days behind the server. Correct the device clock, then retry.",
  DEVICE_DATE_MISMATCH: "This device's date and time do not agree. Correct the device clock, then retry.",
  FIELD_NOT_AVAILABLE: "A selected field is no longer available on the server. Edit the visit and remove it.",
  REPAIR_VISIT_NOT_FOUND: "The previous visit is no longer available (it must be approved and yours).",
  IDENTITY_MISMATCH: "A different technician is signed in. Sign in as the visit's owner to sync it.",
  FORBIDDEN: "The server does not allow this account to do that.",
  VISIT_LOCKED: "The server has already locked this repair visit.",
  STALE_REVISION: "The server has a newer revision of this repair visit. Refresh to load it.",
  VISIT_DELETED: "This repair visit was deleted on the server.",
  IDEMPOTENCY_CONFLICT: "The server already holds different content under this ID.",
  EVIDENCE_NOT_STAGED: "The server does not hold a current photo for a field. Use Edit and submit again, then Replace photo on the fields you sent before.",
  DUPLICATE_ITEM_EVIDENCE: "The same photo was used for two fields of one system. Take a separate photo for each field.",
  INVALID_PHOTO: "The server could not read a photo. Take it again."
};
export function refusalMessage(code: string | undefined, serverMessage: string | undefined) {
  const known = code ? refusalText[code] : undefined;
  return known ?? (serverMessage && serverMessage.trim() ? serverMessage.trim() : "The server refused this repair visit.");
}

async function rvFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const actorId = currentWorkspaceUserId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`/api/repair-visits${path}`, {
      ...init, credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: { ...(init.headers as Record<string, string> | undefined), ...(actorId === undefined ? {} : { "X-Expected-User-Id": String(actorId) }) }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new ServerUnreachableError("The server did not answer in time.", 0);
    throw error;
  } finally { clearTimeout(timer); }
  if (isGatewayUnreachableStatus(response.status)) throw new ServerUnreachableError("The server is not answering.", response.status);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const code = typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : undefined;
    const message = typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string" ? (body as { message: string }).message : undefined;
    throw new RepairVisitApiError(response.status, code, refusalMessage(code, message));
  }
  return response;
}
const json = async (response: Response): Promise<unknown> => response.json().catch(() => { throw new RepairVisitApiError(response.status, undefined, "The server sent an unreadable answer."); });
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const site = (customerId: string, siteId: string) => `/customers/${encodeURIComponent(customerId)}/sites/${encodeURIComponent(siteId)}`;
const previousPath = (previous: RepairVisitPrevious) => `/previous-visits/${previous.kind}/${encodeURIComponent(previous.visitId)}`;

// ---- Reads (2B) ----
export async function fetchPreviousVisits(customerId: string, siteId: string) {
  return parsePreviousVisitList(await json(await rvFetch(`${site(customerId, siteId)}/previous-visits`)));
}
export async function fetchCurrentCatalog(customerId: string, siteId: string) {
  return parseCurrentCatalog(await json(await rvFetch(`${site(customerId, siteId)}/catalog`)));
}
export async function fetchPreviousCatalog(customerId: string, siteId: string, previous: RepairVisitPrevious) {
  return parsePreviousCatalog(await json(await rvFetch(`${site(customerId, siteId)}${previousPath(previous)}/catalog`)));
}
export async function fetchBeforePhoto(customerId: string, siteId: string, previous: RepairVisitPrevious, photoUuid: string) {
  return (await rvFetch(`${site(customerId, siteId)}${previousPath(previous)}/photos/${encodeURIComponent(photoUuid)}/content`)).blob();
}

// ---- Writes (3A) ----
export async function postCreate(request: RepairVisitCreateRequest) {
  return parseCreateReceipt(await json(await rvFetch("", jsonInit("POST", request))));
}
export async function postPhoto(visitUuid: string, metadata: RepairVisitPhotoMetadata, blob: Blob) {
  const form = new FormData();
  form.append("metadata", JSON.stringify(metadata));
  form.append("file", blob, `${metadata.photoUuid}.jpg`);
  return parsePhotoReceipt(await json(await rvFetch(`/${encodeURIComponent(visitUuid)}/photos`, { method: "POST", body: form })));
}
export async function postSubmit(visitUuid: string, body: RepairVisitSubmitBody) {
  return parseEventReceipt(await json(await rvFetch(`/${encodeURIComponent(visitUuid)}/submit`, jsonInit("POST", body))));
}
export async function sendDelete(visitUuid: string, expectedRevision: number) {
  const body = await json(await rvFetch(`/${encodeURIComponent(visitUuid)}`, jsonInit("DELETE", { expectedRevision })));
  if (typeof body !== "object" || body === null || (body as { clientUuid?: unknown }).clientUuid !== visitUuid || (body as { deleted?: unknown }).deleted !== true) {
    throw new RepairVisitApiError(200, undefined, "The server did not confirm this deletion.");
  }
}

// ---- Authoritative reads (3A) ----
export async function fetchVisitList() { return parseVisitList(await json(await rvFetch(""))); }
export async function fetchVisitDetail(visitUuid: string) { return parseVisitDetail(await json(await rvFetch(`/${encodeURIComponent(visitUuid)}`))); }
export async function fetchAfterPhoto(visitUuid: string, photoUuid: string) {
  return (await rvFetch(`/${encodeURIComponent(visitUuid)}/photos/${encodeURIComponent(photoUuid)}/content`)).blob();
}
/** The final PDF is only available once approved; the caller opens the object URL it gets back. */
export async function fetchFinalReport(visitUuid: string, revision: number) {
  return (await rvFetch(`/${encodeURIComponent(visitUuid)}/revisions/${revision}/report.pdf`)).blob();
}
