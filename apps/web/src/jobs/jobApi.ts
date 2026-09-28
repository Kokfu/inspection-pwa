import type { InspectionJob, JobCompletion } from "./jobTypes";

function responseMessage(data: unknown, fallback: string) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return fallback;
  const message = (data as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function hasJobId(data: unknown): data is { job: InspectionJob } {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const job = (data as { job?: unknown }).job;
  return typeof job === "object" && job !== null && !Array.isArray(job)
    && typeof (job as { id?: unknown }).id === "string" && (job as { id: string }).id.trim().length > 0;
}

export async function loadInspectionJobs() {
  const response = await fetch("/api/inspection-jobs", {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Reconnect and verify your session before refreshing jobs");
  }
  if (!response.ok) {
    throw new Error("Inspection jobs are currently unavailable");
  }

  const data = (await response.json()) as { jobs?: InspectionJob[] };
  return Array.isArray(data.jobs) ? data.jobs : [];
}

export async function createServiceVisit(input: {
  requestId: string;
  customerId: string;
  siteId: string;
  systemKeys: string[];
  serviceCallNumber?: string;
  arrivalTime?: string;
  departureTime?: string;
}) {
  const response = await fetch("/api/inspection-jobs/service-visits", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Service visit could not be created.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("Connect to the server to create a new service visit.");
  }
  if (!response.ok) {
    throw new Error(responseMessage(data, "Service visit could not be created."));
  }
  if (!hasJobId(data)) {
    throw new Error(responseMessage(data, "Service visit could not be created."));
  }
  return data.job;
}

export async function deleteUnstartedServiceVisit(jobId: string): Promise<void> {
  const response = await fetch(`/api/inspection-jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE", credentials: "same-origin", cache: "no-store"
  });
  if (response.status === 401 || response.status === 403) throw new Error("Reconnect and verify your session before deleting this service visit.");
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error("Service visit deletion could not be confirmed."); }
  if (!response.ok) throw new Error(responseMessage(data, "Service visit could not be deleted."));
  if (!data || typeof data !== "object" || Array.isArray(data)
    || (data as { jobId?: unknown }).jobId !== jobId
    || !["deleted", "already_deleted"].includes(String((data as { result?: unknown }).result))) {
    throw new Error("Service visit deletion could not be confirmed.");
  }
}

export async function closeInspectionJob(jobId: string): Promise<{
  outcome: "completed" | "already-completed" | "incomplete";
  completion: JobCompletion;
}> {
  const response = await fetch(`/api/inspection-jobs/${encodeURIComponent(jobId)}/close`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Reconnect and verify your session before completing this job");
  }
  const data = await response.json() as {
    outcome?: "completed" | "already-completed";
    error?: string;
    message?: string;
    completion?: JobCompletion;
  };
  if (response.status === 409 && data.error === "JOB_INCOMPLETE" && data.completion) {
    return { outcome: "incomplete", completion: data.completion };
  }
  if (!response.ok || !data.completion || !data.outcome) {
    throw new Error(data.message ?? "Job completion is currently unavailable");
  }
  return { outcome: data.outcome, completion: data.completion };
}

/**
 * T14 (2026-09-27): a technician deletes their OWN in-progress (not yet submitted) job. This is
 * a soft delete (`inspection_jobs.archived_at`, server-side) -- reversible by an admin, never a
 * hard delete. Only ever offered/attempted for a job whose `status` is still `"open"`; the
 * server enforces that and returns 409 `JOB_NOT_OPEN` for anything else (already archived or
 * already closed/submitted).
 */
export async function archiveInspectionJob(jobId: string): Promise<void> {
  const response = await fetch(`/api/inspection-jobs/${encodeURIComponent(jobId)}/archive`, {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store"
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Reconnect and verify your session before deleting this job");
  }
  if (response.ok) return;
  let data: unknown;
  try { data = await response.json(); } catch { data = undefined; }
  throw new Error(responseMessage(data, "This job could not be deleted"));
}
