import { currentWorkspaceUserId, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { processInspectionPhoto, requestPersistentAttachmentStorage } from "../attachments/imageProcessing";
import { malaysiaDay, requestFingerprint, sha256Hex } from "./repairVisitCanon";
import { isEditable, itemProblems, nextSubmitRevision } from "./repairVisitPresentation";
import {
  rvText, type LocalRepairVisit, type LocalRepairVisitItem, type LocalRepairVisitPhoto, type RepairCatalogField, type RepairVisitCreateRequest,
  type RepairVisitOutboxPayload, type RepairVisitOutcome, type RepairVisitPhotoMetadata, type RepairVisitPrevious, type RepairVisitSubmitBody
} from "./repairVisitTypes";

/** A message meant for the technician. Nothing local is changed when one of these is thrown. */
export class RepairVisitLocalError extends Error {}

export function workspaceActor() {
  const userId = currentWorkspaceUserId();
  if (userId === undefined) throw new RepairVisitLocalError("Sign in on this device before using repair visits.");
  return userId;
}
const now = () => new Date().toISOString();

export type NewRepairVisitInput = {
  customerId: string; customerName: string; siteId: string; siteName: string; configurationRevisionId: string;
  previousVisit: RepairVisitPrevious | null; previousVisitLabel?: string; serviceCallNumber: string; arrivalTime: string;
  fields: RepairCatalogField[]; /** True while the server answers: the server then supplies the visit date (plan A7). */ online: boolean;
  clientUuid?: string; at?: Date;
};

/** Local-first create: the visit, its items and the queued create operation commit together before any network call. */
export async function createLocalRepairVisit(input: NewRepairVisitInput): Promise<LocalRepairVisit> {
  const userId = workspaceActor();
  if (input.fields.length === 0) throw new RepairVisitLocalError("Select at least one field to repair.");
  const call = input.serviceCallNumber.trim();
  if (call.length > 100 || (call.length > 0 && !rvText(call, 100))) throw new RepairVisitLocalError("Service Call No must be 100 characters or fewer.");
  if (new Set(input.fields.map(field => JSON.stringify(field.identity))).size !== input.fields.length) throw new RepairVisitLocalError("A field was selected twice.");
  const at = input.at ?? new Date();
  const clientUuid = input.clientUuid ?? crypto.randomUUID();
  const items: LocalRepairVisitItem[] = input.fields.map((field, index) => ({
    clientUuid: crypto.randomUUID(), visitUuid: clientUuid, identity: field.identity, systemLabel: field.systemLabel, unitLabel: field.unitLabel,
    sectionLabel: field.sectionLabel, fieldLabel: field.fieldLabel, before: field.before, outcome: null, remark: "", photoUuid: null, sortOrder: index
  }));
  const request: RepairVisitCreateRequest = {
    clientUuid, customerId: input.customerId, siteId: input.siteId, configurationRevisionId: input.configurationRevisionId,
    deviceCreatedAt: input.online ? null : at.toISOString(), visitDate: malaysiaDay(at), arrivalTime: input.arrivalTime,
    serviceCallNumber: call.length ? call : null, previousVisit: input.previousVisit,
    items: items.map(item => ({ clientUuid: item.clientUuid, identity: item.identity }))
  };
  const fingerprint = await requestFingerprint({ actorId: userId, ...request });
  const stamp = at.toISOString();
  const visit: LocalRepairVisit = {
    clientUuid, visitNumber: null, customerId: input.customerId, siteId: input.siteId, createdByUserId: userId,
    configurationRevisionId: input.configurationRevisionId, serviceCallNumber: request.serviceCallNumber, arrivalTime: input.arrivalTime,
    visitDate: request.visitDate, deviceCreatedAt: stamp, previousVisit: input.previousVisit, status: "draft", revision: 1, reportNumber: null,
    approvedByUserId: null, approvedAt: null, createdAt: stamp, updatedAt: stamp, syncStatus: "Pending", localCreatedAt: stamp, localUpdatedAt: stamp,
    origin: "device", createConfirmed: false, customerName: input.customerName, siteName: input.siteName,
    ...(input.previousVisitLabel ? { previousVisitLabel: input.previousVisitLabel } : {})
  };
  const operation: SyncOutboxItem = {
    operationId: crypto.randomUUID(), entityType: "rvVisit", entityId: clientUuid, action: "create",
    payload: { kind: "create", request, fingerprint } satisfies RepairVisitOutboxPayload, createdAt: stamp, attempts: 0, status: "Pending",
    activeKey: `rvVisit:create:${clientUuid}`
  };
  return localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, localDatabase.syncOutbox, async () => {
    const existing = await localDatabase.rvVisits.get(clientUuid);
    if (existing) return existing;
    await localDatabase.rvVisits.add(visit);
    await localDatabase.rvItems.bulkAdd(items);
    await localDatabase.syncOutbox.add(operation);
    return visit;
  });
}

