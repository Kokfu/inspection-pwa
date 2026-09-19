import { useEffect, useRef, useState } from "react";
import { createManagerTechnician, deactivateManagerTechnician, loadManagerTechnicians, ManagerApiError, type ManagerTechnician } from "./managerApi";

export function ManagerTechnicians({ onAuthorityFailure, onOpen }: { onAuthorityFailure: (error: unknown) => void; onOpen?: (technician: ManagerTechnician) => void }) {
  const [technicians, setTechnicians] = useState<ManagerTechnician[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"inspector" | "supervisor">("inspector");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void loadManagerTechnicians(controller.signal).then((rows) => { if (!controller.signal.aborted) setTechnicians(rows); }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setTechnicians([]); onAuthorityFailure(error); }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true); setMessage("");
    try { await action(); if (!mounted.current) return; const rows = await loadManagerTechnicians(); if (mounted.current) setTechnicians(rows); }
    catch (error) {
      if (!mounted.current) return;
      if (error instanceof ManagerApiError && error.kind === "domain") setMessage(error.message);
      else { setTechnicians([]); onAuthorityFailure(error); }
    } finally { if (mounted.current) setBusy(false); }
  }
  return <section aria-labelledby="technicians-title"><h2 id="technicians-title">Technician List</h2>
    <form className="manager-inline-form" onSubmit={(event) => {
      event.preventDefault();
      void mutate(async () => { await createManagerTechnician({ username, password, role }); setUsername(""); setPassword(""); setRole("inspector"); });
    }}><h3>Add Technician</h3>
      <label>Username<input required maxLength={100} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Password<input required type="password" minLength={12} maxLength={1024} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value === "supervisor" ? "supervisor" : "inspector")}>
        <option value="inspector">Technician</option>
        <option value="supervisor">Supervisor (review only)</option>
      </select></label>
      <button disabled={busy} type="submit">{role === "supervisor" ? "Add Supervisor" : "Add Technician"}</button>
    </form>
    {message && <p role="alert" className="form-message">{message}</p>}
    {busy && <p role="status">Updating technicians…</p>}
    <ul className="manager-technician-list">{technicians.map((technician) => <li key={technician.id}>
      {onOpen && technician.role === "inspector"
        ? <button type="button" className="manager-technician-open" aria-label={`View ${technician.username} service visits`} onClick={() => onOpen(technician)}><strong>{technician.username}</strong><span aria-hidden="true">View visits ›</span></button>
        : <strong>{technician.username}</strong>}
      {technician.role === "supervisor" && <span className="status-badge status-badge--neutral">Supervisor</span>}
      <span className={`status-badge status-badge--${technician.isActive ? "complete" : "attention"}`}>{technician.isActive ? "Active" : "Inactive"}</span>
      {technician.isActive && <button type="button" className="secondary-command" disabled={busy} onClick={() => {
        if (window.confirm(`Deactivate this ${technician.role === "supervisor" ? "supervisor" : "technician"}? They will no longer be able to log in.`)) void mutate(() => deactivateManagerTechnician(technician.id));
      }}>Deactivate</button>}
    </li>)}</ul>
    {!busy && !technicians.length && <p className="empty-state">No technicians.</p>}
  </section>;
}
