import { useState, type FormEvent } from "react";
import type { ManagerAcceptedRecord, ManagerServiceVisit } from "./managerApi";
import { emptyServiceHistoryFilters, type ServiceHistoryFilterValues } from "./ManagerCustomerServiceHistory";
import { formatMalaysiaDateTime } from "../uiPresentation";
import { KpiTiles } from "./KpiTiles";

type OperationsFilters = Pick<ServiceHistoryFilterValues, "technicianId"> & { customerName: string };
const emptyFilters: OperationsFilters = { technicianId: emptyServiceHistoryFilters.technicianId, customerName: "" };

/** "Awaiting approval" or "Approved <name>, <date>" per completed visit. */
function ReportApprovalChip({ visit }: { visit: ManagerServiceVisit }) {
  const approval = visit.reportApproval;
  if (!approval || approval.status === "not_applicable") return null;
  if (approval.status === "approved" && approval.decidedBy) {
    return <span className="status-badge status-badge--complete">Approved {approval.decidedBy}{approval.decidedAt ? `, ${formatMalaysiaDateTime(approval.decidedAt)}` : ""}</span>;
  }
  return <span className="status-badge status-badge--waiting">{approval.correctedAfterApproval ? "Re-approval needed" : "Awaiting approval"}</span>;
}

