import { isLocationProposal, parseLocationProposalList, type LocationProposal, type LocationProposalList } from "../manager/managerApi";
import type {
  CustomerConfigurationResponse,
  InspectionCatalog,
  ReferenceCustomer,
  ReferenceSite,
} from "./referenceDataTypes";
import { parseInspectionCatalog } from "./referenceDataTypes";
import { localDatabase } from "../db/localDatabase";
import { proposalAlreadyPendingMessage } from "./proposalMessages";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign in with an authorized account to refresh reference data");
  }
  if (!response.ok) {
    throw new Error("Reference data is currently unavailable");
  }
  return response.json() as Promise<T>;
}

/** The JSON body of a reply, or an empty object when it is missing or not JSON (a gateway page, for example). */
async function readJsonBody<T extends object>(response: Response): Promise<Partial<T>> {
  try {
    const value: unknown = await response.json();
    return value !== null && typeof value === "object" ? value as Partial<T> : {};
  } catch {
    return {};
  }
}

/**
 * I-44: what a 401/403 on a queued write means to the technician. The server WAS reached, so "Connect to the server"
 * (which is for a real network failure) would send them looking for the wrong problem: a 401 means the session has
 * ended, a 403 means the server said no.
 */
function authRefusalMessage(status: number, body: { message?: unknown }, subject: string, signInTo: string): string {
  if (status === 401) return `Sign in again to ${signInTo}.`;
  const reason = typeof body.message === "string" && body.message.trim() ? ` ${body.message.trim()}` : "";
  return `The server refused this ${subject} (HTTP ${status}).${reason} Tell your Admin if this keeps happening.`;
}

export async function loadInspectionCatalog(): Promise<InspectionCatalog> {
  const catalog = parseInspectionCatalog(await getJson<unknown>("/api/inspection-catalog"));
  if (!catalog) throw new Error("Inspection catalog response is invalid");
  return catalog;
}

export async function loadReferenceCustomers() {
  const data = await getJson<{ customers: ReferenceCustomer[] }>("/api/customers");
  return Array.isArray(data.customers) ? data.customers : [];
}

export type ServiceFormatOption = { key: string; displayName: string; sortOrder: number };
const serviceFormatsCacheKey = "technician:service-format-options";

function parseServiceFormats(value: unknown): ServiceFormatOption[] {
  if (!Array.isArray(value) || !value.every((item) => item && typeof item === "object"
    && typeof item.key === "string" && typeof item.displayName === "string"
    && Number.isSafeInteger(item.sortOrder)) || new Set(value.map((item) => item.key)).size !== value.length)
    throw new Error("Service formats are invalid.");
  return value;
}

export async function cachedServiceFormatOptions(): Promise<ServiceFormatOption[]> {
  const entry = await localDatabase.referenceData.get(serviceFormatsCacheKey);
  return entry ? parseServiceFormats(entry.payload) : [];
}

export async function loadServiceFormatOptions(canCommit: () => boolean = () => true): Promise<ServiceFormatOption[]> {
  const database = localDatabase;
  const data = await getJson<{ systems: ServiceFormatOption[] }>("/api/customers/service-format-options");
  const systems = parseServiceFormats(data.systems);
  if (!canCommit() || database !== localDatabase) throw new Error("Service format refresh was superseded.");
  const at = new Date().toISOString();
  await database.referenceData.put({ key: serviceFormatsCacheKey, payload: systems, version: "1", fetchedAt: at, expiresAt: at });
  return systems;
}

export type TechnicianScheduledCustomer = { id: string; code: string; displayName: string; nextServiceDueDate: string | null };
export type TechnicianUpcomingServicesData = { customers: TechnicianScheduledCustomer[]; unscheduledCustomers: TechnicianScheduledCustomer[] };

