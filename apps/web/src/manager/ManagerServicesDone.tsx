import { useEffect, useRef, useState } from "react";
import { ManagerCustomerServiceHistory, isServiceHistoryFilterValues, type ServiceHistoryFilterValues } from "./ManagerCustomerServiceHistory";
import { loadManagerCustomers, loadManagerTechnicians, ManagerApiError, type ManagerCustomerSummary, type ManagerTechnician } from "./managerApi";
import { readManagerSession, writeManagerSession } from "./managerReturnRoute";

type Props = {
  onAuthorityFailure: (error: unknown) => void;
  onViewServiceVisit: (jobId: string) => void;
  onViewReport: (jobId: string) => void;
  onDownloadReport: (jobId: string) => Promise<void>;
};

type RememberedSelection = { customerId: string; filters: ServiceHistoryFilterValues | null };

const sessionKey = "manager-services-done:v1";
const maxMatches = 10;

function isRememberedSelection(value: unknown): value is RememberedSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.customerId === "string" && candidate.customerId.length > 0
    && (candidate.filters === null || isServiceHistoryFilterValues(candidate.filters));
}

/**
 * Customer-first Services Done. Step 1 finds a customer (client-side over the unpaginated
 * GET /manager/customers); nothing is listed until one is chosen. Step 2 reuses the customer
 * service-history component in its "services-done" variant. The chosen customer and applied
 * filters are remembered for the browser session so Back from a report returns to the same list.
 */
export function ManagerServicesDone({ onAuthorityFailure, onViewServiceVisit, onViewReport, onDownloadReport }: Props) {
  const mounted = useRef(false);
  const [customers, setCustomers] = useState<ManagerCustomerSummary[]>([]);
  const [technicians, setTechnicians] = useState<ManagerTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [selection, setSelection] = useState<RememberedSelection | null>(() => readManagerSession(sessionKey, isRememberedSelection));

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void Promise.all([loadManagerCustomers(controller.signal), loadManagerTechnicians(controller.signal)]).then(([customerRows, technicianRows]) => {
      if (controller.signal.aborted) return;
      setCustomers(customerRows);
      // Supervisors never create visits, so only technicians are offered as a "created by" filter.
      setTechnicians(technicianRows.filter((row) => row.role === "inspector"));
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ManagerApiError && error.kind === "domain") setLoadError(error.message);
      else onAuthorityFailure(error);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCustomer = selection && !loading ? customers.find((row) => row.customer.id === selection.customerId) : undefined;

  const choose = (next: RememberedSelection | null) => {
    setSelection(next);
    writeManagerSession(sessionKey, next);
  };

  const search = () => {
    const trimmed = query.trim();
    if (!trimmed) { setSubmittedQuery(null); setSearchMessage("Enter a customer name or code to search."); return; }
    setSearchMessage("");
    setSubmittedQuery(trimmed);
  };
  const clearSearch = () => { setQuery(""); setSubmittedQuery(null); setSearchMessage(""); };

  const needle = submittedQuery?.toLocaleLowerCase() ?? "";
  const matches = submittedQuery === null ? [] : customers.filter((row) =>
    row.customer.displayName.toLocaleLowerCase().includes(needle) || row.customer.code.toLocaleLowerCase().includes(needle));

  if (selectedCustomer) {
    return <section className="manager-home" aria-labelledby="services-done-title">
      <h2 id="services-done-title">Current Services Done</h2>
      <div className="workspace-heading manager-selected-customer">
        <div><p className="eyebrow">Customer</p><h3>{selectedCustomer.customer.displayName}</h3><p className="job-reference">{selectedCustomer.customer.code}</p></div>
        <button type="button" className="secondary-command" onClick={() => choose(null)}>Change customer</button>
      </div>
      <ManagerCustomerServiceHistory
        key={selectedCustomer.customer.id}
        variant="services-done"
        customer={selectedCustomer}
        technicians={technicians}
        initialFilters={selection?.filters ?? undefined}
        onFiltersApplied={(filters) => choose({ customerId: selectedCustomer.customer.id, filters })}
        onViewServiceVisit={onViewServiceVisit}
        onViewFinalReport={onViewReport}
        onDownloadFinalReport={onDownloadReport}
        onAuthorityFailure={onAuthorityFailure}
      />
    </section>;
  }

  return <section className="manager-home" aria-labelledby="services-done-title">
    <h2 id="services-done-title">Current Services Done</h2>
    <p>Find a customer to see their service visits.</p>
    <form className="manager-search-form" role="search" aria-label="Find customer" onSubmit={(event) => { event.preventDefault(); search(); }}>
      <label htmlFor="services-done-customer-search">Customer name or code</label>
      <div className="manager-search-row">
        <input id="services-done-customer-search" type="search" autoComplete="off" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit" disabled={loading}>Search</button>
        <button type="button" className="secondary-command" onClick={clearSearch}>Clear</button>
      </div>
    </form>
    {loading ? <p role="status">Loading customers…</p> : null}
    {loadError ? <p className="form-message" role="alert">{loadError}</p> : null}
    {searchMessage ? <p className="form-message" role="status">{searchMessage}</p> : null}
    {!loading && submittedQuery !== null ? (matches.length ? <section aria-label="Matching customers">
      <p role="status">{matches.length === 1 ? "1 customer found" : `${matches.length} customers found`}{matches.length > maxMatches ? ` — showing the first ${maxMatches}; refine your search` : ""}</p>
      <ul className="manager-technician-list">{matches.slice(0, maxMatches).map((row) => <li key={row.customer.id}>
        <button type="button" className="manager-technician-open" onClick={() => choose({ customerId: row.customer.id, filters: null })}>
          <strong>{row.customer.displayName}</strong><span>{row.customer.code}</span>
        </button>
      </li>)}</ul>
    </section> : <p className="empty-state" role="status">No customers match “{submittedQuery}”.</p>) : null}
  </section>;
}
