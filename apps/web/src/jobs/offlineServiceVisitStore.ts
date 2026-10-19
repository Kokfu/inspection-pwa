import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";
import type { InspectionJob } from "./jobTypes";
import type { LocalOfflineServiceVisit } from "./offlineServiceVisitTypes";

/** A visit created on this device has no SV number until the server confirms its UUID. */
export const LOCAL_VISIT_REFERENCE = "SV number given when synced";

export function isLocalVisitReference(reference: unknown) {
  return reference === LOCAL_VISIT_REFERENCE;
}

/** Visits whose create has not been confirmed by the server. Their forms and photos must wait. */
export const unconfirmedVisitStatuses = ["Pending", "Syncing", "Failed", "Conflict"] as const;

export async function listLocalVisits(): Promise<LocalOfflineServiceVisit[]> {
  return localDatabase.offlineServiceVisits.toArray();
}

/** Jobs created offline that the server list cannot contain yet. */
export async function unsyncedLocalVisitJobs(): Promise<InspectionJob[]> {
  const userId = currentWorkspaceUserId();
  const visits = await localDatabase.offlineServiceVisits.where("syncStatus").anyOf(...unconfirmedVisitStatuses).toArray();
  return visits.filter((visit) => userId === undefined || visit.createdByUserId === userId).map((visit) => visit.job);
}

/** Job IDs whose form and photo operations must not be sent before the visit exists on the server. */
export async function heldJobIds(): Promise<Set<string>> {
  const keys = await localDatabase.offlineServiceVisits.where("syncStatus").anyOf(...unconfirmedVisitStatuses).primaryKeys();
  return new Set(keys.filter((key): key is string => typeof key === "string"));
}

/**
 * True when the job is a visit created on this device that the server has not confirmed yet. The server cannot already hold an
 * inspection for it, so open paths must skip the server lookup (which would only fail offline) and work from the device.
 * Once the receipt is stored (status Synced) this is false and the normal server lookup applies again. Unreadable storage is false.
 */
export async function isUnconfirmedLocalVisit(jobId: string): Promise<boolean> {
  try {
    const visit = await localDatabase.offlineServiceVisits.get(jobId);
    return visit !== undefined && (unconfirmedVisitStatuses as readonly string[]).includes(visit.syncStatus);
  } catch {
    return false;
  }
}

export type LocalVisitPresentation = {
  label: "Pending sync" | "Syncing" | "Needs attention" | "Synced";
  tone: "pending" | "syncing" | "attention" | "synced";
  reason?: string;
};

const refusalText: Record<string, string> = {
  CONFIGURATION_CHANGED: "This customer's setup changed on the server after it was downloaded. Reconnect, refresh, then retry or recreate the visit.",
  SITE_INACTIVE: "This site is no longer active on the server.",
  SITE_NOT_FOUND: "This site was not found for the customer on the server.",
  CUSTOMER_INACTIVE: "This customer is no longer active on the server.",
  CUSTOMER_NOT_FOUND: "This customer was not found on the server.",
  DEVICE_DATE_IN_FUTURE: "This device's date or time is more than one day ahead of the server. Correct the device clock, then retry.",
  DEVICE_DATE_TOO_OLD: "This visit was created more than 30 days ago, so the server refused it.",
  IDEMPOTENCY_MISMATCH: "The server already holds a different visit under this ID.",
  IDENTITY_MISMATCH: "A different technician is signed in. Sign in as the visit's owner to sync it.",
  FORBIDDEN: "The server does not allow this account to create service visits.",
  JOB_NOT_FOUND: "The server does not recognise this visit for the signed-in account."
};

export function refusalReason(code: string | undefined, serverMessage: string | undefined) {
  const known = code ? refusalText[code] : undefined;
  return known ?? (serverMessage && serverMessage.trim() ? serverMessage.trim() : "The server refused this visit.");
}

export function presentLocalVisit(visit: LocalOfflineServiceVisit): LocalVisitPresentation {
  if (visit.syncStatus === "Synced") return { label: "Synced", tone: "synced" };
  if (visit.syncStatus === "Syncing") return { label: "Syncing", tone: "syncing" };
  if (visit.syncStatus === "Failed" || visit.syncStatus === "Conflict") {
    return { label: "Needs attention", tone: "attention", reason: visit.lastSyncError ?? "The server did not confirm this visit." };
  }
  return { label: "Pending sync", tone: "pending", reason: visit.lastSyncError };
}

/** Show the server's SV number as soon as the receipt is stored, even if a cached job still holds the placeholder. */
export function withConfirmedReference(job: InspectionJob, visit: LocalOfflineServiceVisit | undefined): InspectionJob {
  return visit?.receipt && isLocalVisitReference(job.reference) ? { ...job, reference: visit.receipt.visitNumber } : job;
}
