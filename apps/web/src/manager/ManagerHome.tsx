export type ManagerDashboardRoute = { name: "manager-technicians" | "manager-operations" | "manager-customers" | "manager-add-customer" | "manager-common-remarks" | "manager-service-catalog" | "manager-services-done" | "manager-upcoming-services" };

/**
 * Cards a supervisor sees (T4): review only — no technician, customer or schedule management. The
 * admin-facing "Services" card opens Customer Configuration (`manager-customers`, added by the later
 * Manager UI navigation split); that screen is off-limits to a supervisor (`roleAccess.ts`). A
 * supervisor's own "Services" card therefore points at the review/operations list instead — same
 * label as the pre-split single "Services" card T4 was designed and tested against, different target.
 */
export function ManagerHome({ navigate, supervisor = false }: { navigate: (route: ManagerDashboardRoute) => void; supervisor?: boolean }) {
  const links: Array<[string, ManagerDashboardRoute["name"]]> = supervisor
    ? [["Services", "manager-operations"], ["Current Services Done", "manager-services-done"]]
    : [
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
