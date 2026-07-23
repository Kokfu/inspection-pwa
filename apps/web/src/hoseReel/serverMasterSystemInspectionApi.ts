export type ServerMasterSystemInspectionSummary = {
  clientUuid: string;
  jobReference: string;
  jobTitle: string;
  customerName: string;
  systemKey: "hose_reel";
  status: "submitted";
  performedAt: string;
  receivedAt: string;
  deviceReportedCreatorUsername: string | null;
  verifiedOriginalCreatorUsername: string | null;
  syncedByUsername: string;
};

export async function loadServerMasterSystemInspections() {
  const response = await fetch("/api/master-system-inspections", { credentials: "same-origin" });
  if (response.status === 401 || response.status === 403) throw new Error("Sign in required to load server inspections");
  if (!response.ok) throw new Error(`Server inspection listing failed: ${response.status}`);
  const payload = await response.json() as { inspections?: unknown };
  return Array.isArray(payload.inspections) ? payload.inspections as ServerMasterSystemInspectionSummary[] : [];
}
