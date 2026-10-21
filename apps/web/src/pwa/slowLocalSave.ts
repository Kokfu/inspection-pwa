// I-79: on one phone a local save once sat at "Saving on this device…" for about ten minutes while other tabs of the app
// were open, then completed the moment a hidden tab was closed. Nothing was lost, but the technician could not tell.
// This only reports the delay; it touches no data. (The holder of the stalled IndexedDB transaction was not identified.)
export const SLOW_SAVE_AFTER_MS = 10_000;

export function isLocalSaveSlow(input: { now: number; savingSince?: number; oldestActivityAt?: number; thresholdMs?: number }): boolean {
  const threshold = input.thresholdMs ?? SLOW_SAVE_AFTER_MS;
  const stalled = (since: number | undefined) => since !== undefined && input.now - since >= threshold;
  return stalled(input.savingSince) || stalled(input.oldestActivityAt);
}

export const slowSaveNoticeText =
  "Saving on this device is taking longer than usual. What you typed is still on this screen. Keep this screen open and close other tabs of this app; it should finish by itself.";
