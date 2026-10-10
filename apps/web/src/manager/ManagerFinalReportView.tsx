import { reviewerRoleLabel } from "./roleAccess";
import { useEffect, useState } from "react";
import { FinalReportApiError, downloadFinalReport, loadFinalReport, type FinalReportPreview } from "../jobs/finalReportApi";
import { FinalReportPresentation } from "../jobs/FinalReportPresentation";
import {
  loadReportApproval, loadVisitCorrections, submitReportApproval,
  type ManagerVisitCorrection, type ReportApprovalState
} from "./managerApi";

const managerEndpointBase = "/api/manager/service-visits";
const resultLabels: Record<string, string> = { good: "Good", not_good: "Not Good", complete_repair: "Complete Repair", na: "N.A." };
const show = (value: string | number | null) => value === null || value === "" ? "—" : resultLabels[String(value)] ?? String(value);
function sameCorrectionRevision(report: FinalReportPreview, corrections: ManagerVisitCorrection[]) {
  const counts = report.sections.map((section) => section.review?.correctionCount);
  return counts.every((count, index) => report.sections[index]!.review === undefined || Number.isSafeInteger(count) && count! >= 0)
    && counts.reduce<number>((sum, count) => sum + (count ?? 0), 0) === corrections.length;
}

function formatWhen(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : value;
}