export async function loadTechnicianUpcomingServices(signal?: AbortSignal): Promise<TechnicianUpcomingServicesData> {
  const response = await fetch("/api/customers/upcoming-service", { credentials: "same-origin", cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) throw new Error("Sign in to view upcoming services.");
  if (!response.ok) throw new Error("Upcoming services are currently unavailable.");
  const data: unknown = await response.json();
  const isDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !value.startsWith("0000") && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const isRow = (value: unknown): value is TechnicianScheduledCustomer => typeof value === "object" && value !== null
    && !Array.isArray(value) && typeof (value as TechnicianScheduledCustomer).id === "string"
    && typeof (value as TechnicianScheduledCustomer).code === "string"
    && typeof (value as TechnicianScheduledCustomer).displayName === "string"
    && ((value as TechnicianScheduledCustomer).nextServiceDueDate === null || isDate((value as TechnicianScheduledCustomer).nextServiceDueDate));
  if (typeof data !== "object" || data === null || !Array.isArray((data as TechnicianUpcomingServicesData).customers)
    || !Array.isArray((data as TechnicianUpcomingServicesData).unscheduledCustomers)) throw new Error("Upcoming services response is invalid.");
  const { customers, unscheduledCustomers } = data as TechnicianUpcomingServicesData;
  if (!customers.every((row) => isRow(row) && row.nextServiceDueDate !== null)
    || !unscheduledCustomers.every((row) => isRow(row) && row.nextServiceDueDate === null)
    || new Set([...customers, ...unscheduledCustomers].map((row) => row.id)).size !== customers.length + unscheduledCustomers.length)
    throw new Error("Upcoming services response is invalid.");
  return { customers, unscheduledCustomers };
}

export async function createTechnicianCustomer(input: {
  requestId: string;
  displayName: string;
  siteDisplayName: string;
  systemKeys: string[];
  contactPhone?: string;
  contactPerson?: string;
  fax?: string;
  contractNumber?: string;
  serviceFrequency?: string;
  siteAddress?: string;
}, expectedUserId?: number): Promise<ReferenceCustomer> {
  const response = await fetch("/api/customers", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(expectedUserId ? { "X-Expected-User-Id": String(expectedUserId) } : {}) }, body: JSON.stringify(input)
  });
  const data = await readJsonBody<{ customer: { customer?: ReferenceCustomer }; message: string }>(response);
  if (response.status === 401 || response.status === 403) {
    throw new Error(authRefusalMessage(response.status, data, "new customer", "add this customer"));
  }
  if (!response.ok || !data.customer?.customer
    || typeof data.customer.customer.id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.customer.customer.id)
    || data.customer.customer.displayName !== input.displayName.trim()) {
    throw new Error(data.message ?? "Customer could not be created.");
  }
  return data.customer.customer;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { proposalAlreadyPendingMessage };

/**
 * I-49: the server answers `409 LOCATION_PROPOSAL_ALREADY_PENDING` when an earlier proposal for the same customer,
 * system and location is still awaiting review. Nothing is wrong and retrying cannot help, so this is not a failure
 * to keep retrying; the sync retires the item. It is NOT a confirmation of this proposal's UUID.
 */
export class LocationProposalAlreadyPendingError extends Error {
  constructor() { super(proposalAlreadyPendingMessage); this.name = "LocationProposalAlreadyPendingError"; }
}

/** Mirrors the API's `LocationProposalPatch` (`apps/api/src/inspections/locationConfiguration.ts`).
 *  `add-location` names a brand-new location (no real inspection data exists for it yet);
 *  `update-format` saves row count + per-row content from the live inspection form and may create
 *  Roller Shutter's General location on first approval. The server merges either into whatever the
 *  customer's CURRENT configuration is, fresh, at Approve time -- never trusting this payload alone. */
export type LocationProposalAddPatch = {
  kind: "add-location";
  locationKey: string;
  displayName: string;
  zoneKey: string | null;
  newZone: { key: string; displayName: string } | null;
};
export type LocationProposalFormatPatch = {
  kind: "update-format";
  locationKey: string;
  rows: Array<Record<string, string>>;
};
export type LocationProposalPatch = LocationProposalAddPatch | LocationProposalFormatPatch;

/** Submit a technician-drafted location proposal patch for review. Mirrors `createTechnicianCustomer`:
 *  server-side idempotent on `input.id`, `X-Expected-User-Id` guards against a stale cross-tab
 *  identity, and the response is validated (never trusted on HTTP 200 alone) before the caller may
 *  mark the local draft Synced. */
