-- Service visits are scheduled in the Malaysian site-local wall-clock
-- convention. Keep the date and time separate so a browser timezone can never
-- reinterpret the appointment instant.
ALTER TABLE inspection_jobs
  ADD COLUMN IF NOT EXISTS service_time TIME;

CREATE OR REPLACE FUNCTION enforce_service_visit_site_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customer_sites site
    WHERE site.id = NEW.site_id
      AND site.customer_id = NEW.customer_id
  ) THEN
    RAISE EXCEPTION 'Inspection job site must belong to its customer';
  END IF;

  IF NEW.site_id IS NOT NULL AND NEW.master_template_version_id IS NULL THEN
    RAISE EXCEPTION 'Service visit site requires a master inspection job';
  END IF;

  IF NEW.creation_request_id IS NOT NULL AND (
    NEW.site_id IS NULL OR NEW.service_date IS NULL OR NEW.service_time IS NULL
  ) THEN
    RAISE EXCEPTION 'Created service visits require a site, service date, and service time';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_service_visit_schedule_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.creation_request_id IS NOT NULL AND (
    NEW.service_date IS DISTINCT FROM OLD.service_date
    OR NEW.service_time IS DISTINCT FROM OLD.service_time
  ) THEN
    RAISE EXCEPTION 'Service visit schedule is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_visit_schedule_immutable ON inspection_jobs;
CREATE TRIGGER trg_service_visit_schedule_immutable
BEFORE UPDATE OF service_date, service_time ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION prevent_service_visit_schedule_mutation();
