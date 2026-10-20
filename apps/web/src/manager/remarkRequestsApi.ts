import { isApprovedSectionRemark, isRemarkRequest, type ApprovedSectionRemark, type RemarkRequest } from "../inspectionControls/remarkRequests";
import { ManagerApiError } from "./managerApi";

/**
 * R3: the Admin/Manager client for the remark-request API (apps/api/src/routes/remarkRequests.ts). Every reply is validated
 * strictly; a malformed one is "unavailable", never a partial list. A decision is terminal on the server, so a decision that
 * fails without a definite answer must be followed by a fresh read of the request (the page does this).
 */
export type LegacyRemark = {
  id: string; customerId: string; customerDisplayName: string; systemKey: string; sectionKey: string; wording: string; active: boolean;
};
export type RemarkRequestListFilter = "pending" | "decided" | "approved" | "rejected" | "all";

/** A refusal with the API's own code (for example DUPLICATE_APPROVED or REMARK_REQUEST_ALREADY_DECIDED). */
export class RemarkRequestApiError extends ManagerApiError {
  constructor(message: string, kind: "authorization" | "domain" | "unavailable", readonly code: string | undefined, readonly status: number) {
    super(message, kind);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const unavailable = (): never => { throw new RemarkRequestApiError("Remark request data is currently unavailable.", "unavailable", undefined, 0); };
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

async function request(path: string, method: "GET" | "POST", body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: "same-origin", cache: "no-store", signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RemarkRequestApiError("Remark requests cannot be verified or refreshed right now.", "unavailable", undefined, 0);
  }
  if (response.status === 401 || response.status === 403) throw new RemarkRequestApiError("Manager access requires a verified Manager or Admin account.", "authorization", undefined, response.status);
  let data: unknown;
  try { data = await response.json(); } catch { throw new RemarkRequestApiError("Remark request data is currently unavailable.", "unavailable", undefined, response.status); }
  if (!isRecord(data)) throw new RemarkRequestApiError("Remark request data is currently unavailable.", "unavailable", undefined, response.status);
  if (!response.ok) {
    const message = typeof data.message === "string" && data.message.trim() ? data.message : "The remark request could not be completed.";
    const code = typeof data.error === "string" ? data.error : undefined;
    if ([400, 404, 409, 422].includes(response.status)) throw new RemarkRequestApiError(message, "domain", code, response.status);
    throw new RemarkRequestApiError("Remark request data is currently unavailable.", "unavailable", code, response.status);
  }
  return data;
}

function requests(value: unknown): RemarkRequest[] {
  if (!Array.isArray(value) || value.length > 2000 || !value.every(isRemarkRequest)
    || new Set(value.map((item) => item.id.toLowerCase())).size !== value.length) unavailable();
  return value as RemarkRequest[];
}

export async function loadRemarkRequests(status: RemarkRequestListFilter, signal?: AbortSignal): Promise<RemarkRequest[]> {
  const data = await request(`/api/manager/remark-requests?status=${encodeURIComponent(status)}`, "GET", undefined, signal);
  if (!hasExactKeys(data, ["requests"])) unavailable();
  const list = requests(data.requests);
  const allowed = status === "all" ? ["pending", "approved", "rejected"] : status === "decided" ? ["approved", "rejected"] : [status];
  if (list.some((item) => !allowed.includes(item.status))) unavailable();
  return list;
}

export async function loadRemarkRequest(id: string, signal?: AbortSignal): Promise<RemarkRequest> {
  const data = await request(`/api/manager/remark-requests/${encodeURIComponent(id)}`, "GET", undefined, signal);
  if (!hasExactKeys(data, ["request"]) || !isRemarkRequest(data.request) || data.request.id.toLowerCase() !== id.toLowerCase()) unavailable();
  return data.request as RemarkRequest;
}

export type RemarkDecisionInput = { decision: "approved"; approvedWording?: string; note?: string } | { decision: "rejected"; note: string };
export async function decideRemarkRequest(id: string, input: RemarkDecisionInput): Promise<RemarkRequest> {
  const data = await request(`/api/manager/remark-requests/${encodeURIComponent(id)}/decision`, "POST", input);
  if (!hasExactKeys(data, ["request"]) || !isRemarkRequest(data.request) || data.request.id.toLowerCase() !== id.toLowerCase()
    || data.request.status !== input.decision) unavailable();
  return data.request as RemarkRequest;
}

function isLegacyRemark(value: unknown): value is LegacyRemark {
  return isRecord(value) && hasExactKeys(value, ["id", "customerId", "customerDisplayName", "systemKey", "sectionKey", "wording", "active"])
    && typeof value.id === "string" && typeof value.customerId === "string" && typeof value.customerDisplayName === "string" && value.customerDisplayName.trim().length > 0
    && typeof value.systemKey === "string" && typeof value.sectionKey === "string" && typeof value.wording === "string" && value.wording.trim().length > 0
    && typeof value.active === "boolean";
}

export type SectionRemarkLists = { approvedRemarks: ApprovedSectionRemark[]; legacyRemarks: LegacyRemark[] };
export async function loadSectionRemarks(signal?: AbortSignal): Promise<SectionRemarkLists> {
  const data = await request("/api/manager/section-remarks", "GET", undefined, signal);
  if (!hasExactKeys(data, ["approvedRemarks", "legacyRemarks"]) || !Array.isArray(data.approvedRemarks) || !Array.isArray(data.legacyRemarks)
    || data.approvedRemarks.length > 5000 || data.legacyRemarks.length > 5000
    || !data.approvedRemarks.every(isApprovedSectionRemark) || !data.legacyRemarks.every(isLegacyRemark)) unavailable();
  const approvedRemarks = data.approvedRemarks as ApprovedSectionRemark[];
  const legacyRemarks = data.legacyRemarks as LegacyRemark[];
  if (new Set(approvedRemarks.map((item) => item.id.toLowerCase())).size !== approvedRemarks.length
    || new Set(legacyRemarks.map((item) => item.id.toLowerCase())).size !== legacyRemarks.length) unavailable();
  return { approvedRemarks, legacyRemarks };
}

async function deactivate(kind: "approved" | "legacy", id: string): Promise<void> {
  const data = await request(`/api/manager/section-remarks/${kind}/${encodeURIComponent(id)}/deactivate`, "POST", {});
  const remark = data.remark;
  if (!hasExactKeys(data, ["remark"]) || !isRecord(remark) || !hasExactKeys(remark, ["id", "active"])
    || typeof remark.id !== "string" || remark.id.toLowerCase() !== id.toLowerCase() || remark.active !== false) unavailable();
}
export const deactivateApprovedRemark = (id: string) => deactivate("approved", id);
export const deactivateLegacyRemark = (id: string) => deactivate("legacy", id);

/** The count the Approvals hub shows on the Remark requests card. */
export async function loadPendingRemarkRequestCount(signal?: AbortSignal): Promise<number> {
  return (await loadRemarkRequests("pending", signal)).length;
}
