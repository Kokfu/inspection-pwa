import { autosaveStatusText, useAutosaveStatus } from "./autosaveStatus";

/**
 * I-18: shows whether the open Draft form is saved on this device. Rendered once by the app shell; it takes up its
 * (fixed) height only while a form that autosaves is open, so the page does not jump when the first save happens.
 */
export function AutosaveStatusLine() {
  const { active, status } = useAutosaveStatus();
  if (!active) return null;
  const text = autosaveStatusText(status);
  return (
    <p className={`autosave-status autosave-status--${status}`} role="status" aria-live="polite">
      {text}
    </p>
  );
}
