import type { FinalReportPreview } from "./finalReportApi";
import { formatMalaysiaDateTime } from "../uiPresentation";

/** --failed / --refer / --good modifier for the derived "Summary of Testing" condition cell. */
const conditionModifier = (condition: FinalReportPreview["systems"][number]["condition"]) =>
  condition === "FAILED" ? "failed" : condition === "REFER DETAIL PAGE" ? "refer" : "good";

/** Shared read-only Phase 7 report body for both Technician and Manager views. */
export function FinalReportPresentation({ report }: { report: FinalReportPreview }) {
  const jobFacts: Array<{ label: string; value: string }> = [
    { label: "Customer", value: report.customer },
    { label: "Site", value: report.site },
    { label: "Service Date", value: report.serviceDate },
    { label: "Job Reference", value: report.jobReference },
    { label: "Completed Date", value: formatMalaysiaDateTime(report.completedAt) },
    { label: "Completed By", value: report.completedBy },
  ];
  return <>
    <section className="accepted-record-notice"><strong>Accepted inspection record</strong><p>This report shows the recorded field conditions accepted for this completed service visit.</p></section>
    <section className="report-summary report-summary--facts" aria-label="Service visit details">
      <dl className="job-facts">
        {jobFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value || "—"}</dd></div>)}
      </dl>
    </section>
    <section className="report-summary report-summary--index">
      <h3>Summary of Testing</h3>
      <div className="report-table-scroll">
        <table className="service-summary-table">
          <thead><tr><th scope="col">No.</th><th scope="col">System</th><th scope="col">Location(s)</th><th scope="col">Condition</th></tr></thead>
          <tbody>
            {report.systems.map((system, index) => <tr key={system.systemKey}>
              <td className="service-summary-table__no">{index + 1}</td>
              <th scope="row">{system.label}</th>
              <td>{system.locations.length > 0 ? system.locations.join(", ") : "—"}</td>
              <td className={`service-summary-table__condition service-summary-table__condition--${conditionModifier(system.condition)}`}>
                {system.condition}
                {system.conditionDetail ? <span className="service-summary-table__detail">{system.conditionDetail}</span> : null}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    {report.sections.map((section, index) => <section className="report-section" key={`${section.systemKey}:${section.location?.instanceKey ?? index}`}>
      <h3>{section.label}{section.location ? ` - ${section.location.zoneLabel ? `${section.location.zoneLabel} / ` : ""}${section.location.locationLabel}` : ""}</h3>
      <dl>{section.fields.map((field, fieldIndex) => <div className={`report-field report-field--depth-${Math.min(field.depth, 3)}`} key={`${field.label}:${fieldIndex}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      {section.evidence.map((evidence) => <p className="evidence-confirmed" key={evidence.field}>Photo evidence is included in the downloaded PDF: {evidence.field.replace(/([a-z])([A-Z])/g, "$1 $2")}</p>)}
    </section>)}
  </>;
}
