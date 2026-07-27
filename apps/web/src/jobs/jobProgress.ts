import type { InspectionRecord } from "../db/localDatabase";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { AutomaticSprinklerInspectionRecord } from "../automaticSprinkler/automaticSprinklerTypes";
import type { MasterSystemInspectionRecord } from "../hoseReel/hoseReelTypes";

export type SystemProgress =
  | "Unknown / Not Cached"
  | "Not Started"
  | "Draft"
  | "Pending Sync"
  | "Pending Evidence"
  | "Uploading Evidence"
  | "Syncing"
  | "Needs Attention"
  | "In Progress"
  | "Completed";

export function deriveNoLocalSystemProgress(
  serverAccepted: boolean,
  authStatus: "verified" | "offline-unverified" | "logged-out",
  serverSummaryState: "idle" | "loading" | "loaded" | "failed"
): SystemProgress {
  if (serverAccepted) return "Completed";
  if (authStatus === "verified" && serverSummaryState === "loaded") {
    return "Not Started";
  }
  return "Unknown / Not Cached";
}

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

export function deriveMasterSystemProgress(
  record: MasterSystemInspectionRecord | AutomaticSprinklerInspectionRecord | undefined
): SystemProgress {
  if (!record) return "Not Started";
  if (record.syncStatus === "Draft") return "Draft";
  if (record.syncStatus === "Pending") return "Pending Sync";
  if (record.syncStatus === "Syncing") return "Syncing";
  if (record.syncStatus === "Synced") return "Completed";
  return "Needs Attention";
}

export function deriveAutomaticSprinklerProgress(
  record: AutomaticSprinklerInspectionRecord | undefined,
  attachments: InspectionAttachmentRecord[]
): SystemProgress {
  if (!record) return "Not Started";
  if (record.syncStatus !== "Synced") {
    return deriveMasterSystemProgress(record);
  }
  const evidence = attachments.filter(
    (attachment) => attachment.inspectionClientUuid === record.clientUuid
  );
  if (evidence.some((attachment) => attachment.syncStatus === "Uploading")) {
    return "Uploading Evidence";
  }
  if (evidence.some((attachment) =>
    attachment.syncStatus === "Failed" || attachment.syncStatus === "Conflict"
  )) {
    return "Needs Attention";
  }
  if (evidence.some((attachment) =>
    attachment.syncStatus === "Pending" || attachment.syncStatus === "Draft"
  )) {
    return "Pending Evidence";
  }
  return "Completed";
}
