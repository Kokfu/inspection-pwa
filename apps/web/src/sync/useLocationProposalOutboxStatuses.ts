import { useEffect, useState } from "react";
import { localDatabase } from "../db/localDatabase";
import { SYNC_FINISHED_EVENT } from "./syncEvents";

/** Statuses of this workspace's unconfirmed location-proposal outbox items, re-read after every sync run. */
export function useLocationProposalOutboxStatuses(workspaceKey: unknown): string[] {
  const [statuses, setStatuses] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const items = await localDatabase.syncOutbox.where("entityType").equals("technicianLocationProposal").toArray();
        if (active) setStatuses(items.filter((item) => item.status !== "Completed").map((item) => item.status));
      } catch { /* the header summary must never break the app shell */ }
    }
    void read();
    window.addEventListener(SYNC_FINISHED_EVENT, read);
    window.addEventListener("online", read);
    window.addEventListener("focus", read);
    return () => {
      active = false;
      window.removeEventListener(SYNC_FINISHED_EVENT, read);
      window.removeEventListener("online", read);
      window.removeEventListener("focus", read);
    };
  }, [workspaceKey]);
  return statuses;
}
