import type { ManagerServiceVisit } from "./managerApi";
import { formatMalaysiaDateTime } from "../uiPresentation";

export function ManagerHome({ visits, loading, message, selectedVisit, onRefresh, onSelect, onBack, onViewReport, onDownloadReport }: {
  visits: ManagerServiceVisit[];
  loading: boolean;
  message: string;
  selectedVisit?: ManagerServiceVisit;
  onRefresh: () => Promise<void>;
  onSelect: (visit: ManagerServiceVisit) => void;
  onBack: () => void;
  onViewReport: (visit: ManagerServiceVisit) => void;
  onDownloadReport: (visit: ManagerServiceVisit) => Promise<void>;
}) {
  if (selectedVisit) return <section className="manager-home" aria-labelledby="manager-detail-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Operations</button>
    <div className="workspace-heading"><div><p className="eyebrow">Service visit</p><h2 id="manager-detail-title">{selectedVisit.customer}</h2></div>
      <span className={`status-badge status-badge--${selectedVisit.status === "closed" ? "complete" : "draft"}`}>{selectedVisit.status === "closed" ? "Service Completed" : "In Progress"}</span></div>
    <dl className="job-facts"><div><dt>Site</dt><dd>{selectedVisit.site}</dd></div><div><dt>Created Date & Time</dt><dd>{formatMalaysiaDateTime(selectedVisit.createdAt)}</dd></div><div><dt>Job Reference</dt><dd>{selectedVisit.reference}</dd></div><div><dt>Inspection Progress</dt><dd>{selectedVisit.inspectionProgress.accepted}/{selectedVisit.inspectionProgress.required} complete</dd></div></dl>
    <section className="report-summary"><h3>Applicable Systems</h3><ul>{selectedVisit.systems.map((system) => <li key={system}>{system}</li>)}</ul></section>
    {selectedVisit.status === "closed" ? <section className="report-summary"><h3>Completion</h3><p>Completed {selectedVisit.completion.completedAt ?? ""} by {selectedVisit.completion.completedBy?.username ?? "the recorded technician"}.</p><button type="button" onClick={() => onViewReport(selectedVisit)}>View Final Report</button></section> : <p className="offline-notice">This open service visit is read-only for Managers.</p>}
  </section>;

  const active = visits.filter((visit) => visit.status === "open");
  const completed = visits.filter((visit) => visit.status === "closed");
  const visitCard = (visit: ManagerServiceVisit) => <li key={visit.id}><button type="button" className="job-card" onClick={() => onSelect(visit)}><div className="job-card-heading"><div><span className="job-card-label">Customer</span><strong>{visit.customer}</strong></div><span className={`status-badge status-badge--${visit.status === "closed" ? "complete" : "draft"}`}>{visit.status === "closed" ? "Service Completed" : "In Progress"}</span></div><div className="job-service-line"><span className="job-card-label">Site / Service</span><strong>{visit.site}</strong></div><div className="job-card-meta"><span><small>Created Date & Time</small><strong>{formatMalaysiaDateTime(visit.createdAt)}</strong></span><span><small>Inspection progress</small><strong>{visit.inspectionProgress.accepted}/{visit.inspectionProgress.required} complete</strong></span></div><span className="job-reference">{visit.reference}</span></button>{visit.status === "closed" ? <div className="inline-actions manager-report-actions"><button type="button" className="secondary-command" onClick={() => onViewReport(visit)}>View Final Report</button><button type="button" onClick={() => void onDownloadReport(visit)}>Download PDF</button></div> : null}</li>;
  return <section className="manager-home" aria-labelledby="manager-home-title"><div className="home-toolbar"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-home-title">Operations</h2><p>Read-only operational service visibility.</p></div><button type="button" className="secondary-command" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    <dl className="operations-summary" aria-label="Service visit summary"><div><dt>Open</dt><dd>{active.length}</dd></div><div><dt>Completed</dt><dd>{completed.length}</dd></div><div><dt>Total</dt><dd>{visits.length}</dd></div></dl>
    <section><div className="workspace-heading"><h3>Active Service Visits</h3><span>{active.length}</span></div>{active.length ? <ul className="job-card-list">{active.map(visitCard)}</ul> : <p className="empty-state">No active service visits.</p>}</section>
    <section><div className="workspace-heading"><h3>Completed Service Visits</h3><span>{completed.length}</span></div>{completed.length ? <ul className="job-card-list">{completed.map(visitCard)}</ul> : <p className="empty-state">No completed service visits.</p>}</section>
    <section><h3>Service History</h3><p>Completed visits retain their server-authoritative history and final reports.</p></section>
  </section>;
}
