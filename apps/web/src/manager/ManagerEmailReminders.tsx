import { useEffect, useState, type FormEvent } from "react";
import { loadReminderSettings, loadReminderStaff, loadReminderStatus, saveReminderSettings, saveReminderStaffEmail, ManagerApiError, type ReminderSettings, type ReminderStaff, type ReminderStatus } from "./managerApi";

export function ManagerEmailReminders({ onAuthorityFailure }: { onAuthorityFailure: (error: unknown) => void }) {
  const [settings, setSettings] = useState<ReminderSettings>();
  const [staff, setStaff] = useState<ReminderStaff[]>([]);
  const [status, setStatus] = useState<ReminderStatus>();
  const [sender, setSender] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [staffQuery, setStaffQuery] = useState("");
  const [submittedStaffQuery, setSubmittedStaffQuery] = useState("");
  const [staffStatus, setStaffStatus] = useState<"all" | "active" | "inactive">("all");
  const needle = submittedStaffQuery.toLocaleLowerCase();
  const visibleStaff = staff.filter((person) =>
    (staffStatus === "all" || person.isActive === (staffStatus === "active"))
    && (!needle || [person.displayName, person.username, person.email].some((value) => value?.toLocaleLowerCase().includes(needle))));
  async function refresh(signal?: AbortSignal) {
    const [loaded, people, health] = await Promise.all([loadReminderSettings(signal), loadReminderStaff(signal), loadReminderStatus(signal)]);
    if (signal?.aborted) return;
    setSettings(loaded); setSender(loaded.senderEmail); setStaff(people); setStatus(health);
  }
  function fail(error: unknown) {
    if (error instanceof ManagerApiError && error.kind === "domain") setMessage(error.message);
    else { setSettings(undefined); setStatus(undefined); onAuthorityFailure(error); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((error) => { if (!controller.signal.aborted) fail(error); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const saved = await saveReminderSettings(sender.trim(), password); setSettings(saved); setPassword(""); setMessage("Email reminder settings saved."); await refresh(); }
    catch (error) { fail(error); } finally { setBusy(false); }
  }
  async function saveEmail(person: ReminderStaff, email: string) {
    setBusy(true); setMessage("");
    try { await saveReminderStaffEmail(person.id, email.trim().toLowerCase() || null); await refresh(); setMessage("Staff email saved."); }
    catch (error) { fail(error); } finally { setBusy(false); }
  }
  return <section className="manager-reminder-settings" aria-labelledby="email-reminder-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager Settings</p><h2 id="email-reminder-title">Email reminders</h2>
      <p>At 09:00 Asia/Kuala_Lumpur on the day before a customer’s next service date, the worker emails each selected recipient individually.</p></div></div>
    {message && <p role="alert" className="form-message">{message}</p>}
    {loading && <p role="status">Loading email reminders…</p>}
    {settings && <form onSubmit={(event) => void save(event)}>
      <p>{settings.passwordConfigured ? "Sender configured" : "Sender not configured"}</p>
      <label>Sender Gmail address<input type="email" required maxLength={254} value={sender} onChange={(event) => setSender(event.target.value)} autoComplete="off" /></label>
      <label>Gmail app password<input type="password" maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" aria-describedby="reminder-password-note" /></label>
      <p id="reminder-password-note">{settings.passwordConfigured ? "Leave blank to keep the stored password. Changing the sender requires a new password." : "Enter the app password when the client is ready to activate email."}</p>
      <p>SMTP: smtp.gmail.com:587 · STARTTLS · 09:00 Asia/Kuala_Lumpur</p>
      <p>Messages include only the customer name and next service date.</p>
      <button type="submit" disabled={busy || !sender.trim()}>Save email settings</button>
    </form>}
    {settings && <section aria-label="Staff notification addresses"><h3>Staff notification addresses</h3>
      <form className="manager-search-form" role="search" aria-label="Find staff notification address" onSubmit={(event) => { event.preventDefault(); setSubmittedStaffQuery(staffQuery.trim()); }}>
        <label htmlFor="reminder-staff-search">Name, username, or email</label>
        <div className="manager-search-row"><input id="reminder-staff-search" type="search" autoComplete="off" maxLength={254} value={staffQuery} onChange={(event) => setStaffQuery(event.target.value)} />
          <button type="submit">Search</button><button type="button" className="secondary-command" onClick={() => { setStaffQuery(""); setSubmittedStaffQuery(""); }}>Clear</button></div>
        <label htmlFor="reminder-staff-status">Status</label>
        <select id="reminder-staff-status" value={staffStatus} onChange={(event) => setStaffStatus(event.target.value as typeof staffStatus)}><option value="all">All staff</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select>
      </form>
      {visibleStaff.length === 0 && <p className="empty-state" role="status">{staff.length ? "No staff match this filter." : "No staff notification addresses."}</p>}
      <ul className="manager-technician-list">{visibleStaff.map((person) => <li key={person.id}><strong>{person.displayName ?? person.username}</strong> · {person.role === "supervisor" ? "Supervisor" : "Technician"} · {person.isActive ? "Active" : "Inactive"}
        <form onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("email"); if (typeof value === "string") void saveEmail(person, value); }}>
          <label>Reminder email<input type="email" name="email" autoComplete="off" maxLength={254} defaultValue={person.email ?? ""} key={`${person.id}:${person.email}`} /></label>
          <button type="submit" className="secondary-command" disabled={busy}>Save address</button>
        </form></li>)}</ul>
    </section>}
    {status && <section aria-label="Reminder delivery status"><h3>Delivery status</h3>
      <p>Next run: {status.nextRunDate} at {status.nextRunTime} {status.timezone}. {status.configured ? "Configured" : "Not configured"}.</p>
      {status.encryptionUnavailable && <p role="alert">Email is blocked: the server encryption key is missing or the saved password cannot be read. Ask the server administrator to configure or restore the key. If the key is valid, enter the app password again.</p>}
      <ul>{["reserved", "sent", "failed", "unknown", "skipped"].map((kind) => <li key={kind}>{kind === "skipped" ? "Missed" : kind === "unknown" ? "Delivery uncertain" : kind === "reserved" ? "Sending or awaiting verification" : kind}: {status.counts.find((row) => row.status === kind)?.count ?? 0}</li>)}</ul>
      {status.gaps.length > 0 && <><h4>Recipient gaps</h4><ul>{status.gaps.map((gap) => <li key={gap.customerId}>{gap.customerName} · {gap.dueDate}: add recipients in Next Upcoming Service</li>)}</ul></>}
      <h4>Recent deliveries</h4>{status.deliveries.length ? <ul>{status.deliveries.map((delivery, index) => <li key={`${delivery.customerId}:${delivery.dueDate}:${delivery.recipientEmail}:${index}`}>
        {delivery.customerName} · {delivery.dueDate} · {delivery.recipientEmail} · {delivery.status === "skipped" ? "missed" : delivery.status === "unknown" ? "delivery uncertain" : delivery.status}{delivery.errorCategory ? ` (${delivery.errorCategory})` : ""}
      </li>)}</ul> : <p>No deliveries recorded.</p>}
      <button type="button" className="secondary-command" disabled={busy} onClick={() => { setBusy(true); void loadReminderStatus().then(setStatus).catch(fail).finally(() => setBusy(false)); }}>Refresh status</button>
    </section>}
  </section>;
}
