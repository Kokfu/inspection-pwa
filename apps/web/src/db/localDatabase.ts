import Dexie, { type EntityTable } from "dexie";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { AutomaticSprinklerInspectionRecord } from "../automaticSprinkler/automaticSprinklerTypes";
import type { DryWetRiserInspectionRecord } from "../dryWetRiser/dryWetRiserTypes";
import type { FireAlarmInspectionRecord } from "../fireAlarm/fireAlarmTypes";
import type { HydrantInspectionRecord } from "../hydrant/hydrantTypes";
import type { SmokeVentilationInspectionRecord } from "../smokeVentilation/smokeVentilationTypes";
import type { FireIntercomInspectionRecord } from "../fireIntercom/fireIntercomTypes";
import type { MasterSystemInspectionRecord } from "../hoseReel/hoseReelTypes";
import type {
  MasterSystemFormInstanceRecord,
  MasterSystemInspectionGroupRecord
} from "../co2/co2Types";
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

export type DeviceAuthState = {
  key: "device-auth";
  schemaVersion?: 1;
  userId?: number;
  username?: string;
  role?: "admin" | "inspector";
  lastVerifiedAt?: string;
  cachedAt?: string;
  explicitLogout?: boolean;
  serverLogoutPending: boolean;
};

export type SyncOutboxItem = {
  operationId: string;
  entityType: "testRecord" | "inspection" | "masterSystemInspection" | "masterSystemFormInstance" | "inspectionAttachment" | "v6StagedEvidence" | "v7StagedEvidence" | "commonRemark";
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
  systemKey?: string;
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

function createLocalDatabase(name: string) {
const localDatabase = new Dexie(name) as Dexie & {
  drafts: EntityTable<LocalDraft, "id">;
  testRecords: EntityTable<TestRecord, "clientUuid">;
  inspectionRecords: EntityTable<InspectionRecord, "clientUuid">;
  masterSystemInspections: EntityTable<
    MasterSystemInspectionRecord | AutomaticSprinklerInspectionRecord | DryWetRiserInspectionRecord | FireAlarmInspectionRecord | HydrantInspectionRecord | SmokeVentilationInspectionRecord | FireIntercomInspectionRecord,
    "clientUuid"
  >;
  masterSystemInspectionGroups: EntityTable<MasterSystemInspectionGroupRecord, "groupKey">;
  masterSystemFormInstances: EntityTable<MasterSystemFormInstanceRecord, "clientUuid">;
  syncOutbox: EntityTable<SyncOutboxItem, "operationId">;
  referenceData: EntityTable<ReferenceCacheEntry, "key">;
  authState: EntityTable<DeviceAuthState, "key">;
  inspectionAttachments: EntityTable<InspectionAttachmentRecord, "photoUuid">;
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

localDatabase.version(6).stores({
  drafts: "id, entityType, updatedAt",
  testRecords: "clientUuid, syncStatus, localUpdatedAt, createdAt",
  inspectionRecords: "clientUuid, syncStatus, jobId, systemKey, [jobId+systemKey], templateId, localUpdatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt, &activeKey",
  referenceData: "key, version, fetchedAt, expiresAt",
  authState: "key"
});

localDatabase.version(7).stores({
  drafts: "id, entityType, updatedAt",
  testRecords: "clientUuid, syncStatus, localUpdatedAt, createdAt",
  inspectionRecords: "clientUuid, syncStatus, jobId, systemKey, [jobId+systemKey], templateId, localUpdatedAt",
  masterSystemInspections: "clientUuid, &jobSystemKey, jobId, systemKey, syncStatus, localUpdatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt, &activeKey",
  referenceData: "key, version, fetchedAt, expiresAt",
  authState: "key"
});

localDatabase.version(8).stores({
  drafts: "id, entityType, updatedAt",
  testRecords: "clientUuid, syncStatus, localUpdatedAt, createdAt",
  inspectionRecords: "clientUuid, syncStatus, jobId, systemKey, [jobId+systemKey], templateId, localUpdatedAt",
  masterSystemInspections: "clientUuid, &jobSystemKey, jobId, systemKey, syncStatus, localUpdatedAt",
  masterSystemInspectionGroups: "groupKey, jobId, systemKey, localUpdatedAt",
  masterSystemFormInstances: "clientUuid, &[groupKey+instanceKey], groupKey, jobId, systemKey, configuredLocationId, syncStatus, localUpdatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt, &activeKey",
  referenceData: "key, version, fetchedAt, expiresAt",
  authState: "key"
});

localDatabase.version(9).stores({
  drafts: "id, entityType, updatedAt",
  testRecords: "clientUuid, syncStatus, localUpdatedAt, createdAt",
  inspectionRecords: "clientUuid, syncStatus, jobId, systemKey, [jobId+systemKey], templateId, localUpdatedAt",
  masterSystemInspections: "clientUuid, &jobSystemKey, jobId, systemKey, syncStatus, localUpdatedAt",
  masterSystemInspectionGroups: "groupKey, jobId, systemKey, localUpdatedAt",
  masterSystemFormInstances: "clientUuid, &[groupKey+instanceKey], groupKey, jobId, systemKey, configuredLocationId, syncStatus, localUpdatedAt",
  syncOutbox: "operationId, entityType, entityId, status, createdAt, &activeKey",
  referenceData: "key, version, fetchedAt, expiresAt",
  authState: "key",
  inspectionAttachments: "photoUuid, &[inspectionClientUuid+fieldPath], inspectionClientUuid, systemKey, syncStatus, localUpdatedAt, serverAttachmentId"
});

return localDatabase;
}

// Auth is device-wide; business tables live in a separate database per user.
// The original database is retained, never wiped or silently assigned on login.
export const deviceDatabase = createLocalDatabase("inspection-pwa");
export let localDatabase = deviceDatabase;
let workspaceUserId: number | undefined;

export function currentWorkspaceUserId() {
  return workspaceUserId;
}

export async function activateUserWorkspace(userId: number) {
  if (workspaceUserId === userId) return false;
  const next = createLocalDatabase(`inspection-pwa:user:${userId}`);
  await next.open();
  localDatabase = next;
  workspaceUserId = userId;
  return true;
}

export async function initializeLocalDatabase() {
  await deviceDatabase.open();
  const prior = await deviceDatabase.authState.get("device-auth");
  if (prior?.userId) await activateUserWorkspace(prior.userId);
  else {
    workspaceUserId = undefined;
    localDatabase = createLocalDatabase("inspection-pwa:locked");
    await localDatabase.open();
  }
}

/** Recover old shared-device records only after the server confirms job ownership.
 * Source records stay intact; destination copies and import receipts commit together.
 * Never trust the old cache or the last signed-in identity as proof of job ownership.
 */
// A copied row may have been mid-sync when the old build stopped. Interrupted-sync
// recovery already ran for this workspace, so apply the same Failed (retryable) state here.
const interruptedLegacyCopyMessage = "Recovered from the previous version while syncing; retry sync to confirm with the server";
function withoutInterruptedSyncState(table: string, row: unknown) {
  const value = row as Record<string, unknown>;
  if (table === "syncOutbox" && value.status === "Syncing") {
    return { ...value, status: "Failed", lastError: interruptedLegacyCopyMessage };
  }
  if (table === "inspectionAttachments" && value.syncStatus === "Uploading") {
    return { ...value, syncStatus: "Failed", lastSyncError: interruptedLegacyCopyMessage };
  }
  if (table !== "syncOutbox" && table !== "drafts" && value.syncStatus === "Syncing") {
    return { ...value, syncStatus: "Failed", lastSyncError: interruptedLegacyCopyMessage };
  }
  return row;
}

/** Recovery is inspector-only by design: an admin's job list contains every
 * technician's jobs, so copying by that list would move other technicians'
 * unsynced work into the admin workspace. Admin legacy rows stay quarantined.
 */
export async function recoverLegacyJobData(jobIds: readonly string[], userId: number, canCommit: () => boolean) {
  const destination = localDatabase;
  const identity = await deviceDatabase.authState.get("device-auth");
  if (identity?.role !== "inspector" || identity.userId !== userId || identity.explicitLogout
    || identity.serverLogoutPending || workspaceUserId !== userId || !canCommit()) return;
  const ownedJobs = new Set(jobIds);
  const [inspections, masters, groups, forms, photos, outbox, drafts] = await Promise.all([
    deviceDatabase.inspectionRecords.toArray(), deviceDatabase.masterSystemInspections.toArray(),
    deviceDatabase.masterSystemInspectionGroups.toArray(), deviceDatabase.masterSystemFormInstances.toArray(),
    deviceDatabase.inspectionAttachments.toArray(), deviceDatabase.syncOutbox.toArray(), deviceDatabase.drafts.toArray()
  ]);
  const ownedInspections = inspections.filter((row) => ownedJobs.has(row.jobId));
  const ownedMasters = masters.filter((row) => ownedJobs.has(row.jobId));
  const ownedForms = forms.filter((row) => ownedJobs.has(row.jobId));
  const parents = new Set([...ownedInspections, ...ownedMasters, ...ownedForms].map((row) => row.clientUuid));
  const ownedPhotos = photos.filter((row) => parents.has(row.inspectionClientUuid));
  const entities = new Set([...parents, ...ownedPhotos.map((row) => row.photoUuid)]);
  const batches = [
    { table: "inspectionRecords", key: "clientUuid", rows: ownedInspections },
    { table: "masterSystemInspections", key: "clientUuid", rows: ownedMasters },
    { table: "masterSystemInspectionGroups", key: "groupKey", rows: groups.filter((row) => ownedJobs.has(row.jobId)) },
    { table: "masterSystemFormInstances", key: "clientUuid", rows: ownedForms },
    { table: "inspectionAttachments", key: "photoUuid", rows: ownedPhotos },
    { table: "syncOutbox", key: "operationId", rows: outbox.filter((row) => entities.has(row.entityId)) },
    { table: "drafts", key: "id", rows: drafts.filter((row) => {
      const payload = row.payload as { jobId?: unknown } | null;
      return payload && typeof payload.jobId === "string" && ownedJobs.has(payload.jobId);
    }) }
  ];
  await destination.transaction("rw", [...batches.map((batch) => destination.table(batch.table)), destination.referenceData], async () => {
    for (const batch of batches) for (const row of batch.rows) {
      if (destination !== localDatabase || workspaceUserId !== userId || !canCommit()) throw new Error("AUTH_OPERATION_SUPERSEDED");
      const key = (row as unknown as Record<string, unknown>)[batch.key];
      if (typeof key !== "string") throw new Error("Invalid legacy record identity; original retained");
      const receipt = `workspace:legacy-copy:${batch.table}:${key}`;
      if (await destination.referenceData.get(receipt)) continue;
      // A newer per-user record always wins over its old shared-database copy.
      if (!await destination.table(batch.table).get(key)) await destination.table(batch.table).put(withoutInterruptedSyncState(batch.table, row));
      const at = new Date().toISOString();
      await destination.referenceData.put({ key: receipt, payload: true, version: "1", fetchedAt: at, expiresAt: at });
    }
  });
}
