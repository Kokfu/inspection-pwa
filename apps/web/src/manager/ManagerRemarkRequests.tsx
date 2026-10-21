import { useEffect, useRef, useState } from "react";
import { VisitReference } from "../jobs/VisitReference";
import { sectionDisplayLabel, systemDisplayName } from "../inspectionControls/remarkSectionLabels";
import { normaliseSectionRemarkWording } from "../inspectionControls/sectionRemarkText";
import type { RemarkRequest } from "../inspectionControls/remarkRequests";
import { ManagerApiError } from "./managerApi";
import {
  decideRemarkRequest, deactivateApprovedRemark, deactivateLegacyRemark, loadRemarkRequest, loadRemarkRequests, loadSectionRemarks,
  RemarkRequestApiError, type SectionRemarkLists
} from "./remarkRequestsApi";
import { reviewerRoleLabel } from "./roleAccess";
import "./managerLocationProposals.css";
import "./managerRemarkRequests.css";

type Tab = "pending" | "decided" | "inuse";
const tabs: Array<[Tab, string]> = [["pending", "Pending"], ["decided", "Decided"], ["inuse", "Remarks in use"]];
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statusName = (request: RemarkRequest) =>
  request.status === "approved" ? (request.decision?.approvedWording && request.decision.approvedWording !== request.wording ? "Approved with edited wording" : "Approved")
    : request.status === "rejected" ? "Rejected" : "Pending";

/** A decision that fails without a definite domain answer may still have been committed: the page must re-read before another attempt. */
const needsReread = (reason: unknown) => !(reason instanceof RemarkRequestApiError) || reason.kind !== "domain"
  || reason.code === "REMARK_REQUEST_ALREADY_DECIDED" || reason.code === "REMARK_DECISION_CONFLICT" || reason.code === "REMARK_REQUEST_NOT_FOUND";

/**
 * R3: Admin (code role supervisor) and Manager (code role admin) review of technician remark requests, plus the list of
 * remarks in use. Approving offers the wording in that one service + section for every customer; the server is the authority
 * on duplicates and on the terminal decision.
 */
