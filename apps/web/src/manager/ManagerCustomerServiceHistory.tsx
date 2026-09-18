import { useEffect, useState } from "react";
import { loadManagerServiceHistory, ManagerApiError, type ManagerCustomer, type ManagerServiceHistoryFilters, type ManagerServiceVisit, type ManagerTechnician } from "./managerApi";
import { formatClientDate, formatMalaysiaDateTime } from "../uiPresentation";

type StatusFilter = "" | "open" | "closed";

export type ServiceHistoryFilterValues = {
  siteId: string;
  status: StatusFilter;
  systemKey: string;
  from: string;
  to: string;
  /** Numeric technician id as a string; "" means every technician. */
  technicianId: string;
};

export const emptyServiceHistoryFilters: ServiceHistoryFilterValues = { siteId: "", status: "", systemKey: "", from: "", to: "", technicianId: "" };

export function isServiceHistoryFilterValues(value: unknown): value is ServiceHistoryFilterValues {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(emptyServiceHistoryFilters).every((key) => typeof candidate[key] === "string")
    && ["", "open", "closed"].includes(candidate.status as string)
    && /^(|[1-9]\d{0,9})$/.test(candidate.technicianId as string)
    && [candidate.from, candidate.to].every((date) => date === "" || /^\d{4}-\d{2}-\d{2}$/.test(date as string));
}

function toQuery(customerId: string, filters: ServiceHistoryFilterValues): ManagerServiceHistoryFilters {
  return {
    customerId,
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.systemKey ? { systemKey: filters.systemKey } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.technicianId ? { technicianId: Number(filters.technicianId) } : {})
  };
}

/**
 * Read-only, filtered, keyset-paginated service history for one customer. Always scoped to
 * `customer` (the `customerId` filter); every other filter is server-validated (an invalid date
 * range surfaces the server's own domain-error message inline). Strictly read-only — no mutation
 * call anywhere in this component.
 *
 * - `variant="configuration"` (default, Customer Configuration screen): Site / Status / System /
 *   From / To, applied as soon as they change; one flat list.
 * - `variant="services-done"` (Manager Services Done): From / To / Status / Technician, applied
 *   only by "Apply" and reset by "Clear filters"; visits grouped by site, newest first; each card
 *   also shows the service date and creating technician ("Unknown" for legacy visits).
 */
