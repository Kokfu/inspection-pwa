import { useEffect, useId, useRef, useState } from "react";
import { RepairExport } from "./RepairExport";
import type { AuthUser } from "../auth/authApi";
import { ManagerApiError } from "../manager/managerApi";
import { formatClientDateTime } from "../uiPresentation";
import { errorMessage } from "./repairRepository";
import { RepairPhoto } from "./RepairPartView";
import { repairLabel, repairUnitLabel, reviewLabel, type RepairServiceSummary } from "./repairUiRepository";
import { assignRepair, decideEligibility, decidePart, replayReviewOperation, reviewBefore, reviewContext, reviewOperations,
  reviewService, reviewServices, reviewTechnicians, submittedReview, type ReviewContext, type ReviewOperation, type ReviewTechnician, type SubmittedReview } from "./repairReviewRepository";
import type { RepairFinding, RepairHistory, RepairService, RepairWorkOrder } from "./repairTypes";

export const reviewHref = (jobId?: string, systemKey?: string, findingId?: string) => `#/manager-repairs${jobId && systemKey ? `/${encodeURIComponent(jobId)}/${encodeURIComponent(systemKey)}${findingId ? `/${encodeURIComponent(findingId)}` : ""}` : ""}`;
type PhotoState<T> = { value?: T; error?: string };
type Snapshot = { services: RepairServiceSummary[]; service?: RepairService; before: Record<string, PhotoState<Blob | null>>;
  after: Record<string, PhotoState<SubmittedReview>>; technicians: ReviewTechnician[]; operations: ReviewOperation[]; fetchedAt: string };
