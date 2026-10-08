import { useEffect, useRef } from "react";
import { publishAutosaveStatus, setAutosaveActive } from "./autosaveStatus";
import { DRAFT_AUTOSAVE_DELAY_MS, DraftAutosaver } from "./draftAutosave";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Autosaves an open Draft form (I-04). Add it directly after the form's `useEffect(() => setResponses(record.responses), [record])`
 * so a save's echo never overwrites text typed while the save was running.
 *
 * - saves 1.5 s after the last change, when the tab is hidden/closing, and when the form is left (Back, route change);
 * - asks the browser to confirm a reload/close while there is unsaved typing;
 * - does nothing for a non-Draft record or before the technician has interacted.
 *
 * I-17: pass `submit` (the form's `onSubmitLocal`) and call the returned `submit()` from the Submit button instead of
 * `onSubmitLocal(responses)`. It first lets an autosave that is running (or due) finish and waits for the refreshed record
 * to reach the form, then submits with the latest props, so Submit never races the autosave's write.
 */
export function useDraftAutosave<T>(options: {
  record: { responses: T };
  responses: T;
  setResponses: (value: T) => void;
  save: (value: T) => Promise<void>;
  submit?: (value: T) => Promise<void>;
  /** Canonical copy the save stores, when it differs from what was typed (pre-V6 Fire Alarm). */
  echoOf?: (value: T) => T;
  enabled: boolean;
}) {
  const latest = useRef(options);
  latest.current = options;
  const autosaver = useRef<DraftAutosaver<T> | undefined>(undefined);
  autosaver.current ??= new DraftAutosaver<T>({
    delayMs: DRAFT_AUTOSAVE_DELAY_MS,
    getLatest: () => ({ value: latest.current.responses, enabled: latest.current.enabled }),
    save: (value) => latest.current.save(value),
    echoOf: (value) => (latest.current.echoOf ? latest.current.echoOf(value) : value),
    onStatus: publishAutosaveStatus
  });

  // Echo of our own save (keep newer typing) or an outside change (fresh baseline). Runs after the form's reset effect.
  useEffect(() => {
    autosaver.current?.recordChanged(options.record.responses, options.responses, options.setResponses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.record]);

  useEffect(() => { autosaver.current?.valueChanged(); }, [options.responses, options.enabled]);

  // The status line (I-18) is only for a form whose Draft is being edited, not a Pending/Synced read-only view.
  useEffect(() => {
    setAutosaveActive(options.enabled);
    return () => setAutosaveActive(false);
  }, [options.enabled]);

  useEffect(() => {
    const saver = autosaver.current;
    if (!saver) return;
    const interacted = (event: Event) => { if (event.isTrusted) saver.noteUserEvent(); };
    const events = ["input", "change", "click", "keydown"] as const;
    for (const name of events) document.addEventListener(name, interacted, true);
    const hide = () => { if (document.visibilityState === "hidden") void saver.flush(); };
    const pageHide = () => { void saver.flush(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!saver.isDirty()) return;
      void saver.flush();
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      for (const name of events) document.removeEventListener(name, interacted, true);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("beforeunload", beforeUnload);
      // Leaving the form (Back, navigation) must not drop typed text.
      void saver.flush();
      saver.dispose();
    };
  }, []);

  return {
    /** Submit after any autosave has finished and its refreshed record has reached this form. Throws what `submit` throws. */
    async submit() {
      const saver = autosaver.current;
      if (saver) {
        const recordBefore = latest.current.record;
        const savesBefore = saver.saveCount;
        await saver.flush();
        if (saver.saveCount !== savesBefore) {
          // The save replaced the record in the parent; the Submit handler of this render still holds the old one.
          for (let waited = 0; latest.current.record === recordBefore && waited < 1000; waited += 10) await pause(10);
          await pause(0);
        }
      }
      await latest.current.submit?.(latest.current.responses);
    }
  };
}
