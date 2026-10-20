import "./ManagerApprovals.css";

export function ManagerSettings({ navigate }: { navigate: (route: { name: "manager-email-reminders" | "manager-company-profile" }) => void }) {
  return <section className="manager-hub" aria-labelledby="manager-settings-title">
    <div className="workspace-heading"><h2 id="manager-settings-title">Settings</h2></div>
    <div className="manager-dashboard manager-hub-grid">{([
      ["Email reminders", "Sender and recipients", "manager-email-reminders"],
      ["Company profile", "Name, address, logo", "manager-company-profile"]
    ] as const).map(([title, description, name]) => <button type="button" className="manager-dashboard-card manager-hub-card" key={name} onClick={() => navigate({ name })}>
      <span className="manager-hub-copy"><strong>{title}</strong><span>{description}</span></span>
    </button>)}</div>
  </section>;
}
