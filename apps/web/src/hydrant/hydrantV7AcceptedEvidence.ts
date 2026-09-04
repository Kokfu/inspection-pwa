export type HydrantV7AcceptedEvidence = { photoUuid: string; systemKey: "hydrant"; fieldPath: string; sourceSha256: string; storedSha256: string; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; formInstanceId: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export async function loadHydrantV7AcceptedEvidence(inspectionClientUuid: string) {
  if (!uuid.test(inspectionClientUuid)) throw new Error("Accepted inspection identity is invalid");
  const response = await fetch(`/api/v7-evidence/accepted?inspectionClientUuid=${encodeURIComponent(inspectionClientUuid)}`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Accepted evidence is unavailable");
  const body: unknown = await response.json();
  if (!record(body) || !Array.isArray(body.evidence)) throw new Error("Accepted evidence response is invalid");
  const evidence: HydrantV7AcceptedEvidence[] = [];
  for (const item of body.evidence) {
    if (!record(item) || typeof item.photoUuid !== "string" || !uuid.test(item.photoUuid) || item.systemKey !== "hydrant" || typeof item.fieldPath !== "string" || typeof item.sourceSha256 !== "string" || !hash.test(item.sourceSha256) || typeof item.storedSha256 !== "string" || !hash.test(item.storedSha256) || item.mimeType !== "image/jpeg" || !Number.isSafeInteger(item.sizeBytes) || !Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) || typeof item.formInstanceId !== "string" || !uuid.test(item.formInstanceId)) throw new Error("Accepted evidence response is invalid");
    evidence.push(item as HydrantV7AcceptedEvidence);
  }
  return evidence.sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
}

export const hydrantV7AcceptedEvidenceContentUrl = (photoUuid: string) => `/api/v7-evidence/accepted/${encodeURIComponent(photoUuid)}/content`;
