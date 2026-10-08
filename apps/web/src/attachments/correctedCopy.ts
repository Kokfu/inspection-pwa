/**
 * I-21: corrected copy, shared by every evidence system.
 *
 * Staged evidence is immutable on the server (a photo cannot be replaced or released, and acceptance needs the staged
 * set to equal the frozen manifest exactly), so an evidence-related rejection cannot be fixed on the same record.
 * A corrected copy creates a NEW record (new clientUuid, new photoUuids, same answers and photo bytes), archives the
 * rejected one in `drafts` (metadata only) and closes its open outbox items - all in ONE IndexedDB transaction, so
 * there is never a moment with two live records for the job+system (`jobSystemKey` / [groupKey+instanceKey] are
 * unique). The rejected record was never accepted, so server-side evidence uniqueness (accepted-only) is unaffected.
 */
import { localDatabase } from "../db/localDatabase";
import type { InspectionAttachmentRecord } from "./attachmentTypes";

export const submittedPhotoMessage = "A photo that was already submitted cannot be changed on this record. Use Start corrected copy.";
export const supersededArchiveKey = (clientUuid: string) => `superseded:${clientUuid}`;

/** In-place guard: a photo that has left Draft may already be staged on the server, where its bytes are immutable. */
export function assertPhotoReplaceable(existing: Pick<InspectionAttachmentRecord, "syncStatus"> | undefined) {
  if (existing && existing.syncStatus !== "Draft") throw new Error(submittedPhotoMessage);
}

/** A submitted (possibly staged) photo that the findings no longer need would leave the server with EXTRA staged
 * evidence, which acceptance rejects forever. Only a corrected copy can drop it. */
export function submittedPhotoIssues(attachments: ReadonlyArray<Pick<InspectionAttachmentRecord, "fieldPath" | "syncStatus">>, required: Iterable<string>) {
  const requiredSet = new Set<string>(required);
  return attachments.filter((item) => item.syncStatus !== "Draft" && !requiredSet.has(item.fieldPath))
    .map((item) => `${item.fieldPath} has a submitted photo that is no longer needed. ${submittedPhotoMessage}`);
}

type CorrectableRecord = {
  clientUuid: string; systemKey: string; syncStatus: string; localUpdatedAt: string; localCreatedAt: string; performedAt?: string;
  lastSyncError?: string; lastSyncedAt?: string; supersedes?: { clientUuid: string; supersededAt: string };
};
export type CorrectedCopyTable = "masterSystemInspections" | "masterSystemFormInstances";

const now = () => new Date().toISOString();

export async function startCorrectedCopy<R extends CorrectableRecord>(record: R, table: CorrectedCopyTable, label: string): Promise<R> {
  let created: R | undefined;
  await localDatabase.transaction("rw", [localDatabase.table(table), localDatabase.inspectionAttachments, localDatabase.syncOutbox, localDatabase.drafts], async () => {
    const records = localDatabase.table(table);
    const live = await records.get(record.clientUuid) as R | undefined;
    if (!live || live.systemKey !== record.systemKey || live.localUpdatedAt !== record.localUpdatedAt) throw new Error(`This ${label} record changed elsewhere. Reload before continuing.`);
    const photos = await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(live.clientUuid).toArray();
    const hasSubmittedPhoto = photos.some((photo) => photo.syncStatus !== "Draft");
    if (!(live.syncStatus === "Failed" || live.syncStatus === "Conflict" || (live.syncStatus === "Draft" && hasSubmittedPhoto))) throw new Error("A corrected copy can only be started for a rejected record.");
    const entityIds = new Set([live.clientUuid, ...photos.map((photo) => photo.photoUuid)]);
    const openOutbox = (await localDatabase.syncOutbox.where("status").notEqual("Completed").toArray()).filter((item) => entityIds.has(item.entityId));
    if (openOutbox.some((item) => item.status === "Syncing")) throw new Error("This record is syncing right now. Try again in a moment.");
    const at = now();
    for (const item of openOutbox) await localDatabase.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: at, lastError: "Superseded by corrected copy" });
    const replacement: R & Record<string, unknown> = {
      ...live, clientUuid: crypto.randomUUID(), syncStatus: "Draft", performedAt: at, localCreatedAt: at, localUpdatedAt: at,
      supersedes: { clientUuid: live.clientUuid, supersededAt: at }
    };
    delete replacement.lastSyncedAt; delete replacement.lastSyncError;
    // A legacy photo-set lock (Automatic Sprinkler pre-V7) must not carry over: the copy is a fresh editable Draft.
    delete replacement.attachmentSetSubmittedAt;
    // Archive first (metadata only - the new record owns the bytes), then retire the rejected rows.
    await localDatabase.drafts.put({
      id: supersededArchiveKey(live.clientUuid), entityType: "supersededInspection", updatedAt: at,
      payload: { clientUuid: live.clientUuid, replacedBy: replacement.clientUuid, jobId: (live as unknown as { jobId?: string }).jobId ?? null, systemKey: live.systemKey, supersededAt: at, lastSyncError: live.lastSyncError ?? null, record: live,
        photos: photos.map(({ blob: _blob, ...meta }) => meta) }
    });
    await localDatabase.inspectionAttachments.bulkDelete(photos.map((photo) => photo.photoUuid));
    await records.delete(live.clientUuid);
    await records.add(replacement);
    for (const photo of photos) {
      const { storedSha256: _stored, serverAttachmentId: _server, lastSyncedAt: _synced, lastSyncError: _error, ...rest } = photo;
      await localDatabase.inspectionAttachments.add({ ...rest, photoUuid: crypto.randomUUID(), inspectionClientUuid: replacement.clientUuid, syncStatus: "Draft", localUpdatedAt: at });
    }
    created = replacement;
  });
  return created!;
}
