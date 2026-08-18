-- Phase 6B: a service visit is an immutable, separately identified job.
CREATE TABLE IF NOT EXISTS customer_sites (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  site_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, site_code)
);

CREATE INDEX IF NOT EXISTS idx_customer_sites_customer_active
  ON customer_sites (customer_id, display_name, id)
  WHERE is_active = true;

ALTER TABLE inspection_jobs
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES customer_sites(id),
  ADD COLUMN IF NOT EXISTS service_date DATE,
  ADD COLUMN IF NOT EXISTS creation_request_id UUID UNIQUE;

CREATE SEQUENCE IF NOT EXISTS service_visit_reference_sequence;

-- Continue past any service-visit references that may already exist from a
-- manually prepared environment. The sequence, rather than MAX()+1 at create
-- time, remains the concurrency-safe allocator.
DO $$
DECLARE
  highest_existing_reference BIGINT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(job_reference, '^SV-[0-9]{8}-([0-9]+)$'))[1]::bigint), 0)
    INTO highest_existing_reference
    FROM inspection_jobs
    WHERE job_reference ~ '^SV-[0-9]{8}-[0-9]+$';
  PERFORM setval(
    'service_visit_reference_sequence',
    GREATEST(highest_existing_reference, 1),
    highest_existing_reference > 0
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_inspection_jobs_site_id ON inspection_jobs (site_id);
CREATE INDEX IF NOT EXISTS idx_inspection_jobs_service_date ON inspection_jobs (service_date DESC);

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
    NEW.site_id IS NULL OR NEW.service_date IS NULL
  ) THEN
    RAISE EXCEPTION 'Created service visits require a site and service date';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_visit_site_identity ON inspection_jobs;
CREATE TRIGGER trg_service_visit_site_identity
BEFORE INSERT OR UPDATE OF customer_id, site_id, service_date, creation_request_id,
  master_template_version_id
ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_service_visit_site_identity();

-- A completed job is historical service data. Completion metadata is guarded
-- by migration 009; this also freezes its identifying and visit fields.
CREATE OR REPLACE FUNCTION prevent_completed_service_visit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_completed_service_visit_immutable ON inspection_jobs;
CREATE TRIGGER trg_completed_service_visit_immutable
BEFORE UPDATE ON inspection_jobs
FOR EACH ROW EXECUTE FUNCTION prevent_completed_service_visit_mutation();
