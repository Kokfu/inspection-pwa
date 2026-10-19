import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";
import type { LocalRepairVisit, LocalRepairVisitItem, LocalRepairVisitPhoto } from "./repairVisitTypes";

export type RepairVisitListState = { visits: LocalRepairVisit[]; itemCounts: Map<string, number>; loaded: boolean; failed: boolean };

/** Every repair visit on this device, kept live so a card changes the moment sync confirms or refuses it. */
export function useLocalRepairVisits(): RepairVisitListState {
  const workspace = currentWorkspaceUserId();
  const [state, setState] = useState<RepairVisitListState>({ visits: [], itemCounts: new Map(), loaded: false, failed: false });
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [visits, items] = await Promise.all([localDatabase.rvVisits.toArray(), localDatabase.rvItems.toArray()]);
      const itemCounts = new Map<string, number>();
      for (const item of items) itemCounts.set(item.visitUuid, (itemCounts.get(item.visitUuid) ?? 0) + 1);
      return { visits, itemCounts };
    }).subscribe({
      next: value => setState({ ...value, loaded: true, failed: false }),
      error: () => setState({ visits: [], itemCounts: new Map(), loaded: true, failed: true })
    });
    return () => subscription.unsubscribe();
  }, [workspace]);
  return state;
}

export type RepairVisitFormState = {
  visit: LocalRepairVisit | undefined; items: LocalRepairVisitItem[]; photos: Map<string, LocalRepairVisitPhoto>; loaded: boolean; failed: boolean;
};

export function useLocalRepairVisit(visitUuid: string): RepairVisitFormState {
  const workspace = currentWorkspaceUserId();
  const [state, setState] = useState<RepairVisitFormState>({ visit: undefined, items: [], photos: new Map(), loaded: false, failed: false });
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [visit, items, photos] = await Promise.all([
        localDatabase.rvVisits.get(visitUuid),
        localDatabase.rvItems.where("visitUuid").equals(visitUuid).sortBy("sortOrder"),
        localDatabase.rvPhotos.where("visitUuid").equals(visitUuid).toArray()
      ]);
      return { visit, items, photos: new Map(photos.map(photo => [photo.photoUuid, photo])) };
    }).subscribe({
      next: value => setState({ ...value, loaded: true, failed: false }),
      error: () => setState({ visit: undefined, items: [], photos: new Map(), loaded: true, failed: true })
    });
    return () => subscription.unsubscribe();
  }, [visitUuid, workspace]);
  return state;
}

/** Follows the browser's own connectivity flag. The server being unreachable is detected by the request that fails. */
export function useBrowserConnected() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}
