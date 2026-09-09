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
    enabledSystems: Array<{ key: string; displayName: string; sortOrder: number; zones: unknown[]; locations: unknown[] }>;
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

export function activateManagerCustomerConfiguration(customerId: string, systemKeys: string[]) {
  return managerRequest<ManagerCustomer>(`/api/manager/customers/${encodeURIComponent(customerId)}/configuration-revisions`, "POST", "customer", { systemKeys });
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
 * Shape guard for the `customer` echoed by the PUT response. Validates every
 * field the Manager UI actually dereferences — `configuration.enabledSystems[].key`
 * / `.displayName`, `sites[].displayName`, `supportedSystems[].key` / `.displayName`
 * — so a poisoned HTTP 200 (e.g. `enabledSystems: [null]`) becomes an
 * "unavailable" authority failure, not a render-time `TypeError`.
 */
function isManagerCustomer(value: unknown): value is ManagerCustomer {
  if (!isPlainObject(value)
    || !isPlainObject(value.customer) || typeof value.customer.id !== "string"
      || typeof value.customer.displayName !== "string"
    || !isPlainObject(value.configuration)
      || typeof value.configuration.revision !== "number"
      || !Array.isArray(value.configuration.enabledSystems)
    || !Array.isArray(value.sites) || !Array.isArray(value.supportedSystems)) {
    return false;
  }
  const namedEntry = (entry: unknown) => isPlainObject(entry)
    && typeof entry.key === "string" && typeof entry.displayName === "string";
  return value.configuration.enabledSystems.every(namedEntry)
    && value.sites.every((site) => isPlainObject(site) && typeof site.displayName === "string")
    && value.supportedSystems.every(namedEntry);
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
