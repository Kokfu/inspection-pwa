import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";
import { loadCustomerConfiguration, loadCustomerSites } from "../referenceData/referenceDataApi";
import { getCachedCustomerConfiguration } from "../referenceData/referenceDataCache";
import type { ReferenceSite } from "../referenceData/referenceDataTypes";
import { cacheCustomerSites, getCachedCustomerSites } from "../jobs/offlineServiceVisitLocal";
import { fetchBeforePhoto, fetchCurrentCatalog, fetchPreviousCatalog, fetchPreviousVisits } from "./repairVisitApi";
import { sha256Hex } from "./repairVisitCanon";
import { beforePhotoCacheKey, catalogCacheKey } from "./repairVisitPresentation";
import type {
  CachedRepairBeforePhoto, CachedRepairPreviousVisit, RepairCatalogField, RepairPreviousVisitListItem, RepairVisitPhoto, RepairVisitPrevious
} from "./repairVisitTypes";

const cacheLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export type CatalogSource = { fields: RepairCatalogField[]; configurationRevisionId: string; fetchedAt: string; fromDevice: boolean };

function actor() {
  const userId = currentWorkspaceUserId();
  if (userId === undefined) throw new Error("Sign in on this device first.");
  return userId;
}

/** The revision the server will compare at create time: fresh when connected, the downloaded setup otherwise. */
export async function resolveConfigurationRevision(customerId: string, online: boolean) {
  if (online) return (await loadCustomerConfiguration(customerId)).configuration.configurationId;
  const cached = await getCachedCustomerConfiguration(customerId);
  if (!cached) throw new Error("This customer's setup is not saved on this device. Connect to the server once to download it.");
  return cached.configuration.configurationId;
}

async function putCatalog(customerId: string, siteId: string, previous: RepairVisitPrevious | null, list: RepairPreviousVisitListItem | undefined,
  fields: RepairCatalogField[], configurationRevisionId: string): Promise<CatalogSource> {
  const fetchedAt = new Date().toISOString();
  const row: CachedRepairPreviousVisit = {
    cacheKey: catalogCacheKey(customerId, siteId, previous), customerId, siteId, createdByUserId: actor(), previousVisit: previous,
    visitNumber: list?.visitNumber ?? null, visitDate: list?.visitDate ?? null, configurationRevisionId, fields, fetchedAt,
    expiresAt: new Date(Date.parse(fetchedAt) + cacheLifetimeMs).toISOString()
  };
  await localDatabase.rvPreviousVisits.put(row);
  return { fields, configurationRevisionId, fetchedAt, fromDevice: false };
}

/**
 * The field list for one site and previous visit. Connected: the server's answer, saved on the device. Offline: the saved list.
 * A server that answers with a refusal or a malformed list is never papered over with older saved data (it throws).
 */
export async function loadCatalog(customerId: string, siteId: string, previous: RepairVisitPrevious | null, online: boolean, list?: RepairPreviousVisitListItem): Promise<CatalogSource> {
  if (online) {
    if (previous === null) {
      const current = await fetchCurrentCatalog(customerId, siteId);
      return putCatalog(customerId, siteId, null, undefined, current.fields, current.configurationRevisionId);
    }
    const fields = await fetchPreviousCatalog(customerId, siteId, previous);
    return putCatalog(customerId, siteId, previous, list, fields, await resolveConfigurationRevision(customerId, true));
  }
  const cached = await localDatabase.rvPreviousVisits.get(catalogCacheKey(customerId, siteId, previous));
  if (!cached || cached.createdByUserId !== actor()) throw new Error("This field list is not saved on this device. Connect to the server once, or use Download for offline.");
  const revision = previous === null ? cached.configurationRevisionId : await resolveConfigurationRevision(customerId, false).catch(() => cached.configurationRevisionId);
  return { fields: cached.fields, configurationRevisionId: revision, fetchedAt: cached.fetchedAt, fromDevice: true };
}

export type PreviousVisitListSource = { visits: RepairPreviousVisitListItem[]; fromDevice: boolean; fetchedAt?: string };

