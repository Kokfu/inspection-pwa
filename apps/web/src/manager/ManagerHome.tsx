export type ManagerDashboardRoute = { name: "manager-technicians" | "manager-operations" | "manager-customers" | "manager-services-done" | "manager-upcoming-services" };

/** Cards a supervisor sees (T4): review only — no technician, customer or schedule management. */
const supervisorCards: ReadonlySet<ManagerDashboardRoute["name"]> = new Set(["manager-operations", "manager-services-done"]);

export function ManagerHome({ navigate, supervisor = false }: { navigate: (route: ManagerDashboardRoute) => void; supervisor?: boolean }) {
  const links: Array<[string, ManagerDashboardRoute["name"]]> = ([
    ["Technician List", "manager-technicians"], ["Services", "manager-operations"],
    ["Add Customer", "manager-customers"], ["Current Services Done", "manager-services-done"],
    ["Next Upcoming Service", "manager-upcoming-services"]
  ] as Array<[string, ManagerDashboardRoute["name"]]>).filter(([, name]) => !supervisor || supervisorCards.has(name));
  return <section aria-labelledby="manager-dashboard-title"><h2 id="manager-dashboard-title">Home</h2>
    <div className="manager-dashboard">{links.map(([label, name]) => <button key={name} type="button" className="manager-dashboard-card" onClick={() => navigate({ name })}>{label}</button>)}</div>
  </section>;
}
