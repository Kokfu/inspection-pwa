import { currentWorkspaceUserId, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { cacheCanonicalInspectionJob, getCachedReferenceCustomers, removeCachedInspectionJob } from "../referenceData/referenceDataCache";
import { loadCustomerSites } from "../referenceData/referenceDataApi";
import type { CustomerConfigurationResponse, ReferenceCustomer, ReferenceSite } from "../referenceData/referenceDataTypes";
import { isServerUnreachable } from "./serverReachability";
import type { InspectionJob, JobSystemSnapshot } from "./jobTypes";
import { LOCAL_VISIT_REFERENCE } from "./offlineServiceVisitStore";
import {
  isOfflineServiceVisitCreateRequest,
  type LocalOfflineServiceVisit,
  type OfflineServiceVisitCreateRequest
} from "./offlineServiceVisitTypes";

export class OfflineVisitUnavailableError extends Error {}

const suppressionSystems = ["co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression"];
const sitesKey = (customerId: string) => `customer-sites:${customerId}`;
const sitesRefreshMs = 60 * 60 * 1000;

/** Sites are cached under their own prefix, so the reference-data refresh never prunes them. */
export async function cacheCustomerSites(customerId: string, sites: ReferenceSite[]) {
  const fetchedAt = new Date().toISOString();
  await localDatabase.referenceData.put({ key: sitesKey(customerId), payload: sites, version: "1", fetchedAt, expiresAt: fetchedAt });
}

export async function getCachedCustomerSites(customerId: string): Promise<ReferenceSite[]> {
  const payload = (await localDatabase.referenceData.get(sitesKey(customerId)))?.payload;
  if (!Array.isArray(payload)) return [];
  return payload.filter((site): site is ReferenceSite => typeof site === "object" && site !== null
    && typeof (site as ReferenceSite).id === "string" && (site as ReferenceSite).customerId === customerId
    && typeof (site as ReferenceSite).displayName === "string");
}

/** Best effort: keep each customer's site list on the device so a visit can be started with no signal. */
export async function prefetchCustomerSitesForOffline(now = Date.now()) {
  const customers = await getCachedReferenceCustomers();
  for (const customer of customers) {
    const cached = await localDatabase.referenceData.get(sitesKey(customer.id));
    if (cached && now - Date.parse(cached.fetchedAt) < sitesRefreshMs) continue;
    try { await cacheCustomerSites(customer.id, await loadCustomerSites(customer.id)); }
    catch (error) { if (isServerUnreachable(error)) return; }
  }
}

export function deviceDateString(now: Date = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export type NewLocalVisitInput = {
  customer: ReferenceCustomer; site: ReferenceSite; configuration: CustomerConfigurationResponse;
  systemKeys: string[]; serviceCallNumber: string; arrivalTime: string; now?: Date; clientJobUuid?: string;
};

/** The same job shape the server returns, built only from data the device already holds. */
export function buildLocalVisitJob(input: NewLocalVisitInput, request: OfflineServiceVisitCreateRequest): InspectionJob {
  const { customer, site, configuration } = input;
  const selected = configuration.configuration.enabledSystems
    .filter((system) => input.systemKeys.includes(system.key))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key));
  if (selected.length !== input.systemKeys.length) {
    throw new OfflineVisitUnavailableError("A selected fire system is not in the downloaded setup. Reconnect and refresh first.");
  }
  for (const system of selected) {
    // The server invents a "General" location with fresh IDs for these; a device-made one could never match it.
    if (suppressionSystems.includes(system.key) && system.locations.length === 0) {
      throw new OfflineVisitUnavailableError(`${system.displayName} has no configured locations, so its visit must be created while connected to the server.`);
    }
  }
  const enabledSystems: JobSystemSnapshot[] = selected.map((system) => ({
    enabledSystemId: system.id, systemKey: system.key, displayName: system.displayName, sortOrder: system.sortOrder,
    definitionStatus: "confirmed",
    ...(system.key === "dry_wet_riser" && system.systemConfiguration ? { systemConfiguration: system.systemConfiguration } : {}),
    ...(system.evidencePolicy ? { evidencePolicy: system.evidencePolicy } : {}),
    zones: system.zones.map((zone) => ({ ...zone })), locations: system.locations.map((location) => ({ ...location }))
  }));
  return {
    id: request.clientJobUuid, reference: LOCAL_VISIT_REFERENCE, title: site.displayName, status: "open",
    createdAt: request.deviceCreatedAt, serviceDate: request.visitDate, serviceTime: request.arrivalTime,
    site: { id: site.id, displayName: site.displayName },
    configurationSnapshot: {
      schemaVersion: 1,
      customer: { id: customer.id, code: customer.code, displayName: customer.displayName },
      site: { id: site.id, displayName: site.displayName },
      configuration: { revisionId: configuration.configuration.configurationId, revisionNumber: configuration.configuration.revision },
      template: { id: configuration.configuration.templateId, code: configuration.configuration.templateCode,
        name: configuration.configuration.templateName, version: configuration.configuration.templateVersion },
      enabledSystems
    }
  };
}

export function buildOfflineVisitRequest(input: NewLocalVisitInput): OfflineServiceVisitCreateRequest {
  const now = input.now ?? new Date();
  const call = input.serviceCallNumber.trim();
  return {
    clientJobUuid: input.clientJobUuid ?? crypto.randomUUID(),
    customerId: input.customer.id, siteId: input.site.id,
    systemKeys: input.configuration.configuration.enabledSystems
      .filter((system) => input.systemKeys.includes(system.key))
      .sort((left, right) => left.sortOrder - right.sortOrder).map((system) => system.key),
    configurationRevisionId: input.configuration.configuration.configurationId,
    configurationRevision: input.configuration.configuration.revision,
    deviceCreatedAt: now.toISOString(), visitDate: deviceDateString(now), arrivalTime: input.arrivalTime,
    serviceCallNumber: call.length ? call : null
  };
}

