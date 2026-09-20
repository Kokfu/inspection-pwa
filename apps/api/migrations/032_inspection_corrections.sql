-- T5: supervisor/admin corrections to Accepted V7 inspections. An Accepted form instance is immutable
-- forever, so a correction is an additive, append-only row that points at it; the accepted
-- `response_payload` is never written. The effective value of a field is the accepted value with that
-- field's latest correction (highest `sequence`) applied. Forward-only; no existing table changes.
CREATE TABLE inspection_corrections (
  id UUID PRIMARY KEY,
  -- RESTRICT is deliberate and matches the sibling FKs in 007/017: correction history is audit history, so
  -- an accepted instance or job that carries corrections can no longer be deleted by a recovery CLI.
  form_instance_id UUID NOT NULL REFERENCES master_system_form_instances(id) ON DELETE RESTRICT,
  job_id UUID NOT NULL REFERENCES inspection_jobs(id) ON DELETE RESTRICT,
  system_key TEXT NOT NULL,
  field_path TEXT NOT NULL CHECK (length(field_path) BETWEEN 1 AND 300),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  previous_value JSONB NOT NULL,
  new_value JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  corrected_by_user_id BIGINT NOT NULL REFERENCES users(id),
  corrected_by_role TEXT NOT NULL CHECK (corrected_by_role IN ('admin', 'supervisor')),
  corrected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One submission inserts one row per corrected field, so `request_id` cannot be globally UNIQUE as the
  -- approved design sketched it. Replay is detected per accepted instance: same request id + same
  -- fingerprint returns the stored rows, a different body under the same id is refused (409).
  request_id UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  UNIQUE (form_instance_id, field_path, sequence)
);

CREATE INDEX idx_inspection_corrections_job ON inspection_corrections (job_id);
CREATE INDEX idx_inspection_corrections_request ON inspection_corrections (request_id);

-- Append-only: history is the audit record, so rows are never changed or removed.
CREATE OR REPLACE FUNCTION inspection_corrections_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inspection_corrections is append-only (% refused)', TG_OP;
END $$;

CREATE TRIGGER inspection_corrections_no_update_delete
  BEFORE UPDATE OR DELETE ON inspection_corrections
  FOR EACH ROW EXECUTE FUNCTION inspection_corrections_append_only();

CREATE TRIGGER inspection_corrections_no_truncate
  BEFORE TRUNCATE ON inspection_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION inspection_corrections_append_only();
