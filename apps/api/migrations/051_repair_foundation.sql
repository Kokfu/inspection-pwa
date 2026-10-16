-- CR-09 B1. Forward-only repair authority; no inspection data is rewritten.
BEGIN;
CREATE TABLE repair_findings (
  id UUID PRIMARY KEY,
  form_instance_id UUID NOT NULL REFERENCES master_system_form_instances(id) ON DELETE RESTRICT,
  job_id UUID NOT NULL REFERENCES inspection_jobs(id) ON DELETE RESTRICT,
  system_key TEXT NOT NULL,
  field_path TEXT NOT NULL CHECK (length(field_path) BETWEEN 1 AND 300),
  original_metadata JSONB NOT NULL CHECK (jsonb_typeof(original_metadata) = 'object'),
  source_fingerprint CHAR(64) NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_instance_id, field_path), UNIQUE(id, job_id, system_key)
);
CREATE TABLE repair_work_orders (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES inspection_jobs(id) ON DELETE RESTRICT,
  system_key TEXT NOT NULL,
  assigned_to_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Audited mutation receipts are retained in this projection, including prior revisions.
  mutations JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(mutations) = 'array'),
  UNIQUE(id, job_id, system_key)
);
CREATE INDEX repair_work_orders_actor ON repair_work_orders(assigned_to_user_id, status);
CREATE TABLE repair_records (
  client_uuid UUID PRIMARY KEY,
  finding_id UUID NOT NULL,
  work_order_id UUID NOT NULL,
  job_id UUID NOT NULL,
  system_key TEXT NOT NULL,
  cycle_sequence INTEGER NOT NULL CHECK (cycle_sequence > 0),
  predecessor_uuid UUID REFERENCES repair_records(client_uuid) ON DELETE RESTRICT,
  remark TEXT NOT NULL CHECK (length(btrim(remark)) BETWEEN 1 AND 4000),
  performed_at TIMESTAMPTZ NOT NULL,
  submitted_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_revision CHAR(64) NOT NULL CHECK (source_revision ~ '^[0-9a-f]{64}$'),
  manifest JSONB NOT NULL CHECK (jsonb_typeof(manifest) = 'array' AND jsonb_array_length(manifest) = 1),
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  FOREIGN KEY(finding_id,job_id,system_key) REFERENCES repair_findings(id,job_id,system_key) ON DELETE RESTRICT,
  FOREIGN KEY(work_order_id,job_id,system_key) REFERENCES repair_work_orders(id,job_id,system_key) ON DELETE RESTRICT,
  UNIQUE(finding_id,cycle_sequence), UNIQUE(client_uuid,finding_id,work_order_id,job_id,system_key)
);
CREATE TABLE staged_repair_evidence (
  photo_uuid UUID PRIMARY KEY,
  repair_uuid UUID NOT NULL UNIQUE,
  finding_id UUID NOT NULL,
  work_order_id UUID NOT NULL,
  job_id UUID NOT NULL,
  system_key TEXT NOT NULL,
  uploader_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_sha256 CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  stored_sha256 CHAR(64) NOT NULL CHECK (stored_sha256 ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  storage_relative_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('staged','accepted')),
  bound_repair_uuid UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(finding_id,job_id,system_key) REFERENCES repair_findings(id,job_id,system_key) ON DELETE RESTRICT,
  FOREIGN KEY(work_order_id,job_id,system_key) REFERENCES repair_work_orders(id,job_id,system_key) ON DELETE RESTRICT,
  FOREIGN KEY(bound_repair_uuid,finding_id,work_order_id,job_id,system_key) REFERENCES repair_records(client_uuid,finding_id,work_order_id,job_id,system_key) ON DELETE RESTRICT,
  CHECK ((status='staged' AND bound_repair_uuid IS NULL) OR (status='accepted' AND bound_repair_uuid IS NOT NULL AND bound_repair_uuid=repair_uuid))
);
CREATE UNIQUE INDEX repair_evidence_source_scope ON staged_repair_evidence(job_id,system_key,source_sha256) WHERE status='accepted';
CREATE UNIQUE INDEX repair_evidence_stored_scope ON staged_repair_evidence(job_id,system_key,stored_sha256) WHERE status='accepted';
CREATE TABLE repair_approvals (
  id UUID PRIMARY KEY,
  repair_uuid UUID NOT NULL REFERENCES repair_records(client_uuid) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','withdrawn')),
  reason TEXT CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
  decided_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_role TEXT NOT NULL CHECK (decided_by_role IN ('admin','supervisor')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  request_id UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK (decision <> 'rejected' OR reason IS NOT NULL),
  UNIQUE(repair_uuid,sequence), UNIQUE(repair_uuid,request_id)
);
CREATE TABLE repair_finding_reviews (
  id UUID PRIMARY KEY,
  finding_id UUID NOT NULL REFERENCES repair_findings(id) ON DELETE RESTRICT,
  source_revision CHAR(64) NOT NULL CHECK (source_revision ~ '^[0-9a-f]{64}$'),
  decision TEXT NOT NULL CHECK (decision IN ('eligible','not_required')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  decided_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_role TEXT NOT NULL CHECK (decided_by_role IN ('admin','supervisor')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  request_id UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE(finding_id,sequence), UNIQUE(finding_id,request_id)
);
CREATE FUNCTION repair_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'repair authority is append-only (% refused)', TG_OP; END $$;
DO $$ DECLARE name TEXT; BEGIN
  FOREACH name IN ARRAY ARRAY['repair_findings','repair_records','repair_approvals','repair_finding_reviews'] LOOP
    EXECUTE format('CREATE TRIGGER repair_no_mutation BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION repair_append_only()', name);
    EXECUTE format('CREATE TRIGGER repair_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION repair_append_only()', name);
  END LOOP;
END $$;
-- Serialize cycles on the immutable finding; derive active state from append-only decisions.
-- No mutable status on repair_records and no permanent unique finding constraint.
CREATE FUNCTION repair_cycle_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior repair_records; BEGIN
  PERFORM 1 FROM repair_findings WHERE id=NEW.finding_id FOR UPDATE;
  SELECT * INTO prior FROM repair_records WHERE finding_id=NEW.finding_id ORDER BY cycle_sequence DESC LIMIT 1;
  IF prior.client_uuid IS NULL THEN
    IF NEW.cycle_sequence<>1 OR NEW.predecessor_uuid IS NOT NULL THEN RAISE EXCEPTION 'invalid first repair cycle' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.cycle_sequence<>prior.cycle_sequence+1 OR NEW.predecessor_uuid IS DISTINCT FROM prior.client_uuid
      OR NOT EXISTS(SELECT 1 FROM repair_approvals WHERE repair_uuid=prior.client_uuid) THEN
      RAISE EXCEPTION 'repair cycle occupied or invalid predecessor' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER repair_cycle BEFORE INSERT ON repair_records FOR EACH ROW EXECUTE FUNCTION repair_cycle_guard();
CREATE FUNCTION repair_finding_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM master_system_form_instances f JOIN master_system_inspections p ON p.id=f.inspection_group_id
    WHERE f.id=NEW.form_instance_id AND f.status='submitted' AND p.job_id=NEW.job_id AND p.system_key=NEW.system_key
      AND f.client_uuid::text=NEW.original_metadata->>'sourceClientUuid'
      AND NEW.form_instance_id::text=NEW.original_metadata->>'formInstanceId'
      AND NEW.field_path=NEW.original_metadata->>'fieldPath') THEN
    RAISE EXCEPTION 'foreign original repair finding' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER repair_finding_identity BEFORE INSERT ON repair_findings FOR EACH ROW EXECUTE FUNCTION repair_finding_identity_guard();
CREATE FUNCTION repair_work_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'work-order history cannot be removed'; END IF;
  IF NEW.id<>OLD.id OR NEW.job_id<>OLD.job_id OR NEW.system_key<>OLD.system_key
    OR NEW.created_by_user_id<>OLD.created_by_user_id OR NEW.created_at<>OLD.created_at
    OR NEW.revision<>OLD.revision+1 OR jsonb_array_length(NEW.mutations)<>jsonb_array_length(OLD.mutations)+1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.mutations) WITH ORDINALITY e(value,n)
      WHERE NEW.mutations->(n::integer-1) IS DISTINCT FROM value) THEN
    RAISE EXCEPTION 'invalid work-order history update' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER repair_work_order_identity BEFORE UPDATE OR DELETE ON repair_work_orders FOR EACH ROW EXECUTE FUNCTION repair_work_order_guard();
CREATE TRIGGER repair_work_order_no_truncate BEFORE TRUNCATE ON repair_work_orders FOR EACH STATEMENT EXECUTE FUNCTION repair_append_only();
COMMIT;