async function editableState(visitUuid: string) {
  const visit = await localDatabase.rvVisits.get(visitUuid);
  if (!visit) throw new RepairVisitLocalError("This repair visit is no longer on this device.");
  if (visit.createdByUserId !== currentWorkspaceUserId()) throw new RepairVisitLocalError("This repair visit belongs to another technician.");
  if (!isEditable(visit)) throw new RepairVisitLocalError(visit.frozen ? "This repair visit was submitted on this device and can no longer be changed." : "This repair visit can no longer be changed.");
  return visit;
}

export async function saveItemDraft(itemUuid: string, patch: { outcome?: RepairVisitOutcome | null; remark?: string }) {
  if (patch.remark !== undefined && patch.remark.length > 4000) throw new RepairVisitLocalError("The remark is too long (4000 characters at most).");
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, async () => {
    const item = await localDatabase.rvItems.get(itemUuid);
    if (!item) throw new RepairVisitLocalError("This field is no longer on this repair visit.");
    await editableState(item.visitUuid);
    await localDatabase.rvItems.update(itemUuid, {
      ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}), ...(patch.remark !== undefined ? { remark: patch.remark } : {})
    });
    await localDatabase.rvVisits.update(item.visitUuid, { localUpdatedAt: now() });
  });
}

/** Stamp (CR-08), compress and store one After photo for one field. Replaces only an unsent photo. */
export async function captureItemPhoto(itemUuid: string, source: Blob, captureSource: LocalRepairVisitPhoto["captureSource"], signal?: AbortSignal) {
  const item = await localDatabase.rvItems.get(itemUuid);
  if (!item) throw new RepairVisitLocalError("This field is no longer on this repair visit.");
  await editableState(item.visitUuid);
  const capturedAt = now();
  const processed = await processInspectionPhoto(source, signal, () => new Date(capturedAt));
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, localDatabase.rvPhotos, async () => {
    const current = await localDatabase.rvItems.get(itemUuid);
    if (!current) throw new RepairVisitLocalError("This field is no longer on this repair visit.");
    const visit = await editableState(current.visitUuid);
    const revision = nextSubmitRevision(visit);
    const old = current.photoUuid ? await localDatabase.rvPhotos.get(current.photoUuid) : undefined;
    // The server holds one staged slot per field and revision, so a photo already staged for this submission cannot be replaced.
    if (old && old.syncStatus === "Synced" && old.revision === revision) {
      throw new RepairVisitLocalError("This photo was already sent for the current submission, so it cannot be replaced. Change the result or remark instead.");
    }
    if (old && old.syncStatus !== "Synced") await localDatabase.rvPhotos.delete(old.photoUuid);
    const photo: LocalRepairVisitPhoto = {
      photoUuid: crypto.randomUUID(), visitUuid: current.visitUuid, itemUuid, revision, blob: processed.blob, sourceSha256: processed.sha256,
      sizeBytes: processed.sizeBytes, width: processed.width, height: processed.height, captureSource, capturedAt, syncStatus: "Draft", localUpdatedAt: capturedAt
    };
    await localDatabase.rvPhotos.add(photo);
    await localDatabase.rvItems.update(itemUuid, { photoUuid: photo.photoUuid });
    await localDatabase.rvVisits.update(current.visitUuid, { localUpdatedAt: capturedAt });
  });
  void requestPersistentAttachmentStorage();
}

/** Returned visits only: drop a field. The server's Submit is the complete replacement set, so this is just a local edit. */
export async function removeItem(itemUuid: string) {
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, localDatabase.rvPhotos, async () => {
    const item = await localDatabase.rvItems.get(itemUuid);
    if (!item) return;
    const visit = await editableState(item.visitUuid);
    if (visit.status !== "returned") throw new RepairVisitLocalError("Fields can only be removed after the visit is returned.");
    if ((await localDatabase.rvItems.where("visitUuid").equals(item.visitUuid).count()) <= 1) throw new RepairVisitLocalError("A repair visit needs at least one field.");
    const photo = item.photoUuid ? await localDatabase.rvPhotos.get(item.photoUuid) : undefined;
    // A photo the server already holds is dropped with its item on Submit; only unsent bytes are deleted here.
    if (photo && photo.syncStatus !== "Synced") await localDatabase.rvPhotos.delete(photo.photoUuid);
    await localDatabase.rvItems.delete(itemUuid);
    await localDatabase.rvVisits.update(item.visitUuid, { localUpdatedAt: now() });
  });
}

