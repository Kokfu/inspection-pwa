import { useEffect, useMemo, useRef, useState } from "react";
import { reviewerRoleLabel } from "./roleAccess";
import {
  decideSiteProposal, loadSiteProposal, loadSiteProposals, ManagerApiError,
  type SiteProposal, type SiteProposalDecisionInput
} from "./managerApi";
import { useProposalFilters } from "./proposalFilters";
import "./managerSiteProposals.css";

const statuses = ["pending", "approved", "rejected"] as const;
const names = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : "Site requests could not be verified. Try again.";

export function ManagerSiteProposals({ onAuthorityFailure }: { onAuthorityFailure: (error: ManagerApiError) => void }) {
  const [statusFilter, setStatusFilter] = useState<typeof statuses[number]>("pending");
  const [items, setItems] = useState<SiteProposal[]>();
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<SiteProposal>();
  const [detailError, setDetailError] = useState("");
  const [detailRevision, setDetailRevision] = useState(0);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [retry, setRetry] = useState<SiteProposalDecisionInput>();
  const [message, setMessage] = useState("");
  // Keep the exact UUID/body for an uncertain write, including after reopening this detail.
  const attempts = useRef(new Map<string, SiteProposalDecisionInput>());
  const busy = useRef(false);
  const listController = useRef<AbortController | undefined>(undefined);
  const alive = useRef(true);
  const authorityFailure = useRef(onAuthorityFailure);
  authorityFailure.current = onAuthorityFailure;
  const heading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function reportAuthority(reason: unknown) {
    if (reason instanceof ManagerApiError && reason.kind === "authorization") authorityFailure.current(reason);
  }
  useEffect(() => {
    const controller = new AbortController();
    listController.current = controller;
    setItems(undefined); setListError("");
    void loadSiteProposals(controller.signal).then(result => {
      if (!controller.signal.aborted) setItems(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      reportAuthority(reason); setListError(errorMessage(reason));
    });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    setDetail(undefined); setDetailError(""); setNote(""); setNoteError(""); setRetry(undefined);
    if (!selectedId) return;
    const controller = new AbortController();
    void loadSiteProposal(selectedId, controller.signal).then(result => {
      if (!controller.signal.aborted) setDetail(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      reportAuthority(reason); setDetailError(errorMessage(reason));
    });
    return () => controller.abort();
  }, [selectedId, detailRevision]);
  useEffect(() => { if (detail) heading.current?.focus(); }, [detail?.id]);
  useEffect(() => {
    if (!selectedId && restoreFocus.current) { restoreFocus.current = false; listHeading.current?.focus(); }
  }, [selectedId]);
  useEffect(() => {
    if (!note.trim()) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [note]);
  function leave(restoreListFocus = true) {
    if (note.trim() && !window.confirm("Discard your unsaved review note?")) return false;
    setSelectedId(undefined); setDetail(undefined); setNote(""); setMessage(""); restoreFocus.current = restoreListFocus;
    return true;
  }
  async function submit(input: SiteProposalDecisionInput) {
    if (!selectedId || busy.current) return;
    listController.current?.abort();
    busy.current = true; setDeciding(true); setDetail(undefined); setDetailError(""); setMessage("");
    setItems(undefined); setListError("");
    try {
      await decideSiteProposal(selectedId, input);
      // Never turn a successful POST alone into a decided UI. Re-read both server views.
      const [confirmed, refreshed] = await Promise.all([loadSiteProposal(selectedId), loadSiteProposals()]);
      if (!alive.current) return;
      const listed = refreshed.find(item => item.id === selectedId);
      if (confirmed.status !== input.decision || confirmed.decision?.requestId !== input.requestId
        || confirmed.decision.note !== (input.note ?? null) || listed?.status !== confirmed.status
        || listed.decision?.requestId !== input.requestId) {
        throw new ManagerApiError("The server has not confirmed this decision. Retry to verify it.", "unavailable");
      }
      setDetail(confirmed); setItems(refreshed); setNote(""); setRetry(undefined);
      setMessage(`Server confirmed: ${names[confirmed.status]}.`);
    } catch (reason) {
      if (!alive.current) return;
      reportAuthority(reason); setDetailError(errorMessage(reason));
      setRetry(reason instanceof ManagerApiError && reason.kind === "domain" ? undefined : input);
      setRevision(value => value + 1);
    } finally {
      busy.current = false;
      if (alive.current) setDeciding(false);
    }
  }
  function decide(decision: "approved" | "rejected") {
    if (!detail || detail.status !== "pending" || busy.current) return;
    const trimmed = note.trim();
    if ((decision === "rejected" && trimmed.length < 3) || (trimmed.length > 0 && trimmed.length < 3) || trimmed.length > 500) {
      setNoteError("Enter a note of 3–500 characters. A note is required for Do not add."); noteInput.current?.focus(); return;
    }
    if (!window.confirm(decision === "approved" ? "Add this site to the customer's sites exactly as submitted?" : "Do not add this site? The technician's visit will stay unchanged.")) return;
    const key = JSON.stringify([detail.id, decision, trimmed]);
    const input = attempts.current.get(key) ?? { requestId: crypto.randomUUID(), decision, ...(trimmed ? { note: trimmed } : {}) };
    attempts.current.set(key, input); setNoteError(""); void submit(input);
  }
  const tabItems = useMemo(() => items?.filter(item => item.status === statusFilter), [items, statusFilter]);
  const filters = useProposalFilters(tabItems, statusFilter);
  const sorted = filters.visible?.slice().sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id));
  return <section className={`manager-home manager-site-proposals${selectedId ? " proposal-is-open" : ""}`} aria-labelledby="site-requests-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager workspace</p><h2 id="site-requests-title">Site Requests</h2>
      <p>Review sites proposed by technicians. Approval adds exactly the submitted name and address to the customer's sites.</p>
      <p>Rejecting a request does not change the technician's visit.</p></div></div>
    <div className="job-tabs" role="tablist" aria-label="Site request status">{statuses.map(value => <button key={value} type="button" role="tab" aria-selected={statusFilter === value} tabIndex={statusFilter === value ? 0 : -1} disabled={deciding}
      onKeyDown={event => { const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; if (offset || event.key === "Home" || event.key === "End") { event.preventDefault(); const index = event.key === "Home" ? 0 : event.key === "End" ? statuses.length - 1 : (statuses.indexOf(value) + offset + statuses.length) % statuses.length; const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[index]; target?.focus(); target?.click(); } }}
      onClick={event => {
        if (selectedId && !leave(false)) {
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
          return;
        }
        setStatusFilter(value); setMessage(""); event.currentTarget.focus();
      }}>
      {names[value]} ({items?.filter(item => item.status === value).length ?? "…"})</button>)}</div>
    {filters.bar}{filters.result}
    {message ? <p className="form-message" role="status">{message}</p> : null}
    <div className="proposal-workspace">
      <section className="proposal-inbox" aria-labelledby="site-inbox-title"><h3 id="site-inbox-title" tabIndex={-1} ref={listHeading}>Requests{items ? ` · Pending: ${items.filter(item => item.status === "pending").length}` : ""}</h3>
        {listError ? <div role="alert" className="form-message"><p>{listError}</p><button type="button" onClick={() => setRevision(value => value + 1)}>Retry list</button></div>
          : !sorted ? <div role="status" className="proposal-skeleton">Loading site requests…</div>
          : !sorted.length ? <p className="empty-state">{filters.active ? "No requests match this filter." : `No ${statusFilter} site requests.`}</p>
          : <ul className="job-card-list">{sorted.map(item => <li key={item.id}><button type="button" className="secondary-command proposal-card" aria-pressed={selectedId === item.id} disabled={deciding}
            onClick={() => { if (item.id === selectedId || (selectedId && !leave())) return; setSelectedId(item.id); setMessage(""); }}>
            <strong>{item.customerDisplayName}</strong><span>{item.proposedDisplayName}</span><span>{item.proposedAddress ?? "Address not specified"}</span>
            <span className={`proposal-status proposal-status-${item.status}`}>{names[item.status]}</span>
            {item.jobReference ? <small>Visit: {item.jobReference}</small> : null}
            <small>Submitted by {item.submittedBy}</small><small>Submitted at {date(item.submittedAt)}</small>
          </button></li>)}</ul>}
      </section>
      <section className="proposal-detail" aria-label="Site request review">
        {selectedId ? <button type="button" className="secondary-command proposal-back" disabled={deciding} onClick={() => leave()}>Back to requests</button> : <p className="empty-state">Choose a site request to review.</p>}
        {selectedId && !detail ? detailError ? <div role="alert" className="form-message"><p>{detailError}</p>
          {retry ? <button type="button" disabled={deciding} onClick={() => void submit(retry)}>Retry decision</button> : null}
          <button type="button" disabled={deciding} onClick={() => setDetailRevision(value => value + 1)}>Reload proposal</button>
        </div> : <p className="proposal-skeleton" role="status">{deciding ? "Verifying decision with the server…" : "Loading site request…"}</p> : null}
        {detail ? <section className="report-summary" aria-labelledby="site-detail-title">
          <h3 id="site-detail-title" ref={heading} tabIndex={-1}>{detail.customerDisplayName}</h3>
          <span className={`proposal-status proposal-status-${detail.status}`}>{names[detail.status]}</span>
          <dl className="job-facts"><div><dt>Proposed site name</dt><dd>{detail.proposedDisplayName}</dd></div><div><dt>Proposed address</dt><dd>{detail.proposedAddress ?? "Address not specified"}</dd></div>
            <div><dt>Submitted by</dt><dd>{detail.submittedBy}</dd></div><div><dt>Submitted at</dt><dd>{date(detail.submittedAt)}</dd></div></dl>
          {detail.decision ? <div className="offline-notice" role="status"><p>{names[detail.status]} by {detail.decision.decidedBy} ({reviewerRoleLabel(detail.decision.decidedByRole)}) · {date(detail.decision.decidedAt)}</p>{detail.decision.note ? <p>{detail.decision.note}</p> : null}</div>
            : <><label>Decision note (optional for Add; required for Do not add)
              <textarea ref={noteInput} name="siteDecisionNote" autoComplete="off" rows={4} maxLength={500} value={note} aria-invalid={Boolean(noteError)} aria-describedby="site-note-help site-note-error" onChange={event => { setNote(event.target.value); setNoteError(""); }} />
            </label><p id="site-note-help">Use 3–500 characters if adding a note.</p><p id="site-note-error" role={noteError ? "alert" : undefined}>{noteError}</p>
              <div className="proposal-actions"><button type="button" onClick={() => decide("approved")}>Add to customer's sites</button><button type="button" className="secondary-command" onClick={() => decide("rejected")}>Do not add</button></div></>}
        </section> : null}
      </section>
    </div>
  </section>;
}
