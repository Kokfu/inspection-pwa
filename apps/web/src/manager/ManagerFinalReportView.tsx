import { useEffect, useState } from "react";
import { FinalReportApiError, downloadFinalReport, loadFinalReport, type FinalReportPreview } from "../jobs/finalReportApi";
import { FinalReportPresentation } from "../jobs/FinalReportPresentation";
import { loadVisitCorrections, type ManagerVisitCorrection } from "./managerApi";

const managerEndpointBase = "/api/manager/service-visits";
const resultLabels: Record<string, string> = { good: "Good", not_good: "Not Good", complete_repair: "Complete Repair", na: "N.A." };
const show = (value: string | number | null) => value === null || value === "" ? "—" : resultLabels[String(value)] ?? String(value);
function sameCorrectionRevision(report: FinalReportPreview, corrections: ManagerVisitCorrection[]) {
  const counts = report.sections.map((section) => section.review?.correctionCount);
  return counts.every((count, index) => report.sections[index]!.review === undefined || Number.isSafeInteger(count) && count! >= 0)
    && counts.reduce<number>((sum, count) => sum + (count ?? 0), 0) === corrections.length;
}

export function ManagerFinalReportView({ jobId, backLabel = "Back to Operations", onBack, onAuthorizationFailure, onServerUnavailable }: {
  jobId: string;
  backLabel?: string;
  onBack: () => void;
  onAuthorizationFailure: (message: string) => void;
  onServerUnavailable: (message: string) => void;
}) {
  const [report, setReport] = useState<FinalReportPreview>();
  const [message, setMessage] = useState("Loading final report...");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  /** T5: corrections made after submission. The V7 report now shows effective corrected values. */
  const [corrections, setCorrections] = useState<ManagerVisitCorrection[]>([]);
  /** Until the check succeeds the report cannot claim there are none, so the PDF stays withheld. */
  const [correctionsChecked, setCorrectionsChecked] = useState(false);

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

  /** Load both sources until their append-only correction revisions agree. Never display a mixed pair. */
  const refreshReport = async (active = { current: true }) => {
    setReport(undefined); setCorrections([]); setCorrectionsChecked(false);
    setMessage("Loading final report...");
    for (let attempt = 0; attempt < 3 && active.current; attempt += 1) {
      let value: FinalReportPreview;
      try { value = await loadFinalReport(jobId, managerEndpointBase); }
      catch (error: unknown) { if (active.current) handleLoadFailure(error); return; }
      let rows: ManagerVisitCorrection[];
      try { rows = await loadVisitCorrections(jobId); }
      catch { if (active.current) setMessage("Correction history could not be checked. Check again to reload the report."); return; }
      if (!active.current) return;
      if (sameCorrectionRevision(value, rows)) {
        setReport(value); setCorrections(rows); setCorrectionsChecked(true); setMessage("");
        return;
      }
    }
    if (active.current) setMessage("The report changed while loading. Check again to reload it.");
  };

  useEffect(() => {
    let active = true;
    const alive = { get current() { return active; } };
    void refreshReport(alive);
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
    <button type="button" className="secondary-command" onClick={onBack}>{backLabel}</button>
    <div className="workspace-heading">
      <div><p className="eyebrow">Completed service visit</p><h2 id="manager-final-report-title">Final Report</h2></div>
      {report ? <button type="button" disabled={downloading || !correctionsChecked || corrections.length > 0} onClick={() => void handleDownload()}>{downloading ? "Downloading PDF…" : "Download PDF"}</button> : null}
    </div>
    {!report && !correctionsChecked && message !== "Loading final report..." && <p className="operational-message operational-message--warning" role="status">
      Report and correction history could not be shown together.
      <button type="button" className="secondary-command" onClick={() => void refreshReport()}>Check again</button>
    </p>}
    {corrections.length > 0 && <section className="operational-message operational-message--warning" aria-labelledby="manager-report-corrections-title">
      <h3 id="manager-report-corrections-title">{corrections.length} {corrections.length === 1 ? "correction was" : "corrections were"} made after submission</h3>
      <p>The V7 report shows corrected values. The original accepted values remain in the correction history below. The PDF stays unavailable until it includes these corrections.</p>
      <ul>{corrections.map((correction) => <li key={correction.id}>
        <strong>{correction.label}</strong>: {show(correction.previousValue)} → <strong>{show(correction.newValue)}</strong> · {correction.correctedBy} ({correction.correctedByRole}) · {correction.reason}
      </li>)}</ul>
    </section>}
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    {downloadError ? <p className="form-message" role="alert">{downloadError}</p> : null}
    {report ? <FinalReportPresentation report={report} /> : null}
  </section>;
}
