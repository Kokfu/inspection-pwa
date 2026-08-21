import { useEffect, useState } from "react";
import { downloadFinalReport, loadFinalReport, type FinalReportPreview } from "./finalReportApi";
import { FinalReportPresentation } from "./FinalReportPresentation";

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
    {report ? <FinalReportPresentation report={report} /> : null}
  </section>;
}
