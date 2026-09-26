-- A supervisor explicitly reviews an accepted V7 form at a particular correction revision.
-- Later append-only corrections advance the revision and make the form pending review again.
CREATE TABLE inspection_reviews (
  id UUID PRIMARY KEY,
  form_instance_id UUID NOT NULL REFERENCES master_system_form_instances(id) ON DELETE RESTRICT,
  correction_count INTEGER NOT NULL CHECK (correction_count >= 0),
  reviewed_by_user_id BIGINT NOT NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id UUID NOT NULL,
  UNIQUE (form_instance_id, correction_count),
  UNIQUE (form_instance_id, request_id)
);

CREATE OR REPLACE FUNCTION inspection_reviews_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inspection_reviews is append-only (% refused)', TG_OP;
END $$;

CREATE TRIGGER inspection_reviews_no_update_delete
  BEFORE UPDATE OR DELETE ON inspection_reviews
  FOR EACH ROW EXECUTE FUNCTION inspection_reviews_append_only();

CREATE TRIGGER inspection_reviews_no_truncate
  BEFORE TRUNCATE ON inspection_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION inspection_reviews_append_only();
