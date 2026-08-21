import type { FinalReportPreview } from "./finalReportApi";

/** Shared read-only Phase 7 report body for both Technician and Manager views. */
export function FinalReportPresentation({ report }: { report: FinalReportPreview }) {
  return <>
    <section className="report-summary"><dl className="job-facts">
      <div><dt>Customer</dt><dd>{report.customer}</dd></div><div><dt>Site</dt><dd>{report.site}</dd></div>
      <div><dt>Service Date</dt><dd>{report.serviceDate}</dd></div><div><dt>Job Reference</dt><dd>{report.jobReference}</dd></div>
      <div><dt>Completed Date</dt><dd>{report.completedAt}</dd></div><div><dt>Completed By</dt><dd>{report.completedBy}</dd></div>
    </dl></section>
    <section className="report-summary"><h3>Service Summary</h3><ul>{report.systems.map((system) => <li key={system.systemKey}><strong>{system.label}</strong>: {system.status}{system.locations.length > 1 ? ` - ${system.locations.join(", ")}` : ""}</li>)}</ul></section>
    {report.sections.map((section, index) => <section className="report-section" key={`${section.systemKey}:${section.location?.instanceKey ?? index}`}>
      <h3>{section.label}{section.location ? ` - ${section.location.zoneLabel ? `${section.location.zoneLabel} / ` : ""}${section.location.locationLabel}` : ""}</h3>
      <dl>{section.fields.map((field, fieldIndex) => <div className={`report-field report-field--depth-${Math.min(field.depth, 3)}`} key={`${field.label}:${fieldIndex}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      {section.evidence.map((evidence) => <p className="evidence-confirmed" key={evidence.field}>Final evidence accepted: {evidence.field.replace(/([a-z])([A-Z])/g, "$1 $2")}</p>)}
    </section>)}
  </>;
}
