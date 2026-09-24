export type ManagerDashboardRoute = { name: "manager-technicians" | "manager-operations" | "manager-customers" | "manager-services-done" | "manager-upcoming-services" };

export function ManagerHome({ navigate }: { navigate: (route: ManagerDashboardRoute) => void }) {
  const links: Array<[string, ManagerDashboardRoute["name"]]> = [
    ["Technician List", "manager-technicians"], ["Services", "manager-customers"],
    ["Operations", "manager-operations"],
    ["Add Customer", "manager-customers"], ["Current Services Done", "manager-services-done"],
    ["Next Upcoming Service", "manager-upcoming-services"]
  ];
  return <section aria-labelledby="manager-dashboard-title"><h2 id="manager-dashboard-title">Home</h2>
    <div className="manager-dashboard">{links.map(([label, name]) => <button key={label} type="button" className="manager-dashboard-card" onClick={() => navigate({ name })}>{label}</button>)}</div>
    <ManagerCommonRemarks />
  </section>;
}
import { ManagerCommonRemarks } from "./ManagerCommonRemarks";
