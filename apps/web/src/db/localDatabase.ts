import Dexie, { type EntityTable } from "dexie";

export type LocalDraft = {
  id: string;
  entityType: string;
  payload: unknown;
  updatedAt: string;
};

export type SyncOutboxItem = {
  operationId: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete";
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  status: "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";
};

export const localDatabase = new Dexie("inspection-pwa") as Dexie & {
  drafts: EntityTable<LocalDraft, "id">;
  syncOutbox: EntityTable<SyncOutboxItem, "operationId">;
};

localDatabase.version(1).stores({
  drafts: "id, entityType, updatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt"
});

export async function initializeLocalDatabase() {
  await localDatabase.open();
}

