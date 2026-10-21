import { useEffect, useId, useState } from "react";
import type { AuthUser } from "../auth/authApi";
import { VisitRow } from "./VisitRow";
import { canOpenTimelineVisit, filterTimeline, readCustomerTimeline, timelineStatuses, validTimelineDate, type TimelineFilters, type TimelineVisit } from "./customerTimelineData";

export function CustomerTimelineRows({ visits, actor, onOpen }: { visits: TimelineVisit[]; actor: AuthUser; onOpen: (visit: TimelineVisit) => void }) {
  return <div className="customer-timeline__rows">{visits.map(visit => {
    const allowed = canOpenTimelineVisit(actor, visit);
    return <VisitRow key={`${visit.kind}:${visit.id}`} visit={visit} locked={!allowed} onClick={allowed ? () => onOpen(visit) : undefined} />;
  })}</div>;
}

/** Shared by the technician route and the manager Timeline tab (S3b). */
export function CustomerTimeline({ customerId, actor, mode, onOpen, initialStatus = "", onCountChange }: {
  customerId: string; actor: AuthUser; mode: "server" | "offline" | "unavailable";
  onOpen: (visit: TimelineVisit) => void; initialStatus?: string;
  /** Total validated history, independent of the visible filters; unknown during refresh/error. */
  onCountChange?: (count: number | undefined) => void;
}) {
  const controlId = useId();
  const [filters, setFilters] = useState<TimelineFilters>({ kind: "all", status: initialStatus, dateFrom: "", dateTo: "", siteId: "" });
  const [result, setResult] = useState<{ visits: TimelineVisit[]; offline: boolean; cached: boolean }>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { onCountChange?.(result?.visits.length); }, [result, onCountChange]);
  useEffect(() => {
    const retry = () => setRefresh(n => n + 1);
    window.addEventListener("online", retry); window.addEventListener("offline", retry);
    return () => { window.removeEventListener("online", retry); window.removeEventListener("offline", retry); };
  }, []);
  useEffect(() => {
    let active = true;
    setResult(undefined); setError("");
    if (mode === "unavailable") { setError("Verify your session to view customer history."); return; }
    void readCustomerTimeline(customerId, actor, mode, () => active).then(value => { if (active) setResult(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Customer history is unavailable."); });
    return () => { active = false; };
  }, [customerId, actor.id, actor.role, mode, refresh]);
  const invalidDates = Boolean(filters.dateFrom && !validTimelineDate(filters.dateFrom) || filters.dateTo && !validTimelineDate(filters.dateTo)
    || filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
  const visits = invalidDates ? [] : filterTimeline(result?.visits ?? [], filters);
  const sites = new Map((result?.visits ?? []).filter(v => v.siteId).map(v => [v.siteId!, v.siteName ?? "Unnamed site"]));
  return <section className="customer-timeline" aria-label="Customer timeline">
    <h2>Customer history</h2>
    <div className="customer-timeline__filters" role="group" aria-label="Visit type">
      {([ ["all", "All"], ["service", "Services"], ["repair", "Repairs"] ] as const).map(([kind, label]) =>
        <button type="button" key={kind} aria-pressed={filters.kind === kind} onClick={() => setFilters(f => ({ ...f, kind }))}>{label}</button>)}
    </div>
    <div className="customer-timeline__filters">
      <div><label htmlFor={`${controlId}-status`}>Status</label><select id={`${controlId}-status`} name="status" autoComplete="off" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
        <option value="">All statuses</option>{Object.entries(timelineStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
      <label>From date<input type="date" name="dateFrom" autoComplete="off" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} /></label>
      <label>To date<input type="date" name="dateTo" autoComplete="off" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} /></label>
      <div><label htmlFor={`${controlId}-site`}>Site</label><select id={`${controlId}-site`} name="site" autoComplete="off" value={filters.siteId} onChange={e => setFilters(f => ({ ...f, siteId: e.target.value }))}><option value="">All sites</option>
        {[...sites].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></div>
    </div>
    <button type="button" className="secondary-command" onClick={() => setRefresh(n => n + 1)}>Refresh history</button>
    {invalidDates && <p role="alert">Choose a valid date range with the From date on or before the To date.</p>}
    {error ? <p role="alert">{error}</p> : !result ? <p role="status">Loading customer history…</p> : <>
      {result.offline && <p role="status">{result.cached ? "Offline — showing summaries saved on this device. Recent changes may be missing." : "No history saved on this device. Connect once and refresh this customer's history."}</p>}
      {!visits.length && !invalidDates && <p>No visits match these filters.</p>}
      <CustomerTimelineRows visits={visits} actor={actor} onOpen={onOpen} />
    </>}
  </section>;
}
