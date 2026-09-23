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
  systemKey: "automatic_sprinkler" | "fire_alarm_detector" | "co2_fire_extinguisher" | "wet_chemical" | "hydrant" | "hose_reel" | "dry_wet_riser" | "smoke_ventilation" | "fire_intercom" | "fm200_fire_suppression";
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
  protocolVersion?: 6 | 7;
  masterTemplateId?: string;
  contractSha256?: string;
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
