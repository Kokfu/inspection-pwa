import type { InspectionJob, JobCompletion } from "./jobTypes";

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
