export type ProductRole = "technician" | "manager";

export function RoleSelection({
  message,
  onSelect
}: {
  message?: string;
  onSelect: (role: ProductRole) => void;
}) {
  return <section className="role-selection" aria-labelledby="role-selection-title">
    <p className="eyebrow">MFE SERVICES SDN. BHD.</p>
    <h2 id="role-selection-title">Field Service Management</h2>
    <p>Choose how you are signing in:</p>
    <div className="role-selection-options">
      <button type="button" className="role-card" onClick={() => onSelect("technician")}>
        <strong>Technician</strong>
        <span>Complete assigned inspections. Drafts stay saved on this device until you submit, and submitted changes sync when you reconnect.</span>
      </button>
      <button type="button" className="role-card" onClick={() => onSelect("manager")}>
        <strong>Manager</strong>
        <span>Monitor service visits and review completed reports. Managers can also manage customer service assignments; Supervisors use this option for review access.</span>
      </button>
    </div>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
  </section>;
}