/** Returned visits only: add a field taken from the downloaded catalog of the same previous visit. */
export async function addItem(visitUuid: string, field: RepairCatalogField) {
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, async () => {
    const visit = await editableState(visitUuid);
    if (visit.status !== "returned") throw new RepairVisitLocalError("Fields can only be added after the visit is returned.");
    const items = await localDatabase.rvItems.where("visitUuid").equals(visitUuid).toArray();
    const key = JSON.stringify(field.identity);
    if (items.some(item => JSON.stringify(item.identity) === key)) throw new RepairVisitLocalError("That field is already on this repair visit.");
    await localDatabase.rvItems.add({
      clientUuid: crypto.randomUUID(), visitUuid, identity: field.identity, systemLabel: field.systemLabel, unitLabel: field.unitLabel,
      sectionLabel: field.sectionLabel, fieldLabel: field.fieldLabel, before: field.before, outcome: null, remark: "", photoUuid: null,
      sortOrder: Math.max(-1, ...items.map(item => item.sortOrder)) + 1
    });
    await localDatabase.rvVisits.update(visitUuid, { localUpdatedAt: now() });
  });
}

export async function loadVisitWithItems(visitUuid: string) {
  const [visit, items, photos] = await Promise.all([
    localDatabase.rvVisits.get(visitUuid),
    localDatabase.rvItems.where("visitUuid").equals(visitUuid).sortBy("sortOrder"),
    localDatabase.rvPhotos.where("visitUuid").equals(visitUuid).toArray()
  ]);
  return { visit, items, photos: new Map(photos.map(photo => [photo.photoUuid, photo])) };
}

async function verifyPhotoBytes(photo: LocalRepairVisitPhoto) {
  if (!(photo.blob instanceof Blob) || photo.blob.size !== photo.sizeBytes || photo.blob.size <= 0 || photo.blob.size > 2 * 1024 * 1024
    || await sha256Hex(await photo.blob.arrayBuffer()) !== photo.sourceSha256) {
    throw new RepairVisitLocalError("A saved photo is damaged on this device. Take that photo again, then submit.");
  }
}

/**
 * Local Submit (works offline). Freezes the exact request bodies and queues photos first, then the visit, in one transaction.
 * Later edits cannot change what was frozen; a rejected visit is reopened with `reopenForEdit`.
 */
