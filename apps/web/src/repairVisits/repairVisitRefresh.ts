import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";
import { getCachedCustomerSites } from "../jobs/offlineServiceVisitLocal";
import { getCachedReferenceCustomers } from "../referenceData/referenceDataCache";
import { fetchVisitDetail, fetchVisitList } from "./repairVisitApi";
import type { LocalRepairVisit, RepairVisit, RepairVisitEvent, RepairVisitItem } from "./repairVisitTypes";

/** The latest Return reason from the server's append-only event log. */
export function latestReturnReason(events: RepairVisitEvent[]) {
  const returned = events.filter(event => event.type === "returned");
  return returned.length ? returned[returned.length - 1]!.reason : null;
}

/**
 * What the server's state means for a visit this device owns. Only a visit with nothing queued is touched: a visit that is
 * mid-submission is settled by its own receipt, never overwritten by a list refresh.
 */
export function reconcile(local: LocalRepairVisit, server: RepairVisit, events: RepairVisitEvent[] | undefined): Partial<LocalRepairVisit> | undefined {
  if (local.frozen || !local.createConfirmed || local.syncStatus !== "Synced") return undefined;
  if (server.clientUuid !== local.clientUuid || server.createdByUserId !== local.createdByUserId) return undefined;
  if (server.status === local.status && server.revision === local.revision && server.reportNumber === local.reportNumber) return undefined;
  const patch: Partial<LocalRepairVisit> = {
    status: server.status, revision: server.revision, reportNumber: server.reportNumber, approvedByUserId: server.approvedByUserId,
    approvedAt: server.approvedAt, updatedAt: server.updatedAt, visitNumber: server.visitNumber, serverRefreshedAt: new Date().toISOString(), localUpdatedAt: new Date().toISOString()
  };
  if (server.status === "returned") patch.returnReason = events ? latestReturnReason(events) : local.returnReason ?? null;
  else patch.returnReason = null;
  return patch;
}

async function names(customerId: string, siteId: string) {
  const [customers, sites] = await Promise.all([getCachedReferenceCustomers().catch(() => []), getCachedCustomerSites(customerId).catch(() => [])]);
  return { customerName: customers.find(customer => customer.id === customerId)?.displayName, siteName: sites.find(site => site.id === siteId)?.displayName };
}

function itemFromServer(item: RepairVisitItem): RepairVisitItem { return { ...item }; }

export type RefreshResult = { visits: number; imported: number; updated: number };

/**
 * Pull the server's view of this technician's repair visits (Returned / Approved arrive this way). It fails loudly: the caller
 * shows the failure and the screen keeps labelling its data "last known", it never presents stale data as current.
 */
export async function refreshRepairVisitsFromServer(): Promise<RefreshResult> {
  const userId = currentWorkspaceUserId();
  if (userId === undefined) throw new Error("Sign in on this device first.");
  const serverVisits = (await fetchVisitList()).filter(visit => visit.createdByUserId === userId);
  const result: RefreshResult = { visits: serverVisits.length, imported: 0, updated: 0 };
  for (const server of serverVisits) {
    const local = await localDatabase.rvVisits.get(server.clientUuid);
    if (!local) {
      // Created on another device: shown read-only here. Its photos are fetched on demand while connected.
      const detail = await fetchVisitDetail(server.clientUuid);
      const label = await names(server.customerId, server.siteId);
      const at = new Date().toISOString();
      await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, async () => {
        if (await localDatabase.rvVisits.get(server.clientUuid)) return;
        await localDatabase.rvVisits.add({
          ...detail.visit, syncStatus: "Synced", localCreatedAt: at, localUpdatedAt: at, origin: "server", createConfirmed: true,
          returnReason: detail.visit.status === "returned" ? latestReturnReason(detail.events) : null, serverRefreshedAt: at,
          ...(label.customerName ? { customerName: label.customerName } : {}), ...(label.siteName ? { siteName: label.siteName } : {})
        });
        await localDatabase.rvItems.bulkAdd(detail.items.map(itemFromServer));
      });
      result.imported += 1;
      continue;
    }
    if (local.createdByUserId !== userId) continue;
    let events: RepairVisitEvent[] | undefined;
    let detail: Awaited<ReturnType<typeof fetchVisitDetail>> | undefined;
    if (server.status !== local.status || server.revision !== local.revision || server.reportNumber !== local.reportNumber) {
      detail = await fetchVisitDetail(server.clientUuid); events = detail.events;
    }
    await localDatabase.transaction("rw", localDatabase.rvVisits, localDatabase.rvItems, async () => {
      const current = await localDatabase.rvVisits.get(server.clientUuid);
      if (!current) return;
      const patch = reconcile(current, server, events);
      if (!patch) return;
      await localDatabase.rvVisits.update(server.clientUuid, patch);
      // A visit created on another device has no local edits: its items follow the server's copy.
      if (current.origin === "server" && detail) {
        await localDatabase.rvItems.where("visitUuid").equals(server.clientUuid).delete();
        await localDatabase.rvItems.bulkAdd(detail.items.map(itemFromServer));
      }
      // The server froze each Before snapshot at Submit; show that authoritative copy, never the phone's earlier one.
      for (const item of detail?.items ?? []) {
        const localItem = await localDatabase.rvItems.get(item.clientUuid);
        if (localItem && localItem.visitUuid === server.clientUuid && JSON.stringify(localItem.identity) === JSON.stringify(item.identity)) {
          await localDatabase.rvItems.update(item.clientUuid, { before: item.before });
        }
      }
      result.updated += 1;
    });
  }
  return result;
}
