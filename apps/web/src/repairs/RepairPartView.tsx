import { useEffect, useRef, useState } from "react";
import { CameraCaptureDialog } from "../attachments/CameraCaptureDialog";
import { beginWorkspaceActivity } from "../db/workspaceActivity";
import { localDatabase } from "../db/localDatabase";
import { repairDraftWriter } from "./repairDraftWriter";
import { formatClientDateTime } from "../uiPresentation";
import { captureRepairPhoto, errorMessage, repairBeforePhotoState, saveRepairDraft, submitRepairLocal, verifyRepairBlob } from "./repairRepository";
import { readHistoryAfter, repairRecovery, reviewLabel } from "./repairUiRepository";
import type { RepairAttachment, RepairFinding, RepairHistory, RepairRecord } from "./repairTypes";

export function RepairPhoto({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob]);
  return url ? <a className="repair-photo-link" href={url} target="_blank" rel="noreferrer" aria-label={`Open full size: ${alt}`}>
    <img src={url} alt={alt} width={640} height={480} loading="lazy" />
  </a> : null;
}

export function RepairBefore({ finding, refreshKey }: { finding: RepairFinding; refreshKey: number }) {
  const [state, setState] = useState("loading");
  const [blob, setBlob] = useState<Blob>();
  useEffect(() => {
    let active = true; setBlob(undefined); setState("loading");
    void repairBeforePhotoState(finding.findingId).then(v => {
      if (active) { setState(v.state); if (v.state === "cached") setBlob(v.photo.blob); }
    }).catch(() => { if (active) setState("corrupt"); });
    return () => { active = false; };
  }, [finding.findingId, finding.sourceFingerprint, refreshKey]);
  return <section className="repair-before" aria-label="Original Before (read-only)">
    <h4>ORIGINAL Before — Read Only</h4>
    <p>Original result: {finding.original.result === "poor" ? "Poor" : "Not Good"}</p>
    <p className="repair-remark">{finding.original.remark || "No original remark recorded under the historical contract."}</p>
    {state === "historical_absence" ? <p>Historical finding: no original Before photo.</p>
      : state === "not_downloaded" ? <p>Original Before photo not downloaded. Use Download for Offline to retain it here.</p>
        : state === "corrupt" ? <p role="alert" className="error-text">Original Before photo integrity failure. Download again or ask Manager for help. Retained bytes were not deleted.</p>
          : state === "loading" ? <p role="status">Checking original photo…</p>
            : <><p>Original Before photo cached on this device; integrity verified.</p>{blob ? <RepairPhoto blob={blob} alt="Original accepted Before photo" /> : null}</>}
  </section>;
}

export function LocalAfter({ photo }: { photo?: RepairAttachment }) {
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setVerified(false); setError("");
    if (photo) void verifyRepairBlob(photo.blob, photo, photo.sourceSha256).then(() => { if (active) setVerified(true); })
      .catch(() => { if (active) setError("After photo integrity failure. Your retained photo has not been deleted."); });
    return () => { active = false; };
  }, [photo?.photoUuid, photo?.sourceSha256, photo?.blob]);
  return error ? <p role="alert" className="error-text">{error}</p> : photo && verified ? <RepairPhoto blob={photo.blob} alt="This repair's own After photo" /> : <p>{photo ? "Checking After photo…" : "No After photo saved."}</p>;
}

