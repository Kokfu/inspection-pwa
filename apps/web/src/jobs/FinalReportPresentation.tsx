import { useRef } from "react";
import type { FinalReportPreview, FinalReportResultDisplay, FinalReportServiceSummary, FinalReportSummaryItem } from "./finalReportApi";
import { GalleryPhotoLabel } from "../attachments/photoSourceLabel";
import { formatMalaysiaDateTime } from "../uiPresentation";

type Section = FinalReportPreview["sections"][number];

/** --failed / --refer / --good modifier for the derived "Summary of Testing" condition cell. */
const conditionModifier = (condition: FinalReportPreview["systems"][number]["condition"]) =>
  condition === "FAILED" ? "failed" : condition === "REFER DETAIL PAGE" ? "refer" : "good";

const serviceConditionLabel: Record<FinalReportServiceSummary["condition"], string> = {
  "GOOD CONDITIONS": "All good", "REFER DETAIL PAGE": "Repair needed", FAILED: "Issues found"
};
const resultLabel: Record<FinalReportResultDisplay, string> = {
  GOOD: "Good", "NOT GOOD": "Not good", "COMPLETE REPAIR": "Complete repair", "N/A": "N/A", POOR: "Poor", "NOT RELEVANT": "Not relevant"
};

const sectionHeading = (section: Section) =>
  `${section.label}${section.location ? ` - ${section.location.zoneLabel ? `${section.location.zoneLabel} / ` : ""}${section.location.locationLabel}` : ""}`;

function ReviewNote({ review }: { review: NonNullable<Section["review"]> }) {
  return <p className="operational-message" role="status">
    Submitted by Technician: {review.submittedBy ?? "identity unavailable"}. {review.status === "reviewed"
      ? `Reviewed by Admin: ${review.reviewedBy ?? "identity unavailable"}${review.reviewedAt ? ` on ${formatMalaysiaDateTime(review.reviewedAt)}` : ""}.`
      : "Pending Review."}
  </p>;
}

function EvidenceLines({ evidence }: { evidence: Section["evidence"] }) {
  return <>{evidence.map((item) => <p className="evidence-confirmed" key={item.field}>Photo evidence is included in the downloaded PDF: {item.caption ?? item.field.replace(/([a-z])([A-Z])/g, "$1 $2")}. {item.captureSource === "gallery" ? <GalleryPhotoLabel captureSource="gallery" capturedAt={item.capturedAt} /> : <strong>{item.captureSource === "camera" ? "Captured by Camera" : "Source unavailable"}</strong>}</p>)}</>;
}

function ResultPill({ item }: { item: FinalReportSummaryItem }) {
  return <span className={`result-pill result-pill--${item.tone}`}>{resultLabel[item.result]}</span>;
}

/** A finding keeps its own remark directly under it. `heading` names the service on the page-level list. */
function FindingRow({ item, heading }: { item: FinalReportSummaryItem; heading?: string }) {
  const where = [heading, item.where].filter(Boolean).join(" — ");
  return <li className="service-item service-item--finding">
    {where ? <span className="service-item__where">{where}</span> : null}
    <span className="service-item__main"><span className="service-item__label">{item.label}</span><ResultPill item={item} /></span>
    {item.remark ? <p className="service-item__remark">{item.remark}</p> : null}
  </li>;
}

function CheckedItems({ items }: { items: FinalReportSummaryItem[] }) {
  const groups = new Map<string, FinalReportSummaryItem[]>();
  for (const item of items) groups.set(item.where ?? "", [...(groups.get(item.where ?? "") ?? []), item]);
  return <>{[...groups].map(([where, rows]) => <div className="service-group" key={where}>
    {where ? <h5 className="service-group__title">{where}</h5> : null}
    <ul className="service-checked-list">{rows.map((item, index) => <li key={`${item.label}:${index}`}><span className="service-item__label">{item.label}</span><ResultPill item={item} /></li>)}</ul>
  </div>)}</>;
}

function countsLine({ counts, readings }: FinalReportServiceSummary) {
  if (counts.checked === 0) return readings.length > 0 ? `${readings.length} readings recorded` : "Nothing recorded";
  return [`${counts.checked} checked`, counts.good > 0 ? `${counts.good} good` : null, counts.notRelevant > 0 ? `${counts.notRelevant} N/A` : null, counts.findings > 0 ? `${counts.findings} need attention` : null]
    .filter(Boolean).join(" · ");
}