/** T6: current approval state, who decided and when, and the controls to approve/withdraw. */
function ReportApprovalPanel({ jobId, currentUserRole, reportApproval, checked, onChanged }: {
  jobId: string;
  currentUserRole?: "admin" | "supervisor";
  reportApproval: ReportApprovalState | undefined;
  checked: boolean;
  onChanged: (state: ReportApprovalState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  if (!checked) return <p className="form-message" role="status">Checking report approval…</p>;
  if (!reportApproval || reportApproval.status === "not_applicable") return null;

  const decide = async (decision: "approved" | "withdrawn") => {
    setError("");
    if (decision === "withdrawn" && note.trim().length < 3) { setError("A note of at least 3 characters is required to withdraw approval."); return; }
    setBusy(true);
    try {
      const { reportApproval: next } = await submitReportApproval(jobId, {
        requestId: crypto.randomUUID(), decision, expectedStatus: reportApproval.status === "approved" ? "approved" : "awaiting_approval",
        ...(decision === "withdrawn" ? { note: note.trim() } : {})
      });
      onChanged(next);
      setNote(""); setWithdrawing(false);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "The approval decision could not be saved. Please try again.");
    } finally { setBusy(false); }
  };

  return <section className="operational-message" aria-labelledby="manager-report-approval-title">
    <h3 id="manager-report-approval-title">
      {reportApproval.status === "approved" ? "Report approved" : "Awaiting approval"}
      {reportApproval.correctedAfterApproval && " — corrected after approval, re-approval needed"}
    </h3>
    {reportApproval.decidedBy && <p>
      {reportApproval.status === "approved" ? "Approved" : "Last decided"} by {reportApproval.decidedBy} ({reviewerRoleLabel(reportApproval.decidedByRole)}){reportApproval.decidedAt ? ` on ${formatWhen(reportApproval.decidedAt)}` : ""}.
      {reportApproval.note ? ` "${reportApproval.note}"` : ""}
    </p>}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {currentUserRole && reportApproval.status !== "approved" && <button type="button" disabled={busy} onClick={() => void decide("approved")}>
      {busy ? "Approving…" : "Approve report"}
    </button>}
    {currentUserRole === "admin" && reportApproval.status === "approved" && !withdrawing && <button type="button" className="secondary-command danger-command" onClick={() => setWithdrawing(true)}>Withdraw approval</button>}
    {currentUserRole === "admin" && reportApproval.status === "approved" && withdrawing && <div className="inline-actions">
      <label htmlFor="report-approval-withdraw-note">Reason for withdrawing (required)</label>
      <textarea id="report-approval-withdraw-note" value={note} onChange={(event) => setNote(event.target.value)} minLength={3} maxLength={500} />
      <button type="button" disabled={busy} onClick={() => void decide("withdrawn")}>{busy ? "Withdrawing…" : "Confirm withdraw"}</button>
      <button type="button" className="secondary-command" onClick={() => { setWithdrawing(false); setNote(""); setError(""); }}>Cancel</button>
    </div>}
  </section>;
}

export function ManagerFinalReportView({ jobId, backLabel = "Back to Operations", currentUserRole, onBack, onAuthorizationFailure, onServerUnavailable }: {
  jobId: string;
  backLabel?: string;
  /** Admin/supervisor only; a supervisor can never withdraw (T6 §8 Q1). */
  currentUserRole?: "admin" | "supervisor";
  onBack: () => void;
  onAuthorizationFailure: (message: string) => void;
  onServerUnavailable: (message: string) => void;
}) {
  const [report, setReport] = useState<FinalReportPreview>();
  const [message, setMessage] = useState("Loading final report…");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  /** T5: corrections made after submission. The V7 report now shows effective corrected values. */
  const [corrections, setCorrections] = useState<ManagerVisitCorrection[]>([]);
  /** Until the check succeeds the report cannot claim there are none, so the PDF stays withheld. */
  const [correctionsChecked, setCorrectionsChecked] = useState(false);
  /** T6: the report's approval state. Until this check succeeds, the PDF stays withheld too. */
  const [reportApproval, setReportApproval] = useState<ReportApprovalState>();
  const [reportApprovalChecked, setReportApprovalChecked] = useState(false);

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
    setMessage("Loading final report…");
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

  /** Re-run the approval check after a transient failure, without reloading the page. */
  const checkReportApproval = (active = { current: true }) => loadReportApproval(jobId).then(
    ({ reportApproval: state }) => { if (active.current) { setReportApproval(state); setReportApprovalChecked(true); } },
    () => undefined
  );

  useEffect(() => {
    let active = true;
    setReportApproval(undefined); setReportApprovalChecked(false);
    const alive = { get current() { return active; } };
    void refreshReport(alive);
    // Best effort: the report itself never depends on the approval state.
    void checkReportApproval(alive);
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
      {report ? <button type="button" disabled={downloading || !correctionsChecked || corrections.length > 0 || !reportApprovalChecked || reportApproval?.status !== "approved"} onClick={() => void handleDownload()}>{downloading ? "Downloading PDF…" : "Download PDF"}</button> : null}
    </div>
    {!report && !correctionsChecked && message !== "Loading final report…" && <p className="operational-message operational-message--warning" role="status">
      Report and correction history could not be shown together.
      <button type="button" className="secondary-command" onClick={() => void refreshReport()}>Check again</button>
    </p>}
    {corrections.length > 0 && <section className="operational-message operational-message--warning" aria-labelledby="manager-report-corrections-title">
      <h3 id="manager-report-corrections-title">{corrections.length} {corrections.length === 1 ? "correction was" : "corrections were"} made after submission</h3>
      <p>The V7 report shows corrected values. The original accepted values remain in the correction history below. The PDF stays unavailable until it includes these corrections.</p>
      <ul>{corrections.map((correction) => <li key={correction.id}>
        <strong>{correction.label}</strong>: {show(correction.previousValue)} → <strong>{show(correction.newValue)}</strong> · {correction.correctedBy} ({reviewerRoleLabel(correction.correctedByRole)}) · {correction.reason}
      </li>)}</ul>
    </section>}
    {report && reportApprovalChecked && reportApproval?.status !== "approved" && corrections.length === 0 && <p className="operational-message operational-message--warning" role="status">
      This report has not been approved yet. It is available for download once an Admin approves it below.
    </p>}
    <ReportApprovalPanel jobId={jobId} currentUserRole={currentUserRole} reportApproval={reportApproval} checked={reportApprovalChecked}
      onChanged={(state) => { setReportApproval(state); setReportApprovalChecked(true); }} />
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    {downloadError ? <p className="form-message" role="alert">{downloadError}</p> : null}
    {report ? <FinalReportPresentation report={report} /> : null}
  </section>;
}