export function ManagerCustomerServiceHistory({
  customer, onViewServiceVisit, onViewFinalReport, onDownloadFinalReport, onAuthorityFailure,
  variant = "configuration", technicians = [], initialFilters, onFiltersApplied
}: {
  customer: ManagerCustomer;
  onViewServiceVisit: (jobId: string) => void;
  onViewFinalReport: (jobId: string) => void;
  onDownloadFinalReport: (jobId: string) => Promise<void>;
  onAuthorityFailure: (error: ManagerApiError) => void;
  variant?: "configuration" | "services-done";
  technicians?: ManagerTechnician[];
  initialFilters?: ServiceHistoryFilterValues;
  onFiltersApplied?: (filters: ServiceHistoryFilterValues) => void;
}) {
  const explicitApply = variant === "services-done";
  const [draft, setDraft] = useState<ServiceHistoryFilterValues>(initialFilters ?? emptyServiceHistoryFilters);
  const [applied, setApplied] = useState<ServiceHistoryFilterValues>(initialFilters ?? emptyServiceHistoryFilters);
  const [visits, setVisits] = useState<ManagerServiceVisit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fail = (reason: unknown) => {
    if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
    else setError(reason instanceof Error ? reason.message : "Service history could not be loaded.");
  };

  useEffect(() => {
    let current = true;
    setLoading(true); setError(""); setVisits([]); setNextCursor(null);
    (async () => {
      try {
        const result = await loadManagerServiceHistory(toQuery(customer.customer.id, applied));
        if (!current) return;
        setVisits(result.serviceVisits);
        setNextCursor(result.nextCursor);
        setTotalCount(result.totalCount);
      } catch (reason) {
        if (current) fail(reason);
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.customer.id, applied.siteId, applied.status, applied.systemKey, applied.from, applied.to, applied.technicianId]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true); setError("");
    try {
      const result = await loadManagerServiceHistory({ ...toQuery(customer.customer.id, applied), cursor: nextCursor });
      setVisits((current) => [...current, ...result.serviceVisits]);
      setNextCursor(result.nextCursor);
      setTotalCount(result.totalCount);
    } catch (reason) {
      fail(reason);
    } finally {
      setLoadingMore(false);
    }
  };

  const change = (patch: Partial<ServiceHistoryFilterValues>) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (!explicitApply) setApplied((current) => ({ ...current, ...patch }));
  };
  const apply = (filters: ServiceHistoryFilterValues) => {
    setDraft(filters); setApplied(filters); onFiltersApplied?.(filters);
  };

  const visitCard = (visit: ManagerServiceVisit) => (
    <li key={visit.id}>
      <div className="job-card">
        <div className="job-card-heading">
          <div><span className="job-card-label">Site</span><strong>{visit.site}</strong></div>
          <span className={`status-badge status-badge--${visit.status === "closed" ? "complete" : "draft"}`}>
            {visit.status === "closed" ? "Service Completed" : "In Progress"}
          </span>
        </div>
        {explicitApply ? (
          <div className="job-card-meta">
            <span><small>Service date</small><strong>{visit.serviceDate ? formatClientDate(visit.serviceDate) : "Not scheduled"}</strong></span>
            <span><small>Technician</small><strong>{visit.technician?.displayName ?? "Unknown"}</strong></span>
          </div>
        ) : (
          <div className="job-card-meta">
            <span><small>Created Date & Time</small><strong>{formatMalaysiaDateTime(visit.createdAt)}</strong></span>
            <span><small>Inspection progress</small><strong>{visit.inspectionProgress.accepted}/{visit.inspectionProgress.required} complete</strong></span>
          </div>
        )}
        <span className="job-reference">{visit.reference}</span>
      </div>
      {visit.status === "closed" ? (
        <div className="inline-actions manager-report-actions">
          <button type="button" className="secondary-command" onClick={() => onViewFinalReport(visit.id)}>View Final Report</button>
          <button type="button" onClick={() => void onDownloadFinalReport(visit.id)}>Download PDF</button>
        </div>
      ) : (
        <div className="inline-actions">
          <button type="button" onClick={() => onViewServiceVisit(visit.id)}>View Progress</button>
        </div>
      )}
    </li>
  );

  // Server order is newest service date first; grouping keeps that order within and across sites.
  const siteGroups = explicitApply ? visits.reduce<Array<{ site: string; visits: ManagerServiceVisit[] }>>((groups, visit) => {
    const group = groups.find((candidate) => candidate.site === visit.site);
    if (group) group.visits.push(visit); else groups.push({ site: visit.site, visits: [visit] });
    return groups;
  }, []) : [];

  const filterControls = explicitApply ? (
    <form className="manager-filter-form" aria-label="Service visit filters" onSubmit={(event) => { event.preventDefault(); apply(draft); }}>
      <label>From
        <input type="date" value={draft.from} onChange={(event) => change({ from: event.target.value })} />
      </label>
      <label>To
        <input type="date" value={draft.to} onChange={(event) => change({ to: event.target.value })} />
      </label>
      <label>Status
        <select value={draft.status} onChange={(event) => change({ status: event.target.value as StatusFilter })}>
          <option value="">All</option>
          <option value="open">In Progress</option>
          <option value="closed">Completed</option>
        </select>
      </label>
      <label>Technician
        <select value={draft.technicianId} onChange={(event) => change({ technicianId: event.target.value })}>
          <option value="">All technicians</option>
          {technicians.map((technician) => <option key={technician.id} value={String(technician.id)}>{technician.username}{technician.isActive ? "" : " (inactive)"}</option>)}
        </select>
      </label>
      <div className="inline-actions">
        <button type="submit" disabled={loading}>Apply</button>
        <button type="button" className="secondary-command" disabled={loading} onClick={() => apply(emptyServiceHistoryFilters)}>Clear filters</button>
      </div>
    </form>
  ) : (
    <div className="inline-actions">
      <label>Site
        <select aria-label="Site" value={draft.siteId} onChange={(event) => change({ siteId: event.target.value })}>
          <option value="">All sites</option>
          {customer.sites.map((site) => <option key={site.id} value={site.id}>{site.displayName}</option>)}
        </select>
      </label>
      <label>Status
        <select aria-label="Status" value={draft.status} onChange={(event) => change({ status: event.target.value as StatusFilter })}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <label>System
        <select aria-label="System" value={draft.systemKey} onChange={(event) => change({ systemKey: event.target.value })}>
          <option value="">All systems</option>
          {customer.supportedSystems.map((system) => <option key={system.key} value={system.key}>{system.displayName}</option>)}
        </select>
      </label>
      <label>From
        <input aria-label="From" type="date" value={draft.from} onChange={(event) => change({ from: event.target.value })} />
      </label>
      <label>To
        <input aria-label="To" type="date" value={draft.to} onChange={(event) => change({ to: event.target.value })} />
      </label>
    </div>
  );

  return <section className="report-summary" aria-labelledby="manager-service-history-title">
    <div className="list-heading">
      <h3 id="manager-service-history-title">{explicitApply ? "Service visits" : "Service history"}</h3>
      {visits.length > 0 || loading ? <span>{visits.length} of {totalCount} visits</span> : null}
    </div>
    {filterControls}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {loading ? <p role={explicitApply ? "status" : undefined}>Loading service history…</p> : null}
    {!loading && visits.length === 0 && !error ? <p className="empty-state">{explicitApply ? "No service visits match these filters." : "No service history for the selected filter."}</p> : null}
    {visits.length && !explicitApply ? <ul className="job-card-list">{visits.map(visitCard)}</ul> : null}
    {explicitApply && visits.length ? siteGroups.map((group) => (
      <section key={group.site} className="manager-site-group" aria-label={`${group.site} service visits`}>
        <div className="workspace-heading"><h4>{group.site}</h4><span>{group.visits.length} {group.visits.length === 1 ? "visit" : "visits"}</span></div>
        <ul className="job-card-list">{group.visits.map(visitCard)}</ul>
      </section>
    )) : null}
    {nextCursor ? (
      <button type="button" className="secondary-command" disabled={loadingMore} onClick={() => void loadMore()}>
        {loadingMore ? "Loading…" : "Load more"}
      </button>
    ) : null}
  </section>;
}
