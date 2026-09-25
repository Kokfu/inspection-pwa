import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadInspectionCorrections, ManagerApiError, saveInspectionCorrections,
  type CorrectionValue, type ManagerCorrectableField, type ManagerInspectionCorrections
} from "./managerApi";
import { clearManagerLeaveGuard, setManagerLeaveGuard } from "./managerLeaveGuard";
import "./managerServiceEditor.css";

/**
 * T5b: a supervisor or admin corrects one Accepted record. The accepted inspection is never changed —
 * each save appends a correction carrying the value it replaced, the new value and a reason, and the
 * original stays on screen next to the corrected value.
 */
const resultLabels: Record<string, string> = { good: "Good", not_good: "Not Good", complete_repair: "Complete Repair", na: "N.A." };
const show = (value: CorrectionValue) => value === null || value === "" ? "—" : resultLabels[String(value)] ?? String(value);
const sameValue = (left: CorrectionValue, right: CorrectionValue) => JSON.stringify(left) === JSON.stringify(right);

/**
 * What a typed value is sent as. The draft keeps exactly what was typed (so "45." on the way to "45.5"
 * survives); this coerces once, at submit time. A reading the technician recorded as a number stays a
 * number — the frozen contract refuses a string there — blank clears it, and anything else is left for
 * the server to refuse with its own message.
 */
function submittedValue(field: ManagerCorrectableField, typed: CorrectionValue): CorrectionValue {
  if (field.kind !== "reading" || typeof typed !== "string") return typed;
  const trimmed = typed.trim();
  if (trimmed === "") return null;
  const numeric = Number(trimmed);
  const numericField = typeof field.value === "number" || (field.value === null && typeof field.originalValue !== "string");
  return numericField && Number.isFinite(numeric) ? numeric : typed;
}

function formatWhen(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : value;
}

