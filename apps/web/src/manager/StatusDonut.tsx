import type { DashboardInspectionStatus } from "./managerApi";

export function StatusDonut({ counts }: { counts: DashboardInspectionStatus }) {
  const total = counts.passed + counts.notOk + counts.na;
  const circumference = 2 * Math.PI * 46;
  const segments = [
    { key: "passed", label: "Passed", count: counts.passed },
    { key: "not-ok", label: "Not OK", count: counts.notOk },
    { key: "na", label: "N/A", count: counts.na }
  ];
  let offset = 0;
  return <section className="dashboard-status report-summary" aria-labelledby="dashboard-status-title">
    <div className="workspace-heading"><div><p className="eyebrow">This month</p><h3 id="dashboard-status-title">Inspection status</h3></div><span>{total} accepted systems</span></div>
    <div className="dashboard-status-content">
      <svg viewBox="0 0 120 120" role="img" aria-label={`Inspection status: ${counts.passed} passed, ${counts.notOk} not OK, ${counts.na} N/A`}>
        <circle cx="60" cy="60" r="46" className="status-donut-track" />
        {total > 0 ? segments.map((segment) => {
          const length = segment.count / total * circumference;
          const start = offset;
          offset += length;
          return segment.count > 0 ? <circle key={segment.key} cx="60" cy="60" r="46"
            className={`status-donut-segment status-donut-segment--${segment.key}`}
            strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start} /> : null;
        }) : null}
        <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="status-donut-total">{total}</text>
      </svg>
      <ul className="status-donut-legend">{segments.map((segment) => <li key={segment.key}><span className={`status-donut-key status-donut-key--${segment.key}`} />{segment.label}<strong>{segment.count}</strong></li>)}</ul>
    </div>
    {total === 0 ? <p className="empty-state">No accepted inspections in this period.</p> : null}
  </section>;
}
