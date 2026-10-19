import { currentWorkspaceUserId, deviceDatabase, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { refreshCommonRemarks, type CommonRemark } from "../inspectionControls/commonRemarks";
import { completeSectionRemark, parseSectionRemarkConfirmation, parseSectionRemarkOutboxPayload, refreshSectionRemarks, SectionRemarkNotConfirmedError } from "../inspectionControls/sectionRemarks";
import { outboxHasAutoSyncWork, type AutoSyncReason } from "./autoSync";
import { readRefusalBody, syncRefusalMessage } from "./syncRefusal";
import { syncPendingTechnicianCustomers, technicianCustomerSyncIdle } from "../jobs/technicianCustomerDraft";
import { dispatchPendingRepairs, isRepairOperation, recoverInterruptedRepairs } from "../repairs/repairSync";
import { locationProposalSyncIdle, syncPendingLocationProposals } from "../jobs/technicianLocationProposalDraft";
import { recoverInterruptedOfflineVisits, syncPendingOfflineServiceVisits } from "../jobs/offlineServiceVisitSync";
import { heldJobIds } from "../jobs/offlineServiceVisitStore";
import { recoverInterruptedRepairVisits, syncPendingRepairVisits } from "../repairVisits/repairVisitSync";
import type { FireAlarmInspectionRecord } from "../fireAlarm/fireAlarmTypes";
import type { PortableRecord } from "../portableFireExtinguisher/portableFireExtinguisher";
import { fireAlarmClientDispatch } from "../referenceData/systemContractCompatibility";
import {
  AttachmentUploadError,
  uploadInspectionAttachment,
  stageFireAlarmV6Evidence,
  stageV7Evidence
} from "../attachments/attachmentApi";

type SyncFailedItem = {
  id: string;
  code: string;
  message: string;
};

type SyncResponse = {
  acceptedIds: string[];
  duplicateIds: string[];
  failed: SyncFailedItem[];
};

function isFireAlarmOutboxItem(item: SyncOutboxItem) {
  return item.entityType === "masterSystemInspection"
    && typeof item.payload === "object" && item.payload !== null
    && (item.payload as { systemKey?: unknown }).systemKey === "fire_alarm_detector";
}

function isPortableOutboxItem(item: SyncOutboxItem) {
  return item.entityType === "masterSystemInspection"
    && typeof item.payload === "object" && item.payload !== null
    && (item.payload as { systemKey?: unknown }).systemKey === "portable_fire_extinguisher";
}

function fireAlarmPayloadMatches(record: FireAlarmInspectionRecord | undefined, item: SyncOutboxItem) {
  if (record?.systemKey !== "fire_alarm_detector") return false;
  if (record.masterTemplate.version === 6 || record.masterTemplate.version === 7) return item.entityType === "masterSystemInspection"
    && typeof item.payload === "object" && item.payload !== null
    && (item.payload as { clientUuid?: unknown }).clientUuid === record.clientUuid
    && Array.isArray((item.payload as { evidenceManifest?: unknown }).evidenceManifest);
  const expected = {
    clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey,
    instanceKey: record.instanceKey, configuredZoneId: record.configuredZoneId,
    configuredLocationId: record.configuredLocationId, displaySequence: record.displaySequence,
    originalCreatorSnapshot: record.originalCreatorSnapshot, masterTemplate: record.masterTemplate,
    configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot,
    responses: record.responses, performedAt: record.performedAt
  };
  return JSON.stringify(item.payload) === JSON.stringify(expected);
}

/** An offline-created visit's forms, photos and remarks wait (stay Pending, untouched) until the server confirms the visit's UUID. */
function payloadJobId(item: SyncOutboxItem) {
  const jobId = typeof item.payload === "object" && item.payload !== null ? (item.payload as { jobId?: unknown }).jobId : undefined;
  return typeof jobId === "string" ? jobId : undefined;
}

async function syncPendingV6Evidence(held: ReadonlySet<string>) {
  const work = (await localDatabase.syncOutbox.where("status").anyOf("Pending", "Failed").toArray()).filter((item) => item.entityType === "v6StagedEvidence");
  let accepted = 0; let failed = 0;
  for (const item of work) {
    const attachment = await localDatabase.inspectionAttachments.get(item.entityId); const record = attachment ? await localDatabase.masterSystemInspections.get(attachment.inspectionClientUuid) : undefined;
    if (record && held.has(record.jobId)) continue;
    if (!attachment || attachment.systemKey !== "fire_alarm_detector" || attachment.protocolVersion !== 6 || !record || record.systemKey !== "fire_alarm_detector") { await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: "Local V6 evidence or inspection is unavailable" }); failed += 1; continue; }
    const at = new Date().toISOString();
    await localDatabase.transaction("rw", localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => { await localDatabase.inspectionAttachments.update(attachment.photoUuid, { syncStatus: "Uploading", localUpdatedAt: at, lastSyncError: undefined }); await localDatabase.syncOutbox.update(item.operationId, { status: "Syncing", attempts: item.attempts + 1, lastAttemptAt: at, lastError: undefined }); });
    try {
      await assertSyncIdentity(); const staged = await stageFireAlarmV6Evidence(attachment, record, syncActorId); const done = new Date().toISOString();
      await localDatabase.transaction("rw", localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => { await localDatabase.inspectionAttachments.update(attachment.photoUuid, { syncStatus: "Synced", storedSha256: staged.storedSha256, lastSyncedAt: done, localUpdatedAt: done, lastSyncError: undefined }); await localDatabase.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: done, lastError: undefined }); }); accepted += 1;
    } catch (error) { const message = failureMessage(error); const conflict = error instanceof AttachmentUploadError && ["IDEMPOTENCY_CONFLICT", "RESERVATION_CONFLICT", "JOB_ACCESS_DENIED", "CONTRACT_MISMATCH"].includes(error.code); await localDatabase.transaction("rw", localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => { await localDatabase.inspectionAttachments.update(attachment.photoUuid, { syncStatus: conflict ? "Conflict" : "Failed", localUpdatedAt: new Date().toISOString(), lastSyncError: message }); await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: message }); }); failed += 1; }
  }
  return { accepted, failed, pending: work.length - accepted - failed };
}

