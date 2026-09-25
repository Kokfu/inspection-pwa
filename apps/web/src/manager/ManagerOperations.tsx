import type { ManagerAcceptedRecord, ManagerServiceVisit } from "./managerApi";
import { formatMalaysiaDateTime } from "../uiPresentation";
import { KpiTiles } from "./KpiTiles";

export function ManagerOperations({ visits, loading, message, selectedVisit, acceptedRecords = [], acceptedRecordsUnavailable = false, backLabel = "Back to Operations", onRefresh, onSelect, onBack, onViewReport, onDownloadReport, onCorrect }: {
  visits: ManagerServiceVisit[];
  loading: boolean;
  message: string;
  selectedVisit?: ManagerServiceVisit;
  /** T5: the visit's accepted records, so a supervisor or admin can open one for correction. */
  acceptedRecords?: ManagerAcceptedRecord[];
  /** True when the list could not be loaded, so an empty list is never shown as "none". */
  acceptedRecordsUnavailable?: boolean;
  backLabel?: string;
  onRefresh: () => Promise<void>;
  onSelect: (visit: ManagerServiceVisit) => void;
  onBack: () => void;
  onViewReport: (visit: ManagerServiceVisit) => void;
  onDownloadReport: (visit: ManagerServiceVisit) => Promise<void>;
  onCorrect?: (record: ManagerAcceptedRecord) => void;
}) {
  if (selectedVisit) return <section className="manager-home" aria-labelledby="manager-detail-title">
    <button type="button" className="secondary-command" onClick={onBack}>{backLabel}</button>
    <div className="workspace-heading"><div><p className="eyebrow">Service visit</p><h2 id="manager-detail-title">{selectedVisit.customer}</h2></div>
      <span className={`status-badge status-badge--${selectedVisit.status === "closed" ? "complete" : "draft"}`}>{selectedVisit.status === "closed" ? "Service Completed" : "In Progress"}</span></div>
    <dl className="job-facts"><div><dt>Site</dt><dd>{selectedVisit.site}</dd></div><div><dt>Created Date & Time</dt><dd>{formatMalaysiaDateTime(selectedVisit.createdAt)}</dd></div><div><dt>Job Reference</dt><dd>{selectedVisit.reference}</dd></div><div><dt>Inspection Progress</dt><dd>{selectedVisit.inspectionProgress.accepted}/{selectedVisit.inspectionProgress.required} complete</dd></div></dl>
    <section className="report-summary"><h3>Applicable Systems</h3><ul>{selectedVisit.systems.map((system) => <li key={system}>{system}</li>)}</ul></section>
    {onCorrect && <section className="report-summary" aria-labelledby="manager-accepted-records-title">
      <h3 id="manager-accepted-records-title">Accepted records</h3>
      {acceptedRecordsUnavailable
        ? <p className="form-message" role="alert">Accepted records could not be loaded. Reload to try again.</p>
        : acceptedRecords.length === 0
        ? <p className="empty-state">No accepted records yet.</p>
        : <ul className="manager-technician-list">{acceptedRecords.map((record) => <li key={record.clientUuid}>
          <span><strong>{record.systemLabel}</strong>{record.locationLabel ? <small> · {record.zoneLabel ? `${record.zoneLabel} / ` : ""}{record.locationLabel}</small> : null}</span>
          {record.correctionCount > 0 && <span className="status-badge status-badge--waiting">{record.correctionCount} {record.correctionCount === 1 ? "correction" : "corrections"}</span>}
          <button type="button" className="secondary-command" onClick={() => onCorrect(record)}>{record.supported ? "Review / correct" : "Review"}</button>
        </li>)}</ul>}
    </section>}
    {selectedVisit.status === "closed" ? <section className="report-summary"><h3>Completion</h3><p>Completed {selectedVisit.completion.completedAt ?? ""} by {selectedVisit.completion.completedBy?.username ?? "the recorded technician"}.</p><button type="button" onClick={() => onViewReport(selectedVisit)}>View Final Report</button></section> : <p className="offline-notice">This open service visit is read-only for Managers.</p>}
  </section>;

  const active = visits.filter((visit) => visit.status === "open");
  const completed = visits.filter((visit) => visit.status === "closed");
  const visitCard = (visit: ManagerServiceVisit) => <li key={visit.id}><button type="button" className="job-card" onClick={() => onSelect(visit)}><div className="job-card-heading"><div><span className="job-card-label">Customer</span><strong>{visit.customer}</strong></div><span className={`status-badge status-badge--${visit.status === "closed" ? "complete" : "draft"}`}>{visit.status === "closed" ? "Service Completed" : "In Progress"}</span></div><div className="job-service-line"><span className="job-card-label">Site / Service</span><strong>{visit.site}</strong></div><div className="job-card-meta"><span><small>Created Date & Time</small><strong>{formatMalaysiaDateTime(visit.createdAt)}</strong></span><span><small>Inspection progress</small><strong>{visit.inspectionProgress.accepted}/{visit.inspectionProgress.required} complete</strong></span></div><span className="job-reference">{visit.reference}</span></button>{visit.status === "closed" ? <div className="inline-actions manager-report-actions"><button type="button" className="secondary-command" onClick={() => onViewReport(visit)}>View Final Report</button><button type="button" onClick={() => void onDownloadReport(visit)}>Download PDF</button></div> : null}</li>;
  return <section className="manager-home" aria-labelledby="manager-home-title"><div className="home-toolbar"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-home-title">Operations</h2><p>Read-only operational service visibility.</p></div><button type="button" className="secondary-command" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    <KpiTiles label="Service visit summary" items={[{ label: "Open", value: active.length }, { label: "Completed", value: completed.length }, { label: "Total", value: visits.length }]} />
    <section><div className="workspace-heading"><h3>Active Service Visits</h3><span>{active.length}</span></div>{active.length ? <ul className="job-card-list">{active.map(visitCard)}</ul> : <p className="empty-state">No active service visits.</p>}</section>
    <section><div className="workspace-heading"><h3>Completed Service Visits</h3><span>{completed.length}</span></div>{completed.length ? <ul className="job-card-list">{completed.map(visitCard)}</ul> : <p className="empty-state">No completed service visits.</p>}</section>
    <section><h3>Service History</h3><p>Completed visits retain their server-authoritative history and final reports.</p></section>
  </section>;
}
