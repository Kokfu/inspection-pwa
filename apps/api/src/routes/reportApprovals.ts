import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import type { UserRole } from "../auth/authTypes.js";
import { canonicalJson } from "../corrections/inspectionCorrections.js";
import { pool } from "../db/pool.js";
import { requireRoleAudited } from "../middleware/requireRole.js";
import {
  deriveReportApproval, loadLatestCorrectionAt, loadReportApprovalEvents, visitReportApproval,
  type ReportApprovalEvent, type ReportApprovalState
} from "../reports/reportApproval.js";

/** T6: report approval (docs/autopilot/designs/T6.md §3.3). */
export class ReportApprovalError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Database = Pick<Pool, "query" | "connect">;
type Queryable = Pick<Pool | PoolClient, "query">;

async function loadJobStatus(database: Queryable, jobId: string): Promise<"open" | "closed"> {
  const result = await database.query(`SELECT status FROM inspection_jobs WHERE id=$1 AND is_sample=false`, [jobId]);
  const row = result.rows[0] as { status: "open" | "closed" } | undefined;
  if (!row) throw new ReportApprovalError("SERVICE_VISIT_NOT_FOUND", "Service visit was not found.", 404);
  return row.status;
}

const publicEvent = ({ requestFingerprint: _fingerprint, ...event }: ReportApprovalEvent & { requestFingerprint?: string }) => event;

function publicState(state: ReportApprovalState) {
  return state;
}

type ParsedBody = {
  requestId: string;
  decision: "approved" | "withdrawn";
  expectedStatus: "awaiting_approval" | "approved";
  note: string | undefined;
};

function parseReportApprovalBody(body: unknown): ParsedBody {
  const invalid = (message: string) => new ReportApprovalError("INVALID_REPORT_APPROVAL_REQUEST", message, 400);
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalid("Request body is invalid.");
  const value = body as Record<string, unknown>;
  const allowed = ["requestId", "decision", "note", "expectedStatus"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw invalid("Request body is invalid.");
  if (typeof value.requestId !== "string" || !uuidPattern.test(value.requestId)) throw invalid("A request ID is required.");
  if (value.decision !== "approved" && value.decision !== "withdrawn") throw invalid('decision must be "approved" or "withdrawn".');
  if (value.expectedStatus !== "awaiting_approval" && value.expectedStatus !== "approved") {
    throw invalid('expectedStatus must be "awaiting_approval" or "approved".');
  }
  let note: string | undefined;
  if (value.note !== undefined) {
    if (typeof value.note !== "string" || value.note.trim().length < 3 || value.note.trim().length > 500) {
      throw invalid("A note of 3-500 characters is required.");
    }
    note = value.note.trim();
  }
  if (value.decision === "withdrawn" && note === undefined) throw invalid("A note is required to withdraw approval.");
  return { requestId: value.requestId.toLowerCase(), decision: value.decision, expectedStatus: value.expectedStatus, note };
}

export function createReportApprovalsRouter(database: Database = pool) {
  const router = Router();
  const requireRole = (...roles: UserRole[]) => requireRoleAudited(database, ...roles);

  router.get("/manager/service-visits/:jobId/report-approval", requireRole("admin", "supervisor"), async (request, response, next) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) throw new ReportApprovalError("INVALID_JOB_ID", "Job ID is invalid.", 400);
      const jobStatus = await loadJobStatus(database, jobId);
      const [events, latestCorrectionAt] = await Promise.all([
        loadReportApprovalEvents(database, jobId),
        loadLatestCorrectionAt(database, jobId)
      ]);
      const reportApproval = deriveReportApproval(jobStatus, events, latestCorrectionAt);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ reportApproval: publicState(reportApproval), events: events.map(publicEvent) });
    } catch (error) { next(error); }
  });

  router.post("/manager/service-visits/:jobId/report-approval", requireRole("admin", "supervisor"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) throw new ReportApprovalError("INVALID_JOB_ID", "Job ID is invalid.", 400);
      const input = parseReportApprovalBody(request.body);
      const actor = request.currentUser!;
      // §8 Q1: only an admin may withdraw an approval. Checked before any DB write.
      if (input.decision === "withdrawn" && actor.role !== "admin") {
        throw new ReportApprovalError("REPORT_APPROVAL_WITHDRAW_FORBIDDEN", "Only an admin may withdraw a report approval.", 403);
      }
      const fingerprint = createHash("sha256").update(canonicalJson({
        jobId: jobId.toLowerCase(), decision: input.decision, note: input.note ?? null, expectedStatus: input.expectedStatus
      })).digest("hex");
      client = await database.connect();
      await client.query("BEGIN");
      const jobStatus = await loadJobStatus(client, jobId);
      // Serialise approval decisions per job without writing (or row-locking) the job row.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('report_approvals:' || $1))", [jobId]);
      const existing = await loadReportApprovalEvents(client, jobId);
      const replay = existing.find((event) => event.requestId === input.requestId);
      if (replay) {
        if (replay.requestFingerprint !== fingerprint) throw new ReportApprovalError("APPROVAL_REQUEST_REUSED", "This request ID was already used for a different approval decision.", 409);
        await client.query("COMMIT");
        const latestCorrectionAt = await loadLatestCorrectionAt(database, jobId);
        response.status(200).json({ reportApproval: publicState(deriveReportApproval(jobStatus, existing, latestCorrectionAt)), events: existing.map(publicEvent) });
        return;
      }
      if (jobStatus === "open") throw new ReportApprovalError("REPORT_NOT_READY", "This service visit is not yet completed.", 409);
      const latestCorrectionAt = await loadLatestCorrectionAt(client, jobId);
      const current = deriveReportApproval(jobStatus, existing, latestCorrectionAt);
      if (current.status !== input.expectedStatus) {
        throw new ReportApprovalError("REPORT_APPROVAL_CONFLICT", "The report approval state changed since you loaded it. Reload and try again.", 409);
      }
      const sequence = existing.length + 1;
      const id = randomUUID();
      await client.query(`INSERT INTO report_approvals
        (id, job_id, decision, note, decided_by_user_id, decided_by_role, sequence, request_id, request_fingerprint)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, jobId, input.decision, input.note ?? null, actor.id, actor.role, sequence, input.requestId, fingerprint]);
      await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result, reason) VALUES ($1,$2,'inspectionJob',$3,'success',$4)`,
        [actor.id, input.decision === "approved" ? "report.approve" : "report.withdraw", jobId, input.note ?? ""]);
      await client.query("COMMIT");
      const stored = await loadReportApprovalEvents(client, jobId);
      const updatedLatestCorrectionAt = await loadLatestCorrectionAt(client, jobId);
      response.status(201).json({
        reportApproval: publicState(deriveReportApproval(jobStatus, stored, updatedLatestCorrectionAt)),
        events: stored.map(publicEvent)
      });
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      next(error);
    } finally { client?.release(); }
  });

  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
    if (error instanceof ReportApprovalError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    next(error);
  });
  return router;
}

export const reportApprovalsRouter = createReportApprovalsRouter();

/** Re-exported so other routes need only import from this router module, like `managerCorrections.ts`. */
export { visitReportApproval };
