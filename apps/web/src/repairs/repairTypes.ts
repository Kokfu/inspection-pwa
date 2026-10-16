export type RepairIdentity = {
  findingId: string; workOrderId: string; jobId: string; systemKey: string;
  expectedWorkOrderRevision: number; expectedSourceRevision: string; sourceFingerprint: string;
};
export type RepairPhotoInput = RepairIdentity & {
  photoUuid: string; repairUuid: string; captureSource: "camera" | "gallery" | "unknown";
  capturedAt: string; sourceSha256: string; sizeBytes: number; width: number; height: number;
};
export type RepairPart = RepairIdentity & {
  clientUuid: string; cycleSequence: number; predecessorUuid: string | null; remark: string; performedAt: string;
  manifest: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>;
};
export type BeforeMetadata = {
  photoUuid: string; fieldPath: string; sourceSha256: string; storedSha256: string;
  sizeBytes: number; width: number; height: number;
};
export type RepairHistory = {
  client_uuid: string; cycle_sequence: number; predecessor_uuid: string | null; remark: string;
  performed_at: string; submitted_by_user_id: number | string;
  review_state: "awaiting_approval" | "approved" | "rejected" | "withdrawn";
};
export type RepairFinding = {
  findingId: string; sourceFingerprint: string; sourceRevision: string;
  eligibility: "eligible" | "needs_review" | "not_required"; reviewSequence: number;
  original: {
    jobId: string; systemKey: string; fieldPath: string; result: "not_good" | "poor"; remark: string;
    beforePhoto: BeforeMetadata | null; beforePhotoMissing: boolean;
    template: Record<string, unknown>; contractSha256: string | null;
    [key: string]: unknown;
  };
  reviews: unknown[]; history: RepairHistory[];
  fetchedAt?: string; expiresAt?: string; refreshError?: string;
};
export type RepairWorkOrder = {
  workOrderId: string; jobId: string; systemKey: string; assignedToUserId: number;
  revision: number; status: "active" | "revoked"; fetchedAt?: string; expiresAt?: string;
};
export type RepairRecord = {
  clientUuid: string; findingId: string; workOrderId: string; jobId: string; systemKey: string;
  actorId: number; cycleSequence: number; predecessorUuid: string | null;
  remark: string; performedAt: string; photoUuid?: string; localCreatedAt: string; localUpdatedAt: string;
  syncStatus: "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";
  reviewState: "unsubmitted" | RepairHistory["review_state"];
  frozen?: RepairPart; requestFingerprint?: string; receipt?: Record<string, unknown>;
  lastSyncError?: string; lastSyncedAt?: string; reviewFetchedAt?: string;
};
export type RepairAttachment = {
  photoUuid: string; repairUuid: string; blob: Blob; captureSource: RepairPhotoInput["captureSource"];
  capturedAt: string; sourceSha256: string; sizeBytes: number; width: number; height: number;
  syncStatus: "Draft" | "Pending" | "Uploading" | "Synced" | "Failed";
  frozen?: RepairPhotoInput; requestFingerprint?: string; receipt?: Record<string, unknown>; lastSyncError?: string;
};
export type RepairBeforePhoto = BeforeMetadata & { findingId: string; sourceFingerprint: string; blob: Blob; fetchedAt: string };
export type RepairService = { jobId: string; systemKey: string; findings: RepairFinding[]; workOrders: RepairWorkOrder[] };