async function syncPendingV7Evidence(held: ReadonlySet<string>) {
  const work = (await localDatabase.syncOutbox.where("status").anyOf("Pending", "Failed").toArray()).filter((item) => item.entityType === "v7StagedEvidence");
  let accepted = 0; let failed = 0;
  for (const item of work) {
    const attachment = await localDatabase.inspectionAttachments.get(item.entityId);
    const record = attachment?.systemKey === "fire_alarm_detector" || attachment?.systemKey === "hydrant" || attachment?.systemKey === "hose_reel" || attachment?.systemKey === "automatic_sprinkler" || attachment?.systemKey === "dry_wet_riser" || attachment?.systemKey === "smoke_ventilation" || attachment?.systemKey === "fire_intercom" || attachment?.systemKey === "fire_rated_roller_shutter" ? await localDatabase.masterSystemInspections.get(attachment.inspectionClientUuid) : attachment ? await localDatabase.masterSystemFormInstances.get(attachment.inspectionClientUuid) : undefined;
    if (record && held.has(record.jobId)) continue;
    if (!attachment || attachment.protocolVersion !== 7 || !record || attachment.systemKey !== record.systemKey || (record.systemKey !== "co2_fire_extinguisher" && record.systemKey !== "wet_chemical" && record.systemKey !== "fm200_fire_suppression" && record.systemKey !== "fire_alarm_detector" && record.systemKey !== "hydrant" && record.systemKey !== "hose_reel" && record.systemKey !== "automatic_sprinkler" && record.systemKey !== "dry_wet_riser" && record.systemKey !== "smoke_ventilation" && record.systemKey !== "fire_intercom" && record.systemKey !== "fire_rated_roller_shutter")) { await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: "Local V7 evidence or inspection is unavailable" }); failed += 1; continue; }
    const at = new Date().toISOString();
    await localDatabase.transaction("rw", localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => { await localDatabase.inspectionAttachments.update(attachment.photoUuid, { syncStatus: "Uploading", localUpdatedAt: at, lastSyncError: undefined }); await localDatabase.syncOutbox.update(item.operationId, { status: "Syncing", attempts: item.attempts + 1, lastAttemptAt: at, lastError: undefined }); });
    try {
      await assertSyncIdentity(); const staged = await stageV7Evidence(attachment, record, syncActorId); const done = new Date().toISOString();
      await localDatabase.transaction("rw", localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => { await localDatabase.inspectionAttachments.update(attachment.photoUuid, { syncStatus: "Synced", storedSha256: staged.storedSha256, lastSyncedAt: done, localUpdatedAt: done, lastSyncError: undefined }); await localDatabase.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: done, lastError: undefined }); }); accepted += 1;
    } catch (error) { const message = failureMessage(error); const conflict = error instanceof AttachmentUploadError && ["IDEMPOTENCY_CONFLICT", "RESERVATION_CONFLICT", "JOB_ACCESS_DENIED", "CONTRACT_MISMATCH"].includes(error.code); await localDatabase.transaction("rw", localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => { await localDatabase.inspectionAttachments.update(attachment.photoUuid, { syncStatus: conflict ? "Conflict" : "Failed", localUpdatedAt: new Date().toISOString(), lastSyncError: message }); await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: message }); }); failed += 1; }
  }
  return { accepted, failed, pending: work.length - accepted - failed };
}

async function v6FormReady(item: SyncOutboxItem) {
  if (!isFireAlarmOutboxItem(item) || !Array.isArray((item.payload as { evidenceManifest?: unknown }).evidenceManifest)) return true;
  const manifest = (item.payload as { evidenceManifest: Array<{ photoUuid?: unknown; fieldPath?: unknown; sourceSha256?: unknown }> }).evidenceManifest;
  for (const entry of manifest) { if (typeof entry.photoUuid !== "string") return false; const attachment = await localDatabase.inspectionAttachments.get(entry.photoUuid); if (!attachment || attachment.syncStatus !== "Synced" || attachment.fieldPath !== entry.fieldPath || attachment.sha256 !== entry.sourceSha256) return false; }
  return true;
}

