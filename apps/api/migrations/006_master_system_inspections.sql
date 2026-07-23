CREATE TABLE IF NOT EXISTS master_system_inspections (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES inspection_jobs(id),
  system_key TEXT NOT NULL,
  created_by_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, system_key)
);

CREATE TABLE IF NOT EXISTS master_system_form_instances (
  id UUID PRIMARY KEY,
  inspection_group_id UUID NOT NULL REFERENCES master_system_inspections(id),
  client_uuid UUID NOT NULL UNIQUE,
  instance_key TEXT NOT NULL,
  zone_id UUID REFERENCES customer_system_zones(id),
  location_id UUID REFERENCES customer_system_locations(id),
  zone_snapshot JSONB,
  location_snapshot JSONB,
  display_sequence INTEGER NOT NULL CHECK (display_sequence > 0),
  master_template_version_id UUID NOT NULL REFERENCES master_service_report_templates(id),
  customer_configuration_revision_id UUID NOT NULL REFERENCES customer_configuration_revisions(id),
  snapshot_schema_version INTEGER NOT NULL CHECK (snapshot_schema_version = 1),
  inspection_snapshot JSONB NOT NULL,
  response_schema_version INTEGER NOT NULL CHECK (response_schema_version = 1),
  response_payload JSONB NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  status TEXT NOT NULL CHECK (status = 'submitted'),
  performed_at TIMESTAMPTZ NOT NULL,
  original_created_by_user_id BIGINT REFERENCES users(id),
  original_creator_snapshot JSONB,
  synced_by_user_id BIGINT NOT NULL REFERENCES users(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inspection_group_id, instance_key)
);

ALTER TABLE master_system_form_instances
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES customer_system_zones(id),
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES customer_system_locations(id),
  ADD COLUMN IF NOT EXISTS original_creator_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_master_system_inspections_job_id
  ON master_system_inspections (job_id);
CREATE INDEX IF NOT EXISTS idx_master_system_form_instances_group_id
  ON master_system_form_instances (inspection_group_id);
CREATE INDEX IF NOT EXISTS idx_master_system_form_instances_performed_at
  ON master_system_form_instances (performed_at DESC);

CREATE OR REPLACE FUNCTION enforce_master_system_inspection_group_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  job_template_id UUID;
  job_configuration_id UUID;
  job_configuration_snapshot JSONB;
BEGIN
  SELECT master_template_version_id, customer_configuration_revision_id, configuration_snapshot
    INTO job_template_id, job_configuration_id, job_configuration_snapshot
    FROM inspection_jobs
    WHERE id = NEW.job_id
      AND status = 'open';

  IF job_template_id IS NULL
    OR job_configuration_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(job_configuration_snapshot->'enabledSystems') AS configured(system)
      WHERE configured.system->>'systemKey' = NEW.system_key
        AND configured.system->>'definitionStatus' = 'confirmed'
    )
  THEN
    RAISE EXCEPTION 'Master system inspection group does not match its open job configuration';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_master_system_form_instance_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  group_job_id UUID;
  group_system_key TEXT;
  job_template_id UUID;
  job_configuration_id UUID;
  job_configuration_snapshot JSONB;
  configured_enabled_system_id UUID;
BEGIN
  SELECT inspection.job_id, inspection.system_key
    INTO group_job_id, group_system_key
    FROM master_system_inspections inspection
    WHERE inspection.id = NEW.inspection_group_id;

  SELECT master_template_version_id, customer_configuration_revision_id, configuration_snapshot
    INTO job_template_id, job_configuration_id, job_configuration_snapshot
    FROM inspection_jobs
    WHERE id = group_job_id
      AND status = 'open';

  SELECT (configured.system->>'enabledSystemId')::uuid
    INTO configured_enabled_system_id
    FROM jsonb_array_elements(job_configuration_snapshot->'enabledSystems') AS configured(system)
    WHERE configured.system->>'systemKey' = group_system_key
      AND configured.system->>'definitionStatus' = 'confirmed';

  IF job_template_id IS NULL
    OR job_template_id <> NEW.master_template_version_id
    OR job_configuration_id <> NEW.customer_configuration_revision_id
    OR configured_enabled_system_id IS NULL
  THEN
    RAISE EXCEPTION 'Master system inspection instance does not match its open job identity';
  END IF;

  IF NEW.zone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customer_system_zones zone
    WHERE zone.id = NEW.zone_id AND zone.enabled_system_id = configured_enabled_system_id
  ) THEN
    RAISE EXCEPTION 'Master system inspection zone does not belong to its configured system';
  END IF;

  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customer_system_locations location
    WHERE location.id = NEW.location_id
      AND location.enabled_system_id = configured_enabled_system_id
      AND (NEW.zone_id IS NULL OR location.zone_id = NEW.zone_id)
  ) THEN
    RAISE EXCEPTION 'Master system inspection location does not belong to its configured system';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_master_system_inspection_group_identity
  ON master_system_inspections;
CREATE TRIGGER trg_master_system_inspection_group_identity
BEFORE INSERT OR UPDATE OF job_id, system_key
ON master_system_inspections
FOR EACH ROW EXECUTE FUNCTION enforce_master_system_inspection_group_identity();

DROP TRIGGER IF EXISTS trg_master_system_form_instance_identity
  ON master_system_form_instances;
CREATE TRIGGER trg_master_system_form_instance_identity
BEFORE INSERT OR UPDATE OF inspection_group_id, master_template_version_id,
  customer_configuration_revision_id, zone_id, location_id
ON master_system_form_instances
FOR EACH ROW EXECUTE FUNCTION enforce_master_system_form_instance_identity();
