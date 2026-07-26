import type {
  MasterSystemFormInstanceRecord,
  MasterSystemInspectionGroupRecord
} from "./co2Types";

export type Co2Progress = "Not Started" | "Draft" | "Pending Sync" | "Syncing" | "Needs Attention" | "Completed";
export type Co2ParentProgress = Co2Progress | "In Progress";

export function deriveCo2InstanceProgress(record: MasterSystemFormInstanceRecord): Co2Progress {
  if (record.syncStatus === "Synced") return "Completed";
  if (record.syncStatus === "Failed" || record.syncStatus === "Conflict") return "Needs Attention";
  if (record.syncStatus === "Syncing") return "Syncing";
  if (record.syncStatus === "Pending") return "Pending Sync";
  return record.startedAt ? "Draft" : "Not Started";
}

export function deriveCo2ParentProgress(
  group: MasterSystemInspectionGroupRecord | undefined,
  instances: MasterSystemFormInstanceRecord[]
): Co2ParentProgress {
  if (!group || group.expectedInstances.length === 0) return "Not Started";
  const expectedKeys = new Set(group.expectedInstances.map((instance) => instance.instanceKey));
  const expected = instances.filter((instance) => expectedKeys.has(instance.instanceKey));
  if (expected.some((instance) => instance.syncStatus === "Failed" || instance.syncStatus === "Conflict")) return "Needs Attention";
  if (expected.some((instance) => instance.syncStatus === "Syncing")) return "Syncing";
  if (expected.some((instance) => instance.syncStatus === "Pending")) return "Pending Sync";
  if (expected.length === group.expectedInstances.length && expected.every((instance) => instance.syncStatus === "Synced")) return "Completed";
  if (expected.some((instance) => instance.startedAt !== null || instance.syncStatus === "Synced")) return "In Progress";
  return "Not Started";
}
