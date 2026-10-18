BEGIN;
CREATE SEQUENCE IF NOT EXISTS repair_visit_reference_sequence;
CREATE TABLE IF NOT EXISTS repair_report_number_year_counters (
  report_year INTEGER PRIMARY KEY CHECK (report_year BETWEEN 1 AND 9999),
  last_sequence BIGINT NOT NULL CHECK (last_sequence > 0)
);
CREATE TABLE IF NOT EXISTS repair_visits (
  client_uuid UUID PRIMARY KEY,
  visit_number TEXT NOT NULL UNIQUE CHECK (visit_number ~ '^RV-[0-9]{8}-[1-9][0-9]*$'),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_id UUID NOT NULL REFERENCES customer_sites(id) ON DELETE RESTRICT,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  configuration_revision_id UUID NOT NULL REFERENCES customer_configuration_revisions(id) ON DELETE RESTRICT,
  service_call_number TEXT CHECK (service_call_number IS NULL OR length(service_call_number) <= 100),
  arrival_time TIME NOT NULL,
  visit_date DATE NOT NULL,
  created_on_device_at TIMESTAMPTZ NOT NULL,
  previous_visit_kind TEXT CHECK (previous_visit_kind IN ('service','repair')),
  previous_service_visit_id UUID REFERENCES inspection_jobs(id) ON DELETE RESTRICT,
  previous_repair_visit_id UUID REFERENCES repair_visits(client_uuid) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_approval','returned','approved')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  report_number TEXT UNIQUE CHECK (report_number ~ '^MFE/RR/[0-9]{4}/[0-9]{4,}$'),
  approved_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  final_pdf BYTEA CHECK (final_pdf IS NULL OR octet_length(final_pdf) > 0),
  final_pdf_sha256 TEXT CHECK (final_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((previous_visit_kind IS NULL AND previous_service_visit_id IS NULL AND previous_repair_visit_id IS NULL)
    OR (previous_visit_kind IS NOT NULL AND previous_visit_kind = 'service' AND previous_service_visit_id IS NOT NULL AND previous_repair_visit_id IS NULL)
    OR (previous_visit_kind IS NOT NULL AND previous_visit_kind = 'repair' AND previous_service_visit_id IS NULL AND previous_repair_visit_id IS NOT NULL)),
  CHECK (previous_repair_visit_id IS DISTINCT FROM client_uuid),
  CHECK ((status = 'approved' AND report_number IS NOT NULL AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL
      AND final_pdf IS NOT NULL AND final_pdf_sha256 IS NOT NULL)
    OR (status <> 'approved' AND report_number IS NULL AND approved_by_user_id IS NULL AND approved_at IS NULL
      AND final_pdf IS NULL AND final_pdf_sha256 IS NULL))
);
CREATE INDEX IF NOT EXISTS repair_visits_owner ON repair_visits(created_by_user_id, status, visit_date);
CREATE INDEX IF NOT EXISTS repair_visits_customer_site ON repair_visits(customer_id, site_id, visit_date);
CREATE TABLE IF NOT EXISTS repair_visit_items (
  client_uuid UUID PRIMARY KEY,
  visit_uuid UUID NOT NULL REFERENCES repair_visits(client_uuid) ON DELETE RESTRICT,
  system_key TEXT NOT NULL CHECK (system_key IN ('automatic_sprinkler','fire_alarm_detector','hydrant','hose_reel',
    'dry_wet_riser','co2_fire_extinguisher','wet_chemical','fm200_fire_suppression','smoke_ventilation','fire_intercom','fire_rated_roller_shutter')),
  row_uuid UUID,
  location_id UUID,
  zone_id UUID,
  section_key TEXT NOT NULL CHECK (length(section_key) BETWEEN 1 AND 100),
  field_key TEXT NOT NULL CHECK (length(field_key) BETWEEN 1 AND 100),
  system_label TEXT NOT NULL CHECK (length(system_label) BETWEEN 1 AND 300),
  unit_label TEXT NOT NULL CHECK (length(unit_label) BETWEEN 1 AND 300),
  section_label TEXT NOT NULL CHECK (length(section_label) BETWEEN 1 AND 300),
  field_label TEXT NOT NULL CHECK (length(field_label) BETWEEN 1 AND 300),
  before_snapshot JSONB CHECK (before_snapshot IS NULL OR jsonb_typeof(before_snapshot) = 'object'),
  outcome TEXT CHECK (outcome IN ('done_repair','not_done')),
  remark TEXT NOT NULL DEFAULT '' CHECK (length(remark) <= 4000),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  -- NULL unit dimensions identify a singleton system's static checklist field.
  -- Repeated/configured units use their real UUIDs, never list positions.
  UNIQUE(client_uuid, visit_uuid),
  UNIQUE NULLS NOT DISTINCT (visit_uuid,system_key,row_uuid,location_id,zone_id,section_key,field_key)
);
CREATE TABLE IF NOT EXISTS repair_visit_photos (
  photo_uuid UUID PRIMARY KEY,
  visit_uuid UUID NOT NULL REFERENCES repair_visits(client_uuid) ON DELETE RESTRICT,
  item_uuid UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  uploader_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  stored_sha256 TEXT NOT NULL CHECK (stored_sha256 ~ '^[0-9a-f]{64}$'),
  storage_relative_path TEXT NOT NULL UNIQUE CHECK (length(storage_relative_path) > 0),
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/jpeg'),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  capture_source TEXT NOT NULL CHECK (capture_source IN ('camera','gallery','unknown')),
  captured_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staged','accepted','superseded')),
  bound_item_uuid UUID,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(bound_item_uuid,visit_uuid) REFERENCES repair_visit_items(client_uuid,visit_uuid) ON DELETE RESTRICT,
  CHECK ((status='staged' AND bound_item_uuid IS NULL AND accepted_at IS NULL)
    OR (status IN ('accepted','superseded') AND bound_item_uuid IS NOT NULL AND bound_item_uuid=item_uuid AND accepted_at IS NOT NULL))
);
-- A returned revision stages its replacement before atomically superseding the
-- old binding. One accepted After per item; one staged candidate per revision.
CREATE UNIQUE INDEX IF NOT EXISTS repair_visit_photos_current_item ON repair_visit_photos(item_uuid) WHERE status = 'accepted';
CREATE UNIQUE INDEX IF NOT EXISTS repair_visit_photos_staged_item ON repair_visit_photos(item_uuid,revision) WHERE status = 'staged';
CREATE TABLE IF NOT EXISTS repair_visit_events (
  client_uuid UUID PRIMARY KEY,
  visit_uuid UUID NOT NULL REFERENCES repair_visits(client_uuid) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted','returned','resubmitted','approved')),
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 4000),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_type <> 'returned' OR reason IS NOT NULL),
  UNIQUE(visit_uuid,revision,event_type)
);
CREATE OR REPLACE FUNCTION repair_visit_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'repair visit events are append-only'; END $$;
CREATE OR REPLACE TRIGGER repair_visit_events_no_mutation BEFORE UPDATE OR DELETE ON repair_visit_events
  FOR EACH ROW EXECUTE FUNCTION repair_visit_event_append_only();
CREATE OR REPLACE TRIGGER repair_visit_events_no_truncate BEFORE TRUNCATE ON repair_visit_events
  FOR EACH STATEMENT EXECUTE FUNCTION repair_visit_event_append_only();
COMMIT;
