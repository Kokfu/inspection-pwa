import { useEffect, useMemo, useState } from "react";
import { loadDashboardClients, loadDashboardInspectionStatus, loadDashboardTrend, loadManagerServiceHistory, type DashboardInspectionStatus } from "./managerApi";
import { InspectionTrend } from "./InspectionTrend";
import { StatusDonut } from "./StatusDonut";
import { KpiTiles } from "./KpiTiles";

export type ManagerDashboardRoute = { name: "manager-technicians" | "manager-operations" | "manager-customers" | "manager-add-customer" | "manager-common-remarks" | "manager-service-catalog" | "manager-services-done" | "manager-upcoming-services" | "manager-company-profile" | "manager-email-reminders" };

/**
 * Single source of truth for the manager/supervisor top-level destinations, shared by the
 * Home dashboard's card grid and the persistent sidebar (`AppShell`) so the two never drift.
 */
export function managerNavLinks(supervisor: boolean): Array<[string, ManagerDashboardRoute["name"]]> {
  return supervisor
    ? [["Services", "manager-operations"], ["Current Services Done", "manager-services-done"]]
    : [
        ["Technician List", "manager-technicians"], ["Services", "manager-customers"],
        ["Operations", "manager-operations"],
        ["Add Customer", "manager-add-customer"], ["Current Services Done", "manager-services-done"],
        ["Next Upcoming Service", "manager-upcoming-services"],
        ["Service Common Remarks", "manager-common-remarks"], ["Service Catalog", "manager-service-catalog"],
        ["Company Profile", "manager-company-profile"], ["Email reminders", "manager-email-reminders"]
      ];
}

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
const kpiIcons = {
  clients: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  inspections: <><path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  passed: <><path d="M9 12l2 2 4-4" /><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" /></>,
  notOk: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  na: <><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" /><path d="M8 12h8" /></>
} as const;

function percentOf(count: number, total: number) {
  return total > 0 ? `${(count / total * 100).toFixed(1)}%` : undefined;
}

export function ManagerHome({ navigate, supervisor = false }: { navigate: (route: ManagerDashboardRoute) => void; supervisor?: boolean }) {
  const links = managerNavLinks(supervisor);
  const today = useMemo(malaysiaToday, []);
  const from = `${today.slice(0, 7)}-01`;
  const to = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [clients, setClients] = useState<number | null>(null);
  const [inspections, setInspections] = useState<number | null>(null);
  const [trend, setTrend] = useState<Array<{ day: string; count: number }> | null>(null);
  const [status, setStatus] = useState<DashboardInspectionStatus | null>(null);
  const [error, setError] = useState(false);
  const acceptedTotal = status ? status.passed + status.notOk + status.na : 0;
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
    void loadDashboardInspectionStatus(from, to, controller.signal)
      .then((inspectionStatus) => { if (!controller.signal.aborted) setStatus(inspectionStatus); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [from, to]);
  return <section aria-labelledby="manager-dashboard-title">
    <div className="workspace-heading"><div><p className="eyebrow">{supervisor ? "Supervisor workspace" : "Manager workspace"}</p><h2 id="manager-dashboard-title">Home</h2></div></div>
    <KpiTiles label="Dashboard summary" items={[
      { label: "Total Clients", value: clients ?? "—", icon: kpiIcons.clients, tone: "brand" },
      { label: "Total Inspections", value: inspections ?? "—", icon: kpiIcons.inspections, tone: "brand", meta: "This month" },
      { label: "Passed", value: status?.passed ?? "—", icon: kpiIcons.passed, tone: "success", meta: status ? percentOf(status.passed, acceptedTotal) : undefined },
      { label: "Not OK", value: status?.notOk ?? "—", icon: kpiIcons.notOk, tone: "danger", meta: status ? percentOf(status.notOk, acceptedTotal) : undefined },
      { label: "N/A", value: status?.na ?? "—", icon: kpiIcons.na, tone: "neutral", meta: status ? percentOf(status.na, acceptedTotal) : undefined }
    ]} />
    {error ? <p className="form-message" role="alert">Dashboard data could not be loaded. Open Home again to retry.</p> : null}
    {trend || status ? <div className="dashboard-charts">
      {trend ? <InspectionTrend from={from} to={to} days={trend} /> : null}
      {status ? <StatusDonut counts={status} /> : null}
    </div> : null}
    <div className="manager-dashboard">{links.map(([label, name]) => <button key={label} type="button" className="manager-dashboard-card" onClick={() => navigate({ name })}>{label}</button>)}</div>
  </section>;
}
