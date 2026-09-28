import { useEffect, useRef, useState } from "react";
import { createManagerTechnician, deactivateManagerTechnician, deleteManagerTechnician, loadManagerTechnicians, setTechnicianSupervisorAssignment, updateManagerTechnicianDisplayName, ManagerApiError, type AssignedManagerTechnician, type ManagerTechnician } from "./managerApi";

export function ManagerTechnicians({ onAuthorityFailure, onOpen }: { onAuthorityFailure: (error: unknown) => void; onOpen?: (technician: ManagerTechnician) => void }) {
  const [technicians, setTechnicians] = useState<AssignedManagerTechnician[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [role, setRole] = useState<"inspector" | "supervisor">("inspector");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [showDeactivated, setShowDeactivated] = useState(false);
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
  const supervisors = technicians.filter((row) => row.role === "supervisor");
  const deactivatedCount = technicians.filter((row) => !row.isActive).length;
  const visibleTechnicians = showDeactivated ? technicians : technicians.filter((row) => row.isActive);
  return <section aria-labelledby="technicians-title"><h2 id="technicians-title">Technician List</h2>
    <form className="manager-inline-form" onSubmit={(event) => {
      event.preventDefault();
      void mutate(async () => { await createManagerTechnician({ username, password, displayName: newDisplayName.trim() || null, role }); setUsername(""); setPassword(""); setNewDisplayName(""); setRole("inspector"); });
    }}><h3>Add Technician</h3>
      <label>Username<input required maxLength={100} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Person’s name<input maxLength={160} autoComplete="name" value={newDisplayName} onChange={(event) => setNewDisplayName(event.target.value)} /></label>
      <label>Password<input required type="password" minLength={12} maxLength={1024} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value === "supervisor" ? "supervisor" : "inspector")}>
        <option value="inspector">Technician</option>
        <option value="supervisor">Supervisor (review only)</option>
      </select></label>
      <button disabled={busy} type="submit">{role === "supervisor" ? "Add Supervisor" : "Add Technician"}</button>
    </form>
    {message && <p role="alert" className="form-message">{message}</p>}
    {busy && <p role="status">Updating technicians…</p>}
    {deactivatedCount > 0 && <label className="manager-show-archived">
      <input type="checkbox" checked={showDeactivated} onChange={(event) => setShowDeactivated(event.target.checked)} />
      {` Show deactivated technicians (${deactivatedCount})`}
    </label>}
    <ul className="manager-technician-list">{visibleTechnicians.map((technician) => <li key={technician.id}>
      {onOpen && technician.role === "inspector"
        ? <button type="button" className="manager-technician-open" aria-label={`View ${technician.username} service visits`} onClick={() => onOpen(technician)}><strong>{technician.username}</strong><span aria-hidden="true">View visits ›</span></button>
        : <strong>{technician.username}</strong>}
      {technician.role === "supervisor" && <span className="status-badge status-badge--neutral">Supervisor</span>}
      <span className={`status-badge status-badge--${technician.isActive ? "complete" : "attention"}`}>{technician.isActive ? "Active" : "Inactive"}</span>
      {technician.role === "inspector" && <fieldset className="manager-assignment-picker" disabled={busy}>
        <legend>Assigned supervisors for {technician.username}</legend>
        {supervisors.length ? supervisors.map((supervisor) => <label key={supervisor.id} className="checkbox-label">
          <input type="checkbox" checked={technician.supervisorIds.includes(supervisor.id)} onChange={(event) => void mutate(() => setTechnicianSupervisorAssignment(technician.id, supervisor.id, event.target.checked))} />
          {supervisor.displayName ?? supervisor.username}{supervisor.isActive ? "" : " (inactive)"}
        </label>) : <p>No supervisors available.</p>}
      </fieldset>}
      <form onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("displayName"); if (typeof value === "string") void mutate(() => updateManagerTechnicianDisplayName(technician.id, value.trim() || null)); }}>
        <label>Person’s name<input name="displayName" maxLength={160} defaultValue={technician.displayName ?? ""} key={`${technician.id}:${technician.displayName}`} /></label>
        <button type="submit" className="secondary-command" disabled={busy}>Save name</button>
      </form>
      {technician.isActive && <button type="button" className="secondary-command" disabled={busy} onClick={() => {
        if (window.confirm(`Deactivate this ${technician.role === "supervisor" ? "supervisor" : "technician"}? They will no longer be able to log in.`)) void mutate(() => deactivateManagerTechnician(technician.id));
      }}>Deactivate</button>}
      {!technician.isActive && technician.role === "inspector" && <button type="button" className="secondary-command" disabled={busy} onClick={() => {
        const confirmation = window.prompt(`Permanently remove ${technician.username} from staff lists? This cannot be undone. Used accounts keep their historical records; unused accounts are deleted. Type the username to confirm.`);
        if (confirmation === technician.username) void mutate(async () => {
          const disposition = await deleteManagerTechnician(technician.id, confirmation);
          setMessage(disposition === "deleted" ? "Unused technician account deleted." : "Technician removed from staff lists; historical records remain.");
        });
      }}>Permanently remove</button>}
    </li>)}</ul>
    {!busy && !visibleTechnicians.length && <p className="empty-state">{technicians.length ? "No active technicians." : "No technicians."}</p>}
  </section>;
}
