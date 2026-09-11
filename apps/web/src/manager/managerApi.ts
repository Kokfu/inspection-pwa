import type { JobCompletion } from "../jobs/jobTypes";

export class ManagerApiError extends Error {
  constructor(
    message: string,
    public readonly kind: "authorization" | "domain" | "unavailable"
  ) {
    super(message);
  }
}

export type ManagerServiceVisit = {
  id: string;
  reference: string;
  customer: string;
  site: string;
  createdAt: string;
  serviceDate: string | null;
  serviceTime: string | null;
  status: "open" | "closed";
  systems: string[];
  inspectionProgress: { accepted: number; required: number };
  completion: JobCompletion;
};

export type ManagerCustomer = {
  customer: { id: string; code: string; displayName: string };
  sites: Array<{ id: string; code: string; displayName: string }>;
  configuration: {
    id: string;
    revision: number;
    enabledSystems: Array<{
      key: string; displayName: string; sortOrder: number;
      systemConfiguration?: Record<string, unknown>;
      evidencePolicyId?: string | null;
      zones: unknown[]; locations: unknown[];
    }>;
  };
  supportedSystems: Array<{ key: string; displayName: string; sortOrder: number; assignable: boolean; unavailableReason?: string }>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function readBody(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 401 || response.status === 403) {
    throw new ManagerApiError("Manager access requires a verified Manager account.", "authorization");
  }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable"); }
  // A response body that is not a JSON object at all (null, an array, a scalar)
  // is treated as an unavailable/unexpected condition, never dereferenced.
  if (!isPlainObject(data)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "Manager request could not be completed.";
    if (response.status === 400 || response.status === 404 || response.status === 409) throw new ManagerApiError(message, "domain");
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  return data;
}

async function readResponse<T>(response: Response, key: string): Promise<T> {
  const data = await readBody(response);
  if (!(key in data)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return data[key] as T;
}

export async function loadManagerServiceVisits(signal?: AbortSignal) {
  let response: Response;
  try { response = await fetch("/api/manager/service-visits", { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Operations cannot be verified or refreshed right now.", "unavailable"); }
  const visits = await readResponse<unknown>(response, "serviceVisits");
  if (!Array.isArray(visits)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return visits as ManagerServiceVisit[];
}

export async function loadManagerServiceVisit(jobId: string, signal?: AbortSignal) {
  let response: Response;
  try { response = await fetch(`/api/manager/service-visits/${encodeURIComponent(jobId)}`, { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Operations cannot be verified or refreshed right now.", "unavailable"); }
  return readResponse<ManagerServiceVisit>(response, "serviceVisit");
}

export type ManagerServiceHistoryFilters = {
  customerId: string;
  siteId?: string;
  status?: "open" | "closed";
  systemKey?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};

/**
 * STEP 3.2 slice C: filtered, keyset-paginated service history for the Manager
 * customer-configuration screen. Reuses Slice A's `GET /manager/service-visits`
 * filters (`customerId`/`siteId`/`status`/`systemKey`/`from`/`to`/`cursor`/`limit`).
 * Absent fields are omitted from the query string entirely — same conditional-inclusion
 * style as `activateManagerCustomerConfiguration`.
 */
export async function loadManagerServiceHistory(
  filters: ManagerServiceHistoryFilters,
  signal?: AbortSignal
): Promise<{ serviceVisits: ManagerServiceVisit[]; nextCursor: string | null; totalCount: number }> {
  const query = new URLSearchParams({
    customerId: filters.customerId,
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.systemKey ? { systemKey: filters.systemKey } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
    ...(filters.limit !== undefined ? { limit: String(filters.limit) } : {})
  });
  let response: Response;
  try { response = await fetch(`/api/manager/service-visits?${query}`, { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Operations cannot be verified or refreshed right now.", "unavailable"); }
  const data = await readBody(response);
  if (!Array.isArray(data.serviceVisits) || !(data.nextCursor === null || typeof data.nextCursor === "string")
    || typeof data.totalCount !== "number") {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  return {
    serviceVisits: data.serviceVisits as ManagerServiceVisit[],
    nextCursor: data.nextCursor as string | null,
    totalCount: data.totalCount
  };
}

/** Systems whose per-customer display labels a Manager may override. Mirrors the
 *  API `labelOverrideSystemKeys` bound (apps/api/src/routes/managerCustomers.ts).
 *  `automatic_sprinkler` joined in slice 1a-iii, once the API resolver gained its
 *  V7 fork. `fire_alarm_detector` is still excluded and waits for a dedicated
 *  slice (see the API comment for why). */
export const labelOverrideSystemKeys: ReadonlySet<string> = new Set([
  "hose_reel", "co2_fire_extinguisher", "wet_chemical", "automatic_sprinkler"
]);

export type ManagerLabelOverrideNode = {
  path: string;
  key: string;
  definitionLabel: string;
  effectiveLabel: string;
  overridden: boolean;
};

export type ManagerLabelOverrides = {
  systemKey: string;
  templateVersion: number;
  labels: ManagerLabelOverrideNode[];
  overrides: Record<string, string>;
};

async function managerRequest<T>(path: string, method: "GET" | "POST" | "PUT", key: string, body?: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: "same-origin", cache: "no-store", signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    });
  } catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  return readResponse<T>(response, key);
}

export async function loadManagerCustomers(signal?: AbortSignal) {
  const customers = await managerRequest<unknown>("/api/manager/customers", "GET", "customers", undefined, signal);
  if (!Array.isArray(customers)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return customers as ManagerCustomer[];
}

export function loadManagerCustomer(customerId: string, signal?: AbortSignal) {
  return managerRequest<ManagerCustomer>(`/api/manager/customers/${encodeURIComponent(customerId)}`, "GET", "customer", undefined, signal);
}

export function createManagerCustomer(input: { displayName: string; siteDisplayName: string; systemKeys: string[] }) {
  return managerRequest<ManagerCustomer>("/api/manager/customers", "POST", "customer", input);
}

export function createManagerCustomerSite(customerId: string, displayName: string) {
  return managerRequest<ManagerCustomer>(`/api/manager/customers/${encodeURIComponent(customerId)}/sites`, "POST", "customer", { displayName });
}

export function activateManagerCustomerConfiguration(
  customerId: string,
  systemKeys: string[],
  systemConfiguration?: Record<string, Record<string, unknown>>,
  evidencePolicy?: Record<string, string | null>
) {
  return managerRequest<ManagerCustomer>(
    `/api/manager/customers/${encodeURIComponent(customerId)}/configuration-revisions`,
    "POST", "customer",
    { systemKeys, ...(systemConfiguration ? { systemConfiguration } : {}), ...(evidencePolicy ? { evidencePolicy } : {}) }
  );
}

/** Systems whose per-customer `system_configuration` a Manager may edit. Mirrors
 *  the API `systemConfigurationSystemKeys` bound
 *  (apps/api/src/inspections/systemConfiguration.ts) — widenable without a
 *  migration. Today: `dry_wet_riser -> { riserMode: "dry" | "wet" }`. */
export const systemConfigurationSystemKeys: ReadonlySet<string> = new Set(["dry_wet_riser"]);

export type ManagerSystemConfigurationField = {
  key: string;
  label: string;
  control: "select";
  required: boolean;
  options: Array<{ value: string; label: string }>;
};

export type ManagerSystemConfigurationSchema = { fields: ManagerSystemConfigurationField[] };

export type ManagerSystemConfiguration = {
  systemKey: string;
  templateVersion: number;
  schema: ManagerSystemConfigurationSchema;
  configuration: Record<string, unknown>;
};

function systemConfigurationPath(customerId: string, systemKey: string) {
  return `/api/manager/customers/${encodeURIComponent(customerId)}/systems/${encodeURIComponent(systemKey)}/system-configuration`;
}

function isSystemConfigurationField(value: unknown): value is ManagerSystemConfigurationField {
  return isPlainObject(value)
    && typeof value.key === "string" && typeof value.label === "string"
    && value.control === "select" && typeof value.required === "boolean"
    && Array.isArray(value.options)
    && value.options.every((option) => isPlainObject(option)
      && typeof option.value === "string" && typeof option.label === "string");
}

/**
 * Fully validate the system-configuration response body AND bind it to the
 * system that was actually requested. A poisoned HTTP 200 that names a different
 * `systemKey`, carries an empty/garbage schema, or stores a value the schema
 * does not permit is an "unavailable" authority failure, never a rendered
 * control or a raw TypeError.
 */
function asSystemConfiguration(expectedSystemKey: string, data: Record<string, unknown>): ManagerSystemConfiguration {
  if (typeof data.systemKey !== "string" || data.systemKey !== expectedSystemKey
    || typeof data.templateVersion !== "number"
    || !isPlainObject(data.schema) || !Array.isArray((data.schema as { fields?: unknown }).fields)
    || (data.schema as { fields: unknown[] }).fields.length === 0
    || !(data.schema as { fields: unknown[] }).fields.every(isSystemConfigurationField)
    || !isPlainObject(data.configuration)) {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  const schema = data.schema as ManagerSystemConfigurationSchema;
  const fieldByKey = new Map(schema.fields.map((field) => [field.key, field]));
  // Every stored value must belong to a declared field and be one of that
  // field's declared option values (an unconfigured system sends `{}`).
  for (const [key, value] of Object.entries(data.configuration)) {
    const field = fieldByKey.get(key);
    if (!field || typeof value !== "string" || !field.options.some((option) => option.value === value)) {
      throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
    }
  }
  return {
    systemKey: data.systemKey,
    templateVersion: data.templateVersion,
    schema,
    configuration: data.configuration as Record<string, unknown>
  };
}

export async function loadManagerSystemConfiguration(customerId: string, systemKey: string, signal?: AbortSignal): Promise<ManagerSystemConfiguration> {
  let response: Response;
  try { response = await fetch(systemConfigurationPath(customerId, systemKey), { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  return asSystemConfiguration(systemKey, await readBody(response));
}

/**
 * PUT the full `system_configuration` object for one system. Server validation
 * (INVALID_SYSTEM_CONFIGURATION) surfaces as `ManagerApiError` "domain" with the
 * server message. The response also carries the refreshed `customer`.
 */
export async function saveManagerSystemConfiguration(
  customerId: string, systemKey: string, configuration: Record<string, unknown>
): Promise<{ configuration: ManagerSystemConfiguration; customer: ManagerCustomer }> {
  let response: Response;
  try {
    response = await fetch(systemConfigurationPath(customerId, systemKey), {
      method: "PUT", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemConfiguration: configuration })
    });
  } catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  const data = await readBody(response);
  if (!isManagerCustomer(data.customer)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return { configuration: asSystemConfiguration(systemKey, data), customer: data.customer };
}

/** Systems whose per-customer `evidence_policy_id` a Manager may assign. Mirrors
 *  the API `evidencePolicyAssignableSystemKeys` bound
 *  (apps/api/src/inspections/evidencePolicyAssignment.ts) — widenable without a
 *  migration. Today: `automatic_sprinkler` only, and the one published policy is
 *  the LEGACY pre-V7 photo/PSI lifecycle — a functional no-op on V7. */
export const evidencePolicyAssignableSystemKeys: ReadonlySet<string> = new Set(["automatic_sprinkler"]);

export type ManagerEvidencePolicyOption = { id: string; code: string; version: number; label: string };

export type ManagerEvidencePolicyField = {
  key: "evidencePolicyId";
  label: string;
  control: "select";
  required: boolean;
};

export type ManagerEvidencePolicy = {
  systemKey: string;
  templateVersion: number;
  field: ManagerEvidencePolicyField;
  policies: ManagerEvidencePolicyOption[];
  evidencePolicyId: string | null;
};

function evidencePolicyPath(customerId: string, systemKey: string) {
  return `/api/manager/customers/${encodeURIComponent(customerId)}/systems/${encodeURIComponent(systemKey)}/evidence-policy`;
}

function isEvidencePolicyOption(value: unknown): value is ManagerEvidencePolicyOption {
  return isPlainObject(value)
    && typeof value.id === "string" && typeof value.code === "string"
    && typeof value.version === "number" && typeof value.label === "string";
}

/**
 * Fully validate the evidence-policy response body AND bind it to the system that
 * was actually requested. A poisoned HTTP 200 that names a different `systemKey`,
 * carries a malformed `field` descriptor, a `policies` element missing
 * `id`/`code`/`version`/`label`, a `policies` list with a duplicate `id` (which
 * would render an ambiguous `<select>` and duplicate React keys), or an
 * `evidencePolicyId` that is neither `null` nor one of the returned policy ids is
 * an "unavailable" authority failure, never a rendered control. Same pattern as
 * `asSystemConfiguration`.
 */
function asEvidencePolicy(expectedSystemKey: string, data: Record<string, unknown>): ManagerEvidencePolicy {
  const field = data.field;
  if (typeof data.systemKey !== "string" || data.systemKey !== expectedSystemKey
    || typeof data.templateVersion !== "number"
    || !isPlainObject(field) || field.key !== "evidencePolicyId"
    || typeof field.label !== "string" || field.control !== "select" || typeof field.required !== "boolean"
    || !Array.isArray(data.policies) || !data.policies.every(isEvidencePolicyOption)
    || !(data.evidencePolicyId === null || typeof data.evidencePolicyId === "string")) {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  const policies = data.policies as ManagerEvidencePolicyOption[];
  const ids = policies.map((policy) => policy.id);
  if (new Set(ids).size !== ids.length) {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  if (data.evidencePolicyId !== null && !ids.includes(data.evidencePolicyId)) {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  return {
    systemKey: data.systemKey,
    templateVersion: data.templateVersion,
    field: { key: "evidencePolicyId", label: field.label, control: "select", required: field.required },
    policies,
    evidencePolicyId: data.evidencePolicyId as string | null
  };
}

export async function loadManagerEvidencePolicy(customerId: string, systemKey: string, signal?: AbortSignal): Promise<ManagerEvidencePolicy> {
  let response: Response;
  try { response = await fetch(evidencePolicyPath(customerId, systemKey), { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  return asEvidencePolicy(systemKey, await readBody(response));
}

/**
 * PUT the `evidence_policy_id` for one system (`null` clears it). Server
 * validation (`INVALID_EVIDENCE_POLICY`) surfaces as `ManagerApiError` "domain"
 * with the server message. The response also carries the refreshed `customer`,
 * still guarded by the hardened `isManagerCustomer`.
 */
export async function saveManagerEvidencePolicy(
  customerId: string, systemKey: string, evidencePolicyId: string | null
): Promise<{ evidencePolicy: ManagerEvidencePolicy; customer: ManagerCustomer }> {
  let response: Response;
  try {
    response = await fetch(evidencePolicyPath(customerId, systemKey), {
      method: "PUT", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidencePolicyId })
    });
  } catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  const data = await readBody(response);
  if (!isManagerCustomer(data.customer)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return { evidencePolicy: asEvidencePolicy(systemKey, data), customer: data.customer };
}

function labelOverridesPath(customerId: string, systemKey: string) {
  return `/api/manager/customers/${encodeURIComponent(customerId)}/systems/${encodeURIComponent(systemKey)}/label-overrides`;
}

function isLabelOverrideNode(value: unknown): value is ManagerLabelOverrideNode {
  return isPlainObject(value)
    && typeof value.path === "string" && typeof value.key === "string"
    && typeof value.definitionLabel === "string" && typeof value.effectiveLabel === "string"
    && typeof value.overridden === "boolean";
}

/** Fully validate the label-override response body; anything malformed is an
 *  "unavailable" authority failure (routed away from the inline domain-error
 *  path), never a raw TypeError during hydration. */
function asLabelOverrides(data: Record<string, unknown>): ManagerLabelOverrides {
  if (typeof data.systemKey !== "string" || typeof data.templateVersion !== "number"
    || !Array.isArray(data.labels) || !data.labels.every(isLabelOverrideNode)
    || !isPlainObject(data.overrides)
    || !Object.values(data.overrides).every((value) => typeof value === "string")) {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  return {
    systemKey: data.systemKey,
    templateVersion: data.templateVersion,
    labels: data.labels as ManagerLabelOverrideNode[],
    overrides: data.overrides as Record<string, string>
  };
}

/**
 * Shape guard for the `customer` echoed by a PUT response. Validates EVERY
 * declared `ManagerCustomer` field and nested element — not just the ones a
 * given screen happens to dereference today — so a poisoned HTTP 200 (a missing
 * `configuration.id`, a string `configuration.revision`, `enabledSystems: [null]`,
 * a `supportedSystems` entry whose `assignable` is absent or non-boolean and
 * could flip a service checkbox's authorization) becomes an "unavailable"
 * authority failure, not a render-time `TypeError` or a silent authority change.
 */
function isManagerCustomer(value: unknown): value is ManagerCustomer {
  if (!isPlainObject(value)
    || !isPlainObject(value.customer)
      || typeof value.customer.id !== "string" || typeof value.customer.code !== "string"
      || typeof value.customer.displayName !== "string"
    || !isPlainObject(value.configuration)
      || typeof value.configuration.id !== "string"
      || typeof value.configuration.revision !== "number"
      || !Array.isArray(value.configuration.enabledSystems)
    || !Array.isArray(value.sites) || !Array.isArray(value.supportedSystems)) {
    return false;
  }
  const enabledEntry = (entry: unknown) => isPlainObject(entry)
    && typeof entry.key === "string" && typeof entry.displayName === "string"
    && typeof entry.sortOrder === "number"
    && Array.isArray(entry.zones) && Array.isArray(entry.locations)
    && (entry.systemConfiguration === undefined || isPlainObject(entry.systemConfiguration))
    && (entry.evidencePolicyId === undefined || entry.evidencePolicyId === null || typeof entry.evidencePolicyId === "string");
  const supportedEntry = (entry: unknown) => isPlainObject(entry)
    && typeof entry.key === "string" && typeof entry.displayName === "string"
    && typeof entry.sortOrder === "number" && typeof entry.assignable === "boolean"
    && (entry.unavailableReason === undefined || typeof entry.unavailableReason === "string");
  const siteEntry = (entry: unknown) => isPlainObject(entry)
    && typeof entry.id === "string" && typeof entry.code === "string" && typeof entry.displayName === "string";
  return value.configuration.enabledSystems.every(enabledEntry)
    && value.sites.every(siteEntry)
    && value.supportedSystems.every(supportedEntry);
}

export async function loadManagerLabelOverrides(customerId: string, systemKey: string, signal?: AbortSignal): Promise<ManagerLabelOverrides> {
  let response: Response;
  try { response = await fetch(labelOverridesPath(customerId, systemKey), { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  return asLabelOverrides(await readBody(response));
}

/**
 * PUT the full override map for one system. A blank / omitted path clears that
 * override. Server validation surfaces as `ManagerApiError` "domain" with the
 * server message (UNKNOWN_LABEL_PATH / INVALID_LABEL_OVERRIDE /
 * LABEL_OVERRIDES_TOO_LARGE). The response also carries the refreshed
 * `customer` for the caller to fold into its list.
 */
export async function saveManagerLabelOverrides(
  customerId: string, systemKey: string, labelOverrides: Record<string, string>
): Promise<{ labels: ManagerLabelOverrides; customer: ManagerCustomer }> {
  let response: Response;
  try {
    response = await fetch(labelOverridesPath(customerId, systemKey), {
      method: "PUT", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labelOverrides })
    });
  } catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  const data = await readBody(response);
  if (!isManagerCustomer(data.customer)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return { labels: asLabelOverrides(data), customer: data.customer };
}

/** Systems whose per-customer zone/location configuration a Manager may edit.
 *  Mirrors the API `locationConfigurableSystemKeys` bound
 *  (apps/api/src/inspections/locationConfiguration.ts) — widenable without a
 *  migration. Defining at least one zone + location for one of these is what
 *  unlocks its "Assigned Services" checkbox. */
export const locationConfigurableSystemKeys: ReadonlySet<string> = new Set([
  "co2_fire_extinguisher", "wet_chemical"
]);

export type ManagerZone = {
  id: string;
  enabledSystemId: string;
  key: string;
  displayName: string;
  sortOrder: number;
};

export type ManagerLocation = {
  id: string;
  enabledSystemId: string;
  zoneId: string;
  key: string;
  displayName: string;
  presetRowCount: number;
  rowPreset: Record<string, unknown>;
  sortOrder: number;
};

export type ManagerLocations = {
  systemKey: string;
  templateVersion: number;
  zones: ManagerZone[];
  locations: ManagerLocation[];
};

/** The submission shape for one PUT — `zoneId` on a location is a submitted
 *  zone's `key` (the persisted UUIDs are minted server-side). */
export type ManagerLocationsDraft = {
  zones: Array<{ key: string; displayName: string; sortOrder: number }>;
  locations: Array<{ key: string; displayName: string; zoneId: string; presetRowCount: number; rowPreset?: Record<string, unknown> }>;
};

function locationsPath(customerId: string, systemKey: string) {
  return `/api/manager/customers/${encodeURIComponent(customerId)}/systems/${encodeURIComponent(systemKey)}/locations`;
}

function isManagerZone(value: unknown): value is ManagerZone {
  return isPlainObject(value)
    && typeof value.id === "string" && typeof value.enabledSystemId === "string"
    && typeof value.key === "string" && typeof value.displayName === "string"
    && typeof value.sortOrder === "number";
}

function isManagerLocationShape(value: unknown): value is Omit<ManagerLocation, "zoneId"> & { zoneId: unknown } {
  return isPlainObject(value)
    && typeof value.id === "string" && typeof value.enabledSystemId === "string"
    && typeof value.key === "string" && typeof value.displayName === "string"
    && typeof value.presetRowCount === "number" && typeof value.sortOrder === "number"
    && isPlainObject(value.rowPreset);
}

/**
 * Fully validate the locations response body AND bind it to the system that was
 * actually requested. A poisoned HTTP 200 that names a different `systemKey`,
 * carries a malformed zone/location row, a `zones` list with a duplicate `id`
 * (ambiguous `<select>` + duplicate React keys), or a location whose `zoneId` is
 * not one of the returned zone ids is an "unavailable" authority failure, never a
 * rendered control. Same pattern as `asEvidencePolicy` / `asSystemConfiguration`.
 */
function asManagerLocations(expectedSystemKey: string, data: Record<string, unknown>): ManagerLocations {
  if (typeof data.systemKey !== "string" || data.systemKey !== expectedSystemKey
    || typeof data.templateVersion !== "number"
    || !Array.isArray(data.zones) || !data.zones.every(isManagerZone)
    || !Array.isArray(data.locations) || !data.locations.every(isManagerLocationShape)) {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  const zones = data.zones as ManagerZone[];
  const zoneIds = zones.map((zone) => zone.id);
  if (new Set(zoneIds).size !== zoneIds.length) {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  const zoneIdSet = new Set(zoneIds);
  const locations = data.locations as Array<Omit<ManagerLocation, "zoneId"> & { zoneId: unknown }>;
  if (!locations.every((location) => typeof location.zoneId === "string" && zoneIdSet.has(location.zoneId))) {
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
  return {
    systemKey: data.systemKey,
    templateVersion: data.templateVersion,
    zones,
    locations: locations as ManagerLocation[]
  };
}

export async function loadManagerLocations(customerId: string, systemKey: string, signal?: AbortSignal): Promise<ManagerLocations> {
  let response: Response;
  try { response = await fetch(locationsPath(customerId, systemKey), { credentials: "same-origin", cache: "no-store", signal }); }
  catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  return asManagerLocations(systemKey, await readBody(response));
}

/**
 * PUT the full zone/location set for one system. Server validation
 * (`INVALID_LOCATION_CONFIGURATION`) surfaces as `ManagerApiError` "domain" with
 * the server message. The response also carries the refreshed `customer`, still
 * guarded by the hardened `isManagerCustomer`.
 */
export async function saveManagerLocations(
  customerId: string, systemKey: string, draft: ManagerLocationsDraft
): Promise<{ locations: ManagerLocations; customer: ManagerCustomer }> {
  let response: Response;
  try {
    response = await fetch(locationsPath(customerId, systemKey), {
      method: "PUT", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zones: draft.zones, locations: draft.locations })
    });
  } catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  const data = await readBody(response);
  if (!isManagerCustomer(data.customer)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return { locations: asManagerLocations(systemKey, data), customer: data.customer };
}
