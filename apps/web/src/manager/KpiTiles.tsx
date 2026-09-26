import type { ReactNode } from "react";

export type KpiTone = "brand" | "success" | "danger" | "neutral";

export type KpiItem = {
  label: string;
  value: number | string;
  /** <path>/<circle> children for a 24x24 stroke icon; omit for the plain (non-iconic) tile style. */
  icon?: ReactNode;
  tone?: KpiTone;
  /** Short annotation under the value, e.g. "88.5%" or "This month". */
  meta?: string;
};

export function KpiTiles({ label, items }: { label: string; items: KpiItem[] }) {
  const iconic = items.some((item) => item.icon);
  return <dl className={iconic ? "dashboard-kpis" : "operations-summary"} aria-label={label}>
    {items.map((item) => item.icon ? <div key={item.label} className="dashboard-kpi">
      <span className={`dashboard-kpi-icon dashboard-kpi-icon--${item.tone ?? "brand"}`} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
      </span>
      <div className="dashboard-kpi-body">
        <dt>{item.label}</dt>
        <dd>{item.value}</dd>
        {item.meta ? <span className={`dashboard-kpi-meta dashboard-kpi-meta--${item.tone ?? "brand"}`}>{item.meta}</span> : null}
      </div>
    </div> : <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
  </dl>;
}
