export type ManagerDashboardRoute = { name: "manager-technicians" | "manager-operations" | "manager-customers" | "manager-add-customer" | "manager-common-remarks" | "manager-service-catalog" | "manager-services-done" | "manager-upcoming-services" };

export function ManagerHome({ navigate }: { navigate: (route: ManagerDashboardRoute) => void }) {
  const links: Array<[string, ManagerDashboardRoute["name"]]> = [
    ["Technician List", "manager-technicians"], ["Services", "manager-customers"],
    ["Operations", "manager-operations"],
    ["Add Customer", "manager-add-customer"], ["Current Services Done", "manager-services-done"],
    ["Next Upcoming Service", "manager-upcoming-services"],
    ["Service Common Remarks", "manager-common-remarks"], ["Service Catalog", "manager-service-catalog"]
  ];
  return <section aria-labelledby="manager-dashboard-title"><h2 id="manager-dashboard-title">Home</h2>
    <div className="manager-dashboard">{links.map(([label, name]) => <button key={label} type="button" className="manager-dashboard-card" onClick={() => navigate({ name })}>{label}</button>)}</div>
  </section>;
}
