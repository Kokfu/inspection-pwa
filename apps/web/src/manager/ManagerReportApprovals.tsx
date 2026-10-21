import { useEffect, useRef, useState } from "react";
import { loadReportApprovals, ManagerApiError, type ManagerServiceVisit } from "./managerApi";
import { formatMalaysiaDateTime } from "../uiPresentation";
import "./ManagerReportApprovals.css";

export function ManagerReportApprovals({ onOpen, onAuthorityFailure }: {
  onOpen: (jobId: string) => void;
  onAuthorityFailure: (error: unknown) => void;
}) {
  const [visits, setVisits] = useState<ManagerServiceVisit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
  return <section className="manager-hub page-stack" aria-labelledby="manager-report-approvals-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-report-approvals-title">Service Reports</h2></div></div>
    {error ? <><p className="form-message" role="alert">Service reports could not be loaded. Check the connection and retry.</p><button type="button" className="secondary-command" onClick={() => setAttempt(value => value + 1)}>Retry</button></> : null}
    {loading ? <p role="status">Loading service reports…</p> : null}
    {!loading && !error && visits.length === 0 ? <p className="empty-state">No reports are waiting for approval.</p> : null}
    <ul className="report-approval-list">{visits.map(visit => <li key={visit.id}>
      <button type="button" className="job-card report-approval-row" onClick={() => onOpen(visit.id)}>
        <strong>{visit.customer}</strong><span className="job-reference">{visit.reference}</span>
        <span>Completed {formatMalaysiaDateTime(visit.completion.completedAt!)}</span>
        <span className="status-badge status-badge--waiting">{visit.reportApproval.correctedAfterApproval ? "Re-approval needed" : "Awaiting approval"}</span>
      </button>
    </li>)}</ul>
    {!error && cursor !== null ? <button type="button" className="secondary-command" disabled={loading} onClick={() => void load(cursor)}>Load more</button> : null}
  </section>;
}
