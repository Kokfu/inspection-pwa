import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { localDatabase } from "../db/localDatabase";
import { SYNC_FINISHED_EVENT } from "./syncEvents";

/** Statuses of this workspace's unconfirmed location-proposal outbox items, re-read after every sync run. */
export function useLocationProposalOutboxStatuses(workspaceKey: unknown): string[] {
  return useOutboxEntityStatuses("technicianLocationProposal", workspaceKey);
}

/** Statuses of this workspace's unconfirmed technician Add Customer outbox items (I-74). */
export function useTechnicianCustomerOutboxStatuses(workspaceKey: unknown): string[] {
  return useOutboxEntityStatuses("technicianCustomer", workspaceKey);
}

function useOutboxEntityStatuses(entityType: "technicianLocationProposal" | "technicianCustomer", workspaceKey: unknown): string[] {
  const [statuses, setStatuses] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    setStatuses([]);
    const database = localDatabase;
    const subscription = liveQuery(() => database.syncOutbox.where("entityType").equals(entityType).toArray()).subscribe({
      next: (items) => { if (active && database === localDatabase) setStatuses(items.filter((item) => item.status !== "Completed").map((item) => item.status)); },
      error: () => { /* header failures must not interrupt local work */ }
    });
    async function read() {
      try {
        const items = await database.syncOutbox.where("entityType").equals(entityType).toArray();
        if (active && database === localDatabase) setStatuses(items.filter((item) => item.status !== "Completed").map((item) => item.status));
      } catch { /* the header summary must never break the app shell */ }
    }
    void read();
    window.addEventListener(SYNC_FINISHED_EVENT, read);
    window.addEventListener("online", read);
    window.addEventListener("focus", read);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener(SYNC_FINISHED_EVENT, read);
      window.removeEventListener("online", read);
      window.removeEventListener("focus", read);
    };
  }, [entityType, workspaceKey]);
  return statuses;
}
