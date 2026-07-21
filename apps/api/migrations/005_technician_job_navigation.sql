ALTER TABLE inspection_jobs
  ALTER COLUMN template_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS master_template_version_id UUID
    REFERENCES master_service_report_templates(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inspection_jobs_template_source_check'
  ) THEN
    ALTER TABLE inspection_jobs
      ADD CONSTRAINT inspection_jobs_template_source_check CHECK (
        (
          template_id IS NOT NULL
          AND master_template_version_id IS NULL
          AND customer_id IS NULL
          AND customer_configuration_revision_id IS NULL
          AND configuration_snapshot IS NULL
        )
        OR
        (
          template_id IS NULL
          AND master_template_version_id IS NOT NULL
          AND customer_id IS NOT NULL
          AND customer_configuration_revision_id IS NOT NULL
          AND configuration_snapshot IS NOT NULL
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_inspection_jobs_master_template
  ON inspection_jobs (master_template_version_id);

CREATE INDEX IF NOT EXISTS idx_inspection_jobs_configuration_revision
  ON inspection_jobs (customer_configuration_revision_id);

CREATE OR REPLACE FUNCTION enforce_master_inspection_job_configuration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.master_template_version_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM customer_configuration_revisions revision
    WHERE revision.id = NEW.customer_configuration_revision_id
      AND revision.customer_id = NEW.customer_id
      AND revision.template_version_id = NEW.master_template_version_id
  ) THEN
    RAISE EXCEPTION 'Inspection job configuration must match its customer and Master template';
  END IF;

  IF NEW.configuration_snapshot->>'schemaVersion' <> '1'
    OR NEW.configuration_snapshot->'customer'->>'id' <> NEW.customer_id::text
    OR NEW.configuration_snapshot->'configuration'->>'revisionId' <> NEW.customer_configuration_revision_id::text
    OR NEW.configuration_snapshot->'template'->>'id' <> NEW.master_template_version_id::text
    OR jsonb_typeof(NEW.configuration_snapshot->'enabledSystems') <> 'array'
  THEN
    RAISE EXCEPTION 'Inspection job configuration snapshot does not match its relational identity';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_master_inspection_job_snapshot_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.master_template_version_id IS NOT NULL AND (
    NEW.master_template_version_id IS DISTINCT FROM OLD.master_template_version_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.customer_configuration_revision_id IS DISTINCT FROM OLD.customer_configuration_revision_id
    OR NEW.configuration_snapshot IS DISTINCT FROM OLD.configuration_snapshot
  ) THEN
    RAISE EXCEPTION 'Master inspection job configuration snapshots are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_inspection_job_configuration'
  ) THEN
    CREATE TRIGGER trg_master_inspection_job_configuration
    BEFORE INSERT OR UPDATE OF customer_id, customer_configuration_revision_id,
      master_template_version_id, configuration_snapshot
    ON inspection_jobs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_master_inspection_job_configuration();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_master_inspection_job_snapshot_immutable'
  ) THEN
    CREATE TRIGGER trg_master_inspection_job_snapshot_immutable
    BEFORE UPDATE OF customer_id, customer_configuration_revision_id,
      master_template_version_id, configuration_snapshot
    ON inspection_jobs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_master_inspection_job_snapshot_change();
  END IF;
END;
$$;
