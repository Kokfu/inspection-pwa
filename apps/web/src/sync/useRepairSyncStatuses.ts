import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";

/** One status per submitted repair; Loading is a display-only marker until this workspace is read. */
export function useRepairSyncStatuses(actorId: number | undefined): string[] {
  const [snapshot, setSnapshot] = useState<{ actorId: number; db: typeof localDatabase; statuses: string[] }>();
  useEffect(() => {
    if (!actorId || currentWorkspaceUserId() !== actorId) return;
    const db = localDatabase;
    let active = true;
    const current = () => active && db === localDatabase && currentWorkspaceUserId() === actorId;
    const subscription = liveQuery(async () => {
      const records = await db.repairRecords.toArray();
      const statuses = await Promise.all(records.filter(r => r.actorId === actorId && r.syncStatus !== "Draft").map(async r => {
        const photo = r.photoUuid ? await db.repairAttachments.get(r.photoUuid) : undefined;
        const states = [r.syncStatus, photo?.syncStatus];
        if (states.includes("Conflict")) return "Conflict";
        if (states.includes("Failed")) return "Failed";
        if (states.includes("Syncing") || states.includes("Uploading")) return "Syncing";
        if (states.includes("Pending")) return "Pending";
        return r.syncStatus;
      }));
      return statuses;
    }).subscribe({
      next(statuses) { if (current()) setSnapshot({ actorId, db, statuses }); },
      error() { if (current()) setSnapshot({ actorId, db, statuses: ["Failed"] }); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [actorId]);
  if (!actorId) return [];
  return snapshot?.actorId === actorId && snapshot.db === localDatabase && currentWorkspaceUserId() === actorId ? snapshot.statuses : ["Loading"];
}
