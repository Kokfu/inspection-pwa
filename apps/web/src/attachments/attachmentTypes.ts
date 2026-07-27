export type AttachmentCaptureSource = "camera" | "gallery" | "unknown";
export type AttachmentSyncStatus =
  | "Draft"
  | "Pending"
  | "Uploading"
  | "Synced"
  | "Failed"
  | "Conflict";

export type InspectionAttachmentRecord = {
  photoUuid: string;
  inspectionClientUuid: string;
  systemKey: "automatic_sprinkler";
  fieldPath: string;
  evidencePolicyId: string;
  evidencePolicyVersion: number;
  captureSource: AttachmentCaptureSource;
  blob: Blob;
  mimeType: "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
  storedSha256?: string;
  capturedAt: string;
  localCreatedAt: string;
  localUpdatedAt: string;
  syncStatus: AttachmentSyncStatus;
  lastSyncError?: string;
  serverAttachmentId?: string;
  lastSyncedAt?: string;
};

export type AttachmentOutboxPayload = {
  photoUuid: string;
  inspectionClientUuid: string;
  fieldPath: string;
  evidencePolicyId: string;
  evidencePolicyVersion: number;
  captureSource: AttachmentCaptureSource;
  mimeType: "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
  capturedAt: string;
};
