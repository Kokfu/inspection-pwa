import { currentWorkspaceUserId, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { isServerUnreachable } from "../jobs/serverReachability";
import { AUTO_SYNC_FAILED_BACKOFF_MS } from "../sync/autoSync";
import { postCreate, postPhoto, postSubmit, RepairVisitApiError } from "./repairVisitApi";
import { requestFingerprint, sha256Hex } from "./repairVisitCanon";
import { createReceiptConfirms, photoReceiptConfirms, RepairVisitContractError, submitReceiptConfirms } from "./repairVisitParsers";
import type { RepairVisitCreateReceipt, RepairVisitOutboxPayload } from "./repairVisitTypes";

export type RepairVisitSyncContext = { actorUserId: number | undefined; assertIdentity: () => Promise<void> };

const isRepairVisitOperation = (item: SyncOutboxItem) => item.entityType === "rvVisit" || item.entityType === "rvPhoto";
const isWaiting = (item: SyncOutboxItem) => item.status === "Pending" || item.status === "Failed";
const payloadOf = (item: SyncOutboxItem) => item.payload as RepairVisitOutboxPayload;
const visitOf = (item: SyncOutboxItem) => payloadOf(item).kind === "photo" ? (payloadOf(item) as { visitUuid: string }).visitUuid : item.entityId;
const conflictCodes = new Set(["IDEMPOTENCY_CONFLICT", "VISIT_LOCKED", "STALE_REVISION", "VISIT_DELETED", "ITEM_IDENTITY_CHANGED"]);

/** A refused operation is not re-sent by the timer more often than the usual Failed backoff; Retry and reconnect are never delayed. */
function isCoolingDown(item: SyncOutboxItem, at: number) {
  if (item.status !== "Failed" || !item.lastAttemptAt) return false;
  const last = Date.parse(item.lastAttemptAt);
  return !Number.isNaN(last) && at - last >= 0 && at - last < AUTO_SYNC_FAILED_BACKOFF_MS;
}

/** A crash or force-close mid-request leaves operations "Syncing". Every request is idempotent, so the same payload is queued again. */
export async function recoverInterruptedRepairVisits() {
  const syncing = (await localDatabase.syncOutbox.where("status").equals("Syncing").toArray()).filter(isRepairVisitOperation);
  const visits = await localDatabase.rvVisits.where("syncStatus").equals("Syncing").toArray();
  const photos = await localDatabase.rvPhotos.where("syncStatus").equals("Uploading").toArray();
  if (!syncing.length && !visits.length && !photos.length) return 0;
  await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvPhotos, localDatabase.syncOutbox, async () => {
    for (const item of syncing) await localDatabase.syncOutbox.update(item.operationId, { status: "Pending", lastError: undefined });
    for (const visit of visits) await localDatabase.rvVisits.update(visit.clientUuid, { syncStatus: "Pending", lastSyncError: undefined });
    for (const photo of photos) await localDatabase.rvPhotos.update(photo.photoUuid, { syncStatus: "Pending", lastSyncError: undefined });
  });
  return syncing.length + visits.length + photos.length;
}

type Outcome =
  | { kind: "confirmed" }
  | { kind: "retry"; message: string }
  | { kind: "refused"; code: string | undefined; message: string; conflict: boolean };

/** Map any failure to what the technician should see. Only a definite refusal is Failed; no answer is retried unchanged. */
function classify(error: unknown): Outcome {
  if (error instanceof RepairVisitApiError) {
    if (error.status === 401) return { kind: "retry", message: "Sign in again to send this repair visit." };
    if (error.status >= 500 || error.status === 408 || error.status === 429) return { kind: "retry", message: `The server could not take this repair visit yet (HTTP ${error.status}); it will be sent again.` };
    if (error.code === "VISIT_NOT_YET_CREATED") return { kind: "retry", message: "The server has not received this repair visit yet; it will be sent again." };
    return { kind: "refused", code: error.code, message: error.message, conflict: error.code !== undefined && conflictCodes.has(error.code) };
  }
  if (isServerUnreachable(error)) return { kind: "retry", message: "Could not reach the server; this repair visit will be sent again." };
  if (error instanceof Error && /Authentication changed/.test(error.message)) return { kind: "retry", message: error.message };
  if (error instanceof RepairVisitContractError) return { kind: "refused", code: undefined, message: error.message, conflict: false };
  return { kind: "refused", code: undefined, message: error instanceof Error ? error.message : "The repair visit could not be sent.", conflict: false };
}

