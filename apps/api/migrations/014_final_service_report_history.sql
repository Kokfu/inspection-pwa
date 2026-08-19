-- Phase 7: preserve the completion identity used by an on-demand historical report.
ALTER TABLE inspection_jobs
  ADD COLUMN IF NOT EXISTS completed_by_display_name TEXT;

-- A pre-Phase-7 row has no immutable display-name proof. Preserve a stable,
-- deliberately explicit fallback instead of claiming the current username is historical truth.
UPDATE inspection_jobs
SET completed_by_display_name = CASE
  WHEN completed_by_user_id IS NULL THEN 'Legacy completion (user unavailable)'
  ELSE 'Legacy completion (user ' || completed_by_user_id::text || ')'
END
WHERE status = 'closed' AND completed_by_display_name IS NULL;

CREATE OR REPLACE FUNCTION enforce_inspection_job_completion_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'closed' THEN
    IF NEW.status <> 'closed'
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.completed_by_user_id IS DISTINCT FROM OLD.completed_by_user_id
      OR NEW.completed_by_display_name IS DISTINCT FROM OLD.completed_by_display_name
    THEN
      RAISE EXCEPTION 'Completed inspection job metadata is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'open' THEN
    IF NEW.completed_at IS NOT NULL OR NEW.completed_by_user_id IS NOT NULL
      OR NEW.completed_by_display_name IS NOT NULL THEN
      RAISE EXCEPTION 'Open inspection jobs cannot have completion metadata';
    END IF;
  ELSIF NEW.status = 'closed' THEN
    IF NEW.completed_at IS NULL OR NEW.completed_by_user_id IS NULL
      OR NEW.completed_by_display_name IS NULL
      OR length(trim(NEW.completed_by_display_name)) = 0
      OR length(NEW.completed_by_display_name) > 160 THEN
      RAISE EXCEPTION 'Newly completed inspection jobs require immutable completion metadata';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspection_job_completion_state ON inspection_jobs;
CREATE TRIGGER trg_inspection_job_completion_state
BEFORE INSERT OR UPDATE OF status, completed_at, completed_by_user_id, completed_by_display_name
ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_inspection_job_completion_state();

-- Closed jobs are historical records. Prevent any later rewrite of report
-- inputs, including evidence linkage and its integrity metadata.
CREATE OR REPLACE FUNCTION prevent_closed_job_report_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  report_job_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'master_system_inspections' THEN
    report_job_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.job_id ELSE OLD.job_id END;
  ELSIF TG_TABLE_NAME = 'master_system_form_instances' THEN
    SELECT inspection.job_id INTO report_job_id
    FROM master_system_inspections inspection
    WHERE inspection.id = CASE WHEN TG_OP = 'INSERT' THEN NEW.inspection_group_id ELSE OLD.inspection_group_id END;
  ELSIF TG_TABLE_NAME = 'inspection_attachments' THEN
    SELECT inspection.job_id INTO report_job_id
    FROM master_system_form_instances instance
    INNER JOIN master_system_inspections inspection ON inspection.id = instance.inspection_group_id
    WHERE instance.id = CASE WHEN TG_OP = 'INSERT' THEN NEW.form_instance_id ELSE OLD.form_instance_id END;
  END IF;
  IF report_job_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM inspection_jobs job WHERE job.id = report_job_id AND job.status = 'closed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMPLETED_JOB_REPORT_HISTORY_IMMUTABLE';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_closed_job_master_system_inspection_immutable ON master_system_inspections;
CREATE TRIGGER trg_closed_job_master_system_inspection_immutable
BEFORE INSERT OR UPDATE OR DELETE ON master_system_inspections
FOR EACH ROW EXECUTE FUNCTION prevent_closed_job_report_history_mutation();

DROP TRIGGER IF EXISTS trg_closed_job_form_instance_immutable ON master_system_form_instances;
CREATE TRIGGER trg_closed_job_form_instance_immutable
BEFORE INSERT OR UPDATE OR DELETE ON master_system_form_instances
FOR EACH ROW EXECUTE FUNCTION prevent_closed_job_report_history_mutation();

DROP TRIGGER IF EXISTS trg_closed_job_attachment_immutable ON inspection_attachments;
CREATE TRIGGER trg_closed_job_attachment_immutable
BEFORE INSERT OR UPDATE OR DELETE ON inspection_attachments
FOR EACH ROW EXECUTE FUNCTION prevent_closed_job_report_history_mutation();