export async function submitRepairVisitLocal(visitUuid: string): Promise<LocalRepairVisit> {
  const userId = workspaceActor();
  const { visit, items, photos } = await loadVisitWithItems(visitUuid);
  if (!visit) throw new RepairVisitLocalError("This repair visit is no longer on this device.");
  if (!isEditable(visit)) throw new RepairVisitLocalError("This repair visit cannot be submitted again.");
  if (visit.createdByUserId !== userId) throw new RepairVisitLocalError("This repair visit belongs to another technician.");
  if (items.length === 0) throw new RepairVisitLocalError("A repair visit needs at least one field.");
  for (const item of items) {
    const problems = itemProblems(item, item.photoUuid ? photos.get(item.photoUuid) : undefined);
    if (problems.length) throw new RepairVisitLocalError(`"${item.fieldLabel}" is not complete: add ${problems.map(problem => problem === "outcome" ? "a result" : problem === "remark" ? "a remark" : "a photo").join(", ")}.`);
  }
  const revision = nextSubmitRevision(visit);
  const used = items.map(item => photos.get(item.photoUuid!)!);
  for (const photo of used) { if (photo.syncStatus !== "Synced") await verifyPhotoBytes(photo); }
  const body: RepairVisitSubmitBody = {
    operationUuid: crypto.randomUUID(), expectedRevision: visit.revision, revision,
    items: items.map(item => ({
      clientUuid: item.clientUuid, identity: item.identity, outcome: item.outcome!, remark: item.remark,
      photoUuid: item.photoUuid!, sourceSha256: photos.get(item.photoUuid!)!.sourceSha256
    }))
  };
  const submitFingerprint = await requestFingerprint({ action: "submit", actorId: userId, clientUuid: visitUuid, ...body });
  const staged = used.filter(photo => photo.syncStatus !== "Synced").map(photo => {
    const metadata: RepairVisitPhotoMetadata = {
      photoUuid: photo.photoUuid, itemUuid: photo.itemUuid, revision, sourceSha256: photo.sourceSha256, sizeBytes: photo.sizeBytes,
      width: photo.width, height: photo.height, captureSource: photo.captureSource, capturedAt: photo.capturedAt
    };
    return { photo, metadata };
  });
  const prints = await Promise.all(staged.map(entry => requestFingerprint({ actorId: userId, clientUuid: visitUuid, ...entry.metadata })));
  const stamp = now();
  return localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, localDatabase.rvPhotos, localDatabase.syncOutbox, async () => {
    const current = await localDatabase.rvVisits.get(visitUuid);
    const currentItems = await localDatabase.rvItems.where("visitUuid").equals(visitUuid).sortBy("sortOrder");
    // The form edits asynchronously; refuse if anything changed since the bodies above were built.
    if (!current || !isEditable(current) || JSON.stringify(currentItems) !== JSON.stringify(items) || current.revision !== visit.revision || current.status !== visit.status) {
      throw new RepairVisitLocalError("The repair visit changed while it was being submitted. Check it and submit again.");
    }
    const frozen = { visit: { ...current }, items: currentItems, revision };
    await localDatabase.rvVisits.update(visitUuid, { frozen, requestFingerprint: submitFingerprint, syncStatus: "Pending", lastSyncError: undefined, lastSyncErrorCode: undefined, localUpdatedAt: stamp });
    for (const [index, entry] of staged.entries()) {
      await localDatabase.rvPhotos.update(entry.photo.photoUuid, { syncStatus: "Pending", frozen: entry.metadata, requestFingerprint: prints[index], revision, lastSyncError: undefined, localUpdatedAt: stamp });
      await localDatabase.syncOutbox.add({
        operationId: crypto.randomUUID(), entityType: "rvPhoto", entityId: entry.photo.photoUuid, action: "create",
        payload: { kind: "photo", visitUuid, metadata: entry.metadata, fingerprint: prints[index]! } satisfies RepairVisitOutboxPayload,
        createdAt: stamp, attempts: 0, status: "Pending", activeKey: `rvPhoto:create:${entry.photo.photoUuid}`
      });
    }
    await localDatabase.syncOutbox.add({
      operationId: crypto.randomUUID(), entityType: "rvVisit", entityId: visitUuid, action: "create",
      payload: { kind: "submit", body, fingerprint: submitFingerprint } satisfies RepairVisitOutboxPayload,
      createdAt: stamp, attempts: 0, status: "Pending", activeKey: `rvVisit:submit:${visitUuid}:${revision}`
    });
    return (await localDatabase.rvVisits.get(visitUuid))!;
  });
}

const outstanding = (item: SyncOutboxItem) => (item.entityType === "rvVisit" || item.entityType === "rvPhoto") && item.status !== "Completed";
async function visitOperations(visitUuid: string) {
  const all = await localDatabase.syncOutbox.where("status").anyOf("Pending", "Failed", "Syncing").toArray();
  return all.filter(item => outstanding(item) && (item.entityId === visitUuid || (item.payload as { visitUuid?: unknown })?.visitUuid === visitUuid));
}

/** A refused or interrupted visit goes back in the queue once the cause is fixed. Nothing local is changed. */
export async function requeueRepairVisit(visitUuid: string) {
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvPhotos, localDatabase.syncOutbox, async () => {
    const visit = await localDatabase.rvVisits.get(visitUuid);
    if (!visit || (visit.syncStatus !== "Failed" && visit.syncStatus !== "Conflict")) return;
    for (const operation of (await visitOperations(visitUuid)).filter(item => item.status === "Failed")) {
      await localDatabase.syncOutbox.update(operation.operationId, { status: "Pending" });
    }
    await localDatabase.rvPhotos.where("visitUuid").equals(visitUuid).filter(photo => photo.syncStatus === "Failed").modify({ syncStatus: "Pending" });
    await localDatabase.rvVisits.update(visitUuid, { syncStatus: "Pending", localUpdatedAt: now() });
  });
}

/**
 * After a definite refusal of the submission, unfreeze the visit so it can be corrected and submitted again.
 * Only possible once the server has the visit (create confirmed); photos the server already staged stay locked.
 */
