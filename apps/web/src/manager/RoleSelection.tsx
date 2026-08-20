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
        <span>Complete assigned field inspections, work offline, sync and submit service visits.</span>
      </button>
      <button type="button" className="role-card" onClick={() => onSelect("manager")}>
        <strong>Manager</strong>
        <span>Monitor service visits, review completed service history and access final reports.</span>
      </button>
    </div>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
  </section>;
}
