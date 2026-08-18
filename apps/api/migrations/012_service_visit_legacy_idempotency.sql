-- Phase 6B forward-only safety upgrade. Migration 010 service visits have a
-- request id but no authoritative creator identity. Keep those historical rows
-- untouched and uniquely detectable; they must be rejected at retry time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_jobs_unresolved_service_visit_request
  ON inspection_jobs (creation_request_id)
  WHERE creation_request_id IS NOT NULL AND created_by_user_id IS NULL;

-- Migration 011's trigger is intentionally retained as the write guard rather
-- than validating a CHECK over legacy rows. A NOT VALID CHECK would still
-- reject later, otherwise-safe updates to an unresolved historical row.
-- The trigger rejects every new request-id row without an authenticated actor,
-- while allowing the existing 010 rows to remain available for fail-closed
-- replay detection.
