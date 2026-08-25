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

async function readResponse<T>(response: Response, key: string): Promise<T> {
  if (response.status === 401 || response.status === 403) {
    throw new ManagerApiError("Manager access requires a verified Manager account.", "authorization");
  }
  let data: Record<string, unknown>;
  try { data = await response.json() as Record<string, unknown>; }
  catch { throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable"); }
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "Manager request could not be completed.";
    if (response.status === 400 || response.status === 404 || response.status === 409) throw new ManagerApiError(message, "domain");
    throw new ManagerApiError("Manager server data is currently unavailable.", "unavailable");
  }
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

async function managerRequest<T>(path: string, method: "GET" | "POST", key: string, body?: unknown, signal?: AbortSignal) {
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
