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
  /** Creating technician; null for legacy visits with no recorded creator. */
  technician?: { id: number; displayName: string } | null;
  systems: string[];
  inspectionProgress: { accepted: number; required: number };
  completion: JobCompletion;
  /** Set once an archived (closed) service visit has been archived; null otherwise.
   *  Field name assumed to match the API's `inspection_jobs.archived_at` column
   *  (migration `036_inspection_job_archive.sql`) — adjust if the API agent used
   *  a different field name. */
  archivedAt: string | null;
};

export type ManagerCustomer = {
  customer: { id: string; code: string; displayName: string; nextServiceDueDate?: string | null; contactPhone?: string | null; contactPerson?: string | null; fax?: string | null; contractNumber?: string | null; serviceFrequency?: string | null };
  sites: Array<{ id: string; code: string; displayName: string; address?: string | null }>;
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

/**
 * What the review screens (Services Done, service history) read from a customer. A supervisor's
 * customer list contains only these fields (T4), so those screens must not depend on more.
 */
export type ManagerCustomerSummary = {
  customer: Pick<ManagerCustomer["customer"], "id" | "code" | "displayName">;
  sites: ManagerCustomer["sites"];
  supportedSystems: Array<Pick<ManagerCustomer["supportedSystems"][number], "key" | "displayName" | "sortOrder">>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A field account on the Technician List: a technician (`inspector`) or, since T4, a supervisor. */
export type ManagerTechnician = { id: number; username: string; displayName: string | null; role: "inspector" | "supervisor"; isActive: boolean; createdAt: string };
export type ScheduledCustomer = { id: string; code: string; displayName: string; nextServiceDueDate: string | null };
export type UpcomingServices = { customers: ScheduledCustomer[]; unscheduledCustomers: ScheduledCustomer[] };

function unavailable(): never { throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable"); }
function isTechnician(value: unknown): value is ManagerTechnician {
  return isPlainObject(value) && Number.isSafeInteger(value.id) && Number(value.id) > 0
    && typeof value.username === "string" && (value.displayName === null || (typeof value.displayName === "string" && !!value.displayName.trim()))
    && (value.role === "inspector" || value.role === "supervisor") && typeof value.isActive === "boolean"
    && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt));
}
function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000")
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function isScheduledCustomer(value: unknown): value is ScheduledCustomer {
  return isPlainObject(value) && typeof value.id === "string" && typeof value.code === "string"
    && typeof value.displayName === "string" && (value.nextServiceDueDate === null || isDate(value.nextServiceDueDate));
}
export async function loadManagerTechnicians(signal?: AbortSignal): Promise<ManagerTechnician[]> {
  const result = await managerRequest<unknown>("/api/manager/technicians", "GET", "technicians", undefined, signal);
  if (!Array.isArray(result) || !result.every(isTechnician) || new Set(result.map((row) => row.id)).size !== result.length) unavailable();
  return result;
}
export async function createManagerTechnician(input: { username: string; password: string; displayName?: string | null; role?: "inspector" | "supervisor" }): Promise<ManagerTechnician> {
  const result = await managerRequest<unknown>("/api/manager/technicians", "POST", "technician", input);
  if (!isTechnician(result) || result.username !== input.username.trim() || !result.isActive || result.role !== (input.role ?? "inspector")) unavailable();
  return result;
}
export async function updateManagerTechnicianDisplayName(id: number, displayName: string | null): Promise<ManagerTechnician> {
  const result = await managerRequest<unknown>(`/api/manager/technicians/${id}/display-name`, "PUT", "technician", { displayName });
  const expectedName = displayName === null ? null : displayName.trim();
  if (!isTechnician(result) || result.id !== id || result.displayName !== expectedName) unavailable();
  return result;
}
export async function deactivateManagerTechnician(id: number): Promise<ManagerTechnician> {
  const result = await managerRequest<unknown>(`/api/manager/technicians/${id}/deactivate`, "POST", "technician");
  if (!isTechnician(result) || result.id !== id || result.isActive) unavailable();
  return result;
}
export async function saveCustomerNextServiceDueDate(id: string, nextServiceDueDate: string | null): Promise<ManagerCustomer> {
  const result = await managerRequest<unknown>(`/api/manager/customers/${encodeURIComponent(id)}/next-service-due-date`, "PUT", "customer", { nextServiceDueDate });
  if (!isManagerCustomer(result) || result.customer.id !== id || result.customer.nextServiceDueDate !== nextServiceDueDate) unavailable();
  return result;
}
export async function saveCustomerContactDetails(
  id: string, contactPhone: string | null, contactPerson: string | null, fax: string | null,
  contractNumber: string | null, serviceFrequency: string | null
): Promise<ManagerCustomer> {
  const result = await managerRequest<unknown>(`/api/manager/customers/${encodeURIComponent(id)}/contact-details`, "PUT", "customer", { contactPhone, contactPerson, fax, contractNumber, serviceFrequency });
  if (!isManagerCustomer(result) || result.customer.id !== id
    || (result.customer.contactPhone ?? null) !== contactPhone
    || (result.customer.contactPerson ?? null) !== contactPerson
    || (result.customer.fax ?? null) !== fax
    || (result.customer.contractNumber ?? null) !== contractNumber
    || (result.customer.serviceFrequency ?? null) !== serviceFrequency) unavailable();
  return result;
}

export async function saveCustomerSiteAddress(customerId: string, siteId: string, address: string | null): Promise<ManagerCustomer> {
  const result = await managerRequest<unknown>(`/api/manager/customers/${encodeURIComponent(customerId)}/sites/${encodeURIComponent(siteId)}/address`, "PUT", "customer", { address });
  if (!isManagerCustomer(result) || result.customer.id !== customerId
    || (result.sites.find((site) => site.id === siteId)?.address ?? null) !== address) unavailable();
  return result;
}
export async function loadUpcomingServices(signal?: AbortSignal): Promise<UpcomingServices> {
  const result = await managerRequest<Record<string, unknown>>("/api/manager/customers/upcoming-service", "GET", null, undefined, signal);
  const { customers, unscheduledCustomers } = result;
  if (!Array.isArray(customers) || !Array.isArray(unscheduledCustomers)
    || !customers.every((row) => isScheduledCustomer(row) && row.nextServiceDueDate !== null)
    || !unscheduledCustomers.every((row) => isScheduledCustomer(row) && row.nextServiceDueDate === null)) unavailable();
  const ids = [...customers, ...unscheduledCustomers].map((row: ScheduledCustomer) => row.id);
  if (new Set(ids).size !== ids.length) unavailable();
  return { customers, unscheduledCustomers };
}

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
    if (response.status === 400 || response.status === 404 || response.status === 409 || response.status === 422) throw new ManagerApiError(message, "domain");
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

export async function archiveManagerServiceVisit(jobId: string): Promise<void> {
  let response: Response;
  try { response = await fetch(`/api/manager/service-visits/${encodeURIComponent(jobId)}/archive`, { method: "PUT", credentials: "same-origin", cache: "no-store" }); }
  catch { throw new ManagerApiError("Manager Operations cannot be verified or refreshed right now.", "unavailable"); }
  await readBody(response);
}

export async function restoreManagerServiceVisit(jobId: string): Promise<void> {
  let response: Response;
  try { response = await fetch(`/api/manager/service-visits/${encodeURIComponent(jobId)}/restore`, { method: "PUT", credentials: "same-origin", cache: "no-store" }); }
  catch { throw new ManagerApiError("Manager Operations cannot be verified or refreshed right now.", "unavailable"); }
  await readBody(response);
}

export type ManagerServiceHistoryFilters = {
  customerId?: string;
  siteId?: string;
  technicianId?: number;
  status?: "open" | "closed";
  systemKey?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
  /** When true, includes archived (closed) service visits in the result. Omitted
   *  entirely from the query string when false/absent, matching every other
   *  filter's conditional-inclusion style below. */
  includeArchived?: boolean;
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
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.technicianId !== undefined ? { technicianId: String(filters.technicianId) } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.systemKey ? { systemKey: filters.systemKey } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
    ...(filters.limit !== undefined ? { limit: String(filters.limit) } : {}),
    ...(filters.includeArchived ? { includeArchived: "true" } : {})
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

export async function loadDashboardClients(signal?: AbortSignal): Promise<number> {
  const data = await managerRequest<Record<string, unknown>>("/api/manager/dashboard/clients", "GET", null, undefined, signal);
  if (!Number.isSafeInteger(data.totalClients) || (data.totalClients as number) < 0) unavailable();
  return data.totalClients as number;
}

export async function loadDashboardTrend(from: string, to: string, signal?: AbortSignal): Promise<Array<{ day: string; count: number }>> {
  const query = new URLSearchParams({ from, to });
  const data = await managerRequest<Record<string, unknown>>(`/api/manager/dashboard/inspections-per-day?${query}`, "GET", null, undefined, signal);
  if (!Array.isArray(data.days) || !data.days.every((row: unknown) => isPlainObject(row)
    && typeof row.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.day)
    && Number.isFinite(Date.parse(`${row.day}T00:00:00Z`))
    && new Date(`${row.day}T00:00:00Z`).toISOString().slice(0, 10) === row.day
    && row.day >= from && row.day <= to
    && Number.isSafeInteger(row.count) && (row.count as number) >= 0)) unavailable();
  const days = data.days as Array<{ day: string; count: number }>;
  if (new Set(days.map((row) => row.day)).size !== days.length) unavailable();
  return days;
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

/** Read-only display metadata the label-overrides GET appends (`formLayout`) so the
 *  Manager can lay the fields out like the technician form. Never sent back. */
export type ManagerLabelFormControl = "checklist_item" | "measurement" | "measurement_value" | "text" | "result_column";

export type ManagerLabelFormField = {
  path: string;
  control: ManagerLabelFormControl;
  parentPath: string | null;
  result: { type: "single_select" | "multi_select"; options: Array<{ value: string; label: string }> } | null;
  unit: string | null;
  remarks: boolean;
};

export type ManagerLabelFormSection = {
  key: string;
  heading: string;
  repeatable: { rowHeading: string } | null;
  fields: ManagerLabelFormField[];
};

export type ManagerLabelFormLayout = { sections: ManagerLabelFormSection[] };

export type ManagerLabelOverrides = {
  systemKey: string;
  templateVersion: number;
  labels: ManagerLabelOverrideNode[];
  overrides: Record<string, string>;
  /** Present on the GET only (the PUT response is unchanged). */
  formLayout?: ManagerLabelFormLayout;
};

async function managerRequest<T>(path: string, method: "GET" | "POST" | "PUT", key: string | null, body?: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: "same-origin", cache: "no-store", signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    });
  } catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  return key === null ? await readBody(response) as T : readResponse<T>(response, key);
}