export function ManagerCorrectionEditor({ clientUuid, onBack, onAuthorityFailure }: {
  clientUuid: string;
  /** Receives the visit this record belongs to, once it is known. */
  onBack: (jobId?: string) => void;
  onAuthorityFailure: (error: unknown) => void;
}) {
  const [record, setRecord] = useState<ManagerInspectionCorrections>();
  const [draft, setDraft] = useState<Record<string, CorrectionValue>>({});
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const mounted = useRef(false);
  const guardHash = useRef(window.location.hash);
  /** Held across retries: the same submission must stay idempotent on the server. */
  const requestId = useRef(crypto.randomUUID());

  const fetchRecord = async (signal?: AbortSignal) => {
    const loaded = await loadInspectionCorrections(clientUuid, signal);
    if (signal?.aborted || !mounted.current) return false;
    setRecord(loaded); setDraft({});
    return true;
  };

  const load = (signal?: AbortSignal) => fetchRecord(signal).catch((error: unknown) => {
    if (signal?.aborted) return;
    if (error instanceof ManagerApiError && error.kind === "domain") setMessage(error.message);
    else onAuthorityFailure(error);
  }).finally(() => { if (!signal?.aborted) setBusy(false); });

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => { mounted.current = false; controller.abort(); };
  }, [clientUuid]);

  const fields = record?.fields ?? [];
  const pending = useMemo(
    () => fields.filter((field) => Object.hasOwn(draft, field.fieldPath) && !sameValue(submittedValue(field, draft[field.fieldPath]!), field.value)),
    [fields, draft]
  );
  const reasonReady = reason.trim().length >= 3 && reason.trim().length <= 500;

  const confirmLeave = () => pending.length === 0
    || window.confirm(`You have ${pending.length} unsaved ${pending.length === 1 ? "correction" : "corrections"}. Leave without saving?`);

  // Guards hash navigation (browser Back, typed URL) and reload/close while corrections are unsaved.
  useEffect(() => {
    const hash = guardHash.current;
    if (pending.length === 0) { clearManagerLeaveGuard(hash); return; }
    setManagerLeaveGuard({ hash, confirmLeave });
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("beforeunload", beforeUnload); clearManagerLeaveGuard(hash); };
  });

  const back = () => {
    if (!confirmLeave()) return;
    clearManagerLeaveGuard(guardHash.current);
    setDraft({});
    onBack(record?.jobId);
  };

  async function save() {
    if (!record || !pending.length || !reasonReady) return;
    setBusy(true); setMessage("");
    try {
      await saveInspectionCorrections(clientUuid, {
        requestId: requestId.current,
        reason: reason.trim(),
        changes: pending.map((field) => ({ fieldPath: field.fieldPath, expectedCurrentValue: field.value, newValue: submittedValue(field, draft[field.fieldPath]!) }))
      });
      if (!mounted.current) return;
      requestId.current = crypto.randomUUID();
      clearManagerLeaveGuard(guardHash.current);
      setReason("");
      setDraft({});
      const reloaded = await fetchRecord().then((done) => done, () => false);
      if (!mounted.current) return;
      setMessage(reloaded
        ? "Corrections saved. The accepted inspection is unchanged; the original values stay on record."
        : "Corrections saved, but this screen could not refresh. Reload before correcting anything else.");
    } catch (error) {
      if (!mounted.current) return;
      // Only an authority failure tears the Manager experience down. Anything else keeps the unsaved
      // corrections on screen so the same submission can be retried.
      if (error instanceof ManagerApiError && error.kind === "authorization") { onAuthorityFailure(error); return; }
      setMessage(error instanceof ManagerApiError ? error.message : "The corrections could not be saved. Check your connection and try again.");
    } finally { if (mounted.current) setBusy(false); }
  }

  const historyFor = (fieldPath: string) => (record?.corrections ?? []).filter((correction) => correction.fieldPath === fieldPath).sort((left, right) => left.sequence - right.sequence);
  const query = search.trim().toLocaleLowerCase();
  const visible = fields.filter((field) => (!query || field.label.toLocaleLowerCase().includes(query))
    && (!onlyChanged || field.corrected || Object.hasOwn(draft, field.fieldPath)));

  const editor = (field: ManagerCorrectableField) => {
    const value = Object.hasOwn(draft, field.fieldPath) ? draft[field.fieldPath]! : field.value;
    const change = (next: CorrectionValue) => setDraft((current) => ({ ...current, [field.fieldPath]: next }));
    if (field.kind === "result") {
      return <div className="result-options" role="group" aria-label={`${field.label} result`}>
        {(field.options ?? []).map((option) => <button
          key={option} type="button"
          className={`result-option${option === value ? " result-option--selected" : ""}`}
          aria-pressed={option === value}
          disabled={busy}
          onClick={() => change(option)}
        >{resultLabels[option] ?? option}</button>)}
      </div>;
    }
    return <span className="manager-wording-value-input"><input
      aria-label={field.label}
      value={value === null ? "" : String(value)}
      disabled={busy}
      maxLength={field.kind === "text" ? 4000 : 200}
      inputMode={field.kind === "reading" && typeof field.value === "number" ? "decimal" : undefined}
      onChange={(event) => change(event.target.value)}
    /></span>;
  };

  if (!record && busy) return <section aria-labelledby="manager-correction-title"><h2 id="manager-correction-title">Correct inspection</h2><p role="status">Loading accepted record…</p></section>;
  if (!record) return <section aria-labelledby="manager-correction-title">
    <button type="button" className="secondary-command" onClick={() => onBack()}>Back to service visit</button>
    <h2 id="manager-correction-title">Correct inspection</h2>
    {message ? <p role="alert" className="form-message">{message}</p> : null}
  </section>;

  return <section className="manager-service-editor" aria-labelledby="manager-correction-title">
    <button type="button" className="secondary-command" onClick={back}>Back to service visit</button>
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">Accepted record · {record.jobReference}</p>
        <h2 id="manager-correction-title">Correct inspection</h2>
      </div>
      {record.corrections.length > 0 && <span className="status-badge status-badge--waiting">{record.corrections.length} {record.corrections.length === 1 ? "correction" : "corrections"}</span>}
    </div>
    <p className="operational-message">The accepted inspection is never changed. A correction is recorded separately with the original value, your name and your reason; the report shows both.</p>

    {!record.supported && <p role="alert" className="form-message">Corrections are available for V7 inspections of the supported systems only. This record can be reviewed but not corrected.</p>}
    {record.supported && <>
      <div className="manager-wording-toolbar">
        <label className="manager-wording-search">Search fields<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="manager-wording-filter"><input type="checkbox" checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)} />Show only corrected fields</label>
      </div>

      {visible.length === 0 ? <p className="empty-state">No fields match your search.</p> : <ul className="manager-wording-section">
        {visible.map((field) => {
          const history = historyFor(field.fieldPath);
          const drafted = Object.hasOwn(draft, field.fieldPath) && !sameValue(submittedValue(field, draft[field.fieldPath]!), field.value);
          return <li key={field.fieldPath} className="manager-wording-label-row">
            <div className="manager-wording-label-text">
              <strong>{field.label}</strong>
              {field.corrected && <span className="manager-config-flag manager-config-flag--set">Corrected</span>}
              {drafted && <span className="manager-config-flag manager-config-flag--attention">Unsaved</span>}
            </div>
            {editor(field)}
            {field.corrected && <p className="support-metadata">Originally: <strong>{show(field.originalValue)}</strong></p>}
            {history.map((correction) => <p key={correction.id} className="support-metadata">
              {show(correction.previousValue)} → <strong>{show(correction.newValue)}</strong> · {correction.correctedBy} ({correction.correctedByRole}) · {formatWhen(correction.correctedAt)} · {correction.reason}
            </p>)}
          </li>;
        })}
      </ul>}

      <div className="manager-wording-savebar">
        <label className="manager-wording-field">Reason for these corrections (3–500 characters)
          <textarea value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} />
        </label>
        <span>{pending.length ? `${pending.length} unsaved ${pending.length === 1 ? "correction" : "corrections"}` : "No unsaved corrections"}</span>
        <button type="button" disabled={busy || !pending.length || !reasonReady} onClick={() => void save()}>{busy ? "Saving…" : "Save corrections"}</button>
        <button type="button" className="secondary-command" disabled={busy || !pending.length} onClick={() => setDraft({})}>Discard</button>
      </div>
    </>}
    {message ? <p role="alert" className="form-message">{message}</p> : null}
  </section>;
}
