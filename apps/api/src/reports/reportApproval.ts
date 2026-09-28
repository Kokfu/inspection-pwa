import type { Pool } from "pg";

/**
 * T6: report approval (docs/autopilot/designs/T6.md §3.2). A completed visit's report moves from
 * "awaiting approval" to "approved" only by an explicit admin/supervisor decision, recorded as an
 * append-only event (`report_approvals`, migration 033). The report's CURRENT state is always
 * DERIVED from those events plus the visit's corrections, never read off a mutable column, so the
 * Manager list, the visit detail, the report view and the PDF gate can never disagree.
 *
 * This module deliberately separates the pure derivation (`deriveReportApproval`) from the SQL that
 * loads its inputs (`loadReportApprovalEvents`, `loadLatestCorrectionAt`), the same split
 * `managerCorrections.ts` uses between `loadCorrections`/`supportedRow` and the route logic that
 * calls them — so the logic itself can be unit tested with no database.
 */

export type ReportApprovalDecision = "approved" | "withdrawn";
export type ReportApprovalRole = "admin" | "supervisor";
export type ReportApprovalStatus = "not_applicable" | "awaiting_approval" | "approved";

/**
 * One stored decision. `decidedAt` MUST be formatted the same fixed-width way as
 * `latestCorrectionAt` (`YYYY-MM-DDTHH:MI:SS.MSZ`, 3-digit milliseconds — the same shape
 * `managerCorrections.ts`'s `loadCorrections` uses for `correctedAt`), since the derivation
 * compares them lexicographically rather than parsing dates.
 */
export type ReportApprovalEvent = {
  id: string;
  decision: ReportApprovalDecision;
  note: string | null;
  decidedBy: string;
  decidedByRole: ReportApprovalRole;
  decidedAt: string;
  sequence: number;
  requestId: string;
  /** Present only when loaded via `loadReportApprovalEvents` for the router's own idempotency check;
   *  never sent to a client (the router's `publicEvent` strips it, like corrections' `publicCorrection`). */
  requestFingerprint?: string;
};

export type ReportApprovalState = {
  status: ReportApprovalStatus;
  decidedBy: string | null;
  decidedByRole: ReportApprovalRole | null;
  decidedAt: string | null;
  note: string | null;
  latestCorrectionAt: string | null;
  /** True when the latest approval was undone by a correction recorded after it (§3.2). */
  correctedAfterApproval: boolean;
};

const notApplicable = (latestCorrectionAt: string | null): ReportApprovalState => ({
  status: "not_applicable", decidedBy: null, decidedByRole: null, decidedAt: null, note: null,
  latestCorrectionAt, correctedAfterApproval: false
});

const awaitingApproval = (
  latestCorrectionAt: string | null,
  from: Pick<ReportApprovalEvent, "decidedBy" | "decidedByRole" | "decidedAt" | "note"> | null = null
): ReportApprovalState => ({
  status: "awaiting_approval",
  decidedBy: from?.decidedBy ?? null, decidedByRole: from?.decidedByRole ?? null,
  decidedAt: from?.decidedAt ?? null, note: from?.note ?? null,
  latestCorrectionAt, correctedAfterApproval: false
});

/**
 * Pure derivation (T6.md §3.2):
 *   job.status = 'open'                  -> "not_applicable"
 *   no approval events                   -> "awaiting_approval"
 *   latest event is 'withdrawn'          -> "awaiting_approval"
 *   latest event is 'approved'
 *     and no correction after decided_at -> "approved"
 *     and a correction after decided_at  -> "awaiting_approval" (corrected after approval)
 *
 * "Latest" is the event with the highest `sequence` (insertion order under the per-job advisory
 * lock the router takes before every insert), never wall-clock order — same-millisecond timestamps
 * are exactly what `sequence` exists to break ties for.
 */
export function deriveReportApproval(
  jobStatus: "open" | "closed",
  events: readonly ReportApprovalEvent[],
  latestCorrectionAt: string | null
): ReportApprovalState {
  if (jobStatus === "open") return notApplicable(latestCorrectionAt);
  if (events.length === 0) return awaitingApproval(latestCorrectionAt);
  const latest = events.reduce((max, event) => (event.sequence > max.sequence ? event : max));
  if (latest.decision === "withdrawn") return awaitingApproval(latestCorrectionAt, latest);
  const correctedAfterApproval = latestCorrectionAt !== null && latestCorrectionAt > latest.decidedAt;
  if (correctedAfterApproval) {
    return { ...awaitingApproval(latestCorrectionAt, latest), correctedAfterApproval: true };
  }
  return {
    status: "approved", decidedBy: latest.decidedBy, decidedByRole: latest.decidedByRole,
    decidedAt: latest.decidedAt, note: latest.note, latestCorrectionAt, correctedAfterApproval: false
  };
}

type Queryable = Pick<Pool, "query">;

/** Every approval event recorded for a job, oldest first. */
export async function loadReportApprovalEvents(database: Queryable, jobId: string): Promise<ReportApprovalEvent[]> {
  const result = await database.query(`
    SELECT approval.id, approval.decision, approval.note,
      actor.username AS "decidedBy", approval.decided_by_role AS "decidedByRole",
      to_char(approval.decided_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "decidedAt",
      approval.sequence, approval.request_id AS "requestId", approval.request_fingerprint AS "requestFingerprint"
    FROM report_approvals approval
    INNER JOIN users actor ON actor.id = approval.decided_by_user_id
    WHERE approval.job_id = $1
    ORDER BY approval.sequence`, [jobId]);
  return result.rows as ReportApprovalEvent[];
}

/** The latest correction recorded for the job (T5a `inspection_corrections`), or null if none. */
export async function loadLatestCorrectionAt(database: Queryable, jobId: string): Promise<string | null> {
  const result = await database.query(`
    SELECT to_char(max(corrected_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "latestCorrectionAt"
    FROM inspection_corrections WHERE job_id = $1`, [jobId]);
  return (result.rows[0]?.latestCorrectionAt as string | null | undefined) ?? null;
}

/**
 * The one place every OTHER route calls to get a job's current approval state, mirroring
 * `managerCorrections.ts`'s exported `visitHasCorrections(database, jobId)` shape exactly: it loads
 * the job's own status itself (never trusts a caller-supplied one, so it cannot disagree with the
 * row the caller separately validated), and returns `undefined` for an unknown or sample job so
 * callers can 404/skip without a second existence check.
 */
export async function visitReportApproval(database: Queryable, jobId: string): Promise<ReportApprovalState | undefined> {
  const jobResult = await database.query(`SELECT status FROM inspection_jobs WHERE id=$1 AND is_sample=false`, [jobId]);
  const job = jobResult.rows[0] as { status: "open" | "closed" } | undefined;
  if (!job) return undefined;
  const [events, latestCorrectionAt] = await Promise.all([
    loadReportApprovalEvents(database, jobId),
    loadLatestCorrectionAt(database, jobId)
  ]);
  return deriveReportApproval(job.status, events, latestCorrectionAt);
}
