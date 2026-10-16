-- D only: immutable issued repair documents, separate from service-report approvals.
BEGIN;
CREATE TABLE repair_exports (
  id UUID PRIMARY KEY,
  number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_id UUID NOT NULL UNIQUE,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  job_id UUID NOT NULL REFERENCES inspection_jobs(id) ON DELETE RESTRICT,
  system_key TEXT NOT NULL,
  selection JSONB NOT NULL CHECK (jsonb_typeof(selection)='array' AND jsonb_array_length(selection)>0),
  issued_at TIMESTAMPTZ NOT NULL,
  presentation TEXT NOT NULL,
  pdf BYTEA NOT NULL CHECK (octet_length(pdf)>0),
  pdf_sha256 CHAR(64) NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX repair_exports_service ON repair_exports(job_id,system_key,number);
CREATE TRIGGER repair_exports_no_mutation BEFORE UPDATE OR DELETE ON repair_exports FOR EACH ROW EXECUTE FUNCTION repair_append_only();
CREATE TRIGGER repair_exports_no_truncate BEFORE TRUNCATE ON repair_exports FOR EACH STATEMENT EXECUTE FUNCTION repair_append_only();
COMMIT;
