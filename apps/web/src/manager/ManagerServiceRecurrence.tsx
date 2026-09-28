import { useEffect, useState, type FormEvent } from "react";
import { loadServiceRecurrence, saveServiceRecurrence, ManagerApiError, type ServiceRecurrence } from "./managerApi";

export function ManagerServiceRecurrence({ customerId, onSaved, onAuthorityFailure }: { customerId: string; onSaved: () => Promise<void>; onAuthorityFailure: (error: unknown) => void }) {
  const [draft, setDraft] = useState<ServiceRecurrence>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function fail(error: unknown) {
    if (error instanceof ManagerApiError && error.kind === "domain") setMessage(error.message);
    else { setDraft(undefined); onAuthorityFailure(error); }
  }
  useEffect(() => { const controller = new AbortController(); void loadServiceRecurrence(customerId, controller.signal).then((value) => { if (!controller.signal.aborted) setDraft(value); }).catch((error) => { if (!controller.signal.aborted) fail(error); }); return () => controller.abort(); }, [customerId]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setMessage("");
    try { const saved = await saveServiceRecurrence(customerId, draft); setDraft(saved); await onSaved(); setMessage("Service routine saved."); }
    catch (error) { fail(error); } finally { setBusy(false); }
  }
  return <section className="manager-reminder-editor" aria-label="Service routine"><h4>Optional service routine</h4>
    {!draft ? <p role="status">Loading routine…</p> : <form onSubmit={(event) => void save(event)}>
      <label>Cadence<select value={draft.kind ?? "manual"} onChange={(event) => { const kind = event.target.value; setDraft(kind === "manual" ? { ...draft, kind: null, interval: null, day: null } : kind === "weekly" ? { ...draft, kind: "weekly", interval: 1, day: 1 } : { ...draft, kind: "monthly", interval: 1, day: 1 }); }}>
        <option value="manual">Manual dates</option><option value="weekly">Every N weeks</option><option value="monthly">Monthly on day N</option>
      </select></label>
      {draft.kind === "weekly" && <><label>Every number of weeks<input type="number" min={1} max={52} required value={draft.interval ?? 1} onChange={(event) => setDraft({ ...draft, interval: Number(event.target.value) })} /></label>
        <label>Weekday<select value={draft.day ?? 1} onChange={(event) => setDraft({ ...draft, day: Number(event.target.value) })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label></>}
      {draft.kind === "monthly" && <label>Day of month<input type="number" min={1} max={31} required value={draft.day ?? 1} onChange={(event) => setDraft({ ...draft, day: Number(event.target.value) })} /></label>}
      <label>{draft.kind ? "First due date" : "Manual due date"}<input type="date" required={draft.kind !== null} value={draft.dueDate ?? ""} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value || null })} /></label>
      <p>{draft.kind ? "The first date must match the selected weekday or month day. Closing a service visit advances to the next valid date. A manual date edit is a one-time override on the same weekday or month day. Clearing the date pauses reminders and advancement." : "Manual dates remain as entered. Clearing the routine keeps the displayed due date."}</p>
      <button type="submit" disabled={busy}>Save routine</button>
    </form>}
    {message && <p role="alert" className="form-message">{message}</p>}
  </section>;
}
