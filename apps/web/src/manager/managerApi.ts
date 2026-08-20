import type { JobCompletion } from "../jobs/jobTypes";

export class ManagerApiError extends Error {
  constructor(
    message: string,
    public readonly kind: "authorization" | "unavailable"
  ) {
    super(message);
  }
}

export type ManagerServiceVisit = {
  id: string;
  reference: string;
  customer: string;
  site: string;
  serviceDate: string | null;
  status: "open" | "closed";
  systems: string[];
  inspectionProgress: { accepted: number; required: number };
  completion: JobCompletion;
};

async function readResponse<T>(response: Response, key: string): Promise<T> {
  if (response.status === 401 || response.status === 403) {
    throw new ManagerApiError("Manager access requires a verified Manager account.", "authorization");
  }
  let data: Record<string, unknown>;
  try { data = await response.json() as Record<string, unknown>; }
  catch { throw new Error("Manager service visits are currently unavailable."); }
  if (!response.ok || !(key in data)) {
    throw new ManagerApiError(typeof data.message === "string" ? data.message : "Manager service visits are currently unavailable.", "unavailable");
  }
  return data[key] as T;
}

export async function loadManagerServiceVisits(signal?: AbortSignal) {
  let response: Response;
  try { response = await fetch("/api/manager/service-visits", { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Operations cannot be verified or refreshed right now.", "unavailable"); }
  const visits = await readResponse<unknown>(response, "serviceVisits");
  if (!Array.isArray(visits)) throw new Error("Manager service visits are currently unavailable.");
  return visits as ManagerServiceVisit[];
}

export async function loadManagerServiceVisit(jobId: string, signal?: AbortSignal) {
  let response: Response;
  try { response = await fetch(`/api/manager/service-visits/${encodeURIComponent(jobId)}`, { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Operations cannot be verified or refreshed right now.", "unavailable"); }
  return readResponse<ManagerServiceVisit>(response, "serviceVisit");
}
