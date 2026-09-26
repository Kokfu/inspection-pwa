import type {
  CustomerConfigurationResponse,
  InspectionCatalog,
  ReferenceCustomer,
  ReferenceSite,
} from "./referenceDataTypes";
import { parseInspectionCatalog } from "./referenceDataTypes";
import { localDatabase } from "../db/localDatabase";

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
  const data = await response.json() as { customer?: { customer?: ReferenceCustomer }; message?: string };
  if (response.status === 401 || response.status === 403) {
    throw new Error("Connect to the server to add a new customer.");
  }
  if (!response.ok || !data.customer?.customer
    || typeof data.customer.customer.id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.customer.customer.id)
    || data.customer.customer.displayName !== input.displayName.trim()) {
    throw new Error(data.message ?? "Customer could not be created.");
  }
  return data.customer.customer;
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
