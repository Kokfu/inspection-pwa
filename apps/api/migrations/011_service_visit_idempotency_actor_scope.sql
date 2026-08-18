-- Forward-safe correction for Phase 6B migration 010. Legacy rows without a
-- creator remain historical only; all newly created service visits require it.
ALTER TABLE inspection_jobs
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES users(id);

ALTER TABLE inspection_jobs
  DROP CONSTRAINT IF EXISTS inspection_jobs_creation_request_id_key;

DROP INDEX IF EXISTS inspection_jobs_creation_request_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_jobs_service_visit_idempotency
  ON inspection_jobs (created_by_user_id, creation_request_id)
  WHERE creation_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_service_visit_creator_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.creation_request_id IS NOT NULL AND NEW.created_by_user_id IS NULL THEN
    RAISE EXCEPTION 'Created service visits require an authenticated creator';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_visit_creator_identity ON inspection_jobs;
CREATE TRIGGER trg_service_visit_creator_identity
BEFORE INSERT OR UPDATE OF creation_request_id, created_by_user_id
ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_service_visit_creator_identity();

CREATE OR REPLACE FUNCTION prevent_service_visit_idempotency_identity_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.creation_request_id IS NOT NULL AND (
    NEW.creation_request_id IS DISTINCT FROM OLD.creation_request_id
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
  ) THEN
    RAISE EXCEPTION 'Service visit idempotency identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_visit_idempotency_identity_immutable ON inspection_jobs;
CREATE TRIGGER trg_service_visit_idempotency_identity_immutable
BEFORE UPDATE OF creation_request_id, created_by_user_id
ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION prevent_service_visit_idempotency_identity_change();

CREATE INDEX IF NOT EXISTS idx_inspection_jobs_created_by_user
  ON inspection_jobs (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;
