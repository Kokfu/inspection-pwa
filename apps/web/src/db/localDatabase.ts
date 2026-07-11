import Dexie, { type EntityTable } from "dexie";

export type LocalDraft = {
  id: string;
  entityType: string;
  payload: unknown;
  updatedAt: string;
};

export type SyncOutboxItem = {
  operationId: string;
  entityType: "testRecord";
  entityId: string;
  action: "create";
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  status: "Pending" | "Syncing" | "Failed" | "Completed";
};

export type TestRecordSyncStatus =
  | "Draft"
  | "Pending"
  | "Syncing"
  | "Synced"
  | "Failed";

export type TestRecord = {
  clientUuid: string;
  title: string;
  notes: string;
  createdAt: string;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncedAt?: string;
  syncStatus: TestRecordSyncStatus;
  lastSyncError?: string;
};

export const localDatabase = new Dexie("inspection-pwa") as Dexie & {
  drafts: EntityTable<LocalDraft, "id">;
  testRecords: EntityTable<TestRecord, "clientUuid">;
  syncOutbox: EntityTable<SyncOutboxItem, "operationId">;
};

localDatabase.version(1).stores({
  drafts: "id, entityType, updatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt"
});

localDatabase.version(2).stores({
  drafts: "id, entityType, updatedAt",
  testRecords: "clientUuid, syncStatus, localUpdatedAt, createdAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt"
});

export async function initializeLocalDatabase() {
  await localDatabase.open();
}
