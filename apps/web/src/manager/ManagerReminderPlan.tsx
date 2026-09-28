import { useEffect, useState, type FormEvent } from "react";
import { loadReminderPlan, loadReminderStaff, saveReminderPlan, ManagerApiError, type ReminderPlan, type ReminderStaff } from "./managerApi";

export function ManagerReminderPlan({ customerId, dueDate, onAuthorityFailure }: { customerId: string; dueDate: string; onAuthorityFailure: (error: unknown) => void }) {
  const [plan, setPlan] = useState<ReminderPlan>();
  const [staff, setStaff] = useState<ReminderStaff[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [extras, setExtras] = useState<Array<{ name: string; email: string }>>([]);
  const [extraName, setExtraName] = useState("");
  const [extraEmail, setExtraEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function fail(error: unknown) {
    if (error instanceof ManagerApiError && error.kind === "domain") setMessage(error.message);
    else { setPlan(undefined); onAuthorityFailure(error); }
  }
  async function refresh(signal?: AbortSignal) {
    const [loaded, people] = await Promise.all([loadReminderPlan(customerId, signal), loadReminderStaff(signal)]);
    if (signal?.aborted) return;
    setPlan(loaded); setStaff(people);
    setSelected(loaded.recipients.flatMap((row) => row.staffUserId === null ? [] : [row.staffUserId]));
    setExtras(loaded.recipients.flatMap((row) => row.extraName && row.extraEmail ? [{ name: row.extraName, email: row.extraEmail }] : []));
  }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal).catch((error) => { if (!controller.signal.aborted) fail(error); }); return () => controller.abort(); }, [customerId, dueDate]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await saveReminderPlan(customerId, dueDate, selected, extras); await refresh(); setMessage("Reminder recipients saved for this service date."); }
    catch (error) { fail(error); } finally { setBusy(false); }
  }
  return <section className="manager-reminder-editor" aria-label={`Reminder recipients for ${dueDate}`}>
    <h4>Reminder recipients · {dueDate}</h4>
    {!plan ? <p role="status">Loading recipients…</p> : <>
      {plan.dueDate !== dueDate ? <p role="alert">Due date changed. Reload this page.</p> : <>
        <p>Planned send: {plan.plannedSendDate} at 09:00 Asia/Kuala_Lumpur.</p>
        {plan.reviewRequired && <p role="alert">Recipients were copied from the previous date. Review and save them.</p>}
        {plan.priorSentCount > 0 && <p role="alert">Previous service dates have sent reminders. Recipients may have been told an older date; review delivery history in Email reminders.</p>}
        {plan.blocked && <p role="alert">Reminder blocked: add recipients.</p>}
        {plan.effective.length > 0 && <><p>Effective recipients:</p><ul>{plan.effective.map((person) => <li key={person.email}>{person.name} · {person.email}</li>)}</ul></>}
        <form onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy}><legend>Active technicians and supervisors</legend>
            {staff.filter((person) => person.isActive).map((person) => <label key={person.id} className="checkbox-label">
              <input type="checkbox" disabled={!person.email} checked={selected.includes(person.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id))} />
              {person.displayName ?? person.username} · {person.role === "supervisor" ? "Supervisor" : "Technician"}{person.email ? ` · ${person.email}` : " · add email in Email reminders Settings"}
            </label>)}
          </fieldset>
          <fieldset disabled={busy}><legend>Additional recipients</legend>
            <ul>{extras.map((person, index) => <li key={`${person.email}:${index}`}>{person.name} · {person.email} <button type="button" className="secondary-command" onClick={() => setExtras(extras.filter((_, item) => item !== index))}>Remove</button></li>)}</ul>
            <label>Name<input type="text" maxLength={160} value={extraName} onChange={(event) => setExtraName(event.target.value)} /></label>
            <label>Email<input type="email" maxLength={254} value={extraEmail} onChange={(event) => setExtraEmail(event.target.value)} /></label>
            <button type="button" className="secondary-command" disabled={!extraName.trim() || !extraEmail.trim()} onClick={() => { setExtras([...extras, { name: extraName.trim(), email: extraEmail.trim().toLowerCase() }]); setExtraName(""); setExtraEmail(""); }}>Add address</button>
          </fieldset>
          <button type="submit" disabled={busy}>Save recipients</button>
        </form>
      </>}
    </>}
    {message && <p role="alert" className="form-message">{message}</p>}
  </section>;
}
