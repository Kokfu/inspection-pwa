import type { InspectionJob } from "./jobTypes";

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
