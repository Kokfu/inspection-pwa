import { useEffect, useRef, useState } from "react";
import { getAutosaveStatus } from "../inspectionControls/autosaveStatus";
import { oldestWorkspaceActivityStartedAt } from "../db/workspaceActivity";
import { isLocalSaveSlow, slowSaveNoticeText } from "./slowLocalSave";

/** True while a local save (form autosave or a tracked repair save/photo) has been running longer than expected. */
export function useSlowLocalSave(): boolean {
  const [slow, setSlow] = useState(false);
  const savingSince = useRef<number | undefined>(undefined);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      if (getAutosaveStatus().status === "saving") savingSince.current ??= now; else savingSince.current = undefined;
      setSlow(isLocalSaveSlow({ now, savingSince: savingSince.current, oldestActivityAt: oldestWorkspaceActivityStartedAt() }));
    };
    const timer = window.setInterval(tick, 2_000);
    return () => window.clearInterval(timer);
  }, []);
  return slow;
}

export function SlowLocalSaveNotice({ slow }: { slow: boolean }) {
  if (!slow) return null;
  return (
    <aside className="pwa-update-notice other-tabs-notice" role="status" aria-live="polite" aria-atomic="true">
      <div>
        <strong>Saving is slow</strong>
        <p>{slowSaveNoticeText}</p>
      </div>
    </aside>
  );
}