/** The approved visits of this technician at one site, newest first. Offline: the visits whose field lists are saved here. */
export async function loadPreviousVisitList(customerId: string, siteId: string, online: boolean): Promise<PreviousVisitListSource> {
  const userId = actor();
  if (online) {
    const visits = (await fetchPreviousVisits(customerId, siteId)).filter(visit => visit.createdByUserId === userId);
    // The server's list is authoritative: saved lists of visits it no longer offers are dropped, never reused.
    const keep = new Set(visits.map(visit => catalogCacheKey(customerId, siteId, visit)));
    keep.add(catalogCacheKey(customerId, siteId, null));
    const stale = (await localDatabase.rvPreviousVisits.where("[customerId+siteId]").equals([customerId, siteId]).primaryKeys()).filter(key => !keep.has(String(key)));
    if (stale.length) await localDatabase.rvPreviousVisits.bulkDelete(stale);
    return { visits, fromDevice: false };
  }
  const rows = (await localDatabase.rvPreviousVisits.where("[customerId+siteId]").equals([customerId, siteId]).toArray())
    .filter(row => row.createdByUserId === userId && row.previousVisit !== null && row.visitNumber && row.visitDate);
  return {
    fromDevice: true, fetchedAt: rows.map(row => row.fetchedAt).sort()[0],
    visits: rows.map(row => ({ ...row.previousVisit!, visitNumber: row.visitNumber!, visitDate: row.visitDate!, createdAt: row.fetchedAt, createdByUserId: row.createdByUserId }))
      .sort((left, right) => right.visitDate.localeCompare(left.visitDate) || right.visitId.localeCompare(left.visitId))
  };
}

/** Best effort after a connected list load: save every field list so the same screen works with no signal (plan A8). */
export async function cacheSiteCatalogs(customerId: string, siteId: string, visits: RepairPreviousVisitListItem[]) {
  for (const visit of visits) {
    try { await loadCatalog(customerId, siteId, { kind: visit.kind, visitId: visit.visitId }, true, visit); } catch { return; }
  }
  try { await loadCatalog(customerId, siteId, null, true); } catch { /* the field list for "no previous visit" is saved when it is first used */ }
}

// ---- Before photos ----
export async function readCachedBeforePhoto(previous: RepairVisitPrevious, photo: RepairVisitPhoto): Promise<Blob | undefined> {
  const cached = await localDatabase.rvBeforePhotos.get(beforePhotoCacheKey(previous, photo.photoUuid));
  if (!cached || cached.photoUuid !== photo.photoUuid || cached.storedSha256 !== photo.storedSha256) return undefined;
  if (await sha256Hex(await cached.blob.arrayBuffer()) !== photo.storedSha256) return undefined;
  return cached.blob;
}

/** Downloads, verifies the SHA-256 against the catalog and saves one Before photo. A photo that fails the check is not kept. */
export async function downloadBeforePhoto(customerId: string, siteId: string, previous: RepairVisitPrevious, photo: RepairVisitPhoto): Promise<Blob> {
  const blob = await fetchBeforePhoto(customerId, siteId, previous, photo.photoUuid);
  if (await sha256Hex(await blob.arrayBuffer()) !== photo.storedSha256) throw new Error("The Before photo failed its integrity check and was not saved.");
  const row: CachedRepairBeforePhoto = {
    cacheKey: beforePhotoCacheKey(previous, photo.photoUuid), previousVisit: previous, photoUuid: photo.photoUuid,
    storedSha256: photo.storedSha256, blob, fetchedAt: new Date().toISOString()
  };
  await localDatabase.rvBeforePhotos.put(row);
  return blob;
}

export type OfflineDownloadReport = { sites: number; fieldLists: number; photos: number; failures: string[] };

/** "Download for offline" for one customer: every site's previous-visit field lists and all Before photos. */
export async function downloadCustomerForOffline(customerId: string): Promise<OfflineDownloadReport> {
  const userId = actor();
  const report: OfflineDownloadReport = { sites: 0, fieldLists: 0, photos: 0, failures: [] };
  const sites: ReferenceSite[] = await loadCustomerSites(customerId);
  await cacheCustomerSites(customerId, sites).catch(() => undefined);
  for (const site of sites) {
    report.sites += 1;
    try {
      const list = (await fetchPreviousVisits(customerId, site.id)).filter(visit => visit.createdByUserId === userId);
      const sources: Array<{ previous: RepairVisitPrevious | null; item?: RepairPreviousVisitListItem }> = [{ previous: null }, ...list.map(item => ({ previous: { kind: item.kind, visitId: item.visitId } as RepairVisitPrevious, item }))];
      for (const source of sources) {
        const catalog = await loadCatalog(customerId, site.id, source.previous, true, source.item);
        report.fieldLists += 1;
        if (source.previous === null) continue;
        const photos = new Map<string, RepairVisitPhoto>();
        for (const field of catalog.fields) if (field.before?.photo) photos.set(field.before.photo.photoUuid, field.before.photo);
        for (const photo of photos.values()) {
          try {
            if (!await readCachedBeforePhoto(source.previous, photo)) await downloadBeforePhoto(customerId, site.id, source.previous, photo);
            report.photos += 1;
          } catch (error) { report.failures.push(`${site.displayName}: ${error instanceof Error ? error.message : "a Before photo could not be saved"}`); }
        }
      }
    } catch (error) { report.failures.push(`${site.displayName}: ${error instanceof Error ? error.message : "field lists could not be saved"}`); }
  }
  return report;
}

export { getCachedCustomerSites };
