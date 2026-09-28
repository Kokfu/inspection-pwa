-- Ported from claude/autopilot's `033_report_approvals.sql` (T6) and renumbered to this branch's
-- own next number; content is otherwise unchanged from the autopilot original.
--
-- Report approval. A completed service visit's Final Report moves from "awaiting approval" to
-- "approved" only by an explicit admin/supervisor decision, with an audit trail. Nothing is overwritten:
-- one row per decision (approve/withdraw), append-only, mirroring inspection_corrections's shape.
-- The report's current state is DERIVED (apps/api/src/reports/reportApproval.ts), never read off a
-- mutable column, so "who approved this, when, and what happened next" stays answerable forever.
CREATE TABLE report_approvals (
  id UUID PRIMARY KEY,
  -- RESTRICT matches inspection_corrections/inspection_photo_evidence/job_completion: approval
  -- history is audit history, so a job that carries an approval decision can no longer be deleted
  -- by a recovery CLI.
  job_id UUID NOT NULL REFERENCES inspection_jobs(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'withdrawn')),
  note TEXT CHECK (note IS NULL OR length(btrim(note)) BETWEEN 3 AND 500),
  decided_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_role TEXT NOT NULL CHECK (decided_by_role IN ('admin', 'supervisor')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  -- Idempotency mirrors 032's per-scope replay discipline (not a bare UNIQUE, since a legitimate
  -- retry after a crash and a second, later, genuinely-different decision both reuse the shape of
  -- "a request id for this job"): same request id + same fingerprint replays the stored event; a
  -- different body under the same id is refused (409) by the route, not by a constraint.
  request_id UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  UNIQUE (job_id, sequence)
);

CREATE INDEX idx_report_approvals_job ON report_approvals (job_id);
CREATE INDEX idx_report_approvals_request ON report_approvals (request_id);

-- Append-only: history is the audit record, so rows are never changed or removed.
CREATE OR REPLACE FUNCTION report_approvals_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'report_approvals is append-only (% refused)', TG_OP;
END $$;

CREATE TRIGGER report_approvals_no_update_delete
  BEFORE UPDATE OR DELETE ON report_approvals
  FOR EACH ROW EXECUTE FUNCTION report_approvals_append_only();

CREATE TRIGGER report_approvals_no_truncate
  BEFORE TRUNCATE ON report_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION report_approvals_append_only();