async function v7FormReady(item: SyncOutboxItem) {
  const isV7MasterSystemInspectionOutboxItem = item.entityType === "masterSystemInspection" && typeof item.payload === "object" && item.payload !== null && (["hydrant", "hose_reel", "automatic_sprinkler", "dry_wet_riser", "smoke_ventilation", "fire_intercom", "fire_rated_roller_shutter"] as const).some((systemKey) => (item.payload as { systemKey?: unknown }).systemKey === systemKey);
  if ((item.entityType !== "masterSystemFormInstance" && !isFireAlarmOutboxItem(item) && !isV7MasterSystemInspectionOutboxItem) || !Array.isArray((item.payload as { evidenceManifest?: unknown }).evidenceManifest)) return true;
  // A V6 Fire Alarm parent carries a V6 evidence manifest whose staged photos are
  // protocolVersion 6; its readiness is v6FormReady's responsibility. It must never
  // reach the protocolVersion-7 manifest gate below, which would hold it in Pending
  // forever. V6-ness is read from the frozen template identity, not a version guess.
  if (isFireAlarmOutboxItem(item)) {
    const masterTemplate = (item.payload as { masterTemplate?: { id: string; code: string; version: number } }).masterTemplate;
    if (masterTemplate && fireAlarmClientDispatch(masterTemplate) === "v6") return true;
  }
  const manifest = (item.payload as { evidenceManifest: Array<{ photoUuid?: unknown; fieldPath?: unknown; sourceSha256?: unknown }> }).evidenceManifest;
  for (const entry of manifest) { if (typeof entry.photoUuid !== "string") return false; const attachment = await localDatabase.inspectionAttachments.get(entry.photoUuid); if (!attachment || attachment.protocolVersion !== 7 || attachment.syncStatus !== "Synced" || attachment.fieldPath !== entry.fieldPath || attachment.sha256 !== entry.sourceSha256) return false; }
  return true;
}

function portablePayloadMatches(record: PortableRecord | undefined, item: SyncOutboxItem) {
  if (record?.systemKey !== "portable_fire_extinguisher") return false;
  const expected = {
    clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey,
    instanceKey: record.instanceKey, configuredZoneId: record.configuredZoneId,
    configuredLocationId: record.configuredLocationId, displaySequence: record.displaySequence,
    originalCreatorSnapshot: record.originalCreatorSnapshot, masterTemplate: record.masterTemplate,
    configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot,
    responses: record.responses, performedAt: record.performedAt
  };
  return JSON.stringify(item.payload) === JSON.stringify(expected);
}

function currentPortableWorkIsSyncable(record: PortableRecord | undefined, work: SyncOutboxItem | undefined, entityId: string) {
  return record?.systemKey === "portable_fire_extinguisher"
    && record.clientUuid === entityId
    && (record.syncStatus === "Pending" || record.syncStatus === "Failed")
    && work?.entityId === entityId
    && work.activeKey === `masterSystemInspection:create:${entityId}`
    && (work.status === "Pending" || work.status === "Failed")
    && portablePayloadMatches(record, work);
}

/** A response may only complete the exact operation and payload that dispatched it. */
function currentPortableResponseOwnsWork(record: PortableRecord | undefined, work: SyncOutboxItem | undefined, dispatched: SyncOutboxItem) {
  return record?.systemKey === "portable_fire_extinguisher"
    && record.clientUuid === dispatched.entityId
    && record.syncStatus === "Syncing"
    && work?.operationId === dispatched.operationId
    && work.entityType === dispatched.entityType
    && work.entityId === dispatched.entityId
    && work.action === dispatched.action
    && work.activeKey === `masterSystemInspection:create:${dispatched.entityId}`
    && work.status === "Syncing"
    && JSON.stringify(work.payload) === JSON.stringify(dispatched.payload)
    && portablePayloadMatches(record, dispatched);
}

async function validateFireAlarmWork(items: SyncOutboxItem[]) {
  const valid: SyncOutboxItem[] = [];
  for (const item of items) {
    if (!isFireAlarmOutboxItem(item)) { valid.push(item); continue; }
    const record = await localDatabase.masterSystemInspections.get(item.entityId);
    // Conflict is terminal for automatic sync. Keep the active operation intact so
    // explicit correction can retire that exact immutable history entry.
    if (record?.systemKey === "fire_alarm_detector" && record.syncStatus === "Conflict") {
      continue;
    }
    const payload = item.payload as { clientUuid?: unknown; systemKey?: unknown };
    const expectedActiveKey = `masterSystemInspection:create:${item.entityId}`;
    if (record?.systemKey === "fire_alarm_detector" && record.clientUuid === item.entityId
      && payload.clientUuid === item.entityId && payload.systemKey === "fire_alarm_detector"
      && item.activeKey === expectedActiveKey
      && fireAlarmPayloadMatches(record as FireAlarmInspectionRecord, item)
      && (record.syncStatus === "Pending" || record.syncStatus === "Failed")) {
      valid.push(item);
      continue;
    }
    const message = "Fire Alarm sync operation does not match the current local record";
    await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => {
      await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: message });
      if (record?.systemKey === "fire_alarm_detector" && record.syncStatus !== "Synced") {
        await localDatabase.masterSystemInspections.update(record.clientUuid, { syncStatus: "Failed", lastSyncError: message });
      }
    });
  }
  return valid;
}

async function filterTerminalConflictWork(items: SyncOutboxItem[]) {
  const valid: SyncOutboxItem[] = [];
  for (const item of items) {
    let status: string | undefined;
    if (item.entityType === "inspection") {
      status = (await localDatabase.inspectionRecords.get(item.entityId))?.syncStatus;
    } else if (item.entityType === "masterSystemInspection") {
      status = (await localDatabase.masterSystemInspections.get(item.entityId))?.syncStatus;
    } else if (item.entityType === "masterSystemFormInstance") {
      status = (await localDatabase.masterSystemFormInstances.get(item.entityId))?.syncStatus;
    }
    if (status !== "Conflict") valid.push(item);
  }
  return valid;
}

