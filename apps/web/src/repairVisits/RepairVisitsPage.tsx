import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isServerUnreachable } from "../jobs/serverReachability";
import { formatClientDate, formatClientDateTime } from "../uiPresentation";
import { presentRepairVisit, visitNumberText } from "./repairVisitPresentation";
import { refreshRepairVisitsFromServer } from "./repairVisitRefresh";
import { requeueRepairVisit } from "./repairVisitRepository";
import { useBrowserConnected, useLocalRepairVisits } from "./useRepairVisits";
import type { LocalRepairVisit } from "./repairVisitTypes";

type Tab = "in-progress" | "completed";
const tabLabels: Record<Tab, string> = { "in-progress": "In Progress", completed: "Completed" };

export function RepairVisitsPage({ actorId, canUseServer, onSync }: { actorId: number; canUseServer: boolean; onSync: () => Promise<unknown> }) {
  const { visits, itemCounts, loaded, failed } = useLocalRepairVisits();
  const connected = useBrowserConnected();
  const [tab, setTab] = useState<Tab>("in-progress");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string>();
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true; setRefreshing(true); setRefreshError("");
    try {
      await refreshRepairVisitsFromServer();
      if (mounted.current) setRefreshedAt(new Date().toISOString());
    } catch (error) {
      // A failed refresh is shown; the cards below stay labelled as the last known state, never as current.
      if (mounted.current) setRefreshError(isServerUnreachable(error) ? "The server could not be reached." : error instanceof Error ? error.message : "The list could not be refreshed.");
    } finally { running.current = false; if (mounted.current) setRefreshing(false); }
  }, []);
  useEffect(() => { if (canUseServer && connected) void refresh(); }, [canUseServer, connected, refresh]);

  const mine = useMemo(() => visits.filter(visit => visit.createdByUserId === actorId)
    .sort((left, right) => right.visitDate.localeCompare(left.visitDate) || right.localCreatedAt.localeCompare(left.localCreatedAt)), [visits, actorId]);
  const byTab = useMemo(() => ({
    "in-progress": mine.filter(visit => presentRepairVisit(visit).tab === "in-progress"),
    completed: mine.filter(visit => presentRepairVisit(visit).tab === "completed")
  }), [mine]);
  const shown = byTab[tab];

  async function retry(visit: LocalRepairVisit) {
    setNotice("");
    try { await requeueRepairVisit(visit.clientUuid); if (canUseServer) await onSync(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The repair visit could not be queued again."); }
  }

  return <section className="rv-page page-stack" aria-labelledby="rv-list-title">
    <header className="rv-header">
      <div><p className="eyebrow">Technician workspace</p><h2 id="rv-list-title">Repair List</h2></div>
      <div className="rv-header-actions">
        <a className="rv-primary-link" href="#/repair-visits/new">+ New Repair Visit</a>
        <button type="button" className="secondary-command" disabled={!canUseServer || !connected || refreshing} onClick={() => void refresh()}>{refreshing ? "Refreshing…" : "Refresh"}</button>
      </div>
    </header>
    {!canUseServer || !connected ? <p className="offline-notice" role="status">Offline — your repair visits are saved on this device. Returned and approved visits update when you reconnect.</p> : null}
    {refreshError ? <p className="operational-message operational-message--warning" role="alert">Could not refresh from the server: {refreshError} The list below is the last known state on this device{refreshedAt ? ` (checked ${formatClientDateTime(refreshedAt)})` : ""}.</p> : null}
    {notice ? <p className="operational-message operational-message--warning" role="alert">{notice}</p> : null}
    <div className="rv-tabs" role="tablist" aria-label="Repair visits">
      {(Object.keys(tabLabels) as Tab[]).map(key => <button key={key} type="button" role="tab" id={`rv-tab-${key}`} aria-selected={tab === key} aria-controls="rv-tabpanel"
        className={`rv-tab${tab === key ? " rv-tab--active" : ""}`} onClick={() => setTab(key)}>{tabLabels[key]} ({byTab[key].length})</button>)}
    </div>
    <div id="rv-tabpanel" role="tabpanel" aria-labelledby={`rv-tab-${tab}`}>
      {!loaded ? <p role="status">Loading repair visits…</p>
        : failed ? <p className="rv-error" role="alert">The repair visits on this device could not be read. Close other tabs of this app and reload.</p>
          : shown.length === 0 ? <p className="rv-empty" role="status">{tab === "in-progress" ? "No repair visits in progress. Tap + New Repair Visit to start one." : "No completed repair visits yet. A visit appears here once it is approved."}</p>
            : <ul className="rv-card-list">{shown.map(visit => {
              const state = presentRepairVisit(visit);
              const count = itemCounts.get(visit.clientUuid) ?? 0;
              return <li key={visit.clientUuid}>
                <a className="rv-card" href={`#/repair-visits/${encodeURIComponent(visit.clientUuid)}`}>
                  <span className="rv-card-heading"><strong>{visit.customerName ?? "Customer"}</strong><span className={`status-badge status-badge--${badgeTone(state.tone)}`}>{state.label}</span></span>
                  <span className="rv-card-site">{visit.siteName ?? "Site"}</span>
                  <span className="rv-card-meta">
                    <span><small>Repair visit</small><strong>{visitNumberText(visit)}</strong></span>
                    <span><small>Date</small><strong>{formatClientDate(visit.visitDate)}</strong></span>
                    <span><small>Fields</small><strong>{count}</strong></span>
                  </span>
                  {visit.reportNumber ? <span className="rv-card-report">Report {visit.reportNumber}</span> : null}
                  {state.reason ? <span className="rv-card-reason">{state.reason}</span> : null}
                </a>
                {state.tone === "attention" ? <button type="button" className="secondary-command rv-card-retry" aria-label={`Retry sync for ${visit.customerName ?? "repair"} visit`} onClick={() => void retry(visit)}>Retry sync</button> : null}
              </li>;
            })}</ul>}
    </div>
  </section>;
}

function badgeTone(tone: ReturnType<typeof presentRepairVisit>["tone"]) {
  switch (tone) {
    case "approved": return "complete";
    case "attention": return "attention";
    case "returned": case "waiting": case "pending": return "waiting";
    case "syncing": return "syncing";
    default: return "draft";
  }
}