export async function reopenForEdit(visitUuid: string) {
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvPhotos, localDatabase.syncOutbox, async () => {
    const visit = await localDatabase.rvVisits.get(visitUuid);
    if (!visit?.frozen || !visit.createConfirmed || (visit.syncStatus !== "Failed" && visit.syncStatus !== "Conflict")) {
      throw new RepairVisitLocalError("This repair visit cannot be reopened.");
    }
    const operations = await visitOperations(visitUuid);
    if (operations.some(item => item.status === "Syncing")) throw new RepairVisitLocalError("This repair visit is being sent. Try again in a moment.");
    for (const operation of operations) {
      const kind = (operation.payload as { kind?: unknown })?.kind;
      if (kind === "submit" || kind === "photo") await localDatabase.syncOutbox.delete(operation.operationId);
    }
    await localDatabase.rvPhotos.where("visitUuid").equals(visitUuid).filter(photo => photo.syncStatus !== "Synced")
      .modify({ syncStatus: "Draft", frozen: undefined, requestFingerprint: undefined, lastSyncError: undefined });
    await localDatabase.rvVisits.update(visitUuid, { frozen: undefined, requestFingerprint: undefined, syncStatus: "Synced", localUpdatedAt: now() });
  });
}

/** `needs-server`: the server holds it. `maybe-on-server`: a create was sent but never confirmed, so the server may or may not hold it. */
export type DeleteOutcome = { kind: "deleted-local" } | { kind: "needs-server"; revision: number } | { kind: "maybe-on-server"; revision: number };

/** Delete an unstarted visit. A visit the server never received is removed here; otherwise the server must delete it first. */
export async function prepareDeleteRepairVisit(visitUuid: string): Promise<DeleteOutcome> {
  return localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, localDatabase.rvPhotos, localDatabase.syncOutbox, async () => {
    const visit = await localDatabase.rvVisits.get(visitUuid);
    if (!visit) throw new RepairVisitLocalError("This repair visit is no longer on this device.");
    const items = await localDatabase.rvItems.where("visitUuid").equals(visitUuid).toArray();
    const photos = await localDatabase.rvPhotos.where("visitUuid").equals(visitUuid).count();
    if (visit.status !== "draft" || visit.frozen || photos > 0 || items.some(item => item.outcome !== null || item.remark.trim() || item.photoUuid)) {
      throw new RepairVisitLocalError("Only a repair visit that has not been started can be deleted.");
    }
    const operations = await visitOperations(visitUuid);
    if (operations.some(item => item.status === "Syncing")) throw new RepairVisitLocalError("This repair visit is being sent. Try again in a moment.");
    if (visit.createConfirmed) return { kind: "needs-server" as const, revision: visit.revision };
    // A create that was sent but not answered may have been committed by the server; deleting only here would leave a ghost draft.
    if (operations.some(item => (item.payload as { kind?: unknown })?.kind === "create" && item.attempts > 0)) {
      return { kind: "maybe-on-server" as const, revision: visit.revision };
    }
    await removeLocalVisit(visitUuid);
    return { kind: "deleted-local" as const };
  });
}

/**
 * Throw away a visit whose create the server definitely refused (nothing of it exists on the server). The technician confirms first;
 * this is the only way out of a refusal such as a changed customer setup, because the same request can never succeed.
 */
export async function discardRefusedRepairVisit(visitUuid: string) {
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, localDatabase.rvPhotos, localDatabase.syncOutbox, async () => {
    const visit = await localDatabase.rvVisits.get(visitUuid);
    if (!visit) return;
    if (visit.createdByUserId !== currentWorkspaceUserId()) throw new RepairVisitLocalError("This repair visit belongs to another technician.");
    if (visit.createConfirmed || (visit.syncStatus !== "Failed" && visit.syncStatus !== "Conflict")) {
      throw new RepairVisitLocalError("Only a repair visit the server refused to create can be discarded.");
    }
    if ((await visitOperations(visitUuid)).some(item => item.status === "Syncing")) throw new RepairVisitLocalError("This repair visit is being sent. Try again in a moment.");
    await removeLocalVisit(visitUuid);
  });
}

/** Remove every local row of a visit the server has deleted (or never received). Must run inside a transaction. */
export async function removeLocalVisit(visitUuid: string) {
  const operations = (await localDatabase.syncOutbox.toArray()).filter(item => (item.entityType === "rvVisit" || item.entityType === "rvPhoto")
    && (item.entityId === visitUuid || (item.payload as { visitUuid?: unknown })?.visitUuid === visitUuid));
  for (const operation of operations) await localDatabase.syncOutbox.delete(operation.operationId);
  await localDatabase.rvPhotos.where("visitUuid").equals(visitUuid).delete();
  await localDatabase.rvItems.where("visitUuid").equals(visitUuid).delete();
  await localDatabase.rvVisits.delete(visitUuid);
}
export async function removeLocalVisitConfirmedDeleted(visitUuid: string) {
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, localDatabase.rvPhotos, localDatabase.syncOutbox, () => removeLocalVisit(visitUuid));
}
