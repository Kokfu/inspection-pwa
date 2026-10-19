import { localDatabase } from "../db/localDatabase";

/**
 * "Prepare the job while online" (I-02, option A1).
 *
 * Starting a system for the first time asks the server whether that system already has an accepted inspection for the job,
 * so a technician does not redo accepted work. Offline that answer cannot be fetched. Instead of refusing, the app records,
 * every time the job list is refreshed online, WHEN the server last confirmed each job and which systems it already had
 * accepted. A system the server confirmed as having nothing accepted may then be started offline for a limited time.
 * The server's acceptance check at sync remains the backstop.
 *
 * Stored in the per-user `drafts` table (no schema change).
 */
export const OFFLINE_START_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const ENTITY_TYPE = "offlineStartConfirmation";
const draftId = (jobId: string) => `offline-start:${jobId}`;

export type OfflineStartConfirmation = { jobId: string; confirmedAt: string; acceptedSystemKeys: string[] };

function parse(payload: unknown, jobId: string): OfflineStartConfirmation | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = payload as Partial<OfflineStartConfirmation>;
  if (value.jobId !== jobId || typeof value.confirmedAt !== "string" || Number.isNaN(Date.parse(value.confirmedAt))) return undefined;
  if (!Array.isArray(value.acceptedSystemKeys) || value.acceptedSystemKeys.some((key) => typeof key !== "string")) return undefined;
  return { jobId, confirmedAt: value.confirmedAt, acceptedSystemKeys: value.acceptedSystemKeys };
}

/** Pure rule: fresh confirmation, and the server had nothing accepted for this system. Malformed or future-dated data fails closed. */
export function offlineStartAllowed(confirmation: OfflineStartConfirmation | undefined, systemKey: string, nowMs: number = Date.now(), maxAgeMs: number = OFFLINE_START_MAX_AGE_MS) {
  if (!confirmation) return false;
  const age = nowMs - Date.parse(confirmation.confirmedAt);
  if (age < 0 || age > maxAgeMs) return false;
  return !confirmation.acceptedSystemKeys.includes(systemKey);
}

/** Called after a successful online listing of accepted inspections for `jobs`. */
export async function recordOfflineStartConfirmations(
  jobs: ReadonlyArray<{ id: string }>,
  summaries: ReadonlyArray<{ jobId: string; systemKey: string }>,
  now: Date = new Date()
) {
  const at = now.toISOString();
  const rows = jobs.map((job) => ({
    id: draftId(job.id),
    entityType: ENTITY_TYPE,
    updatedAt: at,
    payload: { jobId: job.id, confirmedAt: at, acceptedSystemKeys: [...new Set(summaries.filter((summary) => summary.jobId === job.id).map((summary) => summary.systemKey))] } satisfies OfflineStartConfirmation
  }));
  if (rows.length) await localDatabase.drafts.bulkPut(rows);
}

export async function loadOfflineStartConfirmation(jobId: string) {
  return parse((await localDatabase.drafts.get(draftId(jobId)))?.payload, jobId);
}

/** Resolver hook: may a never-opened system of this job be started while the server cannot be asked? */
export async function isOfflineStartConfirmed(jobId: string, systemKey: string) {
  try {
    // A visit created on this device does not exist on the server yet, so nothing can already be accepted for it.
    const visit = await localDatabase.offlineServiceVisits.get(jobId);
    if (visit && visit.syncStatus !== "Synced") return true;
    return offlineStartAllowed(await loadOfflineStartConfirmation(jobId), systemKey);
  } catch { return false; }
}

/** Ids of the given jobs that were confirmed recently enough to be started offline (job-card indicator). */
export async function listOfflineReadyJobIds(jobIds: ReadonlyArray<string>, nowMs: number = Date.now()) {
  const ready = new Set<string>();
  try {
    const rows = await localDatabase.drafts.bulkGet(jobIds.map(draftId));
    rows.forEach((row, index) => { const id = jobIds[index]!; if (jobReadyForOffline(parse(row?.payload, id), nowMs)) ready.add(id); });
  } catch { /* indicator only */ }
  return ready;
}

/** Job-card indicator: the job was confirmed recently enough to be started offline. */
export function jobReadyForOffline(confirmation: OfflineStartConfirmation | undefined, nowMs: number = Date.now()) {
  return offlineStartAllowed(confirmation, "", nowMs);
}
