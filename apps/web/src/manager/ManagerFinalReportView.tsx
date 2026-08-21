import { useEffect, useState } from "react";
import { FinalReportApiError, downloadFinalReport, loadFinalReport, type FinalReportPreview } from "../jobs/finalReportApi";
import { FinalReportPresentation } from "../jobs/FinalReportPresentation";

const managerEndpointBase = "/api/manager/service-visits";

export function ManagerFinalReportView({ jobId, onBack, onAuthorizationFailure, onServerUnavailable }: {
  jobId: string;
  onBack: () => void;
  onAuthorizationFailure: (message: string) => void;
  onServerUnavailable: (message: string) => void;
}) {
  const [report, setReport] = useState<FinalReportPreview>();
  const [message, setMessage] = useState("Loading final report...");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const handleLoadFailure = (error: unknown) => {
    const reportError = error instanceof FinalReportApiError
      ? error
      : new FinalReportApiError("Final report is currently unavailable.", "unavailable");
    if (reportError.kind === "domain") {
      setMessage(reportError.message);
      return;
    }
    setReport(undefined);
    setMessage(reportError.message);
    if (reportError.kind === "authorization") onAuthorizationFailure(reportError.message);
    else onServerUnavailable(reportError.message);
  };

  const handleDownloadFailure = (error: unknown) => {
    const reportError = error instanceof FinalReportApiError
      ? error
      : new FinalReportApiError("The final report PDF could not be downloaded. Please try again.", "unavailable");
    if (reportError.kind === "domain") {
      setDownloadError(reportError.message);
      return;
    }
    setReport(undefined);
    if (reportError.kind === "authorization") onAuthorizationFailure(reportError.message);
    else onServerUnavailable(reportError.message);
  };

  useEffect(() => {
    let active = true;
    void loadFinalReport(jobId, managerEndpointBase).then(
      (value) => { if (active) { setReport(value); setMessage(""); } },
      (error: unknown) => { if (active) handleLoadFailure(error); }
    );
    return () => { active = false; };
  // Manager callbacks are intentionally handled at failure time; changing App render state must not reload the report.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const handleDownload = async () => {
    setDownloadError("");
    setDownloading(true);
    try { await downloadFinalReport(jobId, managerEndpointBase); }
    catch (error: unknown) { handleDownloadFailure(error); }
    finally { setDownloading(false); }
  };

  return <section className="final-report" aria-labelledby="manager-final-report-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Operations</button>
    <div className="workspace-heading">
      <div><p className="eyebrow">Completed service visit</p><h2 id="manager-final-report-title">Final Report</h2></div>
      {report ? <button type="button" disabled={downloading} onClick={() => void handleDownload()}>{downloading ? "Downloading PDF…" : "Download PDF"}</button> : null}
    </div>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    {downloadError ? <p className="form-message" role="alert">{downloadError}</p> : null}
    {report ? <FinalReportPresentation report={report} /> : null}
  </section>;
}