export function ManagerOperations({ visits, loading, message, selectedVisit, acceptedRecords = [], acceptedRecordsUnavailable = false, backLabel = "Back to Operations", supervisor = false, onRefresh, onSelect, onBack, onViewReport, onDownloadReport, onCorrect, onDelete }: {
  visits: ManagerServiceVisit[];
  loading: boolean;
  message: string;
  selectedVisit?: ManagerServiceVisit;
  /** T5: the visit's accepted records, so a supervisor or admin can open one for correction. */
  acceptedRecords?: ManagerAcceptedRecord[];
  /** True when the list could not be loaded, so an empty list is never shown as "none". */
  acceptedRecordsUnavailable?: boolean;
  backLabel?: string;
  supervisor?: boolean;
  onRefresh: () => Promise<void>;
  onSelect: (visit: ManagerServiceVisit) => void;
  onBack: () => void;
  onViewReport: (visit: ManagerServiceVisit) => void;
  onDownloadReport: (visit: ManagerServiceVisit) => Promise<void>;
  onCorrect?: (record: ManagerAcceptedRecord) => void;
  onDelete?: (visit: ManagerServiceVisit) => Promise<void>;
}) {
  const [draft, setDraft] = useState<OperationsFilters>(emptyFilters);
  const [applied, setApplied] = useState<OperationsFilters>(emptyFilters);
  const [showActive, setShowActive] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const apply = (event: FormEvent) => { event.preventDefault(); setApplied(draft); };
  const deleteVisit = async (visit: ManagerServiceVisit) => {
    if (!onDelete || deletingId || !window.confirm(`Permanently delete service visit ${visit.reference}? This cannot be undone.`)) return;
    setDeletingId(visit.id);
    try { await onDelete(visit); } finally { setDeletingId(null); }
  };
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
          {record.review && <span className="support-metadata">Submitted by Technician: {record.submittedBy ?? "identity unavailable"} · {record.review.status === "reviewed" ? `Reviewed by Supervisor: ${record.review.reviewedBy}` : "Pending Review"}</span>}
          {record.correctionCount > 0 && <span className="status-badge status-badge--waiting">{record.correctionCount} {record.correctionCount === 1 ? "correction" : "corrections"}</span>}
          <button type="button" className="secondary-command" onClick={() => onCorrect(record)}>{record.supported ? "Review / correct" : "Review"}</button>
        </li>)}</ul>}
    </section>}
    {selectedVisit.status === "closed" ? <section className="report-summary"><h3>Completion</h3><p>Completed {selectedVisit.completion.completedAt ? formatMalaysiaDateTime(selectedVisit.completion.completedAt) : "at an unknown time"} by {selectedVisit.completion.completedBy?.username ?? "the recorded technician"}.</p><p><ReportApprovalChip visit={selectedVisit} /></p><button type="button" onClick={() => onViewReport(selectedVisit)}>View Final Report</button></section> : !supervisor && onDelete ? <div className="inline-actions"><button type="button" disabled={deletingId !== null || acceptedRecordsUnavailable || acceptedRecords.length > 0 || selectedVisit.hasAcceptedRecords === true || selectedVisit.inspectionProgress.accepted > 0} onClick={() => void deleteVisit(selectedVisit)}>Delete</button>{acceptedRecordsUnavailable ? <span className="support-metadata">Accepted records could not be checked.</span> : acceptedRecords.length > 0 || selectedVisit.hasAcceptedRecords === true || selectedVisit.inspectionProgress.accepted > 0 ? <span className="support-metadata">Cannot delete: accepted records exist.</span> : null}</div> : null}
  </section>;

  const filtered = visits.filter((visit) => (!applied.technicianId || String(visit.technician?.id) === applied.technicianId)
    && visit.customer.toLocaleLowerCase().includes(applied.customerName.trim().toLocaleLowerCase()));
  const technicians = [...new Map(visits.flatMap((visit) => visit.technician ? [[visit.technician.id, visit.technician] as const] : [])).values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const active = filtered.filter((visit) => visit.status === "open");
  const completed = filtered.filter((visit) => visit.status === "closed");
  const visitCard = (visit: ManagerServiceVisit) => <li key={visit.id}><button type="button" className="job-card" onClick={() => onSelect(visit)}><div className="job-card-heading"><div><span className="job-card-label">Customer</span><strong>{visit.customer}</strong></div><span className={`status-badge status-badge--${visit.status === "closed" ? "complete" : "draft"}`}>{visit.status === "closed" ? "Service Completed" : "In Progress"}</span></div><div className="job-service-line"><span className="job-card-label">Site / Service</span><strong>{visit.site}</strong></div><div className="job-card-meta"><span><small>Created Date & Time</small><strong>{formatMalaysiaDateTime(visit.createdAt)}</strong></span><span><small>Inspection progress</small><strong>{visit.inspectionProgress.accepted}/{visit.inspectionProgress.required} complete</strong></span></div><span className="job-reference">{visit.reference}</span></button>{visit.status === "closed" ? <div className="inline-actions manager-report-actions"><ReportApprovalChip visit={visit} /><button type="button" className="secondary-command" onClick={() => onViewReport(visit)}>View Final Report</button><button type="button" onClick={() => void onDownloadReport(visit)}>Download PDF</button></div> : !supervisor && onDelete ? <div className="inline-actions manager-report-actions"><button type="button" disabled={deletingId !== null || (visit.hasAcceptedRecords !== false || visit.inspectionProgress.accepted > 0)} title={(visit.hasAcceptedRecords !== false || visit.inspectionProgress.accepted > 0) ? "Accepted records prevent deletion." : undefined} onClick={() => void deleteVisit(visit)}>Delete</button>{(visit.hasAcceptedRecords !== false || visit.inspectionProgress.accepted > 0) ? <span className="support-metadata">Cannot delete: accepted records exist.</span> : null}</div> : null}</li>;
  return <section className="manager-home" aria-labelledby="manager-home-title"><div className="home-toolbar"><div><p className="eyebrow">{supervisor ? "Supervisor workspace" : "Manager workspace"}</p><h2 id="manager-home-title">Operations</h2><p>{supervisor ? "Read-only service visit visibility." : "Service visit visibility and management."}</p></div><button type="button" className="secondary-command" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    <KpiTiles label="Service visit summary" items={[{ label: "Open", value: active.length }, { label: "Completed", value: completed.length }, { label: "Total", value: filtered.length }]} />
    <form className="manager-filter-form" onSubmit={apply}><label>Technician<select value={draft.technicianId} onChange={(event) => setDraft({ ...draft, technicianId: event.target.value })}><option value="">All technicians</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.displayName}</option>)}</select></label><label>Customer name<input value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} /></label><div className="inline-actions"><button type="submit">Apply</button><button type="button" className="secondary-command" onClick={() => { setDraft(emptyFilters); setApplied(emptyFilters); }}>Clear filters</button></div></form>
    <section><div className="workspace-heading"><h3>Active Service Visits</h3><label className="manager-show-archived"><input type="checkbox" checked={showActive} onChange={(event) => setShowActive(event.target.checked)} /> Show active ({active.length})</label></div>{showActive ? active.length ? <ul className="job-card-list">{active.map(visitCard)}</ul> : <p className="empty-state">No active service visits.</p> : null}</section>
    <section><div className="workspace-heading"><h3>Completed Service Visits</h3><label className="manager-show-archived"><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} /> Show completed ({completed.length})</label></div>{showCompleted ? completed.length ? <ul className="job-card-list">{completed.map(visitCard)}</ul> : <p className="empty-state">No completed service visits.</p> : null}</section>
    <section><h3>Service History</h3><p>Completed visits retain their server-authoritative history and final reports.</p></section>
  </section>;
}
