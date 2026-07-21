import { localDatabase, type ReferenceCacheEntry } from "../db/localDatabase";
import { loadInspectionJobs } from "../jobs/jobApi";
import type { InspectionJob } from "../jobs/jobTypes";
import {
  loadCustomerConfiguration,
  loadInspectionCatalog,
  loadReferenceCustomers
} from "./referenceDataApi";
import type {
  CustomerConfigurationResponse,
  InspectionCatalog,
  ReferenceCustomer
} from "./referenceDataTypes";

const catalogKey = "inspection-catalog:MFE-FSSR:1";
const customersKey = "customers:active";
const cacheDurationMs = 24 * 60 * 60 * 1000;
const managedKeyPrefixes = [
  "inspection-catalog:",
  "customers:",
  "customer-configuration:"
] as const;

function isManagedReferenceKey(key: string) {
  return managedKeyPrefixes.some((prefix) => key.startsWith(prefix));
}

function configurationKey(customerId: string) {
  return `customer-configuration:${customerId}`;
}

function inspectionJobsKey(userId: number) {
  return `inspection-jobs:user:${userId}`;
}

function entry(key: string, payload: unknown, version: string, fetchedAt: string): ReferenceCacheEntry {
  return {
    key,
    payload,
    version,
    fetchedAt,
    expiresAt: new Date(Date.parse(fetchedAt) + cacheDurationMs).toISOString()
  };
}

export async function refreshInspectionReferenceData(
  userId: number,
  canCommit: () => boolean = () => true
) {
  const [catalog, customers, jobs] = await Promise.all([
    loadInspectionCatalog(),
    loadReferenceCustomers(),
    loadInspectionJobs()
  ]);
  const configurations = await Promise.all(
    customers.map((customer) => loadCustomerConfiguration(customer.id))
  );
  const fetchedAt = new Date().toISOString();
  const entries = [
    entry(catalogKey, catalog, `${catalog.code}:${catalog.version}`, fetchedAt),
    entry(customersKey, customers, fetchedAt, fetchedAt),
    entry(inspectionJobsKey(userId), jobs, fetchedAt, fetchedAt),
    ...configurations.map((configuration) => entry(
      configurationKey(configuration.customer.id),
      configuration,
      `${configuration.configuration.templateCode}:${configuration.configuration.templateVersion}:revision-${configuration.configuration.revision}`,
      fetchedAt
    ))
  ];
  const desiredKeys = new Set(entries.map((cacheEntry) => cacheEntry.key));

  if (!canCommit()) {
    throw new Error("AUTH_OPERATION_SUPERSEDED");
  }

  await localDatabase.transaction("rw", localDatabase.referenceData, async () => {
    if (!canCommit()) {
      throw new Error("AUTH_OPERATION_SUPERSEDED");
    }
    const existingKeys = await localDatabase.referenceData.toCollection().primaryKeys();
    const obsoleteManagedKeys = existingKeys.filter(
      (key): key is string => typeof key === "string"
        && isManagedReferenceKey(key)
        && !desiredKeys.has(key)
    );
    if (!canCommit()) {
      throw new Error("AUTH_OPERATION_SUPERSEDED");
    }
    await localDatabase.referenceData.bulkDelete(obsoleteManagedKeys);
    if (!canCommit()) {
      throw new Error("AUTH_OPERATION_SUPERSEDED");
    }
    await localDatabase.referenceData.bulkPut(entries);
  });

  return {
    customerCount: customers.length,
    configurationCount: configurations.length,
    jobCount: jobs.length,
    fetchedAt
  };
}

export async function getCachedInspectionCatalog() {
  return (await localDatabase.referenceData.get(catalogKey))?.payload as
    | InspectionCatalog
    | undefined;
}

export async function getCachedReferenceCustomers() {
  return ((await localDatabase.referenceData.get(customersKey))?.payload ?? []) as ReferenceCustomer[];
}

export async function getCachedCustomerConfiguration(customerId: string) {
  return (await localDatabase.referenceData.get(configurationKey(customerId)))?.payload as
    | CustomerConfigurationResponse
    | undefined;
}

export async function getCachedInspectionJobs(userId: number) {
  return ((await localDatabase.referenceData.get(inspectionJobsKey(userId)))?.payload ?? []) as InspectionJob[];
}

export async function getReferenceCacheSummary() {
  const [catalog, customers, entries] = await Promise.all([
    getCachedInspectionCatalog(),
    getCachedReferenceCustomers(),
    localDatabase.referenceData.toArray()
  ]);
  const fetchedAt = entries
    .map((item) => item.fetchedAt)
    .sort()
    .at(-1);
  return {
    catalogAvailable: Boolean(catalog),
    systemCount: catalog?.systems.length ?? 0,
    customerCount: customers.length,
    fetchedAt
  };
}