type Props = { user: AuthUser; isCurrent: () => boolean; jobId?: string; systemKey?: string; findingId?: string; onAuthorityFailure: (error: unknown) => void };
const authorizationFailure = (e: unknown) => /^(AUTH_REQUIRED|FORBIDDEN|IDENTITY_MISMATCH|REPAIR_REVIEW_AUTHORITY_CHANGED|REPAIR_REVIEW_AUTHORITY_REQUIRED)$|REPAIR_HTTP_40[13]/.test(errorMessage(e));
export function RepairReview({ user, isCurrent, jobId, systemKey, findingId, onAuthorityFailure }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const generation = useRef(0), mounted = useRef(false), running = useRef(false);
  const latest = useRef(isCurrent); latest.current = isCurrent;
  const allowed = () => mounted.current && latest.current();
  async function refresh() {
    const ticket = ++generation.current; setSnapshot(undefined); setError("");
    const ctx = await reviewContext(user, () => allowed() && ticket === generation.current);
    const services = await reviewServices(ctx);
    const before: Snapshot["before"] = {}, after: Snapshot["after"] = {};
    let service: RepairService | undefined, technicians: ReviewTechnician[] = [], operations: ReviewOperation[] = [];
    if (jobId && systemKey) {
      [service, operations] = await Promise.all([reviewService(ctx, jobId, systemKey), reviewOperations(ctx, jobId, systemKey)]);
      requireListed(services, service);
      if (findingId && !service.findings.some(f => f.findingId === findingId)) throw new Error("REPAIR_NOT_FOUND");
      if (user.role === "admin") technicians = await reviewTechnicians(ctx);
      // Photo failure is distinct from legitimate historical absence. It blocks
      // this part's review; no cached bytes are displayed as verified downloads.
      const reads = service.findings.flatMap(f => [async () => {
        try { before[f.findingId] = { value: await reviewBefore(ctx, f) }; }
        catch (e) { if (authorizationFailure(e)) throw e; before[f.findingId] = { error: errorMessage(e) }; }
      }, ...f.history.map(h => async () => {
        try { after[h.client_uuid] = { value: await submittedReview(ctx, f, h) }; }
        catch (e) { if (authorizationFailure(e)) throw e; after[h.client_uuid] = { error: errorMessage(e) }; }
      })]);
      // Independent evidence reads in bounded groups keep repeated histories
      // responsive without launching an unbounded set of image downloads.
      for (let i = 0; i < reads.length; i += 4) await Promise.all(reads.slice(i, i + 4).map(read => read()));
    }
    await ctx.assert();
    if (ticket === generation.current && allowed()) setSnapshot({ services, service, before, after, technicians, operations, fetchedAt: new Date().toISOString() });
  }
  async function run(action?: (ctx: ReviewContext, current: Snapshot) => Promise<unknown>) {
    if (running.current || !allowed()) return;
    running.current = true; setBusy(true); setMessage(""); setError("");
    try {
      if (action) {
        if (!snapshot) throw new Error("REPAIR_REFRESH_REQUIRED");
        const ctx = await reviewContext(user, allowed);
        await action(ctx, snapshot); await ctx.assert();
        if (allowed()) setMessage("Exact request confirmed. Refreshing current service authority…");
      }
      await refresh();
    } catch (e) {
      if (allowed()) {
        ++generation.current; setSnapshot(undefined); setMessage(""); setError(errorMessage(e));
        if (authorizationFailure(e)) onAuthorityFailure(new ManagerApiError(errorMessage(e), "authorization"));
      }
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true; let active = true; setBusy(true);
    void refresh().catch(e => { if (active && allowed()) { setSnapshot(undefined); setError(errorMessage(e));
      if (authorizationFailure(e)) onAuthorityFailure(new ManagerApiError(errorMessage(e), "authorization")); } })
      .finally(() => { if (active) setBusy(false); });
    const offline = () => { ++generation.current; setSnapshot(undefined); setMessage(""); setError("REPAIR_REVIEW_OFFLINE"); };
    window.addEventListener("offline", offline);
    return () => { active = false; mounted.current = false; ++generation.current; window.removeEventListener("offline", offline); };
  }, [user.id, user.role, jobId, systemKey, findingId]);
  const current = snapshot?.service, permitted = !!snapshot && !busy && allowed() && navigator.onLine;
  return <section className="repair-page repair-review-page" aria-labelledby="repair-review-title" aria-busy={busy}>
    <header><p className="eyebrow">{user.role === "admin" ? "Manager" : "Admin"} · Online Review</p><h2 id="repair-review-title">Repair Review</h2>
      <p>Review each submitted part independently. ORIGINAL Before and prior repair cycles stay immutable.</p>
      <div className="action-row"><a className="repair-link" href={reviewHref()}>All Repair Services</a>
        <button type="button" disabled={busy || !navigator.onLine} onClick={() => void run()}>Refresh Review Authority</button></div>
    </header>
    {busy ? <p role="status">Loading current repair authority…</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert" className="error-text">Review authority unavailable: {error}. Reconnect, verify sign-in and refresh. Cached data is not current authority; local technician work and photos are retained.</p> : null}
    {snapshot ? <p className="secondary-metadata">Online authority verified {formatClientDateTime(snapshot.fetchedAt)}. The server rechecks every decision and assignment revision.</p> : null}
    {!jobId && snapshot ? <>
      {!snapshot.services.length ? <p>No repair services available.</p> : null}
      {snapshot.services.map(s => <article className="repair-service-card" key={`${s.jobId}/${s.systemKey}`}>
        <h3>{s.customer.displayName}</h3><p>Original Visit: {s.sourceJob.reference} · {s.sourceJob.title}</p><p>{s.systemLabel} · {s.site?.displayName ?? "No site label"}</p>
        <a className="repair-link" href={reviewHref(s.jobId, s.systemKey)}>Review {s.systemLabel} Repairs</a>
      </article>)}
    </> : null}
    {current && snapshot ? <>
      <h3>{repairLabel(current.findings[0]?.original.customer, "Customer unavailable")}</h3>
      <p>Original Visit: {String((current.findings[0]?.original.sourceJob as { reference?: string })?.reference ?? current.jobId)} · {String((current.findings[0]?.original.sourceJob as { title?: string })?.title ?? "")} · {repairLabel(current.findings[0]?.original.system, current.systemKey)}</p>
      <p>{repairLabel(current.findings[0]?.original.site, "No site label")}</p>
      <button type="button" disabled={!permitted} onClick={() => setExportOpen(v => !v)} aria-expanded={exportOpen}> {exportOpen ? "Close Repair Export" : "Open Repair Export"}</button>
      {exportOpen ? <RepairExport key={`${current.jobId}:${current.systemKey}:${snapshot.fetchedAt}`} user={user} jobId={current.jobId} systemKey={current.systemKey}
        isCurrent={() => allowed() && !busy && !!snapshot} onFailure={e => { if (authorizationFailure(e)) onAuthorityFailure(new ManagerApiError(errorMessage(e), "authorization")); }} /> : null}
      {user.role === "admin" ? <section className="repair-group" aria-label="Repair Assignments"><h3>Repair Assignments</h3>
        <p>Assign service repair work to an active Technician. Prior authorship and submissions stay unchanged.</p>
        {current.workOrders.map(w => <Assignment key={`${w.workOrderId}:${w.revision}`} order={w} technicians={snapshot.technicians} enabled={permitted}
          onSave={(id, status) => run((ctx, s) => assignRepair(ctx, s.service!, w, id, status))} />)}
        <Assignment key={`new:${snapshot.fetchedAt}`} technicians={snapshot.technicians}
          enabled={permitted && !snapshot.operations.some(o => o.kind === "assignment" && !o.receipt && o.body.expectedRevision === 0)}
          onSave={(id, status) => run((ctx, s) => assignRepair(ctx, s.service!, undefined, id, status))} />
      </section> : null}
      {current.findings.filter(f => !findingId || f.findingId === findingId).map(f => <article key={f.findingId} className="repair-part" aria-label={`Review part: ${f.original.fieldLabel}`}>
        <h3><a className="repair-link" href={reviewHref(current.jobId, current.systemKey, f.findingId)}>{String(f.original.fieldLabel)}</a></h3>
        <p>{repairUnitLabel(f)} · {String(f.original.sectionLabel)}</p><p>Source eligibility: {f.eligibility === "needs_review" ? "Needs Review" : f.eligibility === "not_required" ? "Not Required" : "Eligible"}</p>
        <a className="repair-link" href={`#/manager-correction/${encodeURIComponent(String(f.original.sourceClientUuid))}`}>View Original Inspection and Corrections</a>
        <div className="repair-comparison"><section className="repair-before"><h4>ORIGINAL Before — Read Only</h4><p>Original result: {f.original.result === "poor" ? "Poor" : "Not Good"}</p><p className="repair-remark">{f.original.remark || "No historical remark recorded."}</p>
          {snapshot.before[f.findingId]?.error ? <PhotoError error={snapshot.before[f.findingId].error!} label="Original Before" />
            : snapshot.before[f.findingId]?.value ? <RepairPhoto blob={snapshot.before[f.findingId].value!} alt="Original accepted Before photo" /> : <p>Historical finding: no original Before photo.</p>}
        </section><section className="repair-after"><h4>Submitted After</h4>
          {!f.history.length ? <p>No submitted repair for this failed part.</p> : f.history.map(h => <section key={h.client_uuid} className="repair-history-item" aria-label={`Repair cycle ${h.cycle_sequence}`}>
            <h5>Cycle {h.cycle_sequence} · {reviewLabel(h.review_state)}</h5><p>Technician #{h.submitted_by_user_id} · Performed {formatClientDateTime(h.performed_at)}</p>
            <p className="repair-remark">{h.remark}</p>
            {snapshot.after[h.client_uuid]?.error ? <PhotoError error={snapshot.after[h.client_uuid].error!} label="Submitted After/history" />
              : snapshot.after[h.client_uuid]?.value ? <><p>Submitted {formatClientDateTime(snapshot.after[h.client_uuid].value!.submittedAt)}</p>
                <RepairPhoto blob={snapshot.after[h.client_uuid].value!.blob} alt={`Immutable After photo for cycle ${h.cycle_sequence}`} />
                <DecisionHistory detail={snapshot.after[h.client_uuid].value!} />
                {h.review_state === "awaiting_approval" ? <PartDecision key={`${h.client_uuid}:${f.sourceRevision}`} enabled={permitted && !snapshot.before[f.findingId]?.error}
                  eligible={f.eligibility === "eligible"} onDecision={(decision, reason) => run(ctx => decidePart(ctx, f, h, snapshot.after[h.client_uuid].value!, decision, reason))} /> : null}
              </> : null}
          </section>)}
        </section></div>
        {f.eligibility === "needs_review" ? <Eligibility key={`${f.findingId}:${f.sourceRevision}:${f.reviewSequence}`} enabled={permitted && !snapshot.before[f.findingId]?.error}
          onDecision={(decision, reason) => run(ctx => decideEligibility(ctx, f, decision, reason))} /> : null}
        <details className="repair-history"><summary>Source Eligibility History ({f.reviews.length})</summary>
          {f.reviews.length ? f.reviews.map((r: any) => <p key={r.id}>Review {r.sequence} · {r.decision === "eligible" ? "Continue Repair" : "Not Required"} · Reviewer #{r.decided_by_user_id} · {formatClientDateTime(r.decided_at)}<br />Reason: {r.reason}<br />Source revision: {r.source_revision}</p>) : <p>No source eligibility decisions recorded.</p>}
        </details>
      </article>)}
      <details className="repair-history"><summary>Saved Review Requests ({snapshot.operations.length})</summary>
        <p>Exact retries retain the saved UUID and content. A receipt confirms that request; refresh confirms current authority. Changed content under the same revision requires resolving the saved request first.</p>
        {snapshot.operations.map(o => <article className="repair-history-item" key={String(o.body.requestId)}><p>{o.kind} · {String(o.body.decision ?? o.body.status)} · {o.receipt ? "Exact receipt confirmed" : "Outcome unconfirmed; exact retry retained"}</p>
          <p>Request: {String(o.body.requestId)} · Target: {o.target}</p><p>{o.body.reason ? `Reason: ${String(o.body.reason)}` : o.kind === "assignment" ? `Technician #${o.body.assignedToUserId}` : "Approval without note"}</p>
          <button type="button" disabled={!permitted || o.kind === "assignment" && user.role !== "admin"} onClick={() => void run(ctx => replayReviewOperation(ctx, o))}>Replay Exact Request</button></article>)}
      </details>
    </> : null}
  </section>;
}
function requireListed(services: RepairServiceSummary[], service: RepairService) {
  if (!services.some(s => s.jobId === service.jobId && s.systemKey === service.systemKey)) throw new Error("REPAIR_NOT_FOUND");
}
function PhotoError({ error, label }: { error: string; label: string }) {
  return <p role="alert" className="error-text">{label}: {/INTEGRITY|INVALID|MISMATCH|SOURCE_CHANGED/.test(error) ? "Integrity failure; review is blocked." : "Download unavailable; review is blocked."} {error}. Refresh to retry.</p>;
}
function DecisionHistory({ detail }: { detail: SubmittedReview }) {
  return <section aria-label="Immutable Decision History"><h5>Decision History</h5>{detail.decisions.length ? detail.decisions.map(d => <p key={d.decisionId}>Decision {d.sequence}: {reviewLabel(d.decision)} · {d.decidedByRole === "admin" ? "Manager" : "Admin"} #{d.decidedByUserId} · {formatClientDateTime(d.decidedAt)}<br />Reason: {d.reason ?? "No approval note"}<br />Request: {d.requestId}</p>) : <p>Awaiting an individual part decision.</p>}</section>;
}
function PartDecision({ enabled, eligible, onDecision }: { enabled: boolean; eligible: boolean; onDecision: (decision: "approved" | "rejected", reason: string | null) => Promise<void> }) {
  const [reason, setReason] = useState(""), [error, setError] = useState(""); const input = useRef<HTMLTextAreaElement>(null), help = useId();
  return <section aria-label="Individual Part Decision"><label>Rejection Reason (Required for Reject)<textarea ref={input} name="rejectionReason" autoComplete="off" maxLength={500} value={reason} disabled={!enabled} aria-invalid={!!error} aria-describedby={help} onChange={e => { setReason(e.target.value); setError(""); }} /></label>
    <p id={help} role={error ? "alert" : undefined}>{error || "Enter 3–500 characters to reject this submitted part."}</p>
    {!eligible ? <p>Approval blocked until source eligibility is current and Eligible.</p> : null}
    <div className="action-row"><button type="button" disabled={!enabled || !eligible} onClick={() => void onDecision("approved", null)}>Approve Part</button>
      <button type="button" disabled={!enabled} onClick={() => { if (reason.trim().length < 3) { setError("Enter a rejection reason (at least 3 characters)."); input.current?.focus(); } else void onDecision("rejected", reason.trim()); }}>Reject Part</button></div>
  </section>;
}
function Eligibility({ enabled, onDecision }: { enabled: boolean; onDecision: (decision: "eligible" | "not_required", reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(""), [error, setError] = useState(""); const input = useRef<HTMLTextAreaElement>(null), help = useId();
  const decide = (decision: "eligible" | "not_required") => { if (reason.trim().length < 3) { setError("Enter a source review reason (at least 3 characters)."); input.current?.focus(); }
    else if (decision !== "not_required" || window.confirm("Mark this original finding Not Required for repair? Original inspection and prior repairs remain unchanged.")) void onDecision(decision, reason.trim()); };
  return <section className="repair-group" aria-label="Source Eligibility Review"><h4>Changed Correction Revision — Source Review Required</h4>
    <p>A correction does not cancel repair eligibility. Review the correction in the original visit before deciding.</p>
    <label>Source Review Reason (Required)<textarea name="sourceReviewReason" autoComplete="off" ref={input} value={reason} maxLength={500} disabled={!enabled} aria-invalid={!!error} aria-describedby={help} onChange={e => { setReason(e.target.value); setError(""); }} /></label>
    <p id={help} role={error ? "alert" : undefined}>{error || "Enter 3–500 characters explaining this source eligibility decision."}</p><div className="action-row"><button type="button" disabled={!enabled} onClick={() => decide("eligible")}>Continue Repair</button>
      <button type="button" disabled={!enabled} onClick={() => decide("not_required")}>Not Required</button></div>
  </section>;
}
function Assignment({ order, technicians, enabled, onSave }: { order?: RepairWorkOrder; technicians: ReviewTechnician[]; enabled: boolean; onSave: (id: number, status: "active" | "revoked") => Promise<void> }) {
  const [technician, setTechnician] = useState(order ? String(order.assignedToUserId) : ""), [error, setError] = useState(""); const select = useRef<HTMLSelectElement>(null), help = useId();
  const save = () => { const id = Number(technician); if (!technicians.some(t => t.id === id)) { setError("Choose an active Technician."); select.current?.focus(); }
    else void onSave(id, "active"); };
  return <section className="repair-service-card" aria-label={order ? `Work Order ${order.workOrderId}` : "New Repair Work Order"}>
    <h4>{order ? `Work Order · ${order.status === "active" ? "Active" : "Revoked"} · Revision ${order.revision}` : "Additional Repair Work Order"}</h4>
    {order ? <p>Assigned Technician #{order.assignedToUserId} · {order.workOrderId}</p> : null}
    <label>Active Technician<select name="assignedTechnician" autoComplete="off" ref={select} value={technician} disabled={!enabled} aria-invalid={!!error} aria-describedby={help} onChange={e => { setTechnician(e.target.value); setError(""); }}>
      <option value="">Choose a Technician</option>{order && !technicians.some(t => t.id === order.assignedToUserId) ? <option value={order.assignedToUserId}>#{order.assignedToUserId} — unavailable for new assignment</option> : null}
      {technicians.map(t => <option key={t.id} value={t.id}>{t.displayName ?? t.username} · #{t.id}</option>)}
    </select></label><p id={help} role={error ? "alert" : undefined}>{error || "Only active Technician accounts can receive repair work."}</p>
    <div className="action-row"><button type="button" disabled={!enabled} onClick={save}>{order ? "Assign / Reassign" : "Assign Repair Work"}</button>
      {order?.status === "active" ? <button type="button" disabled={!enabled || !technicians.some(t => t.id === order.assignedToUserId)} onClick={() => {
        if (window.confirm("Revoke this repair assignment? Saved technician work stays retained; new server writes will be refused.")) void onSave(order.assignedToUserId, "revoked");
      }}>Revoke Assignment</button> : null}</div>
  </section>;
}