/** Records the answer against the exact operation that was sent; an operation changed or removed meanwhile is left alone. */
async function settle(operationId: string, visitUuid: string, outcome: Outcome, apply?: () => Promise<void>) {
  return localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, localDatabase.rvPhotos, localDatabase.syncOutbox, async () => {
    const operation = await localDatabase.syncOutbox.get(operationId);
    if (!operation || operation.status !== "Syncing") return false;
    const at = new Date().toISOString();
    const photoUuid = operation.entityType === "rvPhoto" ? operation.entityId : undefined;
    if (outcome.kind === "confirmed") {
      await apply?.();
      await localDatabase.syncOutbox.update(operationId, { status: "Completed", activeKey: undefined, completedAt: at, lastError: undefined });
    } else if (outcome.kind === "refused") {
      await localDatabase.syncOutbox.update(operationId, { status: "Failed", lastError: outcome.message });
      if (photoUuid) await localDatabase.rvPhotos.update(photoUuid, { syncStatus: "Failed", lastSyncError: outcome.message, localUpdatedAt: at });
      await localDatabase.rvVisits.update(visitUuid, { syncStatus: outcome.conflict ? "Conflict" : "Failed", lastSyncError: outcome.message, lastSyncErrorCode: outcome.code, localUpdatedAt: at });
    } else {
      await localDatabase.syncOutbox.update(operationId, { status: "Pending", lastError: outcome.message });
      if (photoUuid) await localDatabase.rvPhotos.update(photoUuid, { syncStatus: "Pending", lastSyncError: outcome.message, localUpdatedAt: at });
      await localDatabase.rvVisits.update(visitUuid, { syncStatus: "Pending", lastSyncError: outcome.message, localUpdatedAt: at });
    }
    return true;
  });
}

async function claim(item: SyncOutboxItem, visitUuid: string, expectedFingerprint: string) {
  return localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvPhotos, localDatabase.syncOutbox, async () => {
    const current = await localDatabase.syncOutbox.get(item.operationId);
    const visit = await localDatabase.rvVisits.get(visitUuid);
    if (!current || !isWaiting(current) || JSON.stringify(current.payload) !== JSON.stringify(item.payload) || !visit || visit.createdByUserId !== currentWorkspaceUserId()) return false;
    if (payloadOf(current).fingerprint !== expectedFingerprint) {
      const message = "This repair visit was queued by a different account or was altered; sign in as its owner to send it.";
      await localDatabase.syncOutbox.update(current.operationId, { status: "Failed", lastError: message });
      await localDatabase.rvVisits.update(visitUuid, { syncStatus: "Failed", lastSyncError: message });
      return false;
    }
    const at = new Date().toISOString();
    await localDatabase.syncOutbox.update(current.operationId, { status: "Syncing", attempts: current.attempts + 1, lastAttemptAt: at, lastError: undefined });
    await localDatabase.rvVisits.update(visitUuid, { syncStatus: "Syncing", lastSyncError: undefined, lastSyncErrorCode: undefined, localUpdatedAt: at });
    if (item.entityType === "rvPhoto") await localDatabase.rvPhotos.update(item.entityId, { syncStatus: "Uploading", lastSyncError: undefined, localUpdatedAt: at });
    return true;
  });
}

/**
 * Per visit, strictly in order: create the visit, stage each photo, then submit. The next step only starts when the
 * server's receipt for the previous one echoed the exact UUID and the fingerprint the server computes itself.
 */
export async function syncPendingRepairVisits(context: RepairVisitSyncContext) {
  const actorId = context.actorUserId ?? currentWorkspaceUserId();
  const result = { confirmed: 0, failed: 0, attempted: 0 };
  if (actorId === undefined) return result;
  const all = (await localDatabase.syncOutbox.toArray()).filter(isRepairVisitOperation).filter(item => item.status !== "Completed");
  const byVisit = new Map<string, SyncOutboxItem[]>();
  for (const item of all.sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    byVisit.set(visitOf(item), [...(byVisit.get(visitOf(item)) ?? []), item]);
  }
  for (const [visitUuid, operations] of byVisit) {
    const stepsOf = (kind: string) => operations.filter(item => payloadOf(item).kind === kind);
    const ordered = [...stepsOf("create"), ...stepsOf("photo"), ...stepsOf("submit")];
    for (const item of ordered) {
      // Anything in flight or cooling down holds the rest of this visit's chain; nothing is skipped past it.
      const current = await localDatabase.syncOutbox.get(item.operationId);
      if (!current || current.status === "Completed") continue;
      if (!isWaiting(current) || isCoolingDown(current, Date.now())) break;
      result.attempted += 1;
      const stepOutcome = await sendStep(current, visitUuid, actorId, context);
      if (stepOutcome === "confirmed") result.confirmed += 1;
      else { if (stepOutcome === "refused") result.failed += 1; break; }
    }
  }
  return result;
}

