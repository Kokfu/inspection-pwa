import { useEffect, useId, useRef, useState } from "react";
import type { AuthUser } from "../auth/authApi";
import { formatClientDateTime } from "../uiPresentation";
import { errorMessage } from "./repairRepository";
import { repairUnitLabel } from "./repairUiRepository";
import { reviewContext, reviewService, submittedReview, type ReviewContext } from "./repairReviewRepository";
import { exportHistory, exportPdf, exportPreview, replayExport, savedExports, saveExportRequest, type ExportBody, type ExportOperation, type ExportSelection, type IssuedExport } from "./repairExportRepository";
import type { RepairFinding } from "./repairTypes";
type Choice = { finding: RepairFinding; uuid: string; cycle: number; selection: ExportSelection };
export function RepairExport({ user, jobId, systemKey, isCurrent, onFailure }: { user: AuthUser; jobId: string; systemKey: string; isCurrent: () => boolean; onFailure: (e: unknown) => void }) {
  const [choices, setChoices] = useState<Choice[]>([]), [excluded, setExcluded] = useState(0), [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<IssuedExport[]>([]), [ops, setOps] = useState<ExportOperation[]>([]), [preview, setPreview] = useState<{ html: string; body: ExportBody }>();
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState("");
  const mounted = useRef(false), generation = useRef(0), running = useRef(false), first = useRef<HTMLInputElement>(null), help = useId();
  const allowed = () => mounted.current && isCurrent() && navigator.onLine;
  const invalidate = () => { ++generation.current; setReady(false); setChoices([]); setSelected([]); setPreview(undefined); setHistory([]); setOps([]); };
  async function refresh(ctx: ReviewContext) {
    const s = await reviewService(ctx, jobId, systemKey), candidates: Choice[] = []; let outside = 0;
    for (const f of s.findings) for (const h of f.history) {
      if (h.review_state !== "approved" || f.eligibility !== "eligible") { outside++; continue; }
      const d = await submittedReview(ctx, f, h), a = d.decisions.at(-1)!;
      candidates.push({ finding: f, uuid: h.client_uuid, cycle: h.cycle_sequence,
        selection: { clientUuid: h.client_uuid, approvalSequence: a.sequence, sourceRevision: f.sourceRevision, reviewSequence: f.reviewSequence } });
    }
    const [issued, operations] = await Promise.all([exportHistory(ctx, jobId, systemKey), savedExports(ctx, jobId, systemKey)]);
    await ctx.assert(); setChoices(candidates); setExcluded(outside); setHistory(issued); setOps(operations); setReady(true);
  }
  async function run(action?: (ctx: ReviewContext) => Promise<void>) {
    if (running.current || !allowed()) return;
    running.current = true; setBusy(true); setError(""); const ticket = generation.current;
    try {
      const ctx = await reviewContext(user, () => allowed() && ticket === generation.current);
      if (action) await action(ctx); else await refresh(ctx);
      await ctx.assert();
    } catch (e) { if (mounted.current && isCurrent() && ticket === generation.current) { invalidate(); setError(errorMessage(e)); onFailure(e); } }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true; let active = true; const ticket = generation.current; setBusy(true);
    void reviewContext(user, () => active && allowed() && ticket === generation.current).then(refresh).catch(e => {
      if (active && allowed() && ticket === generation.current) { invalidate(); setError(errorMessage(e)); onFailure(e); }
    }).finally(() => { if (active) setBusy(false); });
    const offline = () => { invalidate(); setError("Issuance requires a current online session. Refresh after reconnecting."); };
    window.addEventListener("offline", offline);
    return () => { active = false; mounted.current = false; ++generation.current; window.removeEventListener("offline", offline); };
  }, [user.id, user.role, jobId, systemKey]);
  const enabled = ready && !busy && navigator.onLine && isCurrent();
  const download = async (ctx: ReviewContext, r: IssuedExport) => {
    const blob = await exportPdf(ctx, r); await ctx.assert(); const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `${r.number.replaceAll("/", "-")}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return <section className="repair-group repair-export" aria-labelledby={`${help}-title`} aria-busy={busy}>
    <h3 id={`${help}-title`}>Repair Report / PDF</h3><p>Select each approved cycle explicitly, including older cycles of the same finding. Before always means the ORIGINAL accepted inspection.</p>
    <button type="button" disabled={busy || !navigator.onLine} onClick={() => { invalidate(); void run(); }}>Refresh Export Authority</button>
    {busy ? <p role="status">Checking current export authority…</p> : null}
    {error ? <p id={help} role="alert">{error} Refresh authority to retry; saved export requests remain retained.</p> : <p id={help}>Choose at least one approved cycle, then preview before issuing.</p>}
    {ready ? <><p>{excluded} pending, rejected, withdrawn or source-ineligible cycles outside the selectable subset.</p>
      {!choices.length ? <p>No approved eligible cycles available.</p> : <fieldset aria-describedby={help}><legend>Approved Cycles</legend>{choices.map((c, i) => <label className="repair-export-choice" key={c.uuid}>
        <input ref={i === 0 ? first : undefined} type="checkbox" name="approvedRepairCycle" autoComplete="off" value={c.uuid} checked={selected.includes(c.uuid)} disabled={!enabled}
          onChange={e => { setPreview(undefined); setSelected(v => e.target.checked ? [...v, c.uuid] : v.filter(id => id !== c.uuid)); setError(""); }} />
        <span>{String(c.finding.original.fieldLabel)} · {repairUnitLabel(c.finding)} · {String(c.finding.original.sectionLabel)} · Cycle {c.cycle}<br />{c.uuid}</span>
      </label>)}</fieldset>}
      <div className="action-row"><button type="button" disabled={!enabled || !choices.length} onClick={() => {
        if (!selected.length) { setError("Select at least one approved cycle."); first.current?.focus(); return; }
        const body: ExportBody = { requestId: crypto.randomUUID(), jobId, systemKey, selection: choices.filter(c => selected.includes(c.uuid)).map(c => c.selection).sort((a, b) => a.clientUuid.localeCompare(b.clientUuid)) };
        void run(async ctx => { const html = await exportPreview(ctx, body); await ctx.assert(); setPreview({ html, body }); });
      }}>Preview Selected Repair Report</button>
      <button type="button" disabled={!enabled || !preview || ops.some(o => !o.receipt && !o.refusal)} onClick={() => void run(async ctx => {
        if (!preview) throw new Error("REPAIR_EXPORT_PREVIEW_REQUIRED");
        const op = await saveExportRequest(ctx, preview.body); await replayExport(ctx, op); setPreview(undefined); setSelected([]); await refresh(ctx);
      })}>Issue Selected Repair PDF</button></div>
      {preview ? <><p role="status">Preview only. Issuance rechecks approval and source eligibility.</p><iframe className="repair-export-preview" title="Selected Repair Report Preview" sandbox="" srcDoc={preview.html} /></> : null}
      <h4>Issued Repair History</h4><p>Earlier issued documents remain unchanged. Later withdrawal or source changes affect their current validity.</p>
      {!history.length ? <p>No issued repair documents.</p> : history.map(r => <article className="repair-history-item" key={r.exportId}><h5>{r.number}</h5><p>Issued {formatClientDateTime(r.issuedAt)} · {r.selection.length} selected cycles</p>
        {r.selection.map(s => <p key={s.clientUuid}>Cycle {s.cycle} · {s.clientUuid} · Approval {s.approvalSequence}</p>)}
        {r.validity?.map(s => <p key={s.clientUuid}>Current validity: {s.state === "current" ? "Approval and source eligibility current" : s.state === "approval_withdrawn" ? "Approval withdrawn after issuance" : s.state === "source_eligibility_changed" ? "Source eligibility changed after issuance" : "Authority changed or unavailable"} · {s.clientUuid}</p>)}
        <button type="button" disabled={!enabled} onClick={() => void run(ctx => download(ctx, r))}>Download {r.number}</button></article>)}
      <h4>Saved Export Requests</h4>{ops.length ? ops.map(o => <article className="repair-history-item" key={o.body.requestId}><p>{o.body.requestId} · {o.receipt ? "Exact issued receipt confirmed" : o.refusal ? `Not issued — server refused: ${o.refusal}. Refresh and preview a new request.` : "Outcome unconfirmed; exact retry retained"}</p>
        <button type="button" disabled={!enabled || o.actorRole !== user.role} onClick={() => void run(async ctx => { await replayExport(ctx, o); await refresh(ctx); })}>Replay Exact Export Request</button></article>) : <p>No saved export requests.</p>}
    </> : null}
  </section>;
}