let syncActorId: number | undefined;
const identityChangedMessage = "Authentication changed; sign in as the owner to sync this workspace";
async function assertSyncIdentity() {
  const workspaceUserId = currentWorkspaceUserId();
  // No signed-in identity and no user workspace: nothing account-bound can be sent.
  if (syncActorId === undefined && workspaceUserId === undefined) return;
  const identity = await deviceDatabase.authState.get("device-auth");
  if (syncActorId === undefined || identity?.userId !== syncActorId || identity.explicitLogout
    || identity.serverLogoutPending || (workspaceUserId !== undefined && workspaceUserId !== syncActorId)) {
    throw new Error(identityChangedMessage);
  }
}
/** The server rejects the request if the shared session cookie now belongs to someone else. */
function expectedActorHeaders(): Record<string, string> {
  return syncActorId === undefined ? {} : { "X-Expected-User-Id": String(syncActorId) };
}
let syncInProgress = false;
const idleWaiters: Array<() => void> = [];
export function waitForSyncIdle(): Promise<void> {
  return syncInProgress ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve();
}
export type SyncEngineTestBoundary = "afterCandidatesCaptured" | "afterSyncingItemsCapturedForFailure";
let testBoundaryHook: ((boundary: SyncEngineTestBoundary) => Promise<void>) | undefined;
/** Test-only deterministic boundary. Production leaves this undefined. */
export function setSyncEngineTestBoundaryHook(hook: ((boundary: SyncEngineTestBoundary) => Promise<void>) | undefined) { testBoundaryHook = hook; }
const interruptedSyncMessage = "Recovered from interrupted sync";
const completedOutboxRetentionMs = 30 * 24 * 60 * 60 * 1000;

function shouldSync(item: SyncOutboxItem) {
  return item.status === "Pending" || item.status === "Failed";
}

async function syncPendingCommonRemarks() {
  const items = (await localDatabase.syncOutbox.where("entityType").equals("commonRemark").toArray()).filter(shouldSync);
  let confirmed = 0;
  for (const item of items) {
    const current = await localDatabase.transaction("rw", localDatabase.syncOutbox, async () => {
      const pending = await localDatabase.syncOutbox.get(item.operationId);
      if (!pending || !shouldSync(pending)) return undefined;
      await localDatabase.syncOutbox.update(item.operationId, { status: "Syncing", attempts: pending.attempts + 1, lastAttemptAt: new Date().toISOString() });
      return pending;
    });
    if (!current) continue;
    const remark = current.payload as CommonRemark;
    if (!remark || remark.id !== current.entityId) { await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: "Local common remark is malformed" }); continue; }
    try {
      if (!await localDatabase.syncOutbox.get(item.operationId)) continue;
      const response = await fetch("/api/service-common-remarks", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", ...expectedActorHeaders() }, body: JSON.stringify({ id: remark.id, systemKey: remark.systemKey, wording: remark.wording, detailLabel: remark.detailLabel, detailOptions: remark.detailOptions }) });
      const body = await response.json() as { remark?: { id?: unknown }; message?: string };
      if (!response.ok || body.remark?.id !== remark.id) throw new Error(body.message ?? "Common remark was not confirmed by the server");
      await localDatabase.syncOutbox.update(item.operationId, { status: "Completed", completedAt: new Date().toISOString(), lastError: undefined });
      confirmed++;
    } catch (error) { await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: failureMessage(error) }); }
  }
  if (confirmed) await refreshCommonRemarks().catch(() => undefined);
  return { confirmed, failed: items.length - confirmed, attempted: items.length };
}

/** A queued section remark that gets no reply in this long is treated as unknown, not rejected, and retried. */
const sectionRemarkRequestTimeoutMs = 30_000;

/**
 * CR-07: send this device's queued section remarks. An item becomes Completed ONLY when the reply echoes the exact
 * UUID that was queued and carries a valid canonical row (parseSectionRemarkConfirmation) - never on HTTP 200 alone.
 * A timeout, dropped connection, 5xx or 429 is an unknown result: the item goes back to Pending and the same UUID
 * is sent again (the server is idempotent). A definite 4xx rejection is Failed with the server's reason.
 */
export async function syncPendingSectionRemarks() {
  const held = await heldJobIds();
  const items = (await localDatabase.syncOutbox.where("entityType").equals("sectionRemark").toArray())
    .filter((item) => shouldSync(item) && !held.has(payloadJobId(item) ?? ""));
  let confirmed = 0;
  let failed = 0;
  const refreshed = new Set<string>();
  for (const item of items) {
    const current = await localDatabase.transaction("rw", localDatabase.syncOutbox, async () => {
      const pending = await localDatabase.syncOutbox.get(item.operationId);
      if (!pending || !shouldSync(pending)) return undefined;
      await localDatabase.syncOutbox.update(item.operationId, { status: "Syncing", attempts: pending.attempts + 1, lastAttemptAt: new Date().toISOString() });
      return pending;
    });
    if (!current) continue;
    const payload = parseSectionRemarkOutboxPayload(current.payload, current.entityId);
    if (!payload) { await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: "Local section remark is malformed" }); failed++; continue; }
    const { jobId, ...remark } = payload;
    const retryLater = async (message: string) => { await localDatabase.syncOutbox.update(item.operationId, { status: "Pending", lastError: message }); };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), sectionRemarkRequestTimeoutMs);
      let response: Response;
      try {
        response = await fetch(`/api/technician/customers/${remark.customerId}/systems/${remark.systemKey}/section-remarks`, {
          method: "POST", credentials: "same-origin", signal: controller.signal,
          headers: { "Content-Type": "application/json", ...expectedActorHeaders() },
          body: JSON.stringify({ id: remark.id, sectionKey: remark.sectionKey, wording: remark.wording, ...(jobId === undefined ? {} : { jobId }) })
        });
      } finally { clearTimeout(timer); }
      if (response.status === 401 || response.status === 403) {
        await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: syncRefusalMessage(response.status, await readRefusalBody(response)) });
        failed++; continue;
      }
      let body: unknown;
      try { body = await response.json(); } catch { body = undefined; }
      if (!response.ok) {
        const reason = typeof (body as { message?: unknown } | undefined)?.message === "string" ? (body as { message: string }).message : `The server refused this remark (HTTP ${response.status}).`;
        if (response.status >= 500 || response.status === 408 || response.status === 429) { await retryLater(`The server could not take this remark yet (HTTP ${response.status}); it will be sent again.`); continue; }
        await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: reason });
        failed++; continue;
      }
      await completeSectionRemark(item.operationId, remark, parseSectionRemarkConfirmation(body, remark));
      confirmed++; refreshed.add(remark.customerId);
    } catch (error) {
      if (error instanceof SectionRemarkNotConfirmedError) { await localDatabase.syncOutbox.update(item.operationId, { status: "Failed", lastError: error.message }); failed++; continue; }
      // No answer (offline, timed out, connection dropped): the server may or may not have stored it.
      await retryLater("Could not reach the server; this remark will be sent again.");
    }
  }
  for (const customerId of refreshed) await refreshSectionRemarks(customerId).catch(() => undefined);
  return { confirmed, failed, attempted: items.length };
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "Sync failed";
}

