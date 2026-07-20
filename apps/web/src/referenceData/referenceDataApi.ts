import type {
  CustomerConfigurationResponse,
  InspectionCatalog,
  ReferenceCustomer
} from "./referenceDataTypes";

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

export async function loadInspectionCatalog() {
  const data = await getJson<{ template: InspectionCatalog }>("/api/inspection-catalog");
  return data.template;
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
