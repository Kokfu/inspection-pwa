/**
 * I-65: with several tabs of the app open, every tab reacted to the same reconnect / visible / launch event and sent the
 * same outbox at once (a burst of about 15 requests in 2 seconds on the phone). The sends are idempotent, so no data was
 * at risk, but each tab also competes for storage (see I-70). Only ONE tab runs an automatic sync at a time: the others
 * skip, because the running tab drains the same shared outbox.
 *
 * Automatic triggers only. A sync the technician starts by hand (Sync Now / Sync / Retry) never uses this lock, so a
 * hidden or stuck tab can never keep the technician from syncing. Web Locks release when their page goes away. Without
 * Web Locks (or if the request itself fails) the sync simply runs.
 */
export const AUTO_SYNC_LOCK = "inspection-auto-sync";

export type SingleSenderLocks = {
  request(name: string, options: { ifAvailable: true }, callback: (lock: unknown) => Promise<unknown>): Promise<unknown>;
};

export async function runAsSingleSender(locks: SingleSenderLocks | undefined, work: () => Promise<void>): Promise<"ran" | "skipped"> {
  if (!locks) { await work(); return "ran"; }
  let outcome: "ran" | "skipped" = "skipped";
  let started = false;
  try {
    await locks.request(AUTO_SYNC_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) return; // another tab is already syncing
      started = true; outcome = "ran";
      await work();
    });
  } catch (error) {
    if (started) throw error; // the sync itself failed: let the coordinator treat it as a failed run
    await work(); return "ran"; // the lock request failed before any work: fail open
  }
  return outcome;
}
