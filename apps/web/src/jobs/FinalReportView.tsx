import { useEffect, useState } from "react";
import { downloadFinalReport, loadFinalReport, type FinalReportPreview } from "./finalReportApi";

export function FinalReportView({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const [report, setReport] = useState<FinalReportPreview>();
  const [message, setMessage] = useState("Loading final report...");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    let active = true;
    void loadFinalReport(jobId).then((value) => { if (active) { setReport(value); setMessage(""); } }, (error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Final report is currently unavailable."); });
    return () => { active = false; };
  }, [jobId]);
  const handleDownload = async () => {
    setDownloadError(""); setDownloading(true);
    try { await downloadFinalReport(jobId); }
    catch (error: unknown) { setDownloadError(error instanceof Error ? error.message : "The final report PDF could not be downloaded. Please try again."); }
    finally { setDownloading(false); }
  };
  return <section className="final-report" aria-labelledby="final-report-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Service Job</button>
    <div className="workspace-heading">
      <div><p className="eyebrow">Completed service visit</p><h2 id="final-report-title">Final Report</h2></div>
      {report ? <button type="button" onClick={() => void handleDownload()} disabled={downloading}>{downloading ? "Downloading PDF..." : "Download PDF"}</button> : null}
    </div>
    {message ? <p className="form-message">{message}</p> : null}
    {downloadError ? <p className="form-message" role="alert">{downloadError}</p> : null}
    {report ? <>
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
    </> : null}
  </section>;
}
