import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { FireAlarmInspectionRecord } from "../fireAlarm/fireAlarmTypes";
import type { PortableRecord } from "../portableFireExtinguisher/portableFireExtinguisher";
import {
  AttachmentUploadError,
  uploadInspectionAttachment
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

let syncInProgress = false;
export type SyncEngineTestBoundary = "afterCandidatesCaptured" | "afterSyncingItemsCapturedForFailure";
let testBoundaryHook: ((boundary: SyncEngineTestBoundary) => Promise<void>) | undefined;
/** Test-only deterministic boundary. Production leaves this undefined. */
export function setSyncEngineTestBoundaryHook(hook: ((boundary: SyncEngineTestBoundary) => Promise<void>) | undefined) { testBoundaryHook = hook; }
const interruptedSyncMessage = "Recovered from interrupted sync";
const completedOutboxRetentionMs = 30 * 24 * 60 * 60 * 1000;

function shouldSync(item: SyncOutboxItem) {
  return item.status === "Pending" || item.status === "Failed";
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
      const result = await uploadInspectionAttachment(attachment);
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

export async function syncPendingRecords() {
  if (syncInProgress) {
    return { started: false, message: "Sync already running" };
  }

  syncInProgress = true;
  const startedAt = new Date().toISOString();
  let dispatchedItems: SyncOutboxItem[] = [];

  try {
    await recoverInterruptedSync();

    const candidateItems = (await localDatabase.syncOutbox
      .where("status")
      .anyOf("Pending", "Failed")
      .toArray())
      .filter((item) =>
        item.entityType !== "inspectionAttachment" && shouldSync(item)
      );
    let items = await filterTerminalConflictWork(
      await validateFireAlarmWork(candidateItems)
    );

    await testBoundaryHook?.("afterCandidatesCaptured");

    if (items.length === 0) {
      const evidence = await syncPendingAttachments();
      return {
        started: true,
        message: evidence.accepted || evidence.failed || evidence.pending
          ? `Evidence sync finished: ${evidence.accepted} confirmed, ${evidence.failed} failed, ${evidence.pending} waiting for parent`
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

    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      throw new Error("Sign in required before server sync");
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
              "INSTANCE_ALREADY_EXISTS"
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
  }
}

export const syncPendingTestRecords = syncPendingRecords;