async function sendStep(item: SyncOutboxItem, visitUuid: string, actorId: number, context: RepairVisitSyncContext): Promise<"confirmed" | "retry" | "refused" | "skipped"> {
  const payload = payloadOf(item);
  let expected: string;
  try {
    expected = payload.kind === "create" ? await requestFingerprint({ actorId, ...payload.request })
      : payload.kind === "photo" ? await requestFingerprint({ actorId, clientUuid: visitUuid, ...payload.metadata })
        : await requestFingerprint({ action: "submit", actorId, clientUuid: visitUuid, ...payload.body });
  } catch { return "skipped"; }
  if (!await claim(item, visitUuid, expected)) return "skipped";
  let outcome: Outcome;
  let apply: (() => Promise<void>) | undefined;
  try {
    await context.assertIdentity();
    if (payload.kind === "create") {
      const receipt = await postCreate(payload.request);
      if (!await createReceiptConfirms(receipt, payload.request, actorId)) throw new RepairVisitContractError("create receipt for a different visit");
      apply = () => applyCreate(visitUuid, receipt);
    } else if (payload.kind === "photo") {
      const photo = await localDatabase.rvPhotos.get(item.entityId);
      if (!photo || photo.visitUuid !== visitUuid || JSON.stringify(photo.frozen) !== JSON.stringify(payload.metadata)) throw new Error("The local photo does not match its queued upload.");
      if (photo.blob.size !== payload.metadata.sizeBytes || await sha256Hex(await photo.blob.arrayBuffer()) !== payload.metadata.sourceSha256) {
        throw new Error("A saved photo is damaged on this device. Take that photo again, then submit.");
      }
      const receipt = await postPhoto(visitUuid, payload.metadata, photo.blob);
      if (!await photoReceiptConfirms(receipt, visitUuid, payload.metadata, actorId)) throw new RepairVisitContractError("photo receipt for a different photo");
      apply = async () => { await localDatabase.rvPhotos.update(photo.photoUuid, { syncStatus: "Synced", storedSha256: receipt.storedSha256, lastSyncError: undefined, localUpdatedAt: new Date().toISOString() }); };
    } else {
      const receipt = await postSubmit(visitUuid, payload.body);
      if (!await submitReceiptConfirms(receipt, visitUuid, payload.body, actorId)) throw new RepairVisitContractError("submit receipt for a different submission");
      apply = () => applySubmit(visitUuid, payload.body.revision);
    }
    outcome = { kind: "confirmed" };
  } catch (error) {
    outcome = classify(error);
  }
  const applied = await settle(item.operationId, visitUuid, outcome, apply);
  if (!applied) return "skipped";
  return outcome.kind === "confirmed" ? "confirmed" : outcome.kind === "retry" ? "retry" : "refused";
}

/** Runs inside the settle transaction. The server's receipt supplies the RV number and, for an online create, the visit day. */
async function applyCreate(visitUuid: string, receipt: RepairVisitCreateReceipt) {
  const visit = await localDatabase.rvVisits.get(visitUuid);
  if (!visit) return;
  const at = new Date().toISOString();
  await localDatabase.rvVisits.update(visitUuid, {
    visitNumber: receipt.visitNumber, visitDate: receipt.visitDate, deviceCreatedAt: receipt.deviceCreatedAt, createConfirmed: true,
    syncStatus: visit.frozen ? "Pending" : "Synced", lastSyncError: undefined, lastSyncErrorCode: undefined, lastSyncedAt: at, localUpdatedAt: at
  });
}

/** Runs inside the settle transaction: the server now holds this revision; photos it superseded are no longer needed here. */
async function applySubmit(visitUuid: string, revision: number) {
  const visit = await localDatabase.rvVisits.get(visitUuid);
  if (!visit?.frozen || visit.frozen.revision !== revision) return;
  const at = new Date().toISOString();
  await localDatabase.rvVisits.update(visitUuid, {
    status: "awaiting_approval", revision, frozen: undefined, requestFingerprint: undefined, syncStatus: "Synced", returnReason: null,
    lastSyncError: undefined, lastSyncErrorCode: undefined, lastSyncedAt: at, localUpdatedAt: at
  });
  const kept = new Set((await localDatabase.rvItems.where("visitUuid").equals(visitUuid).toArray()).map(item => item.photoUuid));
  for (const photo of await localDatabase.rvPhotos.where("visitUuid").equals(visitUuid).toArray()) {
    if (!kept.has(photo.photoUuid)) await localDatabase.rvPhotos.delete(photo.photoUuid);
  }
}
