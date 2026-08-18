import type {
  CustomerConfigurationResponse,
  InspectionCatalog,
  ReferenceCustomer,
  ReferenceSite,
} from "./referenceDataTypes";
import { parseInspectionCatalog } from "./referenceDataTypes";

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
