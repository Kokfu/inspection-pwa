import { useEffect, useState } from "react";
import { startTabPresence, type LockManagerLike, type TabPresence } from "./otherTabs";

let presence: TabPresence | undefined;
let started = false;
// One presence lock per page, even if React mounts the shell twice.
function pagePresence(): TabPresence | undefined {
  if (!started) {
    started = true;
    try { presence = startTabPresence((navigator as { locks?: LockManagerLike }).locks, crypto.randomUUID()); } catch { presence = undefined; }
  }
  return presence;
}

/** Number of OTHER open tabs of this app (0 where Web Locks is unavailable). Re-read every 10 s and when this tab is shown. */
export function useOtherTabCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const own = pagePresence();
    if (!own) return;
    let active = true;
    const refresh = () => { void own.readOtherTabs().then((value) => { if (active) setCount(value); }); };
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return count;
}