/**
 * Local-first save: the visit and its create operation commit together in IndexedDB before any network call.
 * Retrying with the same `clientJobUuid` (a double tap) returns the stored visit instead of making a second one.
 */
export async function createLocalServiceVisit(input: NewLocalVisitInput): Promise<InspectionJob> {
  const userId = currentWorkspaceUserId();
  if (userId === undefined) throw new OfflineVisitUnavailableError("Sign in on this device before creating a visit.");
  const request = buildOfflineVisitRequest(input);
  if (!isOfflineServiceVisitCreateRequest(request)) throw new OfflineVisitUnavailableError("This visit could not be prepared on the device.");
  const job = buildLocalVisitJob(input, request);
  const at = new Date().toISOString();
  const stored = await localDatabase.transaction("rw", localDatabase.offlineServiceVisits, localDatabase.syncOutbox, async () => {
    const existing = await localDatabase.offlineServiceVisits.get(request.clientJobUuid);
    if (existing) return existing;
    const visit: LocalOfflineServiceVisit = {
      clientJobUuid: request.clientJobUuid, createdByUserId: userId, request, job,
      syncStatus: "Pending", localCreatedAt: at, localUpdatedAt: at
    };
    const operation: SyncOutboxItem = {
      operationId: crypto.randomUUID(), entityType: "offlineServiceVisit", entityId: request.clientJobUuid, action: "create",
      payload: request, createdAt: at, attempts: 0, status: "Pending", activeKey: `offlineServiceVisit:create:${request.clientJobUuid}`
    };
    await localDatabase.offlineServiceVisits.add(visit);
    await localDatabase.syncOutbox.add(operation);
    return visit;
  });
  await cacheCanonicalInspectionJob(userId, stored.job);
  return stored.job;
}

/** Put a refused or interrupted visit back in the queue after the cause is fixed. Nothing local is changed. */
export async function requeueOfflineServiceVisit(clientJobUuid: string) {
  await localDatabase.transaction("rw", localDatabase.offlineServiceVisits, localDatabase.syncOutbox, async () => {
    const visit = await localDatabase.offlineServiceVisits.get(clientJobUuid);
    if (!visit || (visit.syncStatus !== "Failed" && visit.syncStatus !== "Conflict")) return;
    const operations = (await localDatabase.syncOutbox.where("entityId").equals(clientJobUuid).toArray())
      .filter((item) => item.entityType === "offlineServiceVisit" && item.status !== "Completed" && item.status !== "Syncing");
    for (const operation of operations) await localDatabase.syncOutbox.update(operation.operationId, { status: "Pending" });
    await localDatabase.offlineServiceVisits.update(clientJobUuid, { syncStatus: "Pending", localUpdatedAt: new Date().toISOString() });
  });
}

/** Delete a visit that never reached the server and has no inspection work. Anything else is refused untouched. */
export async function deleteUnsyncedLocalVisit(clientJobUuid: string) {
  const userId = currentWorkspaceUserId();
  const deleted = await localDatabase.transaction("rw",
    [localDatabase.offlineServiceVisits, localDatabase.syncOutbox, localDatabase.inspectionRecords, localDatabase.masterSystemInspections,
      localDatabase.masterSystemInspectionGroups, localDatabase.masterSystemFormInstances], async () => {
      const visit = await localDatabase.offlineServiceVisits.get(clientJobUuid);
      if (!visit) return false;
      if (visit.syncStatus === "Synced") throw new OfflineVisitUnavailableError("This visit is already on the server and cannot be deleted from the device.");
      if (visit.syncStatus === "Syncing") throw new OfflineVisitUnavailableError("This visit is being sent to the server. Try again in a moment.");
      const started = (await Promise.all([
        localDatabase.inspectionRecords.where("jobId").equals(clientJobUuid).count(),
        localDatabase.masterSystemInspections.where("jobId").equals(clientJobUuid).count(),
        localDatabase.masterSystemInspectionGroups.where("jobId").equals(clientJobUuid).count(),
        localDatabase.masterSystemFormInstances.where("jobId").equals(clientJobUuid).count()
      ])).some((count) => count > 0);
      if (started) throw new OfflineVisitUnavailableError("Inspection work has started on this visit, so it cannot be deleted. It will sync normally.");
      const queued = (await localDatabase.syncOutbox.toArray()).filter((item) => item.entityType !== "offlineServiceVisit"
        && item.status !== "Completed" && (item.entityId === clientJobUuid
          || (typeof item.payload === "object" && item.payload !== null && (item.payload as { jobId?: unknown }).jobId === clientJobUuid)));
      if (queued.length > 0) throw new OfflineVisitUnavailableError("Work is queued for this visit (for example a remark), so it cannot be deleted. It will sync normally.");
      const operations = await localDatabase.syncOutbox.where("entityId").equals(clientJobUuid).toArray();
      for (const operation of operations) if (operation.entityType === "offlineServiceVisit") await localDatabase.syncOutbox.delete(operation.operationId);
      await localDatabase.offlineServiceVisits.delete(clientJobUuid);
      return true;
    });
  if (deleted && userId !== undefined) await removeCachedInspectionJob(userId, clientJobUuid);
}
