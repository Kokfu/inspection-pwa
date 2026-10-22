import { useEffect, useMemo, useRef, useState } from "react";
import { loadReportApprovals, ManagerApiError, type ManagerServiceVisit } from "./managerApi";
import { formatMalaysiaDateTime } from "../uiPresentation";
import "./repairVisits/repairVisitReview.css";
import "./ManagerReportApprovals.css";
import { WorkspaceEyebrow } from "./WorkspaceEyebrow";

type ReportFilter = "all" | "awaiting" | "reapproval";
const reportFilters: readonly [ReportFilter, string][] = [["all", "All"], ["awaiting", "Awaiting approval"], ["reapproval", "Re-approval needed"]];

export function ManagerReportApprovals({ onOpen, onAuthorityFailure }: {
  onOpen: (jobId: string) => void;
  onAuthorityFailure: (error: unknown) => void;
}) {
  const [visits, setVisits] = useState<ManagerServiceVisit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [search, setSearch] = useState("");
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const authorityFailure = useRef(onAuthorityFailure);
  authorityFailure.current = onAuthorityFailure;
  const load = async (next?: string) => {
    if (busy.current) return;
    busy.current = true;
    const request = new AbortController();
    controller.current = request;
    setLoading(true); setError(false);
    try {
      const result = await loadReportApprovals({ ...(next === undefined ? {} : { cursor: next }) }, request.signal);
      if (request.signal.aborted) return;
      setVisits(current => next === undefined ? result.serviceVisits : [...current, ...result.serviceVisits]);
      setCursor(result.nextCursor);
    } catch (failure) {
      if (request.signal.aborted) return;
      // Do not continue to show stale authority after a failed or malformed refresh/page.
      setVisits([]); setCursor(null); setError(true);
      if (failure instanceof ManagerApiError && failure.kind === "authorization") authorityFailure.current(failure);
    } finally {
      if (!request.signal.aborted) { setLoading(false); busy.current = false; }
    }
  };
  useEffect(() => {
    void load();
    return () => { controller.current?.abort(); busy.current = false; };
  }, [attempt]);
  const isReapproval = (visit: ManagerServiceVisit) => visit.reportApproval.correctedAfterApproval;
  const counts = useMemo(() => ({ all: visits.length, awaiting: visits.filter(visit => !isReapproval(visit)).length, reapproval: visits.filter(isReapproval).length }), [visits]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return visits.filter(visit => (filter === "all" || (filter === "reapproval") === isReapproval(visit))
      && (needle === "" || `${visit.customer} ${visit.reference}`.toLowerCase().includes(needle)));
  }, [visits, filter, search]);
  return <section className="manager-hub page-stack" aria-labelledby="manager-report-approvals-title">
    <div className="workspace-heading"><div><WorkspaceEyebrow /><h2 id="manager-report-approvals-title">Service Reports</h2></div></div>
    {error ? <><p className="form-message" role="alert">Service reports could not be loaded. Check the connection and retry.</p><button type="button" className="secondary-command" onClick={() => setAttempt(value => value + 1)}>Retry</button></> : null}
    {loading ? <p role="status">Loading service reports…</p> : null}
    {!loading && !error && visits.length === 0 ? <p className="empty-state">No reports are waiting for approval.</p> : null}
    {visits.length > 0 ? <div className="report-approval-filters">
      <input type="search" aria-label="Search reports by customer or reference" placeholder="Search customer or reference" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="report-approval-chips" role="group" aria-label="Filter reports">{reportFilters.map(([key, label]) =>
        <button type="button" key={key} className="report-approval-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} ({counts[key]})</button>)}</div>
    </div> : null}
    {visits.length > 0 && shown.length === 0 ? <p className="empty-state">No reports match this filter.</p> : null}
    <ul className="rv-rows">{shown.map(visit => <li key={visit.id} className="rv-row report-approval-row">
      <div className="rv-row-main">
        <p className="rv-row-title"><span className="status-badge status-badge--draft rv-kind-badge">Service</span> <strong>{visit.customer}</strong></p>
        <p className="rv-row-meta">{visit.reference} · Completed {formatMalaysiaDateTime(visit.completion.completedAt!)}</p>
      </div>
      <span className="status-badge status-badge--waiting">{isReapproval(visit) ? "Re-approval needed" : "Awaiting approval"}</span>
      <button type="button" className="secondary-command" onClick={() => onOpen(visit.id)} aria-label={`Review service report ${visit.reference}`}>Review</button>
    </li>)}</ul>
    {!error && cursor !== null ? <button type="button" className="secondary-command" disabled={loading} onClick={() => void load(cursor)}>Load more</button> : null}
  </section>;
}
