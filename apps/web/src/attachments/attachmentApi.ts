import type { InspectionAttachmentRecord } from "./attachmentTypes";

export type ServerAttachmentMetadata = {
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

export class AttachmentUploadError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export async function uploadInspectionAttachment(
  attachment: InspectionAttachmentRecord
) {
  const body = new FormData();
  body.set("photoUuid", attachment.photoUuid);
  body.set("inspectionClientUuid", attachment.inspectionClientUuid);
  body.set("fieldPath", attachment.fieldPath);
  body.set("captureSource", attachment.captureSource);
  body.set("capturedAt", attachment.capturedAt);
  body.set("sha256", attachment.sha256);
  body.set("sizeBytes", String(attachment.sizeBytes));
  body.set("width", String(attachment.width));
  body.set("height", String(attachment.height));
  body.set("file", attachment.blob, `${attachment.photoUuid}.jpg`);

  const response = await fetch("/api/inspection-attachments", {
    method: "POST",
    credentials: "same-origin",
    body
  });
  const payload = await response.json().catch(() => ({})) as {
    outcome?: unknown;
    attachment?: Partial<ServerAttachmentMetadata>;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok) {
    throw new AttachmentUploadError(
      typeof payload.error === "string" ? payload.error : "UPLOAD_FAILED",
      typeof payload.message === "string"
        ? payload.message
        : `Photo upload failed: ${response.status}`
    );
  }
  if (
    (payload.outcome !== "accepted" && payload.outcome !== "duplicate")
    || payload.attachment?.photoUuid !== attachment.photoUuid
    || payload.attachment.sourceSha256 !== attachment.sha256
    || typeof payload.attachment.serverAttachmentId !== "string"
    || typeof payload.attachment.storedSha256 !== "string"
  ) {
    throw new AttachmentUploadError(
      "CONFIRMATION_MISMATCH",
      "Server did not confirm this exact photo UUID and hash"
    );
  }
  return {
    outcome: payload.outcome,
    attachment: payload.attachment as ServerAttachmentMetadata
  };
}

export async function stageFireAlarmV6Evidence(attachment: InspectionAttachmentRecord, record: { jobId: string; masterTemplate: { id: string; version: number } }) {
  if (attachment.systemKey !== "fire_alarm_detector" || attachment.protocolVersion !== 6 || (record.masterTemplate.version !== 6 && record.masterTemplate.version !== 7) || !attachment.contractSha256) throw new AttachmentUploadError("VALIDATION_ERROR", "Fire Alarm staged evidence identity is invalid");
  const body = new FormData();
  body.set("photoUuid", attachment.photoUuid); body.set("inspectionClientUuid", attachment.inspectionClientUuid); body.set("jobId", record.jobId); body.set("systemKey", "fire_alarm_detector"); body.set("fieldPath", attachment.fieldPath); body.set("masterTemplateId", record.masterTemplate.id); body.set("masterTemplateVersion", String(record.masterTemplate.version)); body.set("contractSha256", attachment.contractSha256); body.set("captureSource", attachment.captureSource); body.set("capturedAt", attachment.capturedAt); body.set("sha256", attachment.sha256); body.set("sizeBytes", String(attachment.sizeBytes)); body.set("width", String(attachment.width)); body.set("height", String(attachment.height)); body.set("file", attachment.blob, `${attachment.photoUuid}.jpg`);
  const response = await fetch("/api/v6-evidence/stage", { method: "POST", credentials: "same-origin", body });
  const payload = await response.json().catch(() => ({})) as { outcome?: unknown; photoUuid?: unknown; fieldPath?: unknown; sourceSha256?: unknown; storedSha256?: unknown; error?: unknown; message?: unknown };
  if (!response.ok) throw new AttachmentUploadError(typeof payload.error === "string" ? payload.error : "UPLOAD_FAILED", typeof payload.message === "string" ? payload.message : `V6 photo staging failed: ${response.status}`);
  if ((payload.outcome !== "staged" && payload.outcome !== "duplicate") || payload.photoUuid !== attachment.photoUuid || payload.fieldPath !== attachment.fieldPath || payload.sourceSha256 !== attachment.sha256 || typeof payload.storedSha256 !== "string") throw new AttachmentUploadError("CONFIRMATION_MISMATCH", "Server did not confirm this exact staged photo identity");
  return { outcome: payload.outcome, storedSha256: payload.storedSha256 };
}

export async function stageV7Evidence(attachment: InspectionAttachmentRecord, record: { jobId: string; masterTemplate: { id: string; version: number } }) {
  if (attachment.protocolVersion !== 7 || record.masterTemplate.version !== 7 || !attachment.contractSha256 || (attachment.systemKey !== "co2_fire_extinguisher" && attachment.systemKey !== "wet_chemical" && attachment.systemKey !== "fire_alarm_detector")) throw new AttachmentUploadError("VALIDATION_ERROR", "V7 staged evidence identity is invalid");
  const body = new FormData();
  body.set("photoUuid", attachment.photoUuid); body.set("inspectionClientUuid", attachment.inspectionClientUuid); body.set("jobId", record.jobId); body.set("systemKey", attachment.systemKey); body.set("fieldPath", attachment.fieldPath); body.set("masterTemplateId", record.masterTemplate.id); body.set("masterTemplateVersion", "7"); body.set("contractSha256", attachment.contractSha256); body.set("captureSource", attachment.captureSource); body.set("capturedAt", attachment.capturedAt); body.set("sha256", attachment.sha256); body.set("sizeBytes", String(attachment.sizeBytes)); body.set("width", String(attachment.width)); body.set("height", String(attachment.height)); body.set("file", attachment.blob, `${attachment.photoUuid}.jpg`);
  const response = await fetch("/api/v7-evidence/stage", { method: "POST", credentials: "same-origin", body });
  const payload = await response.json().catch(() => ({})) as { outcome?: unknown; photoUuid?: unknown; fieldPath?: unknown; sourceSha256?: unknown; storedSha256?: unknown; error?: unknown; message?: unknown };
  if (!response.ok) throw new AttachmentUploadError(typeof payload.error === "string" ? payload.error : "UPLOAD_FAILED", typeof payload.message === "string" ? payload.message : `V7 photo staging failed: ${response.status}`);
  if ((payload.outcome !== "staged" && payload.outcome !== "duplicate") || payload.photoUuid !== attachment.photoUuid || payload.fieldPath !== attachment.fieldPath || payload.sourceSha256 !== attachment.sha256 || typeof payload.storedSha256 !== "string") throw new AttachmentUploadError("CONFIRMATION_MISMATCH", "Server did not confirm this exact staged photo identity");
  return { outcome: payload.outcome, storedSha256: payload.storedSha256 };
}

export async function loadServerInspectionAttachments(inspectionClientUuid: string) {
  const response = await fetch(
    `/api/inspection-attachments?inspectionClientUuid=${encodeURIComponent(inspectionClientUuid)}`,
    { credentials: "same-origin", cache: "no-store" }
  );
  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign in required to view server photos");
  }
  if (!response.ok) throw new Error(`Photo listing failed: ${response.status}`);
  const payload = await response.json() as { attachments?: unknown };
  return Array.isArray(payload.attachments)
    ? payload.attachments as ServerAttachmentMetadata[]
    : [];
}

export function serverAttachmentContentUrl(photoUuid: string) {
  return `/api/inspection-attachments/${encodeURIComponent(photoUuid)}/content`;
}