export async function loadManagerCustomers(signal?: AbortSignal) {
  const customers = await managerRequest<unknown>("/api/manager/customers", "GET", "customers", undefined, signal);
  if (!Array.isArray(customers)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return customers as ManagerCustomer[];
}

export function loadManagerCustomer(customerId: string, signal?: AbortSignal) {
  return managerRequest<ManagerCustomer>(`/api/manager/customers/${encodeURIComponent(customerId)}`, "GET", "customer", undefined, signal);
}

/** `GET /manager/customers/archived` — same `ManagerCustomer` shape/validator as
 *  the active customer list, but `is_active = false`. */
export async function loadArchivedManagerCustomers(signal?: AbortSignal) {
  const customers = await managerRequest<unknown>("/api/manager/customers/archived", "GET", "customers", undefined, signal);
  if (!Array.isArray(customers)) throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  return customers as ManagerCustomer[];
}

export async function archiveManagerCustomer(customerId: string): Promise<void> {
  let response: Response;
  try { response = await fetch(`/api/manager/customers/${encodeURIComponent(customerId)}/archive`, { method: "PUT", credentials: "same-origin", cache: "no-store" }); }
  catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  await readBody(response);
}

export async function restoreManagerCustomer(customerId: string): Promise<void> {
  let response: Response;
  try { response = await fetch(`/api/manager/customers/${encodeURIComponent(customerId)}/restore`, { method: "PUT", credentials: "same-origin", cache: "no-store" }); }
  catch { throw new ManagerApiError("Manager Customer Configuration cannot be verified or refreshed right now.", "unavailable"); }
  await readBody(response);
}

export function createManagerCustomer(input: {
  displayName: string; siteDisplayName: string; systemKeys: string[];
  contactPhone?: string; contactPerson?: string; fax?: string; contractNumber?: string;
  serviceFrequency?: string; siteAddress?: string;
}) {
  return managerRequest<ManagerCustomer>("/api/manager/customers", "POST", "customer", input);
}

/**
 * Service catalog entry as returned by `GET /manager/service-catalog`. Used by
 * `ManagerAddCustomer` (a new, not-yet-existing customer — every non-retired
 * system is always assignable, mirroring the `!existing` branch of the server's
 * `presentSupportedSystems()`) and by `ManagerServiceCatalog` (the retirement
 * admin page, `includeRetired: true`) to show every system with its retirement
 * state.
 */
export type ManagerServiceCatalogEntry = {
  key: string; displayName: string; sortOrder: number; assignable: boolean;
  retiredAt: string | null;
};

function isManagerServiceCatalogEntry(value: unknown, includeRetired: boolean): value is ManagerServiceCatalogEntry {
  if (!isPlainObject(value)) return false;
  const retiredAt = value.retiredAt;
  const validRetiredAt = typeof retiredAt === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(retiredAt)
    && Number.isFinite(Date.parse(retiredAt))
    && new Date(retiredAt).toISOString() === retiredAt;
  return typeof value.key === "string" && typeof value.displayName === "string"
    && typeof value.sortOrder === "number" && typeof value.assignable === "boolean"
    && (retiredAt === null || validRetiredAt)
    && (retiredAt === null ? value.assignable === true : value.assignable === false)
    && (includeRetired || retiredAt === null);
}

/**
 * `GET /manager/service-catalog`. Response envelope `{ systems: [...] }`,
 * mirroring the other list loaders in this file (`{ technicians: [...] }`,
 * `{ customers: [...] }`). By default, excludes retired systems and returns
 * `assignable: true` for every row (the correct default for a brand-new
 * customer with no existing configuration — see `ManagerAddCustomer.tsx`).
 * With `includeRetired: true`, every system is returned with its real
 * `retiredAt`/`assignable` state, used by `ManagerServiceCatalog.tsx` to show
 * and restore already-retired entries.
 */
export async function loadManagerServiceCatalog(options?: { includeRetired?: boolean }, signal?: AbortSignal): Promise<ManagerServiceCatalogEntry[]> {
  const query = options?.includeRetired ? "?includeRetired=true" : "";
  const result = await managerRequest<unknown>(`/api/manager/service-catalog${query}`, "GET", "systems", undefined, signal);
  if (!Array.isArray(result) || !result.every((entry) => isManagerServiceCatalogEntry(entry, !!options?.includeRetired))
    || new Set(result.map((row) => row.key)).size !== result.length) unavailable();
  return result;
}

export type ManagerServiceCatalogRetirement = { key: string; displayName: string; sortOrder: number; retiredAt: string | null };

function isManagerServiceCatalogRetirement(value: unknown): value is ManagerServiceCatalogRetirement {
  return isPlainObject(value) && typeof value.key === "string" && typeof value.displayName === "string"
    && typeof value.sortOrder === "number" && (value.retiredAt === null || typeof value.retiredAt === "string");
}

/** PUT .../retire — server responds `{ system: { key, displayName, sortOrder, retiredAt } }`. */
export async function retireManagerServiceCatalogEntry(systemKey: string): Promise<ManagerServiceCatalogRetirement> {
  const result = await managerRequest<unknown>(`/api/manager/service-catalog/${encodeURIComponent(systemKey)}/retire`, "PUT", "system");
  if (!isManagerServiceCatalogRetirement(result) || result.key !== systemKey || result.retiredAt === null) unavailable();
  return result;
}

/** PUT .../restore — server responds `{ system: { key, displayName, sortOrder, retiredAt } }`. */
export async function restoreManagerServiceCatalogEntry(systemKey: string): Promise<ManagerServiceCatalogRetirement> {
  const result = await managerRequest<unknown>(`/api/manager/service-catalog/${encodeURIComponent(systemKey)}/restore`, "PUT", "system");
  if (!isManagerServiceCatalogRetirement(result) || result.key !== systemKey || result.retiredAt !== null) unavailable();
  return result;
}

export function createManagerCustomerSite(customerId: string, displayName: string, address?: string) {
  return managerRequest<ManagerCustomer>(`/api/manager/customers/${encodeURIComponent(customerId)}/sites`, "POST", "customer", { displayName, ...(address?.trim() ? { address: address.trim() } : {}) });
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

const labelFormControls: ReadonlySet<string> = new Set(["checklist_item", "measurement", "measurement_value", "text", "result_column"]);

function isLabelFormField(value: unknown): value is ManagerLabelFormField {
  if (!isPlainObject(value) || typeof value.path !== "string" || typeof value.control !== "string"
    || !labelFormControls.has(value.control)
    || !(value.parentPath === null || typeof value.parentPath === "string")
    || !(value.unit === null || typeof value.unit === "string")
    || typeof value.remarks !== "boolean") return false;
  const result = value.result;
  if (result === null) return true;
  return isPlainObject(result) && (result.type === "single_select" || result.type === "multi_select")
    && Array.isArray(result.options)
    && result.options.every((option) => isPlainObject(option) && typeof option.value === "string" && typeof option.label === "string");
}

/**
 * Validate the optional GET `formLayout` against the label tree it arrived with:
 * well-formed sections, every label path placed exactly once, no path the tree
 * does not expose, and every `parentPath` pointing at a placed measurement row.
 * A poisoned layout is an "unavailable" authority failure — the replica is never
 * rendered from a layout that disagrees with the label tree.
 */
function asLabelFormLayout(value: unknown, labels: ManagerLabelOverrideNode[]): ManagerLabelFormLayout {
  const fail = (): never => { throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable"); };
  if (!isPlainObject(value) || !Array.isArray(value.sections)) fail();
  const sections = (value as { sections: unknown[] }).sections;
  const sectionKeys = new Set<string>();
  const placed = new Map<string, ManagerLabelFormField>();
  for (const section of sections) {
    if (!isPlainObject(section) || typeof section.key !== "string" || typeof section.heading !== "string"
      || !(section.repeatable === null || (isPlainObject(section.repeatable) && typeof section.repeatable.rowHeading === "string"))
      || !Array.isArray(section.fields) || !section.fields.every(isLabelFormField)
      || sectionKeys.has(section.key)) fail();
    sectionKeys.add((section as { key: string }).key);
    for (const field of (section as { fields: ManagerLabelFormField[] }).fields) {
      if (placed.has(field.path)) fail();
      placed.set(field.path, field);
    }
  }
  const labelPaths = new Set(labels.map((node) => node.path));
  if (placed.size !== labelPaths.size || [...placed.keys()].some((path) => !labelPaths.has(path))) fail();
  for (const field of placed.values()) {
    if (field.parentPath === null) continue;
    // The parent must be a top-level measurement row: no self-parenting and no cycles,
    // which would otherwise hide fields from the editor without failing validation.
    const parent = placed.get(field.parentPath);
    if (field.parentPath === field.path || parent?.control !== "measurement" || parent.parentPath !== null) fail();
  }
  return value as ManagerLabelFormLayout;
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
  const labels = data.labels as ManagerLabelOverrideNode[];
  return {
    systemKey: data.systemKey,
    templateVersion: data.templateVersion,
    labels,
    overrides: data.overrides as Record<string, string>,
    ...(data.formLayout === undefined ? {} : { formLayout: asLabelFormLayout(data.formLayout, labels) })
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
      || (value.customer.contactPhone !== undefined && value.customer.contactPhone !== null && typeof value.customer.contactPhone !== "string")
      || (value.customer.contactPerson !== undefined && value.customer.contactPerson !== null && typeof value.customer.contactPerson !== "string")
      || (value.customer.fax !== undefined && value.customer.fax !== null && typeof value.customer.fax !== "string")
      || (value.customer.contractNumber !== undefined && value.customer.contractNumber !== null && typeof value.customer.contractNumber !== "string")
      || (value.customer.serviceFrequency !== undefined && value.customer.serviceFrequency !== null && !["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"].includes(String(value.customer.serviceFrequency)))
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
    && typeof entry.id === "string" && typeof entry.code === "string" && typeof entry.displayName === "string"
    && (entry.address === undefined || entry.address === null || typeof entry.address === "string");
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
 *  migration. These services use a General location in new visits when the
 *  manager has not configured a location. */
export const locationConfigurableSystemKeys: ReadonlySet<string> = new Set([
  "co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression"
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

/* ------------------------------------------------------------------------------------------------
 * T5 corrections. An Accepted record is immutable: a correction is an append-only entry that carries
 * the field, the value it replaced, the new value, who made it, when and why. The screens show the
 * effective value and always keep the original visible.
 * ---------------------------------------------------------------------------------------------- */

export type CorrectionKind = "result" | "text" | "reading";
export type CorrectionValue = string | number | null;
export type ManagerCorrection = {
  id: string; fieldPath: string; sequence: number; previousValue: CorrectionValue; newValue: CorrectionValue;
  reason: string; correctedBy: string; correctedByRole: "admin" | "supervisor"; correctedAt: string; requestId: string;
};
export type ManagerCorrectableField = {
  fieldPath: string; label: string; kind: CorrectionKind; value: CorrectionValue; originalValue: CorrectionValue;
  corrected: boolean; options?: string[];
};
export type ManagerInspectionCorrections = {
  clientUuid: string; jobId: string; jobReference: string; systemKey: string; instanceKey: string;
  supported: boolean; fields: ManagerCorrectableField[]; corrections: ManagerCorrection[];
};
export type ManagerAcceptedRecord = {
  clientUuid: string; systemKey: string; systemLabel: string; instanceKey: string;
  zoneLabel: string | null; locationLabel: string | null; performedAt: string; correctionCount: number; supported: boolean;
};
export type ManagerVisitCorrection = ManagerCorrection & { clientUuid: string; systemKey: string; instanceKey: string; label: string };

const isCorrectionValue = (value: unknown): value is CorrectionValue =>
  value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));

function isCorrection(value: unknown): value is ManagerCorrection {
  return isPlainObject(value) && typeof value.id === "string" && typeof value.fieldPath === "string"
    && Number.isSafeInteger(value.sequence) && Number(value.sequence) >= 1
    && isCorrectionValue(value.previousValue) && isCorrectionValue(value.newValue)
    && typeof value.reason === "string" && typeof value.correctedBy === "string"
    && (value.correctedByRole === "admin" || value.correctedByRole === "supervisor")
    && typeof value.correctedAt === "string" && Number.isFinite(Date.parse(value.correctedAt))
    && typeof value.requestId === "string";
}

function isCorrectableField(value: unknown): value is ManagerCorrectableField {
  return isPlainObject(value) && typeof value.fieldPath === "string" && typeof value.label === "string"
    && (value.kind === "result" || value.kind === "text" || value.kind === "reading")
    && isCorrectionValue(value.value) && isCorrectionValue(value.originalValue) && typeof value.corrected === "boolean"
    && (value.options === undefined || (Array.isArray(value.options) && value.options.every((option) => typeof option === "string")));
}

/** The correction editor's view of one accepted record: correctable fields and the full history. */
export async function loadInspectionCorrections(clientUuid: string, signal?: AbortSignal): Promise<ManagerInspectionCorrections> {
  const data = await managerRequest<unknown>(`/api/manager/inspections/${encodeURIComponent(clientUuid)}/corrections`, "GET", null, undefined, signal) as Record<string, unknown>;
  if (!isPlainObject(data) || typeof data.clientUuid !== "string" || typeof data.jobId !== "string" || typeof data.jobReference !== "string"
    || typeof data.systemKey !== "string" || typeof data.instanceKey !== "string" || typeof data.supported !== "boolean"
    || !Array.isArray(data.fields) || !data.fields.every(isCorrectableField)
    || !Array.isArray(data.corrections) || !data.corrections.every(isCorrection)) unavailable();
  return data as unknown as ManagerInspectionCorrections;
}

/** Submits one or more field corrections with a shared reason. The accepted record is never changed. */
export async function saveInspectionCorrections(
  clientUuid: string,
  input: { requestId: string; reason: string; changes: Array<{ fieldPath: string; expectedCurrentValue: CorrectionValue; newValue: CorrectionValue }> }
): Promise<ManagerCorrection[]> {
  const corrections = await managerRequest<unknown>(`/api/manager/inspections/${encodeURIComponent(clientUuid)}/corrections`, "POST", "corrections", input);
  if (!Array.isArray(corrections) || !corrections.every(isCorrection)) unavailable();
  return corrections;
}

export async function loadAcceptedRecords(jobId: string, signal?: AbortSignal): Promise<ManagerAcceptedRecord[]> {
  const records = await managerRequest<unknown>(`/api/manager/service-visits/${encodeURIComponent(jobId)}/accepted-records`, "GET", "records", undefined, signal);
  if (!Array.isArray(records) || !records.every((record) => isPlainObject(record) && typeof record.clientUuid === "string"
    && typeof record.systemKey === "string" && typeof record.systemLabel === "string" && typeof record.instanceKey === "string"
    && (record.zoneLabel === null || typeof record.zoneLabel === "string") && (record.locationLabel === null || typeof record.locationLabel === "string")
    && typeof record.performedAt === "string" && Number.isSafeInteger(record.correctionCount) && typeof record.supported === "boolean")) unavailable();
  return records as ManagerAcceptedRecord[];
}

export async function loadVisitCorrections(jobId: string, signal?: AbortSignal): Promise<ManagerVisitCorrection[]> {
  const corrections = await managerRequest<unknown>(`/api/manager/service-visits/${encodeURIComponent(jobId)}/corrections`, "GET", "corrections", undefined, signal);
  if (!Array.isArray(corrections) || !corrections.every((correction) => isCorrection(correction)
    && typeof (correction as unknown as ManagerVisitCorrection).clientUuid === "string"
    && typeof (correction as unknown as ManagerVisitCorrection).label === "string")) unavailable();
  return corrections as ManagerVisitCorrection[];
}
