import {
  localDatabase,
  type SyncOutboxItem,
  type TestRecord
} from "../db/localDatabase";
import type { TestRecordFormValues, TestRecordPayload } from "./testRecordTypes";

function nowIso() {
  return new Date().toISOString();
}

function toPayload(record: TestRecord): TestRecordPayload {
  return {
    clientUuid: record.clientUuid,
    title: record.title,
    notes: record.notes,
    createdAt: record.createdAt
  };
}

export async function listTestRecords() {
  return localDatabase.testRecords.orderBy("localUpdatedAt").reverse().toArray();
}

export async function saveDraft(values: TestRecordFormValues) {
  const timestamp = nowIso();
  const record: TestRecord = {
    clientUuid: crypto.randomUUID(),
    title: values.title.trim(),
    notes: values.notes,
    createdAt: values.createdAt,
    localCreatedAt: timestamp,
    localUpdatedAt: timestamp,
    syncStatus: "Draft"
  };

  await localDatabase.testRecords.put(record);
  return record;
}

export async function submitLocal(values: TestRecordFormValues) {
  const timestamp = nowIso();
  const record: TestRecord = {
    clientUuid: crypto.randomUUID(),
    title: values.title.trim(),
    notes: values.notes,
    createdAt: values.createdAt,
    localCreatedAt: timestamp,
    localUpdatedAt: timestamp,
    syncStatus: "Pending"
  };

  const outboxItem: SyncOutboxItem = {
    operationId: crypto.randomUUID(),
    entityType: "testRecord",
    entityId: record.clientUuid,
    action: "create",
    payload: toPayload(record),
    createdAt: timestamp,
    attempts: 0,
    status: "Pending"
  };

  await localDatabase.transaction(
    "rw",
    localDatabase.testRecords,
    localDatabase.syncOutbox,
    async () => {
      await localDatabase.testRecords.put(record);
      await localDatabase.syncOutbox.put(outboxItem);
    }
  );

  return record;
}

