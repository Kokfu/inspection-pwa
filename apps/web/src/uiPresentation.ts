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

export function isRoutineJobCountMessage(message: string, jobCount: number) {
  return message === `${jobCount} ${jobCount === 1 ? "job" : "jobs"} available on this device`;
}

export function inspectionActionLabel(status: PresentationStatus) {
  if (status === "Not Started") return "Start inspection";
  if (status === "Draft" || status === "In Progress") return "Continue inspection";
  if (status === "Failed" || status === "Conflict" || status === "Needs Attention") {
    return "Review inspection";
  }
  return "View inspection";
}

function parsedDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

export function formatClientDate(value: string) {
  const date = parsedDate(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function formatClientDateTime(value: string) {
  const date = parsedDate(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date).replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
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
