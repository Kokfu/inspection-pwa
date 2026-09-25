-- A no-preset CO2, Wet Chemical, or FM200 visit freezes one server-generated
-- General zone/location in its immutable job snapshot. Migration 006's trigger
-- predates that path and accepts only customer preset IDs. Keep its preset
-- checks, allowing the exact frozen General pair only when no preset location
-- exists for this enabled system.
-- The legacy FKs also require preset rows. The trigger below replaces their
-- insert-time identity check; delete guards retain their reference protection.
ALTER TABLE master_system_form_instances
  DROP CONSTRAINT IF EXISTS master_system_form_instances_zone_id_fkey,
  DROP CONSTRAINT IF EXISTS master_system_form_instances_location_id_fkey;

CREATE OR REPLACE FUNCTION protect_referenced_customer_system_zone()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM master_system_form_instances WHERE zone_id = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Accepted form still references this customer system zone';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.enabled_system_id IS DISTINCT FROM OLD.enabled_system_id THEN
      RAISE EXCEPTION 'Accepted form still references this customer system zone';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION protect_referenced_customer_system_location()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM master_system_form_instances WHERE location_id = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Accepted form still references this customer system location';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.enabled_system_id IS DISTINCT FROM OLD.enabled_system_id
      OR NEW.zone_id IS DISTINCT FROM OLD.zone_id THEN
      RAISE EXCEPTION 'Accepted form still references this customer system location';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_referenced_customer_system_zone ON customer_system_zones;
CREATE TRIGGER trg_protect_referenced_customer_system_zone
BEFORE DELETE OR UPDATE OF id, enabled_system_id ON customer_system_zones
FOR EACH ROW EXECUTE FUNCTION protect_referenced_customer_system_zone();

DROP TRIGGER IF EXISTS trg_protect_referenced_customer_system_location ON customer_system_locations;
CREATE TRIGGER trg_protect_referenced_customer_system_location
BEFORE DELETE OR UPDATE OF id, enabled_system_id, zone_id ON customer_system_locations
FOR EACH ROW EXECUTE FUNCTION protect_referenced_customer_system_location();

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
  frozen_general_location BOOLEAN := false;
BEGIN
  SELECT inspection.job_id, inspection.system_key
    INTO group_job_id, group_system_key
    FROM master_system_inspections inspection
    WHERE inspection.id = NEW.inspection_group_id;

  SELECT master_template_version_id, customer_configuration_revision_id, configuration_snapshot
    INTO job_template_id, job_configuration_id, job_configuration_snapshot
    FROM inspection_jobs
    WHERE id = group_job_id AND status = 'open';

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

  IF group_system_key IN ('co2_fire_extinguisher', 'wet_chemical', 'fm200_fire_suppression')
    AND job_configuration_snapshot #>> '{template,version}' = '7'
    AND NEW.zone_id IS NOT NULL AND NEW.location_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM customer_system_locations
      WHERE enabled_system_id = configured_enabled_system_id)
  THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(job_configuration_snapshot->'enabledSystems') AS configured(system)
      WHERE configured.system->>'systemKey' = group_system_key
        AND configured.system->>'enabledSystemId' = configured_enabled_system_id::text
        AND jsonb_array_length(configured.system->'zones') = 1
        AND jsonb_array_length(configured.system->'locations') = 1
        AND configured.system #>> '{zones,0,id}' = NEW.zone_id::text
        AND configured.system #>> '{zones,0,enabledSystemId}' = configured_enabled_system_id::text
        AND configured.system #>> '{zones,0,key}' = 'general'
        AND configured.system #>> '{zones,0,displayName}' = 'General'
        AND configured.system #>> '{locations,0,id}' = NEW.location_id::text
        AND configured.system #>> '{locations,0,enabledSystemId}' = configured_enabled_system_id::text
        AND configured.system #>> '{locations,0,zoneId}' = NEW.zone_id::text
        AND configured.system #>> '{locations,0,key}' = 'general'
        AND configured.system #>> '{locations,0,displayName}' = 'General'
    ) INTO frozen_general_location;
  END IF;

  IF NEW.zone_id IS NOT NULL AND NOT frozen_general_location AND NOT EXISTS (
    SELECT 1 FROM customer_system_zones zone
    WHERE zone.id = NEW.zone_id AND zone.enabled_system_id = configured_enabled_system_id
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'Master system inspection zone does not belong to its configured system';
  END IF;

  IF NEW.location_id IS NOT NULL AND NOT frozen_general_location AND NOT EXISTS (
    SELECT 1 FROM customer_system_locations location
    WHERE location.id = NEW.location_id
      AND location.enabled_system_id = configured_enabled_system_id
      AND (NEW.zone_id IS NULL OR location.zone_id = NEW.zone_id)
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'Master system inspection location does not belong to its configured system';
  END IF;

  RETURN NEW;
END;
$$;
