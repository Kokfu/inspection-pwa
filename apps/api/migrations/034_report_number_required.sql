-- Require a number only when a job first becomes closed. Historical closed
-- jobs with a NULL number remain readable and unchanged.
CREATE OR REPLACE FUNCTION enforce_inspection_job_report_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' AND NEW.report_number IS NULL THEN
    RAISE EXCEPTION 'A newly completed inspection job requires a report number';
  END IF;

  IF (NEW.report_number IS DISTINCT FROM OLD.report_number
      OR NEW.technician_team_snapshot IS DISTINCT FROM OLD.technician_team_snapshot) AND NOT (
    OLD.status = 'open' AND NEW.status = 'closed'
    AND OLD.report_number IS NULL
    AND NEW.report_number IS NOT NULL
    AND OLD.technician_team_snapshot IS NULL
    AND jsonb_typeof(NEW.technician_team_snapshot) = 'array'
  ) THEN
    RAISE EXCEPTION 'Inspection job report identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
