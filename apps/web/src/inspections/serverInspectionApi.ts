export type ServerInspectionSummary = {
  clientUuid: string;
  jobReference: string;
  jobTitle: string;
  inspectionTitle: string;
  performedAt: string;
};

export async function loadServerInspections() {
  const response = await fetch("/api/inspections", { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign in with an authorized account to load server inspections");
  }
  if (!response.ok) {
    throw new Error("Server inspections are currently unavailable");
  }
  const data = (await response.json()) as { inspections?: ServerInspectionSummary[] };
  return Array.isArray(data.inspections) ? data.inspections : [];
}
