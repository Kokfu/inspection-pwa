import { localDatabase } from "../db/localDatabase";

/**
 * CR-01: a Good or N.A. result may carry ONE optional photo.  A finding
 * (`not_good` / `complete_repair`) keeps its required own remark + own photo, and
 * a missing optional photo is never a submit issue.  This module is the shared,
 * system-neutral half: who is eligible, and how a Draft photo is taken back.
 */
export const isOptionalPhotoResult = (value: unknown) => value === "good" || value === "na";

export const optionalPhotoRemoveRefusedMessage = "This photo has already been submitted and cannot be removed here.";

/**
 * Remove ONE Draft evidence photo (and its Blob) from this device.  Refused for a
 * photo that has left Draft (it may already be staged on the server, where its
 * bytes are immutable) and for a record that is no longer a Draft.  Nothing is
 * deleted unless both are Draft, and both are checked in the same transaction as
 * the delete.  Draft photos have no outbox item yet, so there is nothing to close.
 */
export async function removeDraftEvidencePhoto(photoUuid: string, inspectionClientUuid: string) {
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.masterSystemFormInstances, localDatabase.inspectionAttachments, async () => {
    const photo = await localDatabase.inspectionAttachments.get(photoUuid);
    if (!photo || photo.inspectionClientUuid !== inspectionClientUuid || photo.protocolVersion !== 7) throw new Error("That photo is not part of this inspection.");
    const record = await localDatabase.masterSystemFormInstances.get(inspectionClientUuid) ?? await localDatabase.masterSystemInspections.get(inspectionClientUuid);
    if (!record || record.syncStatus !== "Draft") throw new Error(optionalPhotoRemoveRefusedMessage);
    if (photo.syncStatus !== "Draft") throw new Error(optionalPhotoRemoveRefusedMessage);
    await localDatabase.inspectionAttachments.delete(photoUuid);
  });
}
