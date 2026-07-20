import Dexie, { type EntityTable } from "dexie";
import {
  normalizeInspectionTemplateSnapshot,
  type InspectionTemplateSnapshot
} from "../inspections/inspectionTypes";

export type LocalDraft = {
  id: string;
  entityType: string;
  payload: unknown;
  updatedAt: string;
};

export type ReferenceCacheEntry = {
  key: string;
  payload: unknown;
  version: string;
  fetchedAt: string;
  expiresAt: string;
};

export type SyncOutboxItem = {
  operationId: string;
  entityType: "testRecord" | "inspection";
  entityId: string;
  action: "create";
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  status: "Pending" | "Syncing" | "Failed" | "Completed";
  activeKey?: string;
  completedAt?: string;
};

export type InspectionRecord = {
  clientUuid: string;
  jobId: string;
  templateId: string;
  templateVersion: number;
  templateSnapshot: InspectionTemplateSnapshot;
  header: { title: string; locationNotes: string; performedAt: string };
  responses: Array<{
    templateItemId: string;
    label: string;
    responseType: "status" | "number" | "text";
    value: string;
    remarks: string;
    sortOrder: number;
  }>;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncedAt?: string;
  syncStatus: TestRecordSyncStatus | "Conflict";
  lastSyncError?: string;
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
  inspectionRecords: EntityTable<InspectionRecord, "clientUuid">;
  syncOutbox: EntityTable<SyncOutboxItem, "operationId">;
  referenceData: EntityTable<ReferenceCacheEntry, "key">;
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

localDatabase.version(3).stores({
  drafts: "id, entityType, updatedAt",
  testRecords: "clientUuid, syncStatus, localUpdatedAt, createdAt",
  inspectionRecords: "clientUuid, syncStatus, jobId, templateId, localUpdatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt"
});

localDatabase.version(4).stores({
  drafts: "id, entityType, updatedAt",
  testRecords: "clientUuid, syncStatus, localUpdatedAt, createdAt",
  inspectionRecords: "clientUuid, syncStatus, jobId, templateId, localUpdatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt, &activeKey"
}).upgrade(async (transaction) => {
  const inspections = transaction.table("inspectionRecords");
  const outbox = transaction.table("syncOutbox");

  await inspections.toCollection().modify((record: InspectionRecord) => {
    record.templateSnapshot = normalizeInspectionTemplateSnapshot(
      record.templateSnapshot,
      record.templateId,
      record.templateVersion
    );
  });

  const existingItems = await outbox.toArray() as SyncOutboxItem[];
  const activeByInspection = new Map<string, SyncOutboxItem[]>();
  for (const item of existingItems) {
    if (item.entityType !== "inspection" || item.action !== "create" || item.status === "Completed") {
      continue;
    }
    const items = activeByInspection.get(item.entityId) ?? [];
    items.push(item);
    activeByInspection.set(item.entityId, items);
  }

  for (const [inspectionId, items] of activeByInspection) {
    const ordered = items.slice().sort((left, right) => {
      const leftTime = left.lastAttemptAt ?? left.createdAt;
      const rightTime = right.lastAttemptAt ?? right.createdAt;
      return rightTime.localeCompare(leftTime) || right.operationId.localeCompare(left.operationId);
    });
    const [canonical, ...superseded] = ordered;

    for (const item of superseded) {
      await outbox.update(item.operationId, {
        status: "Completed",
        activeKey: undefined,
        completedAt: item.completedAt ?? new Date().toISOString(),
        lastError: "Superseded duplicate active inspection outbox item during local upgrade"
      });
    }

    await outbox.update(canonical.operationId, {
      activeKey: `inspection:create:${inspectionId}`
    });
  }
});

localDatabase.version(5).stores({
  drafts: "id, entityType, updatedAt",
  testRecords: "clientUuid, syncStatus, localUpdatedAt, createdAt",
  inspectionRecords: "clientUuid, syncStatus, jobId, templateId, localUpdatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt, &activeKey",
  referenceData: "key, version, fetchedAt, expiresAt"
});

export async function initializeLocalDatabase() {
  await localDatabase.open();
}
