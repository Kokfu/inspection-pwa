import type {
  AutomaticSprinklerResponses,
  ResolvedAutomaticSprinklerControls
} from "./automaticSprinklerTypes";

export type ServerInspectionAttachment = {
  serverAttachmentId: string;
  photoUuid: string;
  fieldPath: string;
  captureSource: "camera" | "gallery" | "unknown";
  mimeType: "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
  sourceSha256: string;
  storedSha256: string;
  capturedAt: string;
  receivedAt: string;
};

export type ServerAutomaticSprinklerDetail = {
  clientUuid: string;
  serverFormInstanceId: string;
  jobId: string;
  jobReference: string;
  jobTitle: string;
  customerName: string;
  systemKey: "automatic_sprinkler";
  systemLabel: string;
  instanceKey: string;
  status: "submitted";
  performedAt: string;
  receivedAt: string;
  responses: AutomaticSprinklerResponses;
  displayControls: ResolvedAutomaticSprinklerControls;
  deviceReportedCreatorUsername: string | null;
  verifiedOriginalCreatorUsername: string | null;
  syncedByUsername: string;
  evidencePolicyId: string | null;
  evidencePolicyVersion: number | null;
  evidencePolicySha256: string | null;
  attachments: ServerInspectionAttachment[];
};

export class ServerInspectionNotFoundError extends Error {}

export function serverAttachmentContentUrl(photoUuid: string) {
  return `/api/inspection-attachments/${encodeURIComponent(photoUuid)}/content`;
}

async function loadServerAttachments(clientUuid: string) {
  const response = await fetch(
    `/api/inspection-attachments?inspectionClientUuid=${encodeURIComponent(clientUuid)}`,
    { credentials: "same-origin", cache: "no-store" }
  );
  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign in required to view server photos");
  }
  if (!response.ok) {
    throw new Error(`Server photo listing failed: ${response.status}`);
  }
  const payload = await response.json() as { attachments?: unknown };
  return Array.isArray(payload.attachments)
    ? payload.attachments as ServerInspectionAttachment[]
    : [];
}

export async function loadServerAutomaticSprinklerDetail(clientUuid: string) {
  const response = await fetch(
    `/api/master-system-inspections/${encodeURIComponent(clientUuid)}`,
    { credentials: "same-origin", cache: "no-store" }
  );
  if (response.status === 404) {
    throw new ServerInspectionNotFoundError("Inspection was not found on the server");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign in required to view this inspection");
  }
  if (!response.ok) {
    throw new Error(`Server inspection detail failed: ${response.status}`);
  }
  const payload = await response.json() as {
    inspection?: Omit<ServerAutomaticSprinklerDetail, "attachments">;
  };
  if (
    !payload.inspection
    || payload.inspection.systemKey !== "automatic_sprinkler"
    || payload.inspection.status !== "submitted"
  ) {
    throw new ServerInspectionNotFoundError(
      "This is not an accepted Automatic Sprinkler inspection"
    );
  }
  const attachments = await loadServerAttachments(clientUuid);
  return { ...payload.inspection, attachments };
}
