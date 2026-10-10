import { useSyncExternalStore } from "react";
import type { DraftAutosaveStatus } from "./draftAutosave";

/**
 * I-18: a visible line for the autosave state. One form autosaves at a time, so the state lives in a tiny shared store:
 * `useDraftAutosave` publishes to it, `AutosaveStatusLine` (rendered once by the app shell) reads it.
 */
export type AutosaveStatusSnapshot = { active: boolean; status: DraftAutosaveStatus };

let snapshot: AutosaveStatusSnapshot = { active: false, status: "idle" };
const listeners = new Set<() => void>();

function set(next: AutosaveStatusSnapshot) {
  if (next.active === snapshot.active && next.status === snapshot.status) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** A form that autosaves was mounted (`true`) or left (`false`). */
export function setAutosaveActive(active: boolean) {
  set({ active, status: "idle" });
}

export function publishAutosaveStatus(status: DraftAutosaveStatus) {
  // After a save the form re-renders with the saved record and the autosaver reports "idle"; keep showing "saved"
  // until the technician changes something again.
  if (status === "idle" && snapshot.status === "saved") return;
  set({ ...snapshot, status });
}

export function getAutosaveStatus() {
  return snapshot;
}

/** Only whether a Draft form is open: unlike `useAutosaveStatus` it does not re-render on every save tick. */
const subscribeToStatus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getAutosaveActive = () => snapshot.active;
export function useAutosaveActive() {
  return useSyncExternalStore(subscribeToStatus, getAutosaveActive, getAutosaveActive);
}

export function useAutosaveStatus() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getAutosaveStatus,
    getAutosaveStatus
  );
}

/** Words, not colour alone. `null` = nothing to say (the form is untouched). */
export function autosaveStatusText(status: DraftAutosaveStatus): string | null {
  switch (status) {
    case "pending": return "Unsaved changes – saving shortly";
    case "saving": return "Saving on this device…";
    case "saved": return "Autosaved on this device";
    case "error": return "Could not save on this device – will retry";
    default: return null;
  }
}
