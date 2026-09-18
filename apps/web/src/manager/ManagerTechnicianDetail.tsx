import { useEffect, useRef, useState } from "react";
import { loadManagerServiceHistory, loadManagerTechnicians, ManagerApiError, type ManagerServiceVisit, type ManagerTechnician } from "./managerApi";
import { readManagerSession, writeManagerSession } from "./managerReturnRoute";
import { formatClientDate } from "../uiPresentation";

type Tab = "open" | "closed";
type TabState = { visits: ManagerServiceVisit[]; nextCursor: string | null; totalCount: number };

const pageSize = 20;
const emptyTab: TabState = { visits: [], nextCursor: null, totalCount: 0 };
const isTab = (value: unknown): value is Tab => value === "open" || value === "closed";

/**
 * Manager view of one technician's service visits (the visits they created), split into
 * In Progress / Completed via the admin-only `technicianId` + `status` filters. Read-only.
 */
export function ManagerTechnicianDetail({ technicianId, onBack, onViewServiceVisit, onViewReport, onDownloadReport, onAuthorityFailure }: {
  technicianId: number;
  onBack: () => void;
  onViewServiceVisit: (jobId: string) => void;
  onViewReport: (jobId: string) => void;
  onDownloadReport: (jobId: string) => Promise<void>;
  onAuthorityFailure: (error: unknown) => void;
}) {
  const tabKey = `manager-technician-tab:${technicianId}`;
  const [technician, setTechnician] = useState<ManagerTechnician | null>();
  const [tab, setTab] = useState<Tab>(() => readManagerSession(tabKey, isTab) ?? "open");
  const [tabs, setTabs] = useState<Record<Tab, TabState>>({ open: emptyTab, closed: emptyTab });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  // Bumped on technicianId change and unmount: a stale Load more page must not land afterwards.
  const requestGeneration = useRef(0);

  const fail = (reason: unknown) => {
    if (reason instanceof ManagerApiError && reason.kind === "domain") setError(reason.message);
    else onAuthorityFailure(reason);
  };

  useEffect(() => {
    mounted.current = true;
    requestGeneration.current += 1;
    const controller = new AbortController();
    setLoading(true); setLoadingMore(false); setError("");
    void Promise.all([
      loadManagerTechnicians(controller.signal),
      loadManagerServiceHistory({ technicianId, status: "open", limit: pageSize }, controller.signal),
      loadManagerServiceHistory({ technicianId, status: "closed", limit: pageSize }, controller.signal)
    ]).then(([technicians, open, closed]) => {
      if (controller.signal.aborted) return;
      setTechnician(technicians.find((candidate) => candidate.id === technicianId) ?? null);
      setTabs({
        open: { visits: open.serviceVisits, nextCursor: open.nextCursor, totalCount: open.totalCount },
        closed: { visits: closed.serviceVisits, nextCursor: closed.nextCursor, totalCount: closed.totalCount }
      });
    }).catch((reason: unknown) => { if (!controller.signal.aborted) fail(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; requestGeneration.current += 1; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicianId]);

  const selectTab = (next: Tab) => { setTab(next); writeManagerSession(tabKey, next); };

  const loadMore = async () => {
    const cursor = tabs[tab].nextCursor;
    if (!cursor) return;
    const current = tab;
    const generation = requestGeneration.current;
    const isCurrent = () => mounted.current && generation === requestGeneration.current;
    setLoadingMore(true); setError("");
    try {
      const result = await loadManagerServiceHistory({ technicianId, status: current, limit: pageSize, cursor });
      if (!isCurrent()) return;
      setTabs((state) => ({ ...state, [current]: {
        visits: [...state[current].visits, ...result.serviceVisits], nextCursor: result.nextCursor, totalCount: result.totalCount
      } }));
    } catch (reason) { if (isCurrent()) fail(reason); }
    finally { if (isCurrent()) setLoadingMore(false); }
  };

  const visitCard = (visit: ManagerServiceVisit) => <li key={visit.id}>
    <div className="job-card">
      <div className="job-card-heading">
        <div><span className="job-card-label">Customer</span><strong>{visit.customer}</strong></div>
        <span className={`status-badge status-badge--${visit.status === "closed" ? "complete" : "draft"}`}>{visit.status === "closed" ? "Service Completed" : "In Progress"}</span>
      </div>
      <div className="job-service-line"><span className="job-card-label">Site</span><strong>{visit.site}</strong></div>
      <div className="job-card-meta">
        <span><small>Service date</small><strong>{visit.serviceDate ? formatClientDate(visit.serviceDate) : "Not scheduled"}</strong></span>
        <span><small>Reference</small><strong>{visit.reference}</strong></span>
      </div>
    </div>
    {visit.status === "closed"
      ? <div className="inline-actions manager-report-actions">
        <button type="button" className="secondary-command" onClick={() => onViewReport(visit.id)}>View Report</button>
        <button type="button" onClick={() => void onDownloadReport(visit.id)}>Download PDF</button>
      </div>
      : <div className="inline-actions"><button type="button" className="secondary-command" onClick={() => onViewServiceVisit(visit.id)}>View Progress</button></div>}
  </li>;

  const active = tabs[tab];
  return <section className="manager-home" aria-labelledby="manager-technician-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Technicians</button>
    <div className="workspace-heading">
      <div><p className="eyebrow">Technician</p><h2 id="manager-technician-title">{technician?.username ?? (technician === null ? "Technician not found" : "Technician")}</h2></div>
      {technician ? <span className={`status-badge status-badge--${technician.isActive ? "complete" : "attention"}`}>{technician.isActive ? "Active" : "Inactive"}</span> : null}
    </div>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {loading ? <p role="status">Loading service visits…</p> : technician === null ? <p className="empty-state">This technician no longer exists.</p> : <>
      <div className="job-tabs" role="tablist" aria-label="Technician service visits">
        {(["open", "closed"] as const).map((value) => <button
          key={value} type="button" role="tab" id={`technician-tab-${value}`}
          aria-selected={tab === value} aria-controls="technician-tab-panel" tabIndex={tab === value ? 0 : -1}
          onClick={() => selectTab(value)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next: Tab = event.key === "Home" ? "open" : event.key === "End" ? "closed" : tab === "open" ? "closed" : "open";
            selectTab(next); document.getElementById(`technician-tab-${next}`)?.focus();
          }}>
          {value === "open" ? `In Progress (${tabs.open.totalCount})` : `Completed (${tabs.closed.totalCount})`}
        </button>)}
      </div>
      <div id="technician-tab-panel" className="manager-technician-visits" role="tabpanel" aria-labelledby={`technician-tab-${tab}`} tabIndex={0}>
        {active.visits.length
          ? <ul className="job-card-list">{active.visits.map(visitCard)}</ul>
          : <p className="empty-state">{tab === "open" ? "No service visits in progress." : "No completed service visits."}</p>}
        {active.nextCursor
          ? <button type="button" className="secondary-command" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more"}</button>
          : null}
      </div>
    </>}
  </section>;
}
