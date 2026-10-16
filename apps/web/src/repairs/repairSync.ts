import Dexie from "dexie";
import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { canonical, fingerprint, hash, object, requireRepair } from "./repairContract";
import { errorMessage, repairContext, repairRequest, verifyRepairBlob, type RepairContext } from "./repairRepository";
import type { RepairPart, RepairPhotoInput } from "./repairTypes";

export const isRepairOperation = (o: SyncOutboxItem) => o.entityType === "repairEvidence" || o.entityType === "repairRecord";
const retryable = (o: SyncOutboxItem) => o.status === "Pending" || o.status === "Failed";
const tables = (ctx: RepairContext) => [ctx.db.syncOutbox, ctx.db.repairRecords, ctx.db.repairAttachments];
/** Called by the one inspection sync coordinator, never while a repair request is live. */
export async function recoverInterruptedRepairs() {
  const db = localDatabase;
  await db.transaction("rw", db.syncOutbox, db.repairRecords, db.repairAttachments, async () => {
    const error = "Repair sync was interrupted; retry the same immutable UUIDs to confirm";
    for (const o of await db.syncOutbox.where("status").equals("Syncing").toArray()) if (isRepairOperation(o)) await db.syncOutbox.update(o.operationId, { status: "Failed", lastError: error });
    await db.repairRecords.where("syncStatus").equals("Syncing").modify({ syncStatus: "Failed", lastSyncError: error });
    await db.repairAttachments.where("syncStatus").equals("Uploading").modify({ syncStatus: "Failed", lastSyncError: error });
  });
}
async function currentOperation(ctx: RepairContext, op: SyncOutboxItem, status: string) {
  await ctx.assert();
  const current = await ctx.db.syncOutbox.get(op.operationId);
  requireRepair(current && current.status === status && current.activeKey === op.activeKey && current.entityType === op.entityType
    && current.entityId === op.entityId && canonical(current.payload) === canonical(op.payload), "REPAIR_STALE_DISPATCH");
}
async function validateFrozen(ctx: RepairContext, op: SyncOutboxItem, checkBlob: boolean) {
  const photo = op.entityType === "repairEvidence";
  requireRepair(op.activeKey === `${op.entityType}:create:${op.entityId}` && op.action === "create");
  const a = photo ? await ctx.db.repairAttachments.get(op.entityId) : undefined;
  const r = await ctx.db.repairRecords.get(photo ? a?.repairUuid ?? "" : op.entityId);
  requireRepair(r?.actorId === ctx.actorId && r.frozen && r.requestFingerprint && r.syncStatus !== "Draft" && r.syncStatus !== "Conflict", "REPAIR_FROZEN_INVALID");
  requireRepair(canonical(photo ? a?.frozen : r.frozen) === canonical(op.payload)
    && r.frozen.clientUuid === r.clientUuid && r.frozen.remark === r.remark && r.frozen.performedAt === r.performedAt
    && r.frozen.cycleSequence === r.cycleSequence && r.frozen.predecessorUuid === r.predecessorUuid
    && r.frozen.findingId === r.findingId && r.frozen.workOrderId === r.workOrderId && r.frozen.jobId === r.jobId && r.frozen.systemKey === r.systemKey
    && r.frozen.manifest.length === 1 && r.frozen.manifest[0].photoUuid === r.photoUuid, "REPAIR_FROZEN_INVALID");
  requireRepair(await Dexie.waitFor(fingerprint({ actorId: ctx.actorId, ...r.frozen })) === r.requestFingerprint, "REPAIR_FROZEN_INVALID");
  const attachment = a ?? await ctx.db.repairAttachments.get(r.photoUuid!);
  requireRepair(attachment?.frozen && attachment.requestFingerprint && attachment.repairUuid === r.clientUuid
    && attachment.photoUuid === r.photoUuid && attachment.frozen.photoUuid === attachment.photoUuid
    && attachment.frozen.repairUuid === r.clientUuid && attachment.frozen.sourceSha256 === attachment.sourceSha256
    && attachment.frozen.capturedAt === attachment.capturedAt && attachment.frozen.captureSource === attachment.captureSource
    && attachment.frozen.width === attachment.width && attachment.frozen.height === attachment.height && attachment.frozen.sizeBytes === attachment.sizeBytes
    && attachment.sourceSha256 === r.frozen.manifest[0].sourceSha256, "REPAIR_FROZEN_INVALID");
  for (const key of ["findingId", "workOrderId", "jobId", "systemKey", "expectedWorkOrderRevision", "expectedSourceRevision", "sourceFingerprint"] as const)
    requireRepair(attachment.frozen[key] === r.frozen[key], "REPAIR_FROZEN_INVALID");
  requireRepair(await Dexie.waitFor(fingerprint({ actorId: ctx.actorId, ...attachment.frozen })) === attachment.requestFingerprint, "REPAIR_FROZEN_INVALID");
  if (checkBlob) await Dexie.waitFor(verifyRepairBlob(attachment.blob, attachment, attachment.sourceSha256));
  return { r, a: attachment };
}
function validatePhotoReceipt(value: unknown, input: RepairPhotoInput, expected: string): asserts value is Record<string, unknown> {
  requireRepair(object(value) && Object.keys(value).sort().join() === "findingId,jobId,photoUuid,repairUuid,requestFingerprint,sourceSha256,storedSha256,systemKey,workOrderId"
    && value.photoUuid === input.photoUuid && value.repairUuid === input.repairUuid && value.requestFingerprint === expected
    && value.sourceSha256 === input.sourceSha256 && hash(value.storedSha256) && value.findingId === input.findingId
    && value.workOrderId === input.workOrderId && value.jobId === input.jobId && value.systemKey === input.systemKey, "REPAIR_RECEIPT_MISMATCH");
}
function validateParentReceipt(value: unknown, input: RepairPart, expected: string): asserts value is Record<string, unknown> {
  requireRepair(object(value) && Object.keys(value).sort().join() === "clientUuid,cycleSequence,findingId,jobId,predecessorUuid,requestFingerprint,sourceRevision,systemKey,workOrderId"
    && value.clientUuid === input.clientUuid && value.requestFingerprint === expected && value.findingId === input.findingId
    && value.workOrderId === input.workOrderId && value.jobId === input.jobId && value.systemKey === input.systemKey
    && value.cycleSequence === input.cycleSequence && value.predecessorUuid === input.predecessorUuid
    && value.sourceRevision === input.expectedSourceRevision, "REPAIR_RECEIPT_MISMATCH");
}
async function fail(ctx: RepairContext, op: SyncOutboxItem, e: unknown) {
  // Even if auth changed, update only the captured workspace's exact still-active operation. Keep all bytes.
  await ctx.db.transaction("rw", tables(ctx), async () => {
    const current = await ctx.db.syncOutbox.get(op.operationId);
    if (!current || current.status === "Completed" || current.activeKey !== op.activeKey || canonical(current.payload) !== canonical(op.payload)) return;
    const lastError = errorMessage(e);
    await ctx.db.syncOutbox.update(op.operationId, { status: "Failed", lastError });
    if (op.entityType === "repairEvidence") await ctx.db.repairAttachments.update(op.entityId, { syncStatus: "Failed", lastSyncError: lastError });
    else await ctx.db.repairRecords.update(op.entityId, { syncStatus: "Failed", lastSyncError: lastError });
  });
}
/** Bounded per-part batches isolate failures. Server partial results are never blanket confirmations. */
export async function dispatchPendingRepairs() {
  const work = (await localDatabase.syncOutbox.where("status").anyOf("Pending", "Failed").toArray()).filter(isRepairOperation);
  if (!work.length) return { confirmed: 0, failed: 0 };
  const ctx = await repairContext();
  let confirmed = 0, failed = 0;
  const ordered = [...work.filter(o => o.entityType === "repairEvidence"), ...work.filter(o => o.entityType === "repairRecord")];
  for (const op of ordered) {
    try {
      await currentOperation(ctx, op, op.status);
      const { r, a } = await validateFrozen(ctx, op, true);
      const photo = op.entityType === "repairEvidence";
      if (!photo) {
        const dependency = await ctx.db.syncOutbox.where("activeKey").equals(`repairEvidence:create:${a.photoUuid}`).first();
        if (a.syncStatus !== "Synced" || dependency) continue;
        validatePhotoReceipt(a.receipt, a.frozen!, a.requestFingerprint!);
      }
      await ctx.db.transaction("rw", tables(ctx), async () => {
        await currentOperation(ctx, op, op.status); await validateFrozen(ctx, op, false);
        await ctx.db.syncOutbox.update(op.operationId, { status: "Syncing", attempts: op.attempts + 1, lastAttemptAt: new Date().toISOString() });
        if (photo) await ctx.db.repairAttachments.update(a.photoUuid, { syncStatus: "Uploading" });
        else await ctx.db.repairRecords.update(r.clientUuid, { syncStatus: "Syncing" });
      });
      await currentOperation(ctx, op, "Syncing");
      let receipt: unknown;
      if (photo) {
        const body = new FormData(); body.append("metadata", JSON.stringify(op.payload)); body.append("file", a.blob, `${a.photoUuid}.jpg`);
        receipt = await (await repairRequest(ctx, "evidence/stage", { method: "POST", body })).json();
        validatePhotoReceipt(receipt, a.frozen!, a.requestFingerprint!);
      } else {
        const result: unknown = await (await repairRequest(ctx, "submissions", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: r.jobId, systemKey: r.systemKey, parts: [op.payload] }) })).json();
        requireRepair(object(result) && Object.keys(result).sort().join() === "jobId,results,systemKey" && result.jobId === r.jobId && result.systemKey === r.systemKey
          && Array.isArray(result.results) && result.results.length === 1 && object(result.results[0]) && result.results[0].clientUuid === r.clientUuid, "REPAIR_RECEIPT_MISMATCH");
        const part = result.results[0];
        if (part.outcome === "failed") { requireRepair(typeof part.error === "string"); throw new Error(part.error); }
        requireRepair(part.outcome === "submitted" && Object.keys(part).sort().join() === "clientUuid,outcome,receipt", "REPAIR_RECEIPT_MISMATCH");
        receipt = part.receipt; validateParentReceipt(receipt, r.frozen!, r.requestFingerprint!);
      }
      await ctx.db.transaction("rw", tables(ctx), async () => {
        await currentOperation(ctx, op, "Syncing"); await validateFrozen(ctx, op, true);
        const at = new Date().toISOString();
        await ctx.db.syncOutbox.update(op.operationId, { status: "Completed", activeKey: undefined, completedAt: at, lastError: undefined });
        if (photo) await ctx.db.repairAttachments.update(a.photoUuid, { syncStatus: "Synced", receipt: receipt as Record<string, unknown>, lastSyncError: undefined });
        else await ctx.db.repairRecords.update(r.clientUuid, { syncStatus: "Synced", receipt: receipt as Record<string, unknown>, lastSyncError: undefined,
          lastSyncedAt: at, reviewState: "awaiting_approval" });
      });
      confirmed++;
    } catch (e) { failed++; await fail(ctx, op, e); }
  }
  return { confirmed, failed };
}