export function ManagerRemarkRequests({ onAuthorityFailure }: { onAuthorityFailure: (error: ManagerApiError) => void }) {
  const [tab, setTab] = useState<Tab>("pending");
  const [list, setList] = useState<RemarkRequest[]>();
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<RemarkRequest>();
  const [detailError, setDetailError] = useState("");
  const [detailRevision, setDetailRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editedWording, setEditedWording] = useState("");
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [message, setMessage] = useState("");
  const [inUse, setInUse] = useState<SectionRemarkLists>();
  const [inUseError, setInUseError] = useState("");
  const [inUseRevision, setInUseRevision] = useState(0);
  const [busyId, setBusyId] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const wordingInput = useRef<HTMLTextAreaElement>(null);
  const restoreListFocus = useRef(false);
  const authorityFailure = useRef(onAuthorityFailure);
  authorityFailure.current = onAuthorityFailure;
  const fail = (reason: unknown, fallback: string, show: (text: string) => void) => {
    if (reason instanceof ManagerApiError && reason.kind === "authorization") authorityFailure.current(reason);
    else show(reason instanceof Error ? reason.message : fallback);
  };

  useEffect(() => {
    if (tab === "inuse") return;
    const controller = new AbortController();
    setList(undefined); setListError("");
    void loadRemarkRequests(tab, controller.signal).then((result) => { if (!controller.signal.aborted) setList(result); })
      .catch((reason) => { if (!controller.signal.aborted) fail(reason, "Remark requests could not be loaded. Try again.", setListError); });
    return () => controller.abort();
  }, [tab, revision]);

  useEffect(() => {
    if (tab !== "inuse") return;
    const controller = new AbortController();
    setInUse(undefined); setInUseError("");
    void loadSectionRemarks(controller.signal).then((result) => { if (!controller.signal.aborted) setInUse(result); })
      .catch((reason) => { if (!controller.signal.aborted) fail(reason, "Remarks in use could not be loaded. Try again.", setInUseError); });
    return () => controller.abort();
  }, [tab, inUseRevision]);

  useEffect(() => {
    setDetail(undefined); setDetailError(""); setEditing(false); setEditedWording(""); setNote(""); setDecisionError("");
    if (!selectedId) return;
    const controller = new AbortController();
    void loadRemarkRequest(selectedId, controller.signal).then((result) => { if (!controller.signal.aborted) { setDetail(result); setEditedWording(result.wording); } })
      .catch((reason) => { if (!controller.signal.aborted) fail(reason, "The request could not be loaded. Try again.", setDetailError); });
    return () => controller.abort();
  }, [selectedId, detailRevision]);
  useEffect(() => { if (detail) heading.current?.focus(); }, [detail?.id]);
  useEffect(() => {
    if (!selectedId && restoreListFocus.current) { restoreListFocus.current = false; listHeading.current?.focus(); }
  }, [selectedId]);

  const dirty = Boolean(detail && ((editing && editedWording.trim() !== detail.wording) || note.trim()));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function leaveDetail() {
    if (dirty && !window.confirm("Discard your unsaved review changes?")) return false;
    setSelectedId(undefined); setDetail(undefined); setEditing(false); setNote("");
    restoreListFocus.current = true; return true;
  }
  function select(id: string) {
    if (id === selectedId) return;
    if (selectedId && !leaveDetail()) return;
    setSelectedId(id); setMessage("");
  }
  function chooseTab(next: Tab) {
    if (next === tab) return;
    if (selectedId && !leaveDetail()) return;
    setTab(next); setMessage("");
  }

  async function decide(decision: "approved" | "rejected") {
    if (!detail || deciding || detail.status !== "pending") return;
    setDecisionError("");
    const trimmed = note.trim();
    if ((decision === "rejected" && trimmed.length < 3) || (trimmed.length > 0 && trimmed.length < 3)) {
      setDecisionError("Enter a note of at least 3 characters. A note is required to reject."); noteInput.current?.focus(); return;
    }
    let approvedWording: string | undefined;
    if (decision === "approved" && editing) {
      const text = normaliseSectionRemarkWording(editedWording);
      if (!text.ok) { setDecisionError(text.message); wordingInput.current?.focus(); return; }
      if (text.wording !== detail.wording) approvedWording = text.wording;
    }
    const where = `${sectionDisplayLabel(detail.sectionKey, detail.systemKey)} (${systemDisplayName(detail.systemKey)})`;
    const question = decision === "rejected" ? "Reject this request with your note?"
      : approvedWording ? `Approve the edited wording for every customer in ${where}?` : `Approve this remark for every customer in ${where}?`;
    if (!window.confirm(question)) return;
    setDeciding(true);
    try {
      const confirmed = await decideRemarkRequest(detail.id, decision === "approved"
        ? { decision, ...(approvedWording ? { approvedWording } : {}), ...(trimmed ? { note: trimmed } : {}) }
        : { decision, note: trimmed });
      setDetail(confirmed); setEditing(false); setNote(""); setMessage(`${statusName(confirmed)}.`); setRevision((value) => value + 1);
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind === "authorization") authorityFailure.current(reason);
      else {
        const text = reason instanceof Error ? reason.message : "The decision could not be confirmed.";
        // The decision is terminal on the server: re-read to learn whether it was committed. A refusal that kept the request pending leaves the form as it was.
        if (needsReread(reason)) { setMessage(`${text} The request was reloaded to show its current state.`); setDetailRevision((value) => value + 1); setRevision((value) => value + 1); }
        else setDecisionError(text);
      }
    } finally { setDeciding(false); }
  }

  async function deactivate(kind: "approved" | "legacy", id: string, wording: string) {
    if (busyId) return;
    if (!window.confirm(`Deactivate "${wording}"? It stops being offered in new visits. Visits that already contain this text are not changed.`)) return;
    setBusyId(id); setInUseError(""); setMessage("");
    try {
      await (kind === "approved" ? deactivateApprovedRemark(id) : deactivateLegacyRemark(id));
      setMessage("Remark deactivated."); setInUseRevision((value) => value + 1);
    } catch (reason) { fail(reason, "The remark could not be deactivated.", setInUseError); }
    finally { setBusyId(undefined); }
  }

  const approvedBySection = inUse ? Object.entries(inUse.approvedRemarks.reduce<Record<string, typeof inUse.approvedRemarks>>((groups, item) => {
    const key = `${item.systemKey}|${item.sectionKey}`; (groups[key] ??= []).push(item); return groups;
  }, {})).sort(([a], [b]) => sectionDisplayLabel(a.split("|")[1]!, a.split("|")[0]).localeCompare(sectionDisplayLabel(b.split("|")[1]!, b.split("|")[0]))) : [];

  return <section className={`manager-home page-stack manager-location-proposals manager-remark-requests${selectedId && tab !== "inuse" ? " proposal-is-open" : ""}`} aria-labelledby="manager-remark-requests-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-remark-requests-title">Remark Requests</h2>
      <p>Technicians ask for a typed remark to be offered in one row. Approving it offers the wording in that row for every customer.</p></div></div>
    <div className="job-tabs" role="tablist" aria-label="Remark request views">{tabs.map(([value, name]) => <button key={value} type="button" role="tab" aria-selected={tab === value}
      tabIndex={tab === value ? 0 : -1} disabled={deciding} onClick={() => chooseTab(value)}>{name}</button>)}</div>
    {message ? <p className="form-message" role="status">{message}</p> : null}

    {tab === "inuse" ? <div className="remark-in-use">
      {inUseError ? <div className="form-message" role="alert"><p>{inUseError}</p><button type="button" onClick={() => setInUseRevision((value) => value + 1)}>Retry</button></div> : null}
      {!inUse && !inUseError ? <p className="proposal-skeleton" role="status">Loading remarks in use…</p> : null}
      {inUse ? <>
        <section aria-labelledby="approved-remarks-title"><h3 id="approved-remarks-title" tabIndex={-1}>Approved section remarks</h3>
          <p className="remark-in-use-note">Offered in one service row for every customer.</p>
          {approvedBySection.length === 0 ? <p className="empty-state">No approved section remarks yet.</p> : approvedBySection.map(([key, items]) =>
            <div key={key} className="remark-in-use-group"><h4>{systemDisplayName(items[0]!.systemKey)} · {sectionDisplayLabel(items[0]!.sectionKey, items[0]!.systemKey)}</h4>
              <ul className="remark-in-use-list">{items.map((item) => <li key={item.id} className="remark-in-use-item">
                <span className="remark-in-use-wording">{item.wording}</span>
                <span className={`proposal-status ${item.active ? "proposal-status-approved" : ""}`}>{item.active ? "Active" : "Deactivated"}</span>
                {item.active ? <button type="button" className="secondary-command" disabled={busyId === item.id} aria-label={`Deactivate ${item.wording}`}
                  onClick={() => void deactivate("approved", item.id, item.wording)}>Deactivate</button> : null}
              </li>)}</ul></div>)}
        </section>
        <section aria-labelledby="legacy-remarks-title"><h3 id="legacy-remarks-title" tabIndex={-1}>Older remarks added for one customer</h3>
          <p className="remark-in-use-note">Added by technicians before approval existed. Each is offered only to its own customer.</p>
          {inUse.legacyRemarks.length === 0 ? <p className="empty-state">No customer remarks.</p>
            : <ul className="remark-in-use-list">{inUse.legacyRemarks.map((item) => <li key={item.id} className="remark-in-use-item">
              <span className="remark-in-use-wording">{item.wording}</span>
              <small>{item.customerDisplayName} · {systemDisplayName(item.systemKey)} · {sectionDisplayLabel(item.sectionKey, item.systemKey)}</small>
              <span className={`proposal-status ${item.active ? "proposal-status-approved" : ""}`}>{item.active ? "Active" : "Deactivated"}</span>
              {item.active ? <button type="button" className="secondary-command" disabled={busyId === item.id} aria-label={`Deactivate customer remark ${item.wording}`}
                onClick={() => void deactivate("legacy", item.id, item.wording)}>Deactivate</button> : null}
            </li>)}</ul>}
        </section>
      </> : null}
    </div> : <div className="proposal-workspace">
      <section className="proposal-inbox" aria-labelledby="remark-inbox-title"><h3 id="remark-inbox-title" ref={listHeading} tabIndex={-1}>{tab === "pending" ? "Pending requests" : "Decided requests"}</h3>
        {listError ? <div className="form-message" role="alert"><p>{listError}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>Retry list</button></div>
          : !list ? <div role="status" aria-label="Loading remark requests"><div className="proposal-skeleton">Loading remark requests…</div></div> : <>
            {list.length === 0 ? <p className="empty-state">{tab === "pending" ? "No remark requests are waiting." : "No decided remark requests."}</p> : null}
            <ul className="job-card-list">{list.map((item) => <li key={item.id}><button type="button" className="secondary-command proposal-card" aria-pressed={selectedId === item.id} disabled={deciding} onClick={() => select(item.id)}>
              <strong>{item.wording}</strong><span>{systemDisplayName(item.systemKey)} · {sectionDisplayLabel(item.sectionKey, item.systemKey)}</span>
              <span>{item.customerDisplayName}</span>
              <span className={`proposal-status proposal-status-${item.status}`}>{statusName(item)}</span>
              <small>{item.requestedBy} · {date(item.createdAt)}</small>
            </button></li>)}</ul></>}
      </section>
      <section className="proposal-detail" aria-label="Remark request review">
        {selectedId ? <button type="button" className="secondary-command proposal-back" disabled={deciding} onClick={() => leaveDetail()}>Back to requests</button> : <p className="empty-state">Choose a request to review it.</p>}
        {selectedId && !detail ? detailError ? <div className="form-message" role="alert"><p>{detailError}</p><button type="button" onClick={() => setDetailRevision((value) => value + 1)}>Reload request</button></div> : <p className="proposal-skeleton" role="status">Loading request…</p> : null}
        {detail ? <section className="report-summary" aria-labelledby="remark-request-detail-title">
          <h3 id="remark-request-detail-title" tabIndex={-1} ref={heading}>{detail.wording}</h3>
          <span className={`proposal-status proposal-status-${detail.status}`}>{statusName(detail)}</span>
          <dl className="job-facts">
            <div><dt>Service</dt><dd>{systemDisplayName(detail.systemKey)}</dd></div>
            <div><dt>Section</dt><dd>{sectionDisplayLabel(detail.sectionKey, detail.systemKey)}</dd></div>
            <div><dt>Technician</dt><dd>{detail.requestedBy}</dd></div>
            <div><dt>Customer</dt><dd>{detail.customerDisplayName}</dd></div>
            <div><dt>Visit</dt><dd>{detail.jobReference && detail.jobId ? <VisitReference job={{ id: detail.jobId, reference: detail.jobReference }} /> : "Not linked to a visit"}</dd></div>
            <div><dt>Requested</dt><dd>{date(detail.createdAt)}</dd></div>
          </dl>
          {detail.decision ? <div className="offline-notice" role="status">
            <p>{statusName(detail)} by {detail.decision.reviewer} ({reviewerRoleLabel(detail.decision.reviewerRole)}) · {date(detail.decision.createdAt)}</p>
            {detail.decision.approvedWording ? <p>Offered as: {detail.decision.approvedWording}</p> : null}
            {detail.decision.note ? <p>{detail.decision.note}</p> : null}
          </div> : <>
            <p className="offline-notice" role="status">Approving offers this wording in {sectionDisplayLabel(detail.sectionKey, detail.systemKey)} for every customer. The technician's visit keeps the text either way.</p>
            {editing ? <label>Approved wording<textarea ref={wordingInput} name="approvedWording" rows={3} maxLength={300} value={editedWording} disabled={deciding}
              aria-invalid={Boolean(decisionError) && !normaliseSectionRemarkWording(editedWording).ok} aria-describedby={decisionError ? "remark-decision-error" : undefined}
              onChange={(event) => { setEditedWording(event.target.value); setDecisionError(""); }} /></label> : null}
            <label>Note (required to reject, optional to approve)<textarea ref={noteInput} name="reviewNote" autoComplete="off" maxLength={500} value={note} disabled={deciding}
              aria-invalid={Boolean(decisionError) && normaliseSectionRemarkWording(editedWording).ok} aria-describedby={decisionError ? "remark-decision-error" : undefined}
              onChange={(event) => { setNote(event.target.value); setDecisionError(""); }} /></label>
            {decisionError ? <p id="remark-decision-error" className="form-message" role="alert">{decisionError}</p> : null}
            <div className="proposal-actions">
              <button type="button" disabled={deciding} onClick={() => void decide("approved")}>{deciding ? "Saving…" : editing ? "Approve with edited wording" : "Approve"}</button>
              <button type="button" className="secondary-command" disabled={deciding} onClick={() => { setEditing((value) => !value); setEditedWording(detail.wording); setDecisionError(""); }}>{editing ? "Cancel edit" : "Edit wording and approve"}</button>
              <button type="button" className="secondary-command" disabled={deciding} onClick={() => void decide("rejected")}>Reject</button>
            </div>
          </>}
        </section> : null}
      </section>
    </div>}
  </section>;
}
