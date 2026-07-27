export type ServerMasterSystemInspectionSummary = {
  clientUuid: string;
  jobId: string;
  jobReference: string;
  jobTitle: string;
  customerName: string;
  systemKey: "hose_reel" | "co2_fire_extinguisher" | "automatic_sprinkler";
  instanceKey: string;
  zoneName: string | null;
  locationName: string | null;
  status: "submitted";
  performedAt: string;
  receivedAt: string;
  deviceReportedCreatorUsername: string | null;
  verifiedOriginalCreatorUsername: string | null;
  syncedByUsername: string;
};

export async function loadServerMasterSystemInspections(jobIds: string[] = []) {
  const query = jobIds.length > 0
    ? `?jobIds=${encodeURIComponent(jobIds.join(","))}`
    : "";
  const response = await fetch(`/api/master-system-inspections${query}`, {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (response.status === 401 || response.status === 403) throw new Error("Sign in required to load server inspections");
  if (!response.ok) throw new Error(`Server inspection listing failed: ${response.status}`);
  const payload = await response.json() as { inspections?: unknown };
  return Array.isArray(payload.inspections) ? payload.inspections as ServerMasterSystemInspectionSummary[] : [];
}

export async function findServerMasterSystemInspection(
  jobId: string,
  systemKey: string
) {
  const query = new URLSearchParams({ jobId, systemKey });
  const response = await fetch(`/api/master-system-inspections?${query}`, {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign in required to check server inspections");
  }
  if (!response.ok) {
    throw new Error(`Server inspection check failed: ${response.status}`);
  }
  const payload = await response.json() as { inspections?: unknown };
  const inspections = Array.isArray(payload.inspections)
    ? payload.inspections as ServerMasterSystemInspectionSummary[]
    : [];
  return inspections[0];
}
