import { useEffect, useState } from "react";
import { downloadFinalReport, loadFinalReport, type FinalReportPreview } from "../jobs/finalReportApi";

const managerEndpointBase = "/api/manager/service-visits";

export function ManagerFinalReportView({ jobId, onBack, onServerUnavailable }: {
  jobId: string;
  onBack: () => void;
  onServerUnavailable: (message: string) => void;
}) {
  const [report, setReport] = useState<FinalReportPreview>();
  const [message, setMessage] = useState("Loading final report...");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => { let active = true; void loadFinalReport(jobId, managerEndpointBase).then((value) => { if (active) { setReport(value); setMessage(""); } }, () => { if (active) { setReport(undefined); setMessage("Final report is currently unavailable."); onServerUnavailable("Manager Operations cannot be verified or refreshed right now."); } }); return () => { active = false; }; }, [jobId, onServerUnavailable]);
  return <section className="final-report" aria-labelledby="manager-final-report-title"><button type="button" className="secondary-command" onClick={onBack}>Back to Operations</button><div className="workspace-heading"><div><p className="eyebrow">Completed service visit</p><h2 id="manager-final-report-title">Final Report</h2></div>{report ? <button type="button" disabled={downloading} onClick={async () => { setDownloadError(""); setDownloading(true); try { await downloadFinalReport(jobId, managerEndpointBase); } catch (error) { setReport(undefined); setDownloadError(error instanceof Error ? error.message : "The final report PDF could not be downloaded."); onServerUnavailable("Manager Operations cannot be verified or refreshed right now."); } finally { setDownloading(false); } }}>{downloading ? "Downloading PDF…" : "Download PDF"}</button> : null}</div>{message ? <p className="form-message" role="alert">{message}</p> : null}{downloadError ? <p className="form-message" role="alert">{downloadError}</p> : null}{report ? <><dl className="job-facts"><div><dt>Customer</dt><dd>{report.customer}</dd></div><div><dt>Site</dt><dd>{report.site}</dd></div><div><dt>Service Date</dt><dd>{report.serviceDate}</dd></div><div><dt>Job Reference</dt><dd>{report.jobReference}</dd></div><div><dt>Completed Date</dt><dd>{report.completedAt}</dd></div><div><dt>Completed By</dt><dd>{report.completedBy}</dd></div></dl><section className="report-summary"><h3>Applicable Systems</h3><ul>{report.systems.map((system) => <li key={system.systemKey}>{system.label}: {system.status}</li>)}</ul></section></> : null}</section>;
}