export function RepairEditor({ record, photo, onDirty, suspended = false }: { record: RepairRecord; photo?: RepairAttachment; onDirty: (clientUuid: string, dirty: boolean) => void; suspended?: boolean }) {
  const [remark, setRemark] = useState(record.remark);
  const [message, setMessage] = useState("Saved on this device.");
  const [error, setError] = useState("");
  const [remarkError, setRemarkError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const workspace = useRef({ db: localDatabase, actorId: record.actorId });
  const writer = useRef<ReturnType<typeof repairDraftWriter<string>> | undefined>(undefined);
  if (!writer.current) {
    writer.current = repairDraftWriter(value => saveRepairDraft(record.clientUuid, value, record.performedAt, workspace.current));
  }
  const latestRemark = useRef(record.remark);
  const submitting = useRef(false);
  const unsaved = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const file = useRef<HTMLInputElement>(null);
  const remarkInput = useRef<HTMLTextAreaElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | undefined>(undefined);
  const editable = record.syncStatus === "Draft" && !record.frozen;
  const remarkId = `repair-remark-${record.clientUuid}`, photoId = `repair-photo-${record.clientUuid}`;
  useEffect(() => {
    mounted.current = true;
    const warn = (e: BeforeUnloadEvent) => { if (unsaved.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { mounted.current = false; controller.current?.abort(); window.removeEventListener("beforeunload", warn); };
  }, []);
  // A retained, hidden editor must not leave a camera streaming in the background.
  useEffect(() => { if (suspended) setCamera(false); }, [suspended]);
  useEffect(() => {
    if (!camera) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); setCamera(false); }
      if (e.key === "Tab" && dialog) {
        const controls = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keys);
    return () => { document.removeEventListener("keydown", keys); cameraButton.current?.focus(); };
  }, [camera, busy]);

  function save(value: string) {
    const revision = ++generation.current;
    unsaved.current = true; onDirty(record.clientUuid, true); setMessage("Saving on this device…");
    const finish = beginWorkspaceActivity();
    const task = writer.current!(value);
    void task.then(() => {
      if (revision === generation.current) {
        unsaved.current = false;
        if (mounted.current) { onDirty(record.clientUuid, false); setMessage("Saved on this device."); setError(""); }
      }
    }).catch(e => { if (mounted.current && revision === generation.current) {
      setMessage(errorMessage(e) === "REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN"
        ? "Save outcome unconfirmed; keep this form open and retry Save Draft."
        : "Draft save failed; keep this form open and retry Save Draft."); setError(errorMessage(e));
    } }).finally(finish);
    return task;
  }
  async function store(blob: Blob, source: "camera" | "gallery") {
    const finish = beginWorkspaceActivity();
    controller.current = new AbortController(); setBusy(true); setError(""); setMessage("Processing photo…");
    try {
      await captureRepairPhoto(record.clientUuid, blob, source, controller.current.signal);
      if (mounted.current) { setMessage("After photo saved on this device."); setPhotoError(""); }
    } catch (e) { if (mounted.current) { setMessage(errorMessage(e) === "REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN"
      ? "After photo save outcome unconfirmed; the replacement may already be saved. Retry choosing or taking the photo. Internet is not required."
      : "After photo save failed; your previous saved photo is retained. Retry choosing or taking the photo."); setError(errorMessage(e)); } }
    finally { finish(); if (mounted.current) setBusy(false); }
  }
  async function submit() {
    if (submitting.current) return;
    const missingRemark = !latestRemark.current.trim(), missingPhoto = !record.photoUuid;
    setRemarkError(missingRemark ? "Enter a nonblank repair remark for this part." : "");
    setPhotoError(missingPhoto ? "Save one own After photo for this part." : "");
    if (missingRemark || missingPhoto) { (missingRemark ? remarkInput.current : cameraButton.current)?.focus(); return; }
    submitting.current = true;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const finish = beginWorkspaceActivity(); setBusy(true); setError("");
    try {
      await save(latestRemark.current);
      if (!mounted.current || signal.aborted) return;
      await submitRepairLocal(record.clientUuid, workspace.current, signal);
      if (mounted.current) setMessage("Submitted on this device — Pending Sync. The content and photo are now immutable.");
    } catch (e) { if (mounted.current) {
      if (errorMessage(e) === "REPAIR_PHOTO_VERIFICATION_TIMEOUT") setMessage("Photo verification took too long; retry Submit Locally. Your saved remark and photo are retained.");
      if (errorMessage(e) === "REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN") setMessage("Submit outcome unconfirmed; retained local work will be checked on retry.");
      setError(errorMessage(e));
    } }
    finally { submitting.current = false; finish(); if (mounted.current) setBusy(false); }
  }
  return <section className="repair-after" aria-label="Repair After">
    <h4>After — Repair Cycle {record.cycleSequence}</h4>
    <p>Local sync: <strong>{record.syncStatus === "Pending" ? "Pending Sync" : record.syncStatus}</strong></p>
    <p>Server review: <strong>{reviewLabel(record.reviewState)}</strong>{record.reviewFetchedAt ? ` (fetched ${formatClientDateTime(record.reviewFetchedAt)})` : ""}</p>
    <p>Performed: {formatClientDateTime(record.performedAt)}</p>
    {editable ? <>
      <label htmlFor={remarkId}>Repair Remark (Required)</label>
      <textarea ref={remarkInput} id={remarkId} name="repairRemark" autoComplete="off" rows={4} maxLength={4000} value={remark}
        aria-required="true" aria-invalid={!!remarkError} aria-describedby={`${remarkId}-error`}
        readOnly={submitting.current}
        onChange={e => { if (submitting.current) return; latestRemark.current = e.target.value; setRemark(e.target.value); setRemarkError(""); void save(e.target.value); }} />
      <p id={`${remarkId}-error`} className="error-text" aria-live="polite">{remarkError}</p>
    </> : <><p className="repair-remark">{record.remark}</p><p>This submitted repair is immutable. A revision uses a new repair cycle.</p></>}
    <LocalAfter photo={photo} />
    {editable ? <>
      <p id={`${photoId}-hint`}>One own After photo is required for this part. Replacing it changes only this unsubmitted draft.</p>
      <div className="repair-actions">
        <button ref={cameraButton} type="button" disabled={busy} aria-describedby={`${photoId}-hint ${photoId}-error`} onClick={() => setCamera(true)}>Take After Photo</button>
        <button type="button" disabled={busy} className="secondary-command" onClick={() => file.current?.click()}>{photo ? "Replace After Photo" : "Choose After Photo"}</button>
      </div>
      <input ref={file} id={photoId} className="repair-file" type="file" accept="image/*" aria-label="Choose this part's After photo" onChange={e => {
        const selected = e.target.files?.[0]; e.target.value = ""; if (selected) void store(selected, "gallery");
      }} />
      <p id={`${photoId}-error`} className="error-text" aria-live="polite">{photoError}</p>
      <div className="repair-actions repair-save-actions">
        <button type="button" disabled={busy} className="secondary-command" onClick={() => { void save(latestRemark.current).catch(() => undefined); }}>Save Draft</button>
        <button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Submit Locally"}</button>
      </div>
    </> : null}
    <p role="status">{message}</p>
    {error || record.lastSyncError || photo?.lastSyncError ? <p role="alert" className="error-text">{error || record.lastSyncError || photo?.lastSyncError}. {repairRecovery(error || record.lastSyncError || photo?.lastSyncError || "")}</p> : null}
    {camera ? <CameraCaptureDialog onClose={() => setCamera(false)} onCapture={async blob => { await store(blob, "camera"); setCamera(false); }} /> : null}
  </section>;
}

function HistoryItem({ finding, history, local, photo }: { finding: RepairFinding; history: RepairHistory; local?: RepairRecord; photo?: RepairAttachment }) {
  const [blob, setBlob] = useState<Blob>();
  const [decisions, setDecisions] = useState<Awaited<ReturnType<typeof readHistoryAfter>>["decisions"]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function load() {
    setBlob(undefined); setDecisions([]); setBusy(true); setError("");
    try { const next = await readHistoryAfter(finding, history); if (mounted.current) { setBlob(next.blob); setDecisions(next.decisions); } }
    catch (e) { if (mounted.current) setError(errorMessage(e)); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <article className="repair-history-item">
    <h5>Cycle {history.cycle_sequence} — {reviewLabel(history.review_state)} (Cached Server History)</h5>
    <p>Technician #{history.submitted_by_user_id} · {formatClientDateTime(history.performed_at)}</p>
    <p className="repair-remark">{history.remark}</p>
    <p className="secondary-metadata">Repair UUID: {history.client_uuid}</p>
    {blob ? <RepairPhoto blob={blob} alt={`Submitted After photo for cycle ${history.cycle_sequence}`} /> : photo && local?.clientUuid === history.client_uuid ? <LocalAfter photo={photo} /> : <p>Submitted After photo is not downloaded on this device.</p>}
    <button type="button" className="secondary-command" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "View Submitted Detail / After Online"}</button>
    {decisions.map(d => <p key={d.sequence}>{reviewLabel(d.decision)} · Reviewer #{d.decidedByUserId} · {formatClientDateTime(d.decidedAt)}{d.reason ? ` — ${d.reason}` : ""}</p>)}
    {error ? <p role="alert" className="error-text">{error}. {repairRecovery(error)}</p> : null}
  </article>;
}
export function RepairHistoryView({ finding, records, photos }: { finding: RepairFinding; records: RepairRecord[]; photos: RepairAttachment[] }) {
  // Remote history never replaces local frozen submissions, including those with an unknown receipt.
  const remote = new Set(finding.history.map(h => h.client_uuid));
  const retained = records.filter(r => r.frozen && !remote.has(r.clientUuid));
  return <details className="repair-history"><summary>Repair History ({finding.history.length + retained.length})</summary>
    <p>Previous repairs are separate from the ORIGINAL Before. History reflects the last successful authority download.</p>
    {finding.history.map(h => <HistoryItem key={h.client_uuid} finding={finding} history={h} local={records.find(r => r.clientUuid === h.client_uuid)} photo={photos.find(p => p.repairUuid === h.client_uuid)} />)}
    {retained.map(r => <article key={r.clientUuid} className="repair-history-item"><h5>Retained Local Cycle {r.cycleSequence}</h5>
      <p>Local sync: {r.syncStatus}; Server review: {reviewLabel(r.reviewState)}</p><p className="repair-remark">{r.remark}</p>
      <p className="secondary-metadata">Repair UUID: {r.clientUuid}</p><LocalAfter photo={photos.find(p => p.repairUuid === r.clientUuid)} />
    </article>)}
    {!finding.history.length && !retained.length ? <p>No submitted repair history.</p> : null}
  </details>;
}
