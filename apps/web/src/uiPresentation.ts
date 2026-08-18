export type PresentationStatus =
  | "Draft"
  | "Pending"
  | "Pending Sync"
  | "Pending Evidence"
  | "Uploading Evidence"
  | "Syncing"
  | "Synced"
  | "Completed"
  | "Failed"
  | "Conflict"
  | "Needs Attention"
  | "Not Started"
  | "In Progress"
  | "Unknown / Not Cached";

export function inspectionStatusLabel(status: PresentationStatus) {
  if (status === "Pending" || status === "Pending Sync") return "Waiting to Sync";
  if (status === "Synced" || status === "Completed") return "Inspection Complete";
  if (status === "Failed" || status === "Conflict" || status === "Needs Attention") {
    return "Needs Attention";
  }
  if (status === "Syncing") return "Syncing\u2026";
  if (status === "Pending Evidence") return "Waiting for Evidence";
  if (status === "Uploading Evidence") return "Uploading Evidence\u2026";
  if (status === "Unknown / Not Cached") return "Status Unavailable";
  return status;
}

export function inspectionStatusTone(status: PresentationStatus) {
  if (status === "Synced" || status === "Completed") return "complete";
  if (status === "Failed" || status === "Conflict" || status === "Needs Attention") return "attention";
  if (status === "Pending" || status === "Pending Sync" || status === "Pending Evidence") return "waiting";
  if (status === "Syncing" || status === "Uploading Evidence") return "syncing";
  if (status === "Draft" || status === "In Progress") return "draft";
  return "neutral";
}

export function jobStatusLabel(status: "open" | "closed") {
  return status === "closed" ? "Service Completed" : "In Progress";
}

export function technicianOperationalMessage(message: string) {
  if (message === "Cached template version is unavailable. Refresh jobs online first.") {
    return {
      text: "Inspection setup is not available on this device yet. Refresh while online to continue.",
      tone: "warning" as const
    };
  }
  return { text: message, tone: "info" as const };
}