function ServiceCard({ section, summary }: { section: Section; summary: FinalReportServiceSummary }) {
  const modifier = conditionModifier(summary.condition);
  const { counts } = summary;
  // Collapsed by default: the page-level "Needs attention" list already shows every finding.
  return <details className={`service-card service-card--${modifier}`}>
    <summary className="service-card__summary">
      <span className="service-card__title"><strong>{sectionHeading(section)}</strong><span className="service-card__counts">{countsLine(summary)}</span></span>
      <span className={`service-card__badge service-card__badge--${modifier}`}>{serviceConditionLabel[summary.condition]}</span>
    </summary>
    <div className="service-card__body">
      {section.review ? <ReviewNote review={section.review} /> : null}
      {summary.findings.length > 0
        ? <><h4 className="service-card__heading">Needs attention</h4><ul className="service-findings">{summary.findings.map((item, index) => <FindingRow key={`${item.label}:${index}`} item={item} />)}</ul></>
        : <p className="service-card__clear">Nothing needs attention for this service.</p>}
      {summary.checked.length > 0 ? <details className="service-card__more">
        <summary>{counts.good} good{counts.notRelevant > 0 ? ` · ${counts.notRelevant} N/A` : ""} — show checked items</summary>
        <CheckedItems items={summary.checked} />
      </details> : null}
      {summary.readings.length > 0 ? <details className="service-card__more">
        <summary>Readings and counts ({summary.readings.length})</summary>
        <dl className="service-readings">{summary.readings.map((reading, index) => <div key={`${reading.label}:${index}`}><dt>{reading.label}</dt><dd>{reading.value}</dd></div>)}</dl>
      </details> : null}
      {summary.comments ? <div className="service-card__comments"><h4 className="service-card__heading">Comments</h4><p>{summary.comments}</p></div> : null}
      <EvidenceLines evidence={section.evidence} />
    </div>
  </details>;
}

function IssuesFound({ sections }: { sections: Section[] }) {
  const issues = sections.flatMap((section) => (section.summary?.findings ?? []).map((item) => ({ section, item })));
  const allSummarised = sections.length > 0 && sections.every((section) => section.summary !== undefined);
  if (issues.length === 0) {
    return allSummarised ? <section className="report-summary report-issues report-issues--clear" aria-label="Items needing attention"><p><strong>No issues found.</strong> Every checked item is Good or N/A.</p></section> : null;
  }
  return <section className="report-summary report-issues" aria-label="Items needing attention">
    <h3>Needs attention ({issues.length})</h3>
    <ul className="service-findings">{issues.map(({ section, item }, index) => <FindingRow key={`${section.systemKey}:${section.location?.instanceKey ?? ""}:${index}`} item={item} heading={sectionHeading(section)} />)}</ul>
  </section>;
}

/** Shared read-only Phase 7 report body for both Technician and Manager views. */
export function FinalReportPresentation({ report }: { report: FinalReportPreview }) {
  const detail = useRef<HTMLDivElement>(null);
  const setAllOpen = (open: boolean) => detail.current?.querySelectorAll("details").forEach((element) => { element.open = open; });
  const jobFacts: Array<{ label: string; value: string }> = [
    { label: "Customer", value: report.customer },
    { label: "Site", value: report.site },
    { label: "Service Date", value: report.serviceDate },
    { label: "Job Reference", value: report.jobReference },
    { label: "Completed Date", value: formatMalaysiaDateTime(report.completedAt) },
    { label: "Completed By", value: report.completedBy },
  ];
  const summarised = report.sections.some((section) => section.summary !== undefined);
  return <>
    <section className="accepted-record-notice"><strong>Accepted inspection record</strong><p>This report shows the current recorded field conditions for this completed service visit.</p></section>
    <section className="report-summary report-summary--facts" aria-label="Service visit details">
      <dl className="job-facts">
        {jobFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value || "—"}</dd></div>)}
      </dl>
    </section>
    <IssuesFound sections={report.sections} />
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
    {summarised ? <div className="service-card-actions">
      <button type="button" className="secondary-command" onClick={() => setAllOpen(true)}>Expand all</button>
      <button type="button" className="secondary-command" onClick={() => setAllOpen(false)}>Collapse all</button>
    </div> : null}
    <div className="service-card-list" ref={detail}>
      {report.sections.map((section, index) => section.summary
        ? <ServiceCard key={`${section.systemKey}:${section.location?.instanceKey ?? index}`} section={section} summary={section.summary} />
        : <section className="report-section" key={`${section.systemKey}:${section.location?.instanceKey ?? index}`}>
          <h3>{sectionHeading(section)}</h3>
          {section.review ? <ReviewNote review={section.review} /> : null}
          <dl>{section.fields.map((field, fieldIndex) => <div className={`report-field report-field--depth-${Math.min(field.depth, 3)}`} key={`${field.label}:${fieldIndex}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
          <EvidenceLines evidence={section.evidence} />
        </section>)}
    </div>
  </>;
}
