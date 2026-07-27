import { localDatabase } from "../db/localDatabase";
import type { AutomaticSprinklerInspectionRecord } from "../automaticSprinkler/automaticSprinklerTypes";
import type { EvidencePolicySnapshot } from "../jobs/jobTypes";
import type {
  AttachmentCaptureSource,
  AttachmentOutboxPayload,
  InspectionAttachmentRecord
} from "./attachmentTypes";
import type { AutomaticSprinklerPsiFieldPath } from "./automaticSprinklerEvidencePolicy";

const now = () => new Date().toISOString();

export function attachmentSaveError(error: unknown) {
  const seen = new Set<unknown>();
  let candidate: unknown = error;
  while (candidate && !seen.has(candidate)) {
    seen.add(candidate);
    if (
      candidate instanceof Error
      && (
        candidate.name === "QuotaExceededError"
        || candidate.name === "QuotaError"
        || /quota|storage.*full/i.test(candidate.message)
      )
    ) {
      return new Error(
        "Unable to save this photo because browser storage is full. Keep the page open, free device storage, then try again."
      );
    }
    candidate = typeof candidate === "object" && candidate !== null
      ? ("cause" in candidate ? candidate.cause : "inner" in candidate ? candidate.inner : undefined)
      : undefined;
  }
  return error;
}

async function liveDraft(inspectionClientUuid: string) {
  const parent = await localDatabase.masterSystemInspections.get(inspectionClientUuid);
  if (
    !parent
    || parent.systemKey !== "automatic_sprinkler"
    || parent.syncStatus !== "Draft"
    || parent.attachmentSetSubmittedAt
  ) {
    throw new Error("Photos can only be changed before the inspection is first submitted");
  }
  return parent as AutomaticSprinklerInspectionRecord;
}

export async function listInspectionAttachments(inspectionClientUuid: string) {
  return localDatabase.inspectionAttachments
    .where("inspectionClientUuid")
    .equals(inspectionClientUuid)
    .sortBy("fieldPath");
}

export async function saveDraftInspectionAttachment(values: {
  inspectionClientUuid: string;
  fieldPath: AutomaticSprinklerPsiFieldPath;
  policy: EvidencePolicySnapshot;
  captureSource: AttachmentCaptureSource;
  blob: Blob;
  mimeType: "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
  capturedAt?: string;
  signal?: AbortSignal;
}) {
  try {
    await localDatabase.transaction(
      "rw",
      localDatabase.masterSystemInspections,
      localDatabase.inspectionAttachments,
      async () => {
        await liveDraft(values.inspectionClientUuid);
        if (values.signal?.aborted) throw new DOMException("Photo processing was cancelled", "AbortError");
        const existing = await localDatabase.inspectionAttachments
          .where("[inspectionClientUuid+fieldPath]")
          .equals([values.inspectionClientUuid, values.fieldPath])
          .first();
        if (values.signal?.aborted) throw new DOMException("Photo processing was cancelled", "AbortError");
        const timestamp = now();
        const attachment: InspectionAttachmentRecord = {
          photoUuid: existing?.photoUuid ?? crypto.randomUUID(),
          inspectionClientUuid: values.inspectionClientUuid,
          systemKey: "automatic_sprinkler",
          fieldPath: values.fieldPath,
          evidencePolicyId: values.policy.id,
          evidencePolicyVersion: values.policy.version,
          captureSource: values.captureSource,
          blob: values.blob,
          mimeType: values.mimeType,
          sizeBytes: values.sizeBytes,
          width: values.width,
          height: values.height,
          sha256: values.sha256,
          capturedAt: values.capturedAt ?? timestamp,
          localCreatedAt: existing?.localCreatedAt ?? timestamp,
          localUpdatedAt: timestamp,
          syncStatus: "Draft"
        };
        if (values.signal?.aborted) throw new DOMException("Photo processing was cancelled", "AbortError");
        await localDatabase.inspectionAttachments.put(attachment);
        if (values.signal?.aborted) throw new DOMException("Photo processing was cancelled", "AbortError");
      }
    );
    const winner = await localDatabase.inspectionAttachments
      .where("[inspectionClientUuid+fieldPath]")
      .equals([values.inspectionClientUuid, values.fieldPath])
      .first();
    if (!winner) throw new Error("Saved photo could not be reloaded");
    return winner;
  } catch (error) {
    if (error instanceof Error && error.name === "ConstraintError") {
      const winner = await localDatabase.inspectionAttachments
        .where("[inspectionClientUuid+fieldPath]")
        .equals([values.inspectionClientUuid, values.fieldPath])
        .first();
      if (winner) return winner;
    }
    throw attachmentSaveError(error);
  }
}

export async function removeDraftInspectionAttachment(
  inspectionClientUuid: string,
  fieldPath: AutomaticSprinklerPsiFieldPath
) {
  await localDatabase.transaction(
    "rw",
    localDatabase.masterSystemInspections,
    localDatabase.inspectionAttachments,
    async () => {
      await liveDraft(inspectionClientUuid);
      const existing = await localDatabase.inspectionAttachments
        .where("[inspectionClientUuid+fieldPath]")
        .equals([inspectionClientUuid, fieldPath])
        .first();
      if (existing) await localDatabase.inspectionAttachments.delete(existing.photoUuid);
    }
  );
}

export function attachmentOutboxPayload(
  attachment: InspectionAttachmentRecord
): AttachmentOutboxPayload {
  return {
    photoUuid: attachment.photoUuid,
    inspectionClientUuid: attachment.inspectionClientUuid,
    fieldPath: attachment.fieldPath,
    evidencePolicyId: attachment.evidencePolicyId,
    evidencePolicyVersion: attachment.evidencePolicyVersion,
    captureSource: attachment.captureSource,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    width: attachment.width,
    height: attachment.height,
    sha256: attachment.sha256,
    capturedAt: attachment.capturedAt
  };
}
