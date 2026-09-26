import { useEffect, useMemo, useState } from "react";
import { loadDashboardClients, loadDashboardTrend, loadManagerServiceHistory } from "./managerApi";
import { InspectionTrend } from "./InspectionTrend";
import { KpiTiles } from "./KpiTiles";

export type ManagerDashboardRoute = { name: "manager-technicians" | "manager-operations" | "manager-customers" | "manager-add-customer" | "manager-common-remarks" | "manager-service-catalog" | "manager-services-done" | "manager-upcoming-services" };

function malaysiaToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

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
  const today = useMemo(malaysiaToday, []);
  const from = `${today.slice(0, 7)}-01`;
  const to = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [clients, setClients] = useState<number | null>(null);
  const [inspections, setInspections] = useState<number | null>(null);
  const [trend, setTrend] = useState<Array<{ day: string; count: number }> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      loadDashboardClients(controller.signal),
      loadManagerServiceHistory({ from, to, limit: 1 }, controller.signal),
      loadDashboardTrend(from, to, controller.signal)
    ]).then(([totalClients, history, days]) => {
      if (controller.signal.aborted) return;
      if (!Number.isSafeInteger(history.totalCount) || history.totalCount < 0) throw new Error("Invalid dashboard count");
      setClients(totalClients); setInspections(history.totalCount); setTrend(days);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [from, to]);
  return <section aria-labelledby="manager-dashboard-title">
    <div className="workspace-heading"><div><p className="eyebrow">{supervisor ? "Supervisor workspace" : "Manager workspace"}</p><h2 id="manager-dashboard-title">Home</h2></div></div>
    <KpiTiles label="Dashboard summary" items={[{ label: "Total Clients", value: clients ?? "—" }, { label: "Total Inspections This Month", value: inspections ?? "—" }]} />
    {error ? <p className="form-message" role="alert">Dashboard data could not be loaded. Open Home again to retry.</p> : null}
    {trend ? <InspectionTrend from={from} to={to} days={trend} /> : null}
    <div className="manager-dashboard">{links.map(([label, name]) => <button key={label} type="button" className="manager-dashboard-card" onClick={() => navigate({ name })}>{label}</button>)}</div>
  </section>;
}
