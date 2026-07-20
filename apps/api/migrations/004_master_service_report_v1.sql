CREATE TABLE IF NOT EXISTS master_service_report_templates (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  selection_policy TEXT NOT NULL CHECK (selection_policy = 'preset_only'),
  header_definition JSONB NOT NULL,
  report_boilerplate JSONB NOT NULL,
  publication_status TEXT NOT NULL CHECK (publication_status IN ('published', 'retired')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE TABLE IF NOT EXISTS master_service_report_systems (
  template_version_id UUID NOT NULL REFERENCES master_service_report_templates(id),
  system_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('confirmed', 'requires_confirmation')),
  definition JSONB NOT NULL,
  PRIMARY KEY (template_version_id, system_key),
  UNIQUE (template_version_id, sort_order)
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY,
  customer_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_configuration_revisions (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  template_version_id UUID NOT NULL REFERENCES master_service_report_templates(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_configuration_active
  ON customer_configuration_revisions (customer_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS customer_enabled_systems (
  id UUID PRIMARY KEY,
  configuration_revision_id UUID NOT NULL REFERENCES customer_configuration_revisions(id),
  template_version_id UUID NOT NULL,
  system_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (template_version_id, system_key)
    REFERENCES master_service_report_systems(template_version_id, system_key),
  UNIQUE (configuration_revision_id, system_key),
  UNIQUE (configuration_revision_id, sort_order)
);

CREATE TABLE IF NOT EXISTS customer_system_zones (
  id UUID PRIMARY KEY,
  enabled_system_id UUID NOT NULL REFERENCES customer_enabled_systems(id),
  zone_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enabled_system_id, zone_key),
  UNIQUE (enabled_system_id, sort_order)
);

CREATE TABLE IF NOT EXISTS customer_system_locations (
  id UUID PRIMARY KEY,
  enabled_system_id UUID NOT NULL REFERENCES customer_enabled_systems(id),
  zone_id UUID REFERENCES customer_system_zones(id),
  location_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  preset_row_count INTEGER NOT NULL DEFAULT 1 CHECK (preset_row_count > 0),
  row_preset JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enabled_system_id, location_key),
  UNIQUE (enabled_system_id, sort_order)
);

ALTER TABLE inspection_jobs
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS customer_configuration_revision_id UUID REFERENCES customer_configuration_revisions(id),
  ADD COLUMN IF NOT EXISTS configuration_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_customer_enabled_systems_revision
  ON customer_enabled_systems (configuration_revision_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_customer_system_zones_enabled_system
  ON customer_system_zones (enabled_system_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_customer_system_locations_enabled_system
  ON customer_system_locations (enabled_system_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_inspection_jobs_customer_id
  ON inspection_jobs (customer_id);

CREATE OR REPLACE FUNCTION enforce_confirmed_customer_system()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM master_service_report_systems system
    INNER JOIN customer_configuration_revisions revision
      ON revision.id = NEW.configuration_revision_id
     AND revision.template_version_id = system.template_version_id
    WHERE system.template_version_id = NEW.template_version_id
      AND system.system_key = NEW.system_key
      AND system.definition_status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'Customer configuration may only enable confirmed systems';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_location_zone_system()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.zone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM customer_system_zones zone
    WHERE zone.id = NEW.zone_id
      AND zone.enabled_system_id = NEW.enabled_system_id
  ) THEN
    RAISE EXCEPTION 'Location zone must belong to the same enabled system';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customer_enabled_system_confirmed'
  ) THEN
    CREATE TRIGGER trg_customer_enabled_system_confirmed
    BEFORE INSERT OR UPDATE OF template_version_id, system_key
    ON customer_enabled_systems
    FOR EACH ROW
    EXECUTE FUNCTION enforce_confirmed_customer_system();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customer_location_zone_system'
  ) THEN
    CREATE TRIGGER trg_customer_location_zone_system
    BEFORE INSERT OR UPDATE OF enabled_system_id, zone_id
    ON customer_system_locations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_location_zone_system();
  END IF;
END;
$$;