/** Best-effort maintenance: only completed operations older than 30 days may be removed. */
export async function pruneCompletedOutboxItems(now = Date.now()) {
  const cutoff = now - completedOutboxRetentionMs;
  const completedItems = await localDatabase.syncOutbox
    .where("status")
    .equals("Completed")
    .toArray();
  const expiredOperationIds = completedItems
    .filter((item) =>
      !item.activeKey
      && Date.parse(item.completedAt ?? item.lastAttemptAt ?? item.createdAt) < cutoff
    )
    .map((item) => item.operationId);

  if (expiredOperationIds.length === 0) {
    return 0;
  }

  let removed = 0;
  await localDatabase.transaction("rw", localDatabase.syncOutbox, async () => {
    for (const operationId of expiredOperationIds) {
      const current = await localDatabase.syncOutbox.get(operationId);
      if (current?.status === "Completed") {
        await localDatabase.syncOutbox.delete(operationId);
        removed += 1;
      }
    }
  });
  return removed;
}

export async function recoverInterruptedSync() {
  await recoverInterruptedRepairs();
  await recoverInterruptedOfflineVisits();
  // Repair visit requests are idempotent: an interrupted one is queued again with the same payload, not marked Failed below.
  await recoverInterruptedRepairVisits();
  const interruptedAt = new Date().toISOString();
  const syncingItems = await localDatabase.syncOutbox
    .where("status")
    .equals("Syncing")
    .toArray();
  const syncingTestRecords = await localDatabase.testRecords
    .where("syncStatus")
    .equals("Syncing")
    .toArray();
  const syncingInspections = await localDatabase.inspectionRecords
    .where("syncStatus")
    .equals("Syncing")
    .toArray();
  const syncingMasterSystemInspections = await localDatabase.masterSystemInspections
    .where("syncStatus")
    .equals("Syncing")
    .toArray();
  const syncingMasterSystemFormInstances = await localDatabase.masterSystemFormInstances
    .where("syncStatus")
    .equals("Syncing")
    .toArray();
  const uploadingAttachments = await localDatabase.inspectionAttachments
    .where("syncStatus")
    .equals("Uploading")
    .toArray();

  if (syncingItems.length === 0 && syncingTestRecords.length === 0 && syncingInspections.length === 0 && syncingMasterSystemInspections.length === 0 && syncingMasterSystemFormInstances.length === 0 && uploadingAttachments.length === 0) {
    return 0;
  }

  await localDatabase.transaction(
    "rw",
    [
      localDatabase.testRecords,
      localDatabase.inspectionRecords,
      localDatabase.masterSystemInspections,
      localDatabase.masterSystemFormInstances,
      localDatabase.inspectionAttachments,
      localDatabase.syncOutbox
    ],
    async () => {
      await Promise.all(
        syncingItems.map((item) =>
          localDatabase.syncOutbox.update(item.operationId, {
            status: "Failed",
            lastAttemptAt: interruptedAt,
            lastError: interruptedSyncMessage
          })
        )
      );
      await Promise.all(
        syncingTestRecords.map((record) =>
          localDatabase.testRecords.update(record.clientUuid, {
            syncStatus: "Failed",
            lastSyncError: interruptedSyncMessage
          })
        )
      );
      await Promise.all(
        syncingInspections.map((record) =>
          localDatabase.inspectionRecords.update(record.clientUuid, {
            syncStatus: "Failed",
            lastSyncError: interruptedSyncMessage
          })
        )
      );
      await Promise.all(
        syncingMasterSystemInspections.map((record) =>
          localDatabase.masterSystemInspections.update(record.clientUuid, {
            syncStatus: "Failed",
            lastSyncError: interruptedSyncMessage
          })
        )
      );
      await Promise.all(
        syncingMasterSystemFormInstances.map((record) =>
          localDatabase.masterSystemFormInstances.update(record.clientUuid, {
            syncStatus: "Failed",
            lastSyncError: interruptedSyncMessage
          })
        )
      );
      await Promise.all(
        uploadingAttachments.map((attachment) =>
          localDatabase.inspectionAttachments.update(attachment.photoUuid, {
            syncStatus: "Failed",
            lastSyncError: interruptedSyncMessage,
            localUpdatedAt: interruptedAt
          })
        )
      );
    }
  );

  return syncingItems.length + syncingTestRecords.length + syncingInspections.length + syncingMasterSystemInspections.length + syncingMasterSystemFormInstances.length + uploadingAttachments.length;
}

