ALTER TABLE inspection_jobs
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by_user_id BIGINT REFERENCES users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inspection_jobs_completed_by_user_id_fkey'
      AND conrelid = 'inspection_jobs'::regclass
  ) THEN
    ALTER TABLE inspection_jobs
      ADD CONSTRAINT inspection_jobs_completed_by_user_id_fkey
      FOREIGN KEY (completed_by_user_id) REFERENCES users(id);
  END IF;
END;
$$;

-- Preserve pre-existing closed jobs without inventing a completing user.
UPDATE inspection_jobs
SET completed_at = created_at
WHERE status = 'closed' AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_inspection_job_completion_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'closed' THEN
    IF NEW.status <> 'closed'
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.completed_by_user_id IS DISTINCT FROM OLD.completed_by_user_id
    THEN
      RAISE EXCEPTION 'Completed inspection job metadata is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'open' THEN
    IF NEW.completed_at IS NOT NULL OR NEW.completed_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Open inspection jobs cannot have completion metadata';
    END IF;
  ELSIF NEW.status = 'closed' THEN
    IF NEW.completed_at IS NULL OR NEW.completed_by_user_id IS NULL THEN
      RAISE EXCEPTION 'Newly completed inspection jobs require completion metadata';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspection_job_completion_state ON inspection_jobs;
CREATE TRIGGER trg_inspection_job_completion_state
BEFORE INSERT OR UPDATE OF status, completed_at, completed_by_user_id
ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_inspection_job_completion_state();

CREATE INDEX IF NOT EXISTS idx_inspection_jobs_completed_by
  ON inspection_jobs (completed_by_user_id)
  WHERE completed_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION require_open_job_for_legacy_inspection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM inspection_jobs job
    WHERE job.id = NEW.job_id AND job.status = 'open'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'JOB_CLOSED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_open_job_for_legacy_inspection ON inspections;
CREATE TRIGGER trg_require_open_job_for_legacy_inspection
BEFORE INSERT OR UPDATE OF job_id ON inspections
FOR EACH ROW EXECUTE FUNCTION require_open_job_for_legacy_inspection();

CREATE OR REPLACE FUNCTION require_open_job_for_inspection_attachment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM master_system_form_instances instance
    INNER JOIN master_system_inspections inspection
      ON inspection.id = instance.inspection_group_id
    INNER JOIN inspection_jobs job ON job.id = inspection.job_id
    WHERE instance.id = NEW.form_instance_id AND job.status = 'open'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'JOB_CLOSED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_open_job_for_inspection_attachment
  ON inspection_attachments;
CREATE TRIGGER trg_require_open_job_for_inspection_attachment
BEFORE INSERT OR UPDATE OF form_instance_id ON inspection_attachments
FOR EACH ROW EXECUTE FUNCTION require_open_job_for_inspection_attachment();
