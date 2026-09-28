import { useEffect, useState } from "react";

/**
 * T6 §8 Q3: a technician sees the report-approval state read-only on their own completed visit.
 * Self-fetching and best-effort, like `AcceptedCorrectionsPanel`: the report itself renders with or
 * without this chip. Reads `GET /inspection-jobs/:jobId/completion`, which carries the same
 * server-derived `reportApproval` summary the Manager screens use, so this can never disagree with
 * what a supervisor or admin sees.
 */
type ReportApprovalSummary = {
  status: "not_applicable" | "awaiting_approval" | "approved";
  decidedBy: string | null;
  decidedByRole: "admin" | "supervisor" | null;
  decidedAt: string | null;
  correctedAfterApproval: boolean;
};

function isReportApprovalSummary(value: unknown): value is ReportApprovalSummary {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (candidate.status === "not_applicable" || candidate.status === "awaiting_approval" || candidate.status === "approved")
    && (candidate.decidedBy === null || typeof candidate.decidedBy === "string")
    && (candidate.decidedByRole === null || candidate.decidedByRole === "admin" || candidate.decidedByRole === "supervisor")
    && (candidate.decidedAt === null || typeof candidate.decidedAt === "string")
    && typeof candidate.correctedAfterApproval === "boolean";
}

function formatWhen(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : value;
}

export function ReportApprovalChip({ jobId }: { jobId: string }) {
  const [approval, setApproval] = useState<ReportApprovalSummary>();

  useEffect(() => {
    let active = true;
    setApproval(undefined);
    void (async () => {
      try {
        const response = await fetch(`/api/inspection-jobs/${encodeURIComponent(jobId)}/completion`, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { reportApproval?: unknown };
        if (active && isReportApprovalSummary(data.reportApproval)) setApproval(data.reportApproval);
      } catch { /* best-effort: the report renders regardless */ }
    })();
    return () => { active = false; };
  }, [jobId]);

  if (!approval || approval.status === "not_applicable") return null;
  if (approval.status === "approved" && !approval.correctedAfterApproval) {
    return <span className="status-badge status-badge--complete">
      Approved{approval.decidedBy ? ` by ${approval.decidedBy}` : ""}{approval.decidedAt ? `, ${formatWhen(approval.decidedAt)}` : ""}
    </span>;
  }
  return <span className="status-badge status-badge--waiting">{approval.correctedAfterApproval ? "Re-approval needed" : "Awaiting approval"}</span>;
}
