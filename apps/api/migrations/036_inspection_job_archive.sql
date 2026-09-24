-- Soft-archive for a service-visit/job (`inspection_jobs`). Reversible: setting
-- `archived_at` hides the row from the default manager service-visit list;
-- clearing it restores visibility. Never a hard delete.
--
-- Trigger-safety note (read migrations 009 and 010 in full before touching
-- this): neither existing immutability trigger currently blocks a targeted
-- `UPDATE inspection_jobs SET archived_at = ... WHERE id = $1` on a closed
-- row.
--   * `enforce_inspection_job_completion_state` (009) is wired as
--     `BEFORE INSERT OR UPDATE OF status, completed_at, completed_by_user_id`
--     — a column-list trigger that only FIRES when one of those three columns
--     is present in the UPDATE's SET list. An UPDATE that sets only
--     `archived_at` never fires it at all.
--   * `prevent_completed_service_visit_mutation` (010) is wired as a plain
--     `BEFORE UPDATE` (fires on every UPDATE, no column list), but its body
--     only RAISEs when one of nine specific columns (`job_reference`,
--     `title`, `customer_id`, `customer_configuration_revision_id`,
--     `master_template_version_id`, `configuration_snapshot`, `site_id`,
--     `service_date`, `creation_request_id`) is DISTINCT from OLD. An UPDATE
--     that sets only `archived_at` leaves every one of those columns equal to
--     its old value (Postgres keeps unmentioned columns unchanged), so the
--     body never raises.
--
-- Both functions are still amended below (CREATE OR REPLACE, migrations 009/
-- 010 themselves stay byte-identical) to make that allowance EXPLICIT and
-- durable rather than incidental:
--   * `enforce_inspection_job_completion_state`'s trigger is widened to also
--     fire `... OF status, completed_at, completed_by_user_id, archived_at`.
--     The function body is unchanged — `archived_at` is not one of the three
--     fields it compares — so a closed row's archive/restore now visibly
--     takes the same "still closed, nothing else disturbed" path as before,
--     instead of silently not triggering the function at all.
--   * `prevent_completed_service_visit_mutation`'s function body gets a
--     comment recording that `archived_at` is deliberately excluded from its
--     immutability column list. Its trigger definition is unchanged (it must
--     keep firing on every UPDATE to keep protecting the other nine columns).
--
-- Nothing else about either function's behavior changes: every other column
-- they already protected on a closed job stays exactly as protected as
-- before.

ALTER TABLE inspection_jobs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_inspection_jobs_archived_at
  ON inspection_jobs (archived_at)
  WHERE archived_at IS NOT NULL;

-- Re-declared identically to migration 009's body; only the trigger's column
-- list (below) widens to include archived_at.
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
    -- archived_at is intentionally NOT checked here: archiving/restoring a
    -- closed job's soft-archive flag is explicitly permitted and must not
    -- raise.
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
BEFORE INSERT OR UPDATE OF status, completed_at, completed_by_user_id, archived_at
ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_inspection_job_completion_state();

-- Re-declared identically to migration 010's body, plus a comment recording
-- that archived_at is deliberately excluded from the immutability list below.
-- The trigger itself (BEFORE UPDATE, no column list) is unchanged.
CREATE OR REPLACE FUNCTION prevent_completed_service_visit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- archived_at is deliberately NOT included in this immutability check: a
  -- closed service visit may still be archived/restored (soft-archive is
  -- reversible administrative visibility, not a change to historical service
  -- data). Every column below stays exactly as immutable as before.
  IF OLD.status = 'closed' AND (
    NEW.job_reference IS DISTINCT FROM OLD.job_reference
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.customer_configuration_revision_id IS DISTINCT FROM OLD.customer_configuration_revision_id
    OR NEW.master_template_version_id IS DISTINCT FROM OLD.master_template_version_id
    OR NEW.configuration_snapshot IS DISTINCT FROM OLD.configuration_snapshot
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.service_date IS DISTINCT FROM OLD.service_date
    OR NEW.creation_request_id IS DISTINCT FROM OLD.creation_request_id
  ) THEN
    RAISE EXCEPTION 'Completed inspection jobs are immutable historical service data';
  END IF;
  RETURN NEW;
END;
$$;
