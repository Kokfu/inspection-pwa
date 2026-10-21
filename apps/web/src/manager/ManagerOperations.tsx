import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ManagerAcceptedRecord, ManagerServiceVisit } from "./managerApi";
import { formatMalaysiaDateTime } from "../uiPresentation";
import "./managerOperations.css";

type StatusFilter = "all" | "open" | "closed";

/** Table layout from 900px; below it the existing cards. */
const WIDE_QUERY = "(min-width: 900px)";
/** An open visit older than this is flagged in the Age column. */
export const OLD_OPEN_VISIT_MS = 2 * 24 * 60 * 60 * 1000;

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => { const list = window.matchMedia(query); list.addEventListener("change", notify); return () => list.removeEventListener("change", notify); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** "12m", "5h" or "3d" since the visit was created. */
export function formatVisitAge(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** Oldest open visit first, then completed visits, newest first. */
export function sortVisits(visits: ManagerServiceVisit[]) {
  const time = (visit: ManagerServiceVisit) => Date.parse(visit.createdAt) || 0;
  return [...visits].sort((a, b) => a.status === b.status
    ? (a.status === "open" ? time(a) - time(b) : time(b) - time(a))
    : a.status === "open" ? -1 : 1);
}

export type OpsSort = { key: "customer" | "technician" | "created" | "age"; dir: "asc" | "desc" } | null;

/** No header sort: oldest open first, then completed. A header sort orders by that column alone. */
export function sortVisitsBy(visits: ManagerServiceVisit[], sort: OpsSort) {
  if (!sort) return sortVisits(visits);
  const time = (visit: ManagerServiceVisit) => Date.parse(visit.createdAt) || 0;
  const text = (visit: ManagerServiceVisit) => sort.key === "customer" ? visit.customer : visit.technician?.displayName ?? "";
  const compare = (a: ManagerServiceVisit, b: ManagerServiceVisit) => sort.key === "customer" || sort.key === "technician"
    ? text(a).localeCompare(text(b))
    : sort.key === "created" ? time(a) - time(b) : time(b) - time(a);
  return [...visits].sort((a, b) => (sort.dir === "asc" ? 1 : -1) * compare(a, b));
}

function SortHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: NonNullable<OpsSort>["key"]; sort: OpsSort; onSort: (key: NonNullable<OpsSort>["key"]) => void }) {
  const active = sort?.key === sortKey;
  return <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
    <button type="button" className="ops-sort" onClick={() => onSort(sortKey)}>{label}<span aria-hidden="true">{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span></button>
  </th>;
}

/** "Awaiting approval" or "Approved <name>, <date>" per completed visit. */
function ReportApprovalChip({ visit }: { visit: ManagerServiceVisit }) {
  const approval = visit.reportApproval;
  if (!approval || approval.status === "not_applicable") return null;
  if (approval.status === "approved" && approval.decidedBy) {
    return <span className="status-badge status-badge--complete">Approved {approval.decidedBy}{approval.decidedAt ? `, ${formatMalaysiaDateTime(approval.decidedAt)}` : ""}</span>;
  }
  return <span className="status-badge status-badge--waiting">{approval.correctedAfterApproval ? "Re-approval needed" : "Awaiting approval"}</span>;
}

export function ManagerOperations({ visits, loading, message, selectedVisit, acceptedRecords = [], acceptedRecordsUnavailable = false, backLabel = "Back to Operations", supervisor = false, nowMs = Date.now, onRefresh, onSelect, onBack, onViewReport, onDownloadReport, onCorrect, onDelete }: {
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
  /** Clock for the Age column; injectable so tests do not depend on the wall clock. */
  nowMs?: () => number;
  onRefresh: () => Promise<void>;
  onSelect: (visit: ManagerServiceVisit) => void;
  onBack: () => void;
  onViewReport: (visit: ManagerServiceVisit) => void;
  onDownloadReport: (visit: ManagerServiceVisit) => Promise<void>;
  onCorrect?: (record: ManagerAcceptedRecord) => void;
  onDelete?: (visit: ManagerServiceVisit) => Promise<void>;
}) {
  const [technicianId, setTechnicianId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<OpsSort>(null);
  const toggleSort = (key: NonNullable<OpsSort>["key"]) => setSort((current) => current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const wide = useMediaQuery(WIDE_QUERY);
  const [now, setNow] = useState(() => nowMs());
  // Age is shown in days/hours, so a minute-level tick keeps it honest without re-rendering constantly.
  useEffect(() => { const timer = window.setInterval(() => setNow(nowMs()), 60_000); return () => window.clearInterval(timer); }, [nowMs]);
  const term = search.trim().toLocaleLowerCase();
  const filtered = useMemo(() => visits.filter((visit) => (!technicianId || String(visit.technician?.id) === technicianId)
    && (!term || [visit.customer, visit.site, visit.reference].some((field) => field.toLocaleLowerCase().includes(term)))), [visits, technicianId, term]);
  const technicians = useMemo(() => [...new Map(visits.flatMap((visit) => visit.technician ? [[visit.technician.id, visit.technician] as const] : [])).values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName)), [visits]);
  const openCount = filtered.filter((visit) => visit.status === "open").length;
  const completedCount = filtered.filter((visit) => visit.status === "closed").length;
  const listed = useMemo(() => sortVisitsBy(filtered.filter((visit) => statusFilter === "all" || visit.status === statusFilter), sort), [filtered, statusFilter, sort]);
  const filtersActive = technicianId !== "" || search !== "" || statusFilter !== "all" || sort !== null;
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
          {record.review && <span className="support-metadata">Submitted by Technician: {record.submittedBy ?? "identity unavailable"} · {record.review.status === "reviewed" ? `Reviewed by Admin: ${record.review.reviewedBy}` : "Pending Review"}</span>}
          {record.correctionCount > 0 && <span className="status-badge status-badge--waiting">{record.correctionCount} {record.correctionCount === 1 ? "correction" : "corrections"}</span>}
          <button type="button" className="secondary-command" onClick={() => onCorrect(record)}>{record.supported ? "Review / correct" : "Review"}</button>
        </li>)}</ul>}
    </section>}
    {selectedVisit.status === "closed" ? <section className="report-summary"><h3>Completion</h3><p>Completed {selectedVisit.completion.completedAt ? formatMalaysiaDateTime(selectedVisit.completion.completedAt) : "at an unknown time"} by {selectedVisit.completion.completedBy?.username ?? "the recorded technician"}.</p><p><ReportApprovalChip visit={selectedVisit} /></p><button type="button" onClick={() => onViewReport(selectedVisit)}>View Final Report</button></section> : !supervisor && onDelete ? <div className="inline-actions"><button type="button" disabled={deletingId !== null || acceptedRecordsUnavailable || acceptedRecords.length > 0 || selectedVisit.hasAcceptedRecords === true || selectedVisit.inspectionProgress.accepted > 0} onClick={() => void deleteVisit(selectedVisit)}>Delete</button>{acceptedRecordsUnavailable ? <span className="support-metadata">Accepted records could not be checked.</span> : acceptedRecords.length > 0 || selectedVisit.hasAcceptedRecords === true || selectedVisit.inspectionProgress.accepted > 0 ? <span className="support-metadata">Cannot delete: accepted records exist.</span> : null}</div> : null}
  </section>;

  const canDelete = (visit: ManagerServiceVisit) => visit.hasAcceptedRecords === false && visit.inspectionProgress.accepted === 0;
  const technicianName = (visit: ManagerServiceVisit) => visit.technician?.displayName ?? "Not recorded";
  const rowActions = (visit: ManagerServiceVisit) => visit.status === "closed"
    ? <><ReportApprovalChip visit={visit} /><button type="button" className="secondary-command" onClick={() => onViewReport(visit)}>View Final Report</button><button type="button" onClick={() => void onDownloadReport(visit)}>Download PDF</button></>
    : !supervisor && onDelete ? <><button type="button" disabled={deletingId !== null || !canDelete(visit)} title={canDelete(visit) ? undefined : "Accepted records prevent deletion."} onClick={() => void deleteVisit(visit)}>Delete</button>{canDelete(visit) ? null : <span className="support-metadata">Cannot delete: accepted records exist.</span>}</> : null;
  const visitCard = (visit: ManagerServiceVisit) => <li key={visit.id}><button type="button" className="job-card" onClick={() => onSelect(visit)}><div className="job-card-heading"><div><span className="job-card-label">Customer</span><strong>{visit.customer}</strong></div><span className={`status-badge status-badge--${visit.status === "closed" ? "complete" : "draft"}`}>{visit.status === "closed" ? "Service Completed" : "In Progress"}</span></div><div className="job-service-line"><span className="job-card-label">Site / Service</span><strong>{visit.site}</strong></div><div className="job-card-meta"><span><small>Technician</small><strong>{technicianName(visit)}</strong></span><span><small>Created Date & Time</small><strong>{formatMalaysiaDateTime(visit.createdAt)}</strong></span><span><small>Inspection progress</small><strong>{visit.inspectionProgress.accepted}/{visit.inspectionProgress.required} complete</strong></span></div><span className="job-reference">{visit.reference}</span></button>{rowActions(visit) ? <div className="inline-actions manager-report-actions">{rowActions(visit)}</div> : null}</li>;
  const visitRow = (visit: ManagerServiceVisit) => {
    const age = now - (Date.parse(visit.createdAt) || now);
    const old = visit.status === "open" && age > OLD_OPEN_VISIT_MS;
    return <tr key={visit.id} className="ops-row" onClick={() => onSelect(visit)}>
      <td><button type="button" className="ops-row-open" onClick={(event) => { event.stopPropagation(); onSelect(visit); }}>{visit.customer}<small className="ops-muted">{visit.reference}</small></button></td>
      <td>{technicianName(visit)}</td>
      <td className="ops-num">{visit.inspectionProgress.accepted}/{visit.inspectionProgress.required}</td>
      <td>{formatMalaysiaDateTime(visit.createdAt)}</td>
      <td className={`ops-num${old ? " ops-age--old" : ""}`} data-old={old ? "true" : undefined}>{visit.status === "open" ? formatVisitAge(age) : "—"}{old ? <span className="visually-hidden"> (open for more than 2 days)</span> : null}</td>
      <td onClick={(event) => event.stopPropagation()}><div className="inline-actions ops-row-actions">{rowActions(visit)}</div></td>
    </tr>;
  };
  const chip = (value: StatusFilter, label: string, count: number) => <button type="button" className="ops-chip" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label} <span className="ops-chip-count">{count}</span></button>;
  return <section className="manager-home" aria-labelledby="manager-home-title"><div className="home-toolbar"><div><p className="eyebrow">{supervisor ? "Admin workspace" : "Manager workspace"}</p><h2 id="manager-home-title">Operations</h2><p>{supervisor ? "Read-only service visit visibility." : "Service visit visibility and management."}</p></div><button type="button" className="secondary-command" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    <div className="ops-chips" role="group" aria-label="Service visit status">{chip("open", "Open", openCount)}{chip("closed", "Completed", completedCount)}{chip("all", "Total", filtered.length)}</div>
    <div className="manager-filter-form ops-filters"><label>Search<input type="search" value={search} placeholder="Customer, site or SV number" onChange={(event) => setSearch(event.target.value)} /></label><label>Technician<select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}><option value="">All technicians</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.displayName}</option>)}</select></label><div className="inline-actions"><button type="button" className="secondary-command" disabled={!filtersActive} onClick={() => { setTechnicianId(""); setSearch(""); setStatusFilter("all"); setSort(null); }}>Clear filters</button></div></div>
    <section aria-labelledby="ops-visits-title"><h3 id="ops-visits-title" className="visually-hidden">Service visits</h3>
      {listed.length === 0 ? <p className="empty-state">No service visits match.</p>
        : wide ? <table className="ops-table"><thead><tr><SortHeader label="Customer" sortKey="customer" sort={sort} onSort={toggleSort} /><SortHeader label="Technician" sortKey="technician" sort={sort} onSort={toggleSort} /><th scope="col">Progress</th><SortHeader label="Created" sortKey="created" sort={sort} onSort={toggleSort} /><SortHeader label="Age" sortKey="age" sort={sort} onSort={toggleSort} /><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{listed.map(visitRow)}</tbody></table>
        : <ul className="job-card-list">{listed.map(visitCard)}</ul>}</section>
    <section><h3>Service History</h3><p>Completed visits retain their server-authoritative history and final reports.</p></section>
  </section>;
}
