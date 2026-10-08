/** Fired on `window` after every sync run (manual or automatic) so screens showing queued work can re-read IndexedDB. */
export const SYNC_FINISHED_EVENT = "inspection-sync-finished";
export function announceSyncFinished() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_FINISHED_EVENT));
}
