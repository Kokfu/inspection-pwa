import { useEffect, useRef, useState } from "react";
import { reviewerRoleLabel } from "./roleAccess";
import { VisitReference } from "../jobs/VisitReference";
import {
  decideLocationProposal, loadLocationProposal, loadLocationProposals, ManagerApiError,
  type LocationProposal, type LocationProposalDetail, type LocationProposalInbox,
  type LocationProposalPatch, type LocationProposalStatus
} from "./managerApi";
import { validLocationProposalPatch } from "../jobs/locationProposalShape";
import { diffLocationProposalRows, type ProposalRow } from "./locationProposalDiff";
import { useProposalFilters } from "./proposalFilters";
import "./managerLocationProposals.css";

const statuses: LocationProposalStatus[] = ["pending", "approved", "rejected", "withdrawn"];
const statusNames = { pending: "Pending", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" };
const fieldNames: Record<string, string> = { assetReference: "Asset", zoneText: "Zone", alarmZone: "Zone", locationText: "Location", location: "Location", drumType: "Drum type" };
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statusName = (proposal: LocationProposal) => proposal.edited ? "Approved with changes" : statusNames[proposal.status];

function RowText({ row }: { row?: ProposalRow }) {
  return row ? <dl className="proposal-fields">{Object.entries(row).map(([key, value]) => <div key={key}><dt>{fieldNames[key] ?? "Text"}</dt><dd>{value || "Not specified"}</dd></div>)}</dl> : <span>No row</span>;
}
function RowDiff({ before, after, title }: { before: readonly ProposalRow[]; after: readonly ProposalRow[]; title: string }) {
  return <section className="proposal-diff" aria-label={title}>
    <h4>{title}</h4><p>{before.length} rows → {after.length} rows</p>
    <table><thead><tr><th scope="col">Change</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
      <tbody>{diffLocationProposalRows(before, after).map((row, index) => <tr key={index} className={`proposal-diff-${row.kind.toLowerCase()}`}>
        <th scope="row"><span>{row.kind}</span><small>{row.afterIndex !== undefined ? `Row ${row.afterIndex + 1}` : `Previous row ${row.beforeIndex! + 1}`}</small></th>
        <td><span className="proposal-cell-label">Before</span><RowText row={row.before} /></td>
        <td><span className="proposal-cell-label">After</span><RowText row={row.after} /></td>
      </tr>)}</tbody></table>
  </section>;
}
function PatchSummary({ patch, detail }: { patch: LocationProposalPatch; detail: LocationProposalDetail }) {
  return patch.kind === "add-location" ? <dl className="job-facts">
    <div><dt>Location name</dt><dd>{patch.displayName}</dd></div>
    <div><dt>Zone</dt><dd>{patch.newZone ? `${patch.newZone.displayName} (new)` : detail.availableZones.find(zone => zone.key === patch.zoneKey)?.displayName ?? "Zone no longer available"}</dd></div>
  </dl> : <ol className="proposal-original-rows">{patch.rows.map((row, index) => <li key={index}><strong>Row {index + 1}</strong><RowText row={row} /></li>)}</ol>;
}

export function ManagerLocationProposals({ onAuthorityFailure }: { onAuthorityFailure: (error: ManagerApiError) => void }) {
  const [statusFilter, setStatusFilter] = useState<LocationProposalStatus>("pending");
  const [inbox, setInbox] = useState<LocationProposalInbox>();
  const filters = useProposalFilters(inbox?.proposals, statusFilter);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<LocationProposalDetail>();
  const [detailError, setDetailError] = useState("");
  const [revision, setRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LocationProposalPatch>();
  const [newZoneKey, setNewZoneKey] = useState("");
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [invalidApprovalField, setInvalidApprovalField] = useState<"location" | "zone" | "row">();
  const [invalidRowId, setInvalidRowId] = useState<string>();
  const reloadButton = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const locationInput = useRef<HTMLInputElement>(null);
  const zoneInput = useRef<HTMLInputElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const restoreInboxFocus = useRef(false);
  const authorityFailure = useRef(onAuthorityFailure);
  authorityFailure.current = onAuthorityFailure;

  useEffect(() => {
    const controller = new AbortController();
    setInbox(undefined); setListError("");
    void loadLocationProposals(statusFilter, controller.signal).then(result => {
      if (!controller.signal.aborted) setInbox(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      if (reason instanceof ManagerApiError && reason.kind !== "domain") authorityFailure.current(reason);
      else setListError(reason instanceof Error ? reason.message : "Proposals could not be loaded. Try again.");
    });
    return () => controller.abort();
  }, [statusFilter, revision]);

  useEffect(() => {
    setDetail(undefined); setDetailError(""); setEditing(false); setDraft(undefined); setNote(""); setDecisionError("");
    setInvalidApprovalField(undefined); setInvalidRowId(undefined);
    if (!selectedId) return;
    const controller = new AbortController();
    void loadLocationProposal(selectedId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setDetail(result); setDraft(structuredClone(result.payload));
      setNewZoneKey(result.payload.kind === "add-location" && result.payload.newZone ? result.payload.newZone.key : crypto.randomUUID());
    }).catch(reason => {
      if (controller.signal.aborted) return;
      if (reason instanceof ManagerApiError && reason.kind !== "domain") authorityFailure.current(reason);
      else setDetailError(reason instanceof Error ? reason.message : "Proposal could not be loaded. Try again.");
    });
    return () => controller.abort();
  }, [selectedId, detailRevision]);
  useEffect(() => { if (detail) heading.current?.focus(); }, [detail?.id]);
  // A failed decision unmounts the actions; keep the keyboard position on the recovery control.
  useEffect(() => { if (selectedId && !detail && detailError) reloadButton.current?.focus(); }, [detailError, detail, selectedId]);
  useEffect(() => {
    if (!selectedId && restoreInboxFocus.current) {
      restoreInboxFocus.current = false;
      listHeading.current?.focus();
    }
  }, [selectedId]);

  const changed = Boolean(editing && detail && draft && JSON.stringify(draft) !== JSON.stringify(detail.payload));
  useEffect(() => {
    if (!changed && !note.trim()) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, note]);
  /** The server checks the submitted proposal. A reviewer's zone edit can make a zone-stale add-location approvable;
   *  the server still re-checks the latest configuration on approval. */
  const zoneFixable = Boolean(detail && detail.status === "pending" && detail.payload.kind === "add-location"
    && detail.mergeable !== true && /zone/i.test(detail.mergeable.reason));
  const editedZoneUsable = Boolean(detail && draft?.kind === "add-location" && (draft.newZone
    ? !detail.availableZones.some(zone => zone.key === draft.newZone!.key)
    : draft.zoneKey !== null && detail.availableZones.some(zone => zone.key === draft.zoneKey)));
  const canApprove = Boolean(detail && (detail.mergeable === true || (changed && zoneFixable && editedZoneUsable)));
  function leaveDetail() {
    if ((changed || note.trim()) && !window.confirm("Discard your unsaved review changes?")) return false;
    setSelectedId(undefined); setDetail(undefined); setDraft(undefined); setEditing(false); setNote("");
    restoreInboxFocus.current = true; return true;
  }
  function select(id: string) {
    if (id === selectedId) return;
    if (selectedId && !leaveDetail()) return;
    setDetail(undefined); setSelectedId(id); setMessage("");
  }
  async function decide(decision: "approved" | "rejected") {
    if (!detail || deciding || (decision === "approved" && !canApprove)) return;
    setInvalidApprovalField(undefined); setInvalidRowId(undefined);
    if ((decision === "rejected" && note.trim().length < 3) || (note.trim().length > 0 && note.trim().length < 3)) {
      setDecisionError("Enter a note of at least 3 characters. A note is required to reject."); noteInput.current?.focus(); return;
    }
    if (decision === "approved" && draft?.kind === "add-location" && editing && (!draft.displayName.trim() || (draft.newZone && !draft.newZone.displayName.trim()))) {
      const field = !draft.displayName.trim() ? "location" : "zone";
      setInvalidApprovalField(field);
      setDecisionError(field === "location" ? "Enter a location name before approving." : "Enter a zone name before approving.");
      (field === "location" ? locationInput : zoneInput).current?.focus(); return;
    }
    // A bad edit must be fixed in place: a server refusal clears the form, so catch it before sending.
    if (decision === "approved" && editing && draft?.kind === "update-format" && !validLocationProposalPatch(draft, detail.systemKey)) {
      const blank = draft.rows.flatMap((row, index) => (row.locationText ?? "").trim() ? [] : [index])[0];
      if (blank === undefined) { setDecisionError("No field may be too long before approving."); return; }
      const id = `proposal-row-${blank}-locationText`;
      setInvalidApprovalField("row"); setInvalidRowId(id);
      setDecisionError(`Enter a location for row ${blank + 1} before approving.`);
      document.getElementById(id)?.focus(); return;
    }
    if (!window.confirm(decision === "rejected" ? "Reject this proposal with your note?" : changed ? "Approve this proposal with your changes?" : "Approve this proposal?")) return;
    setDeciding(true); setDecisionError("");
    try {
      const confirmed = await decideLocationProposal(detail.id, { requestId: crypto.randomUUID(), decision,
        ...(note.trim() ? { note: note.trim() } : {}), ...(decision === "approved" && changed && draft ? { appliedPatch: draft } : {}) });
      setDetail({ ...detail, ...confirmed, mergeable: { reason: "This proposal has already been decided." } });
      setEditing(false); setDraft(undefined); setNote(""); setMessage(statusName(confirmed)); setRevision(value => value + 1);
    } catch (reason) {
      // A failed write may have raced a decision/configuration change. Require a fresh detail before another attempt.
      setDetail(undefined); setDraft(undefined); setEditing(false);
      setDetailError(reason instanceof Error ? reason.message : "Decision could not be confirmed. Reload the proposal before trying again.");
      if (reason instanceof ManagerApiError && reason.kind !== "domain") authorityFailure.current(reason);
    } finally { setDeciding(false); }
  }

  return <section className={`manager-home manager-location-proposals${selectedId ? " proposal-is-open" : ""}`} aria-labelledby="manager-location-proposals-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-location-proposals-title">Location Proposals</h2><p>Review location and format requests before applying them to future visits.</p></div></div>
    <div className="job-tabs" role="tablist" aria-label="Location proposal status">{statuses.map(value => <button key={value} type="button" role="tab" aria-selected={statusFilter === value} tabIndex={statusFilter === value ? 0 : -1} disabled={deciding}
      onKeyDown={event => { const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; if (offset || event.key === "Home" || event.key === "End") { event.preventDefault(); const index = event.key === "Home" ? 0 : event.key === "End" ? statuses.length - 1 : (statuses.indexOf(value) + offset + statuses.length) % statuses.length; const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[index]; target?.focus(); target?.click(); } }}
      onClick={() => { if (selectedId && !leaveDetail()) return; setStatusFilter(value); setMessage(""); }}>
      {statusNames[value]} ({inbox?.counts[value] ?? "…"})</button>)}</div>
    {filters.bar}{filters.result}
    {message ? <p className="form-message" role="status">{message}</p> : null}
    <div className="proposal-workspace">
      <section className="proposal-inbox" aria-labelledby="proposal-inbox-title"><h3 id="proposal-inbox-title" ref={listHeading} tabIndex={-1}>{statusNames[statusFilter]} requests</h3>
        {listError ? <div className="form-message" role="alert"><p>{listError}</p><button type="button" onClick={() => setRevision(value => value + 1)}>Retry list</button></div> : !inbox ? <div role="status" aria-label="Loading location proposals"><div className="proposal-skeleton">Loading location proposals…</div><div className="proposal-skeleton" aria-hidden="true" /></div> : <>
          {inbox.unreadable.length ? <section className="offline-notice" role="alert"><h4>{inbox.unreadable.length} {inbox.unreadable.length === 1 ? "proposal cannot" : "proposals cannot"} be shown</h4><p>This version cannot read these proposals. They cannot be approved or rejected here. Ask an administrator to check them. Other proposals are not affected.</p><ul>{inbox.unreadable.map((item, index) => <li key={item.id ?? index}>{item.customerDisplayName ?? "Details unavailable"}{item.submittedBy ? ` · Submitted by ${item.submittedBy}` : ""}{item.id ? <small> (reference {item.id.slice(0, 8)})</small> : null}</li>)}</ul></section> : null}
          {!filters.visible?.length && (filters.active || !inbox.unreadable.length) ? <p className="empty-state">{filters.active ? "No requests match this filter." : `No ${statusFilter} location proposals.`}</p> : null}
          <ul className="job-card-list">{filters.visible?.map(proposal => <li key={proposal.id}><button type="button" className="secondary-command proposal-card" aria-pressed={selectedId === proposal.id} disabled={deciding} onClick={() => select(proposal.id)}>
            <strong>{proposal.customerDisplayName}</strong><span>{proposal.systemDisplayName ?? "System name unavailable"}</span><span>{proposal.payload.kind === "add-location" ? `New location: ${proposal.payload.displayName}` : `Update format · ${proposal.payload.rows.length} rows`}</span><span className={`proposal-status proposal-status-${proposal.status}`}>{statusName(proposal)}</span><small>Submitted by {proposal.submittedBy}</small>
          </button></li>)}</ul>
        </>}
      </section>
      <section className="proposal-detail" aria-label="Proposal review">
        {selectedId ? <button type="button" className="secondary-command proposal-back" disabled={deciding} onClick={() => leaveDetail()}>Back to requests</button> : <p className="empty-state">Choose a request to review its changes.</p>}
        {selectedId && !detail ? detailError ? <div className="form-message" role="alert"><p>{detailError}</p><button type="button" ref={reloadButton} onClick={() => setDetailRevision(value => value + 1)}>Reload proposal</button></div> : <p className="proposal-skeleton" role="status">Loading current configuration…</p> : null}
        {detail ? <section className="report-summary" aria-labelledby="location-proposal-detail-title">
          <h3 id="location-proposal-detail-title" tabIndex={-1} ref={heading}>{detail.customerDisplayName}</h3><p>{detail.systemDisplayName ?? "System name unavailable"}</p><span className={`proposal-status proposal-status-${detail.status}`}>{statusName(detail)}</span>
          <dl className="job-facts"><div><dt>Submitted by</dt><dd>{detail.submittedBy}</dd></div><div><dt>Submitted</dt><dd>{date(detail.submittedAt)}</dd></div><div><dt>Visit reference</dt><dd>{detail.jobReference ? <VisitReference job={{ id: detail.jobId, reference: detail.jobReference }} /> : "Visit reference unavailable"}</dd></div></dl>
          <h4>Original proposal</h4><PatchSummary patch={detail.payload} detail={detail} />
          {detail.payload.kind === "update-format" ? <><p>Location: {detail.currentLocation?.displayName ?? "Location no longer available"}</p>{detail.status === "pending" ? <RowDiff title="Current configuration → proposed format" before={detail.currentRows} after={editing && draft?.kind === "update-format" ? draft.rows : detail.payload.rows} /> : null}</> : null}
          {detail.decision ? <><div className="offline-notice" role="status"><p>{statusName(detail)} by {detail.decision.decidedBy} ({reviewerRoleLabel(detail.decision.decidedByRole)}) · {date(detail.decision.decidedAt)}</p>{detail.decision.note ? <p>{detail.decision.note}</p> : null}</div>{detail.decision.appliedPatch ? <section aria-label="Approved changes"><h4>Applied changes</h4>{detail.payload.kind === "update-format" && detail.decision.appliedPatch.kind === "update-format" ? <RowDiff title="Original proposal → approved format" before={detail.payload.rows} after={detail.decision.appliedPatch.rows} /> : <PatchSummary patch={detail.decision.appliedPatch} detail={detail} />}</section> : null}</> : <>
            <p className="offline-notice" role="status">{detail.mergeable === true ? "This proposal can be approved. Approval checks the latest configuration again."
              : canApprove ? "This proposal can be approved with your changes. Approval checks the latest configuration again."
              : `Cannot approve: ${detail.mergeable.reason}${zoneFixable ? " Use Edit before approval to choose or name a zone." : ""}`}</p>
            <button type="button" className="secondary-command" disabled={deciding} onClick={() => { setEditing(value => !value); setDraft(structuredClone(detail.payload)); setDecisionError(""); }}>{editing ? "Discard edits" : "Edit before approval"}</button>
            {editing && draft ? <fieldset className="proposal-editor" disabled={deciding}><legend>Edit approval</legend>{draft.kind === "add-location" ? <>
              <label>Location name<input ref={locationInput} aria-invalid={invalidApprovalField === "location"} aria-describedby={invalidApprovalField === "location" && decisionError ? "proposal-decision-error" : undefined} name="locationName" autoComplete="off" maxLength={300} value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} /></label>
              <label>Zone<select name="zone" value={draft.newZone ? "" : draft.zoneKey ?? ""} onChange={event => setDraft({ ...draft, zoneKey: event.target.value || null, newZone: event.target.value ? null : { key: newZoneKey, displayName: detail.payload.kind === "add-location" ? detail.payload.newZone?.displayName ?? "" : "" } })}>
                <option value="">Create a new zone</option>{draft.zoneKey && !detail.availableZones.some(zone => zone.key === draft.zoneKey) ? <option value={draft.zoneKey}>Zone no longer available</option> : null}{detail.availableZones.map(zone => <option key={zone.key} value={zone.key}>{zone.displayName}</option>)}
              </select></label>
              {draft.newZone ? <label>New zone name<input ref={zoneInput} aria-invalid={invalidApprovalField === "zone"} aria-describedby={invalidApprovalField === "zone" && decisionError ? "proposal-decision-error" : undefined} name="newZoneName" autoComplete="off" maxLength={300} value={draft.newZone.displayName} onChange={event => setDraft({ ...draft, newZone: { ...draft.newZone!, displayName: event.target.value } })} /></label> : null}
            </> : <><p>Edit text or remove rows. At least one row must remain.</p>{draft.rows.map((row, index) => <fieldset key={index}><legend>Row {index + 1}</legend>{Object.entries(row).map(([key, value]) => <label key={key}>{fieldNames[key] ?? "Text"}{key === "drumType" ? <span>{value || "Not specified"}</span> : <input id={`proposal-row-${index}-${key}`} aria-invalid={invalidRowId === `proposal-row-${index}-${key}`} aria-describedby={invalidRowId === `proposal-row-${index}-${key}` && decisionError ? "proposal-decision-error" : undefined} name={`row-${index}-${key}`} autoComplete="off" maxLength={key === "assetReference" ? 200 : key === "zoneText" ? 200 : detail.systemKey === "dry_wet_riser" && key === "locationText" ? 250 : 300} value={value} onChange={event => setDraft({ ...draft, rows: draft.rows.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) })} />}</label>)}<button type="button" className="secondary-command" disabled={draft.rows.length === 1} onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, i) => i !== index) })}>Remove row {index + 1}</button></fieldset>)}</>}</fieldset> : null}
            {changed && draft?.kind === "update-format" && detail.payload.kind === "update-format" ? <RowDiff title="Original proposal → your edits" before={detail.payload.rows} after={draft.rows} /> : null}
            <label>Note (required to reject, optional to approve)<textarea ref={noteInput} name="reviewNote" autoComplete="off" maxLength={500} value={note} disabled={deciding} aria-invalid={Boolean(decisionError) && !invalidApprovalField} aria-describedby={decisionError && !invalidApprovalField ? "proposal-decision-error" : undefined} onChange={event => setNote(event.target.value)} /></label>
            {decisionError ? <p id="proposal-decision-error" className="form-message" role="alert">{decisionError}</p> : null}
            <div className="proposal-actions"><button type="button" disabled={deciding || !canApprove} onClick={() => void decide("approved")}>{deciding ? "Saving…" : changed ? "Approve with changes" : "Approve"}</button><button type="button" className="secondary-command" disabled={deciding} onClick={() => void decide("rejected")}>Reject</button></div>
          </>}
        </section> : null}
      </section>
    </div>
  </section>;
}
