ALTER TABLE customers
  ADD COLUMN fax TEXT,
  ADD COLUMN contract_number TEXT,
  ADD COLUMN service_frequency TEXT;

ALTER TABLE customers
  ADD CONSTRAINT customers_service_frequency_check
  CHECK (service_frequency IS NULL OR service_frequency IN ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUALLY'));

ALTER TABLE customer_sites ADD COLUMN address TEXT;
ALTER TABLE inspection_jobs
  ADD COLUMN report_number TEXT,
  ADD COLUMN technician_team_snapshot JSONB;

CREATE UNIQUE INDEX inspection_jobs_report_number_unique
  ON inspection_jobs (report_number)
  WHERE report_number IS NOT NULL;

CREATE TABLE report_number_year_counters (
  report_year INTEGER PRIMARY KEY CHECK (report_year BETWEEN 1 AND 9999),
  last_sequence BIGINT NOT NULL CHECK (last_sequence > 0)
);

-- A report number may only be assigned during the one-way open -> closed
-- transition. Historical closed jobs deliberately retain NULL.
CREATE OR REPLACE FUNCTION enforce_inspection_job_report_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.report_number IS DISTINCT FROM OLD.report_number
      OR NEW.technician_team_snapshot IS DISTINCT FROM OLD.technician_team_snapshot) AND NOT (
    OLD.status = 'open' AND NEW.status = 'closed'
    AND OLD.report_number IS NULL
    AND (NEW.report_number IS NOT NULL OR NEW.service_date IS NULL)
    AND OLD.technician_team_snapshot IS NULL
    AND jsonb_typeof(NEW.technician_team_snapshot) = 'array'
  ) THEN
    RAISE EXCEPTION 'Inspection job report identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspection_job_report_number ON inspection_jobs;
CREATE TRIGGER trg_inspection_job_report_number
BEFORE UPDATE OF status, report_number, technician_team_snapshot ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_inspection_job_report_number();
