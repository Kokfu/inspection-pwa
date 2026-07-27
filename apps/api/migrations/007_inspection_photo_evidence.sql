CREATE TABLE IF NOT EXISTS inspection_evidence_policies (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  system_key TEXT NOT NULL,
  definition JSONB NOT NULL,
  definition_sha256 CHAR(64) NOT NULL CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
  publication_status TEXT NOT NULL CHECK (publication_status IN ('published', 'retired')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

ALTER TABLE customer_enabled_systems
  ADD COLUMN IF NOT EXISTS evidence_policy_id UUID
    REFERENCES inspection_evidence_policies(id) ON DELETE RESTRICT;

ALTER TABLE master_system_form_instances
  ADD COLUMN IF NOT EXISTS evidence_policy_id UUID
    REFERENCES inspection_evidence_policies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS evidence_policy_version INTEGER,
  ADD COLUMN IF NOT EXISTS evidence_policy_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS evidence_policy_sha256 CHAR(64);

ALTER TABLE master_system_form_instances
  DROP CONSTRAINT IF EXISTS master_system_form_instances_evidence_policy_consistency;
ALTER TABLE master_system_form_instances
  ADD CONSTRAINT master_system_form_instances_evidence_policy_consistency CHECK (
    (
      evidence_policy_id IS NULL
      AND evidence_policy_version IS NULL
      AND evidence_policy_snapshot IS NULL
      AND evidence_policy_sha256 IS NULL
    )
    OR
    (
      evidence_policy_id IS NOT NULL
      AND evidence_policy_version IS NOT NULL
      AND evidence_policy_version > 0
      AND evidence_policy_snapshot IS NOT NULL
      AND evidence_policy_sha256 ~ '^[0-9a-f]{64}$'
    )
  );

CREATE TABLE IF NOT EXISTS inspection_attachments (
  id UUID PRIMARY KEY,
  client_uuid UUID NOT NULL UNIQUE,
  form_instance_id UUID NOT NULL
    REFERENCES master_system_form_instances(id) ON DELETE RESTRICT,
  evidence_policy_id UUID NOT NULL
    REFERENCES inspection_evidence_policies(id) ON DELETE RESTRICT,
  field_path TEXT NOT NULL CHECK (
    length(field_path) BETWEEN 1 AND 200
    AND field_path ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  capture_source TEXT NOT NULL CHECK (capture_source IN ('camera', 'gallery', 'unknown')),
  storage_relative_path TEXT NOT NULL UNIQUE CHECK (
    length(storage_relative_path) BETWEEN 1 AND 500
    AND storage_relative_path !~ '(^|/)\.\.(/|$)'
    AND storage_relative_path !~ '^[\\/]'
  ),
  source_sha256 CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  stored_sha256 CHAR(64) NOT NULL CHECK (stored_sha256 ~ '^[0-9a-f]{64}$'),
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/jpeg'),
  source_size_bytes INTEGER NOT NULL CHECK (source_size_bytes > 0 AND source_size_bytes <= 2097152),
  source_width INTEGER NOT NULL CHECK (source_width > 0 AND source_width <= 1600),
  source_height INTEGER NOT NULL CHECK (source_height > 0 AND source_height <= 1600),
  stored_size_bytes INTEGER NOT NULL CHECK (stored_size_bytes > 0 AND stored_size_bytes <= 2097152),
  width INTEGER NOT NULL CHECK (width > 0 AND width <= 1600),
  height INTEGER NOT NULL CHECK (height > 0 AND height <= 1600),
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_instance_id, field_path)
);

CREATE INDEX IF NOT EXISTS idx_inspection_attachments_form_instance
  ON inspection_attachments (form_instance_id);
CREATE INDEX IF NOT EXISTS idx_inspection_attachments_received_at
  ON inspection_attachments (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_enabled_systems_evidence_policy
  ON customer_enabled_systems (evidence_policy_id)
  WHERE evidence_policy_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_published_evidence_policy_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.publication_status = 'published' THEN
    RAISE EXCEPTION 'Published evidence policies are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_published_evidence_policy
  ON inspection_evidence_policies;
CREATE TRIGGER trg_immutable_published_evidence_policy
BEFORE UPDATE OR DELETE
ON inspection_evidence_policies
FOR EACH ROW EXECUTE FUNCTION prevent_published_evidence_policy_mutation();

CREATE OR REPLACE FUNCTION enforce_enabled_system_evidence_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.evidence_policy_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM inspection_evidence_policies policy
    WHERE policy.id = NEW.evidence_policy_id
      AND policy.system_key = NEW.system_key
      AND policy.publication_status = 'published'
  ) THEN
    RAISE EXCEPTION 'Evidence policy does not match the enabled system';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_enabled_system_evidence_policy
  ON customer_enabled_systems;
CREATE TRIGGER trg_customer_enabled_system_evidence_policy
BEFORE INSERT OR UPDATE OF system_key, evidence_policy_id
ON customer_enabled_systems
FOR EACH ROW EXECUTE FUNCTION enforce_enabled_system_evidence_policy();

CREATE OR REPLACE FUNCTION enforce_form_instance_evidence_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_system_key TEXT;
  old_has_policy BOOLEAN;
  new_has_policy BOOLEAN;
BEGIN
  old_has_policy := TG_OP = 'UPDATE' AND OLD.evidence_policy_id IS NOT NULL;
  new_has_policy := NEW.evidence_policy_id IS NOT NULL;

  IF old_has_policy AND (
    NEW.evidence_policy_id IS DISTINCT FROM OLD.evidence_policy_id
    OR NEW.evidence_policy_version IS DISTINCT FROM OLD.evidence_policy_version
    OR NEW.evidence_policy_snapshot IS DISTINCT FROM OLD.evidence_policy_snapshot
    OR NEW.evidence_policy_sha256 IS DISTINCT FROM OLD.evidence_policy_sha256
  ) THEN
    RAISE EXCEPTION 'Accepted form-instance evidence policy is immutable';
  END IF;

  IF NOT new_has_policy THEN
    RETURN NEW;
  END IF;

  SELECT parent.system_key
    INTO parent_system_key
    FROM master_system_inspections parent
    WHERE parent.id = NEW.inspection_group_id;

  IF NOT EXISTS (
    SELECT 1
    FROM inspection_evidence_policies policy
    WHERE policy.id = NEW.evidence_policy_id
      AND policy.system_key = parent_system_key
      AND policy.version = NEW.evidence_policy_version
      AND policy.definition_sha256 = NEW.evidence_policy_sha256
      AND policy.definition = NEW.evidence_policy_snapshot
      AND policy.publication_status = 'published'
  ) THEN
    RAISE EXCEPTION 'Accepted evidence policy does not match the inspection system';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_master_system_form_instance_evidence_policy
  ON master_system_form_instances;
CREATE TRIGGER trg_master_system_form_instance_evidence_policy
BEFORE INSERT OR UPDATE OF inspection_group_id, evidence_policy_id,
  evidence_policy_version, evidence_policy_snapshot, evidence_policy_sha256
ON master_system_form_instances
FOR EACH ROW EXECUTE FUNCTION enforce_form_instance_evidence_policy();

CREATE OR REPLACE FUNCTION enforce_inspection_attachment_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM master_system_form_instances instance
    WHERE instance.id = NEW.form_instance_id
      AND instance.status = 'submitted'
      AND instance.evidence_policy_id = NEW.evidence_policy_id
      AND COALESCE((instance.evidence_policy_snapshot->'points'->NEW.field_path->>'allowed')::boolean, false)
      AND COALESCE((instance.evidence_policy_snapshot->'points'->NEW.field_path->>'maxCount')::integer, 0) = 1
  ) THEN
    RAISE EXCEPTION 'Attachment field is not allowed by the accepted evidence policy';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspection_attachment_policy
  ON inspection_attachments;
CREATE TRIGGER trg_inspection_attachment_policy
BEFORE INSERT OR UPDATE OF form_instance_id, evidence_policy_id, field_path
ON inspection_attachments
FOR EACH ROW EXECUTE FUNCTION enforce_inspection_attachment_policy();
