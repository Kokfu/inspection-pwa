import type { InspectionRecord } from "../db/localDatabase";

export type SystemProgress =
  | "Not Started"
  | "Draft"
  | "Pending Sync"
  | "Syncing"
  | "Needs Attention"
  | "Completed";

export function deriveSystemProgress(
  inspections: InspectionRecord[],
  jobId: string,
  systemKey: string
): SystemProgress {
  const latest = inspections
    .filter((record) => record.jobId === jobId && record.systemKey === systemKey)
    .sort((left, right) => right.localUpdatedAt.localeCompare(left.localUpdatedAt))[0];

  if (!latest) return "Not Started";
  if (latest.syncStatus === "Draft") return "Draft";
  if (latest.syncStatus === "Pending") return "Pending Sync";
  if (latest.syncStatus === "Syncing") return "Syncing";
  if (latest.syncStatus === "Synced") return "Completed";
  return "Needs Attention";
}