async function syncPendingAttachments() {
  const items = (await localDatabase.syncOutbox
    .where("status")
    .anyOf("Pending", "Failed")
    .toArray())
    .filter((item) =>
      item.entityType === "inspectionAttachment" && shouldSync(item)
    );
  let accepted = 0;
  let failed = 0;

  for (const item of items) {
    const attachment = await localDatabase.inspectionAttachments.get(item.entityId);
    if (!attachment) {
      await localDatabase.syncOutbox.update(item.operationId, {
        status: "Failed",
        lastError: "Local photo Blob is unavailable"
      });
      failed += 1;
      continue;
    }
    if (attachment.syncStatus === "Conflict") continue;
    const parent = await localDatabase.masterSystemInspections.get(
      attachment.inspectionClientUuid
    );
    if (!parent || parent.syncStatus !== "Synced") continue;

    const startedAt = new Date().toISOString();
    await localDatabase.transaction(
      "rw",
      localDatabase.inspectionAttachments,
      localDatabase.syncOutbox,
      async () => {
        await localDatabase.inspectionAttachments.update(attachment.photoUuid, {
          syncStatus: "Uploading",
          lastSyncError: undefined,
          localUpdatedAt: startedAt
        });
        await localDatabase.syncOutbox.update(item.operationId, {
          status: "Syncing",
          attempts: item.attempts + 1,
          lastAttemptAt: startedAt,
          lastError: undefined
        });
      }
    );

    try {
      await assertSyncIdentity();
      const result = await uploadInspectionAttachment(attachment, syncActorId);
      const syncedAt = new Date().toISOString();
      await localDatabase.transaction(
        "rw",
        localDatabase.inspectionAttachments,
        localDatabase.syncOutbox,
        async () => {
          await localDatabase.inspectionAttachments.update(attachment.photoUuid, {
            syncStatus: "Synced",
            storedSha256: result.attachment.storedSha256,
            serverAttachmentId: result.attachment.serverAttachmentId,
            lastSyncedAt: syncedAt,
            lastSyncError: undefined,
            localUpdatedAt: syncedAt
          });
          await localDatabase.syncOutbox.update(item.operationId, {
            status: "Completed",
            activeKey: undefined,
            completedAt: syncedAt,
            lastError: undefined
          });
        }
      );
      accepted += 1;
    } catch (error) {
      const message = failureMessage(error);
      const conflict = error instanceof AttachmentUploadError
        && (
          error.code === "IDEMPOTENCY_CONFLICT"
          || error.code === "ATTACHMENT_FIELD_OCCUPIED"
          || error.code === "JOB_CLOSED"
        );
      const failedAt = new Date().toISOString();
      await localDatabase.transaction(
        "rw",
        localDatabase.inspectionAttachments,
        localDatabase.syncOutbox,
        async () => {
          await localDatabase.inspectionAttachments.update(attachment.photoUuid, {
            syncStatus: conflict ? "Conflict" : "Failed",
            lastSyncError: message,
            localUpdatedAt: failedAt
          });
          await localDatabase.syncOutbox.update(item.operationId, {
            status: "Failed",
            lastAttemptAt: failedAt,
            lastError: message
          });
        }
      );
      failed += 1;
    }
  }
  return { accepted, failed, pending: items.length - accepted - failed };
}

/** Cheap read-only check used by the automatic triggers so an idle app never hits the network. */
export async function hasAutoSyncWork(reason: AutoSyncReason) {
  const items = await localDatabase.syncOutbox.where("status").anyOf("Pending", "Failed", "Syncing").toArray();
  return outboxHasAutoSyncWork(items, reason, Date.now());
}

