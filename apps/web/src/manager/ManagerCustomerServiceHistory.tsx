import { useEffect, useState } from "react";
import { loadManagerServiceHistory, ManagerApiError, type ManagerCustomer, type ManagerServiceVisit } from "./managerApi";
import { formatMalaysiaDateTime } from "../uiPresentation";

type StatusFilter = "" | "open" | "closed";

/**
 * STEP 3.2 slice B: read-only service-history list on the customer configuration
 * screen. Always scoped to `customer` (Slice A's `customerId` filter); the "Site"
 * select narrows to one of `customer.sites` (All Sites default). `systemKey` /
 * `from` / `to` are supported server-side but out of scope for this slice's UI.
 * Strictly read-only — no mutation call anywhere in this component.
 */
export function ManagerCustomerServiceHistory({ customer, onViewServiceVisit, onViewFinalReport, onDownloadFinalReport, onAuthorityFailure }: {
  customer: ManagerCustomer;
  onViewServiceVisit: (jobId: string) => void;
  onViewFinalReport: (jobId: string) => void;
  onDownloadFinalReport: (jobId: string) => Promise<void>;
  onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [visits, setVisits] = useState<ManagerServiceVisit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true); setError(""); setVisits([]); setNextCursor(null);
    (async () => {
      try {
        const result = await loadManagerServiceHistory({
          customerId: customer.customer.id,
          ...(siteId ? { siteId } : {}),
          ...(status ? { status } : {})
        });
        if (!current) return;
        setVisits(result.serviceVisits);
        setNextCursor(result.nextCursor);
      } catch (reason) {
        if (!current) return;
        if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
        else setError(reason instanceof Error ? reason.message : "Service history could not be loaded.");
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.customer.id, siteId, status]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true); setError("");
    try {
      const result = await loadManagerServiceHistory({
        customerId: customer.customer.id,
        ...(siteId ? { siteId } : {}),
        ...(status ? { status } : {}),
        cursor: nextCursor
      });
      setVisits((current) => [...current, ...result.serviceVisits]);
      setNextCursor(result.nextCursor);
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Service history could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
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
        <div className="job-card-meta">
          <span><small>Created Date & Time</small><strong>{formatMalaysiaDateTime(visit.createdAt)}</strong></span>
          <span><small>Inspection progress</small><strong>{visit.inspectionProgress.accepted}/{visit.inspectionProgress.required} complete</strong></span>
        </div>
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

  return <section className="report-summary" aria-labelledby="manager-service-history-title">
    <h3 id="manager-service-history-title">Service history</h3>
    <div className="inline-actions">
      <label>Site
        <select aria-label="Site" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
          <option value="">All sites</option>
          {customer.sites.map((site) => <option key={site.id} value={site.id}>{site.displayName}</option>)}
        </select>
      </label>
      <label>Status
        <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </label>
    </div>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {loading ? <p>Loading service history…</p> : null}
    {!loading && visits.length === 0 && !error ? <p className="empty-state">No service history for the selected filter.</p> : null}
    {visits.length ? <ul className="job-card-list">{visits.map(visitCard)}</ul> : null}
    {nextCursor ? (
      <button type="button" className="secondary-command" disabled={loadingMore} onClick={() => void loadMore()}>
        {loadingMore ? "Loading…" : "Load more"}
      </button>
    ) : null}
  </section>;
}
