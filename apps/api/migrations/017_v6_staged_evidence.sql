-- V6 staged evidence is intentionally independent from legacy accepted
-- inspection_attachments.  Binaries may arrive before form acceptance.
ALTER TABLE master_system_form_instances
  DROP CONSTRAINT IF EXISTS master_system_form_instances_response_schema_version_check;
ALTER TABLE master_system_form_instances
  ADD CONSTRAINT master_system_form_instances_response_schema_version_check
  CHECK (response_schema_version IN (1, 2));
ALTER TABLE master_system_form_instances
  DROP CONSTRAINT IF EXISTS master_system_form_instances_snapshot_schema_version_check;
ALTER TABLE master_system_form_instances
  ADD CONSTRAINT master_system_form_instances_snapshot_schema_version_check
  CHECK (snapshot_schema_version IN (1, 2));

CREATE TABLE IF NOT EXISTS inspection_evidence_reservations (
  inspection_client_uuid UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES inspection_jobs(id) ON DELETE RESTRICT,
  system_key TEXT NOT NULL,
  master_template_version_id UUID NOT NULL REFERENCES master_service_report_templates(id) ON DELETE RESTRICT,
  master_template_version INTEGER NOT NULL CHECK (master_template_version = 6),
  system_contract_sha256 CHAR(64) NOT NULL CHECK (system_contract_sha256 ~ '^[0-9a-f]{64}$'),
  reserved_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  CHECK (system_key = 'fire_alarm_detector')
);

CREATE INDEX IF NOT EXISTS idx_evidence_reservations_job_system
  ON inspection_evidence_reservations(job_id, system_key);

CREATE TABLE IF NOT EXISTS staged_inspection_evidence (
  photo_uuid UUID PRIMARY KEY,
  inspection_client_uuid UUID NOT NULL REFERENCES inspection_evidence_reservations(inspection_client_uuid) ON DELETE RESTRICT,
  job_id UUID NOT NULL REFERENCES inspection_jobs(id) ON DELETE RESTRICT,
  system_key TEXT NOT NULL CHECK (system_key = 'fire_alarm_detector'),
  field_path TEXT NOT NULL CHECK (length(field_path) BETWEEN 1 AND 500),
  master_template_version_id UUID NOT NULL REFERENCES master_service_report_templates(id) ON DELETE RESTRICT,
  master_template_version INTEGER NOT NULL CHECK (master_template_version = 6),
  system_contract_sha256 CHAR(64) NOT NULL CHECK (system_contract_sha256 ~ '^[0-9a-f]{64}$'),
  uploader_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_sha256 CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  stored_sha256 CHAR(64) NOT NULL CHECK (stored_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/jpeg'),
  source_size_bytes INTEGER NOT NULL CHECK (source_size_bytes BETWEEN 1 AND 2097152),
  source_width INTEGER NOT NULL CHECK (source_width BETWEEN 1 AND 1600),
  source_height INTEGER NOT NULL CHECK (source_height BETWEEN 1 AND 1600),
  stored_size_bytes INTEGER NOT NULL CHECK (stored_size_bytes BETWEEN 1 AND 2097152),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 1600),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 1600),
  storage_relative_path TEXT NOT NULL UNIQUE CHECK (length(storage_relative_path) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (status IN ('staged', 'accepted')),
  form_instance_id UUID REFERENCES master_system_form_instances(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE (inspection_client_uuid, system_key, field_path),
  CHECK ((status = 'staged' AND form_instance_id IS NULL AND accepted_at IS NULL)
      OR (status = 'accepted' AND form_instance_id IS NOT NULL AND accepted_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_staged_evidence_reservation_status
  ON staged_inspection_evidence(inspection_client_uuid, status);
CREATE INDEX IF NOT EXISTS idx_staged_evidence_job_status
  ON staged_inspection_evidence(job_id, status);
