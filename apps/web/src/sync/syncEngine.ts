import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";

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

let syncInProgress = false;
const interruptedSyncMessage = "Recovered from interrupted sync";

function shouldSync(item: SyncOutboxItem) {
  return item.status === "Pending" || item.status === "Failed";
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "Sync failed";
}

export async function recoverInterruptedSync() {
  const interruptedAt = new Date().toISOString();
  const syncingItems = await localDatabase.syncOutbox
    .where("status")
    .equals("Syncing")
    .toArray();
  const syncingRecords = await localDatabase.testRecords
    .where("syncStatus")
    .equals("Syncing")
    .toArray();

  if (syncingItems.length === 0 && syncingRecords.length === 0) {
    return 0;
  }

  await localDatabase.transaction(
    "rw",
    localDatabase.testRecords,
    localDatabase.syncOutbox,
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
        syncingRecords.map((record) =>
          localDatabase.testRecords.update(record.clientUuid, {
            syncStatus: "Failed",
            lastSyncError: interruptedSyncMessage
          })
        )
      );
    }
  );

  return syncingItems.length + syncingRecords.length;
}

export async function syncPendingTestRecords() {
  if (syncInProgress) {
    return { started: false, message: "Sync already running" };
  }

  syncInProgress = true;
  const startedAt = new Date().toISOString();

  try {
    await recoverInterruptedSync();

    const items = (await localDatabase.syncOutbox
      .where("status")
      .anyOf("Pending", "Failed")
      .toArray())
      .filter(shouldSync)
      .filter((item) => item.entityType === "testRecord");

    if (items.length === 0) {
      return { started: true, message: "No pending records" };
    }

    const ids = items.map((item) => item.operationId);
    const entityIds = items.map((item) => item.entityId);

    await localDatabase.transaction(
      "rw",
      localDatabase.testRecords,
      localDatabase.syncOutbox,
      async () => {
        await Promise.all(
          items.map((item) =>
            localDatabase.syncOutbox.update(item.operationId, {
              status: "Syncing",
              attempts: item.attempts + 1,
              lastAttemptAt: startedAt,
              lastError: undefined
            })
          )
        );
        await Promise.all(
          entityIds.map((clientUuid) =>
            localDatabase.testRecords.update(clientUuid, {
              syncStatus: "Syncing",
              lastSyncError: undefined
            })
          )
        );
      }
    );

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
      localDatabase.syncOutbox,
      async () => {
        await Promise.all(
          items.map(async (item) => {
            if (confirmedIds.has(item.entityId)) {
              await localDatabase.testRecords.update(item.entityId, {
                syncStatus: "Synced",
                lastSyncedAt: syncedAt,
                lastSyncError: undefined
              });
              await localDatabase.syncOutbox.update(item.operationId, {
                status: "Completed",
                lastError: undefined
              });
              return;
            }

            const failed = failedById.get(item.entityId);
            const message =
              failed?.message ?? "Server did not confirm this record UUID";
            await localDatabase.testRecords.update(item.entityId, {
              syncStatus: "Failed",
              lastSyncError: message
            });
            await localDatabase.syncOutbox.update(item.operationId, {
              status: "Failed",
              lastError: message
            });
          })
        );
      }
    );

    return { started: true, message: "Sync finished" };
  } catch (error) {
    const message = failureMessage(error);
    const failedAt = new Date().toISOString();
    const syncingItems = await localDatabase.syncOutbox
      .where("status")
      .equals("Syncing")
      .toArray();

    await localDatabase.transaction(
      "rw",
      localDatabase.testRecords,
      localDatabase.syncOutbox,
      async () => {
        await Promise.all(
          syncingItems.map(async (item) => {
            await localDatabase.syncOutbox.update(item.operationId, {
              status: "Failed",
              lastAttemptAt: failedAt,
              lastError: message
            });
            await localDatabase.testRecords.update(item.entityId, {
              syncStatus: "Failed",
              lastSyncError: message
            });
          })
        );
      }
    );

    return { started: true, message };
  } finally {
    syncInProgress = false;
  }
}
