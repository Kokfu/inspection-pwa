import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";
import type { LocalOfflineServiceVisit } from "./offlineServiceVisitTypes";

/** Visits created on this device, kept live so a card changes the moment sync confirms or refuses it. */
export function useOfflineServiceVisits(): { visits: LocalOfflineServiceVisit[]; loaded: boolean } {
  const workspace = currentWorkspaceUserId();
  const [state, setState] = useState<{ visits: LocalOfflineServiceVisit[]; loaded: boolean }>({ visits: [], loaded: false });
  useEffect(() => {
    const subscription = liveQuery(() => localDatabase.offlineServiceVisits.toArray()).subscribe({
      next: (visits) => setState({ visits, loaded: true }),
      error: () => setState({ visits: [], loaded: false })
    });
    return () => subscription.unsubscribe();
  }, [workspace]);
  return state;
}