export async function submitTechnicianLocationProposal(
  customerId: string,
  systemKey: string,
  input: { id: string; jobId: string; patch: LocationProposalPatch },
  expectedUserId?: number
): Promise<{ id: string; status: string }> {
  let response: Response;
  try {
    response = await fetch(`/api/technician/customers/${encodeURIComponent(customerId)}/systems/${encodeURIComponent(systemKey)}/location-proposals`, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(expectedUserId ? { "X-Expected-User-Id": String(expectedUserId) } : {}) },
      body: JSON.stringify(input)
    });
  } catch {
    // The request never got an answer: this is the one case that really is a connection problem.
    throw new Error("Connect to the server to submit this location proposal.");
  }
  const data = await readJsonBody<{ proposal: { id?: string; status?: string }; message: string; error: string }>(response);
  if (response.status === 401 || response.status === 403) {
    throw new Error(authRefusalMessage(response.status, data, "location proposal", "submit this location proposal"));
  }
  if (response.status === 409 && data.error === "LOCATION_PROPOSAL_ALREADY_PENDING") throw new LocationProposalAlreadyPendingError();
  if (!response.ok || !data.proposal
    || !isLocationProposal(data.proposal) || data.proposal.id !== input.id.toLowerCase()
    || data.proposal.jobId !== input.jobId.toLowerCase() || data.proposal.customerId !== customerId.toLowerCase()
    || data.proposal.systemKey !== systemKey || (expectedUserId !== undefined && data.proposal.submittedByUserId !== expectedUserId)) {
    throw new Error(data.message ?? "Location proposal could not be submitted.");
  }
  return { id: data.proposal.id!, status: data.proposal.status! };
}

/** Online read-back only. No authoritative decision is persisted in the local draft. */
export async function loadTechnicianLocationProposals(jobId: string, signal?: AbortSignal): Promise<LocationProposalList> {
  const response = await fetch(`/api/technician/location-proposals?jobId=${encodeURIComponent(jobId)}`, {
    credentials: "same-origin", cache: "no-store", signal
  });
  const data = await readJsonBody<{ proposals: unknown; message: unknown }>(response);
  if (!response.ok) throw new Error(authRefusalMessage(response.status, data, "location proposal", "read your location proposals"));
  const parsed = parseLocationProposalList(data.proposals);
  if (parsed.proposals.some((proposal) => proposal.jobId !== jobId.toLowerCase())) throw new Error("Location proposal response is invalid.");
  return parsed;
}

/** Server-confirmed withdrawal; callers retain the same requestId after an unknown network outcome. */
export async function withdrawTechnicianLocationProposal(proposalId: string, requestId: string, expectedUserId?: number): Promise<LocationProposal> {
  const response = await fetch(`/api/technician/location-proposals/${encodeURIComponent(proposalId)}/withdraw`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(expectedUserId ? { "X-Expected-User-Id": String(expectedUserId) } : {}) },
    body: JSON.stringify({ requestId })
  });
  const data = await readJsonBody<{ proposal: unknown; message: unknown }>(response);
  if (!response.ok) throw new Error(authRefusalMessage(response.status, data, "location proposal", "withdraw this location proposal"));
  if (!isLocationProposal(data.proposal) || data.proposal.id !== proposalId.toLowerCase() || data.proposal.status !== "withdrawn"
    || data.proposal.decision?.requestId !== requestId.toLowerCase()
    || (expectedUserId !== undefined && data.proposal.submittedByUserId !== expectedUserId)) throw new Error("Location proposal withdrawal could not be confirmed.");
  return data.proposal;
}

export function loadCustomerConfiguration(customerId: string) {
  return getJson<CustomerConfigurationResponse>(
    `/api/customers/${encodeURIComponent(customerId)}/configuration`
  );
}

export async function loadCustomerSites(customerId: string): Promise<ReferenceSite[]> {
  const data = await getJson<{ sites: ReferenceSite[] }>(
    `/api/customers/${encodeURIComponent(customerId)}/sites`
  );
  return Array.isArray(data.sites) ? data.sites : [];
}
