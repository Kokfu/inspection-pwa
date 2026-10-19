import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";

/**
 * One header status per submitted repair visit of this account; Loading is a display-only marker
 * until this workspace is read. A Draft visit has nothing to sync, so it adds no status. Photos
 * that still wait or failed are folded into their visit's status.
 */
export function useRepairVisitSyncStatuses(actorId: number | undefined): string[] {
  const [snapshot, setSnapshot] = useState<{ actorId: number; db: typeof localDatabase; statuses: string[] }>();
  useEffect(() => {
    if (!actorId || currentWorkspaceUserId() !== actorId) return;
    const db = localDatabase;
    let active = true;
    const current = () => active && db === localDatabase && currentWorkspaceUserId() === actorId;
    const subscription = liveQuery(async () => {
      const visits = (await db.rvVisits.toArray()).filter(visit => visit.createdByUserId === actorId && visit.syncStatus !== "Draft");
      return Promise.all(visits.map(async visit => {
        const photos = await db.rvPhotos.where("visitUuid").equals(visit.clientUuid).toArray();
        const states: string[] = [visit.syncStatus, ...photos.map(photo => photo.syncStatus)];
        if (states.includes("Conflict")) return "Conflict";
        if (states.includes("Failed")) return "Failed";
        if (states.includes("Syncing") || states.includes("Uploading")) return "Syncing";
        if (states.includes("Pending")) return "Pending";
        return visit.syncStatus;
      }));
    }).subscribe({
      next(statuses) { if (current()) setSnapshot({ actorId, db, statuses }); },
      error() { if (current()) setSnapshot({ actorId, db, statuses: ["Failed"] }); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [actorId]);
  if (!actorId) return [];
  return snapshot?.actorId === actorId && snapshot.db === localDatabase && currentWorkspaceUserId() === actorId ? snapshot.statuses : ["Loading"];
}