export async function syncPendingRecords(actorUserId?: number) {
  if (syncInProgress) {
    return { started: false, message: "Sync already running" };
  }

  syncInProgress = true;
  syncActorId = actorUserId;
  const startedAt = new Date().toISOString();
  let dispatchedItems: SyncOutboxItem[] = [];

  try {
    if (syncActorId === undefined) {
      const deviceIdentity = await deviceDatabase.authState.get("device-auth");
      if (!deviceIdentity?.explicitLogout) syncActorId = deviceIdentity?.userId;
    }
    await assertSyncIdentity();
    // A customer / location-proposal sync started from its own screen marks its item "Syncing"; recovering now would
    // reset it under that live request and lose its completion (found by I-03 auto-sync, I-19).
    await Promise.all([technicianCustomerSyncIdle(), locationProposalSyncIdle()]);
    await recoverInterruptedSync();
    // Ordering: a visit created on this device is sent first. Its forms and photos are released below only for
    // visits the server has confirmed (exact UUID); held visits keep every local record and queued operation.
    const visits = await syncPendingOfflineServiceVisits({ actorUserId: syncActorId, assertIdentity: assertSyncIdentity, headers: expectedActorHeaders() });
    const held = await heldJobIds();
    const repairs = await dispatchPendingRepairs();
    // Repair visits: create, then photos, then submit, each only after the server echoed the exact UUID and fingerprint.
    const repairVisits = await syncPendingRepairVisits({ actorUserId: syncActorId, assertIdentity: assertSyncIdentity });

    if (syncActorId !== undefined) await syncPendingTechnicianCustomers(syncActorId);
    if (syncActorId !== undefined) await syncPendingLocationProposals(syncActorId);

    const commonRemarks = await syncPendingCommonRemarks();
    const sectionRemarks = await syncPendingSectionRemarks();

    const v6Evidence = await syncPendingV6Evidence(held);
    const v7Evidence = await syncPendingV7Evidence(held);

    const candidateItems = (await localDatabase.syncOutbox
      .where("status")
      .anyOf("Pending", "Failed")
      .toArray())
      .filter((item) =>
        !isRepairOperation(item) && item.entityType !== "offlineServiceVisit" && item.entityType !== "rvVisit" && item.entityType !== "rvPhoto" && !held.has(payloadJobId(item) ?? "") && item.entityType !== "inspectionAttachment" && item.entityType !== "v6StagedEvidence" && item.entityType !== "v7StagedEvidence" && item.entityType !== "commonRemark" && item.entityType !== "sectionRemark" && item.entityType !== "technicianCustomer" && item.entityType !== "technicianLocationProposal" && shouldSync(item)
      );
    let items = await filterTerminalConflictWork(
      await validateFireAlarmWork(candidateItems)
    );
    items = (await Promise.all(items.map(async (item) => await v6FormReady(item) && await v7FormReady(item) ? item : undefined))).filter((item): item is SyncOutboxItem => !!item);

    await testBoundaryHook?.("afterCandidatesCaptured");

    if (items.length === 0) {
      const evidence = await syncPendingAttachments();
      return {
        started: true,
        message: visits.attempted ? `Service visit sync: ${visits.confirmed} confirmed, ${visits.failed} need attention`
          : repairVisits.attempted ? `Repair visit sync: ${repairVisits.confirmed} steps confirmed, ${repairVisits.failed} need attention`
          : repairs.confirmed || repairs.failed ? `Repair sync: ${repairs.confirmed} operations confirmed, ${repairs.failed} failed`
          : commonRemarks.attempted || sectionRemarks.attempted || v6Evidence.accepted || v6Evidence.failed || v6Evidence.pending || v7Evidence.accepted || v7Evidence.failed || v7Evidence.pending || evidence.accepted || evidence.failed || evidence.pending
          ? `Sync finished: ${commonRemarks.confirmed} common remarks confirmed, ${commonRemarks.failed} common remarks failed, ${sectionRemarks.confirmed} section remarks confirmed, ${sectionRemarks.failed} section remarks failed, ${evidence.accepted} attachments confirmed`
          : "No pending records"
      };
    }

    const readyItems: SyncOutboxItem[] = [];
    await localDatabase.transaction(
    "rw",
    localDatabase.testRecords,
    localDatabase.inspectionRecords,
    localDatabase.masterSystemInspections,
    localDatabase.masterSystemFormInstances,
      localDatabase.syncOutbox,
      async () => {
        for (const item of items) {
          if (isFireAlarmOutboxItem(item)) {
            const currentWork = await localDatabase.syncOutbox.get(item.operationId);
            const currentRecord = await localDatabase.masterSystemInspections.get(item.entityId);
            if (!currentWork || currentWork.activeKey !== `masterSystemInspection:create:${item.entityId}`
              || (currentWork.status !== "Pending" && currentWork.status !== "Failed")
              || currentRecord?.systemKey !== "fire_alarm_detector"
              || !fireAlarmPayloadMatches(currentRecord as FireAlarmInspectionRecord | undefined, currentWork)
              || (currentRecord.syncStatus !== "Pending" && currentRecord.syncStatus !== "Failed")) continue;
          }
          if (isPortableOutboxItem(item)) {
            const currentWork = await localDatabase.syncOutbox.get(item.operationId);
            const currentRecord = await localDatabase.masterSystemInspections.get(item.entityId);
            if (!currentPortableWorkIsSyncable(currentRecord as PortableRecord | undefined, currentWork, item.entityId)) continue;
          }
          await localDatabase.syncOutbox.update(item.operationId, {
              status: "Syncing",
              attempts: item.attempts + 1,
              lastAttemptAt: startedAt,
              lastError: undefined
          });
          const update = { syncStatus: "Syncing" as const, lastSyncError: undefined };
          if (item.entityType === "inspection") await localDatabase.inspectionRecords.update(item.entityId, update);
          else if (item.entityType === "masterSystemInspection") await localDatabase.masterSystemInspections.update(item.entityId, update);
          else if (item.entityType === "masterSystemFormInstance") await localDatabase.masterSystemFormInstances.update(item.entityId, update);
          else await localDatabase.testRecords.update(item.entityId, update);
          readyItems.push(item);
        }
      }
    );
    items = readyItems;
    if (items.length === 0) return { started: true, message: "No pending records" };
    dispatchedItems = items;

    await assertSyncIdentity();
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...expectedActorHeaders() },
      credentials: "same-origin",
      body: JSON.stringify({
        items: items.map((item) => ({
          operationId: item.operationId,
          entityType: item.entityType,
          entityId: item.entityId,
          action: item.action,
          payload: item.payload
        }))
      })
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(syncRefusalMessage(response.status, await readRefusalBody(response)));
    }

    if (response.status === 409) {
      const body = await response.clone().json().catch(() => ({})) as { error?: unknown };
      if (body.error === "IDENTITY_MISMATCH") throw new Error(identityChangedMessage);
    }
    if (!response.ok) {
      throw new Error(`Sync request failed: ${response.status}`);
    }

    const result = (await response.json()) as SyncResponse;
    const confirmedIds = new Set([
      ...result.acceptedIds,
      ...result.duplicateIds
    ]);
    const failedById = new Map(result.failed.map((item) => [item.id, item]));
    const syncedAt = new Date().toISOString();

    await localDatabase.transaction(
    "rw",
    localDatabase.testRecords,
    localDatabase.inspectionRecords,
    localDatabase.masterSystemInspections,
    localDatabase.masterSystemFormInstances,
      localDatabase.syncOutbox,
      async () => {
        await Promise.all(
          items.map(async (item) => {
            if (isPortableOutboxItem(item)) {
              const currentWork = await localDatabase.syncOutbox.get(item.operationId);
              const currentRecord = await localDatabase.masterSystemInspections.get(item.entityId);
              if (!currentPortableResponseOwnsWork(
                currentRecord as unknown as PortableRecord | undefined,
                currentWork,
                item
              )) return;
            }
            if (confirmedIds.has(item.entityId)) {
              const update = {
                syncStatus: "Synced" as const,
                lastSyncedAt: syncedAt,
                lastSyncError: undefined
              };
              if (item.entityType === "inspection") {
                await localDatabase.inspectionRecords.update(item.entityId, update);
              } else if (item.entityType === "masterSystemInspection") {
                await localDatabase.masterSystemInspections.update(item.entityId, update);
              } else if (item.entityType === "masterSystemFormInstance") {
                await localDatabase.masterSystemFormInstances.update(item.entityId, update);
              } else {
                await localDatabase.testRecords.update(item.entityId, update);
              }
              await localDatabase.syncOutbox.update(item.operationId, {
                status: "Completed",
                activeKey: undefined,
                completedAt: syncedAt,
                lastError: undefined
              });
              return;
            }

            const failed = failedById.get(item.entityId);
            const message =
              failed?.message ?? "Server did not confirm this record UUID";
            const conflict = failed !== undefined && new Set([
              "JOB_CLOSED",
              "IDEMPOTENCY_CONFLICT",
              "ACTIVE_INSPECTION_EXISTS",
              "INSTANCE_ALREADY_EXISTS",
              // Accepted V7 evidence is unique within jobId+systemKey. Once
              // the server reports this conflict, retrying the immutable
              // Pending manifest cannot succeed; preserve it as Needs review.
              "EVIDENCE_CONFLICT"
            ]).has(failed.code);
            const update = { syncStatus: "Failed" as const, lastSyncError: message };
            if (item.entityType === "inspection") {
              await localDatabase.inspectionRecords.update(item.entityId, conflict
                ? { syncStatus: "Conflict", lastSyncError: message }
                : update);
            } else if (item.entityType === "masterSystemInspection") {
              await localDatabase.masterSystemInspections.update(item.entityId, conflict
                ? { syncStatus: "Conflict", lastSyncError: message }
                : update);
            } else if (item.entityType === "masterSystemFormInstance") {
              await localDatabase.masterSystemFormInstances.update(item.entityId, conflict
                ? { syncStatus: "Conflict", lastSyncError: message }
                : update);
            } else {
              await localDatabase.testRecords.update(item.entityId, update);
            }
            await localDatabase.syncOutbox.update(item.operationId, {
              status: "Failed",
              lastError: message
            });
          })
        );
      }
    );

    void pruneCompletedOutboxItems().catch(() => undefined);

    const evidence = await syncPendingAttachments();
    return {
      started: true,
      message: evidence.accepted || evidence.failed || evidence.pending
        ? `Sync finished; evidence: ${evidence.accepted} confirmed, ${evidence.failed} failed, ${evidence.pending} waiting for parent`
        : "Sync finished"
    };
  } catch (error) {
    const message = failureMessage(error);
    const failedAt = new Date().toISOString();
    const syncingItems = await localDatabase.syncOutbox
      .where("status")
      .equals("Syncing")
      .toArray();

    await testBoundaryHook?.("afterSyncingItemsCapturedForFailure");

    await localDatabase.transaction(
      "rw",
      localDatabase.testRecords,
      localDatabase.inspectionRecords,
      localDatabase.masterSystemInspections,
      localDatabase.masterSystemFormInstances,
      localDatabase.syncOutbox,
      async () => {
        await Promise.all(
          syncingItems.map(async (item) => {
            if (isPortableOutboxItem(item)) {
              const dispatchedItem = dispatchedItems.find((candidate) => candidate.operationId === item.operationId);
              const currentWork = await localDatabase.syncOutbox.get(item.operationId);
              const currentRecord = await localDatabase.masterSystemInspections.get(item.entityId);
              if (!dispatchedItem || !isPortableOutboxItem(dispatchedItem)
                || !currentPortableResponseOwnsWork(
                  currentRecord as unknown as PortableRecord | undefined,
                  currentWork,
                  dispatchedItem
                )) return;
            }
            const currentFireAlarm = isFireAlarmOutboxItem(item)
              ? await localDatabase.masterSystemInspections.get(item.entityId)
              : undefined;
            await localDatabase.syncOutbox.update(item.operationId, {
              status: "Failed",
              lastAttemptAt: failedAt,
              lastError: message
            });
            if (currentFireAlarm?.systemKey === "fire_alarm_detector"
              && currentFireAlarm.syncStatus === "Conflict") {
              return;
            }
            const update = {
              syncStatus: "Failed" as const,
              lastSyncError: message
            };
            if (item.entityType === "inspection") {
              await localDatabase.inspectionRecords.update(item.entityId, update);
            } else if (item.entityType === "masterSystemInspection") {
              await localDatabase.masterSystemInspections.update(item.entityId, update);
            } else if (item.entityType === "masterSystemFormInstance") {
              await localDatabase.masterSystemFormInstances.update(item.entityId, update);
            } else {
              await localDatabase.testRecords.update(item.entityId, update);
            }
          })
        );
      }
    );

    return { started: true, message };
  } finally {
    syncInProgress = false;
    idleWaiters.splice(0).forEach((resolve) => resolve());
  }
}

export const syncPendingTestRecords = syncPendingRecords;
