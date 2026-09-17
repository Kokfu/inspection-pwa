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
