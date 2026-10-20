-- R2: requests and terminal decisions; approved choices have service/section scope at every customer.
-- 049 and its per-customer rows remain untouched.
CREATE TABLE section_remark_requests (
  id uuid PRIMARY KEY,
  system_key text NOT NULL CHECK (length(system_key) BETWEEN 1 AND 80),
  section_key text NOT NULL CHECK (length(section_key) BETWEEN 1 AND 160 AND section_key <> 'comments'),
  wording text NOT NULL CHECK (length(wording) BETWEEN 3 AND 300 AND wording = btrim(wording)),
  requested_by_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  -- Context only: unfinished visits may be deleted, without deleting a request.
  job_id uuid,
  create_fingerprint text NOT NULL CHECK (create_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX section_remark_requests_owner ON section_remark_requests(requested_by_user_id, created_at, id);
CREATE INDEX section_remark_requests_wording ON section_remark_requests(system_key, section_key, lower(wording));

CREATE TABLE section_remark_request_decisions (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES section_remark_requests(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  reviewer_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_role text NOT NULL CHECK (reviewer_role IN ('admin','supervisor')),
  note text CHECK (length(note) BETWEEN 3 AND 500 AND note = btrim(note)),
  approved_wording text CHECK (length(approved_wording) BETWEEN 3 AND 300 AND approved_wording = btrim(approved_wording)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((decision = 'approved' AND approved_wording IS NOT NULL) OR
         (decision = 'rejected' AND approved_wording IS NULL AND note IS NOT NULL))
);

CREATE TABLE approved_section_remarks (
  id uuid PRIMARY KEY,
  system_key text NOT NULL CHECK (length(system_key) BETWEEN 1 AND 80),
  section_key text NOT NULL CHECK (length(section_key) BETWEEN 1 AND 160 AND section_key <> 'comments'),
  wording text NOT NULL CHECK (length(wording) BETWEEN 3 AND 300 AND wording = btrim(wording)),
  active boolean NOT NULL DEFAULT true,
  source_request_id uuid NOT NULL UNIQUE REFERENCES section_remark_requests(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX approved_section_remarks_active_wording
  ON approved_section_remarks(system_key, section_key, lower(wording)) WHERE active;

-- Match the site proposal decision log's append-only enforcement, including TRUNCATE.
CREATE FUNCTION section_remark_request_decisions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'section_remark_request_decisions is append-only (% refused)', TG_OP;
END $$;
CREATE TRIGGER section_remark_decisions_no_update_delete BEFORE UPDATE OR DELETE ON section_remark_request_decisions
  FOR EACH ROW EXECUTE FUNCTION section_remark_request_decisions_append_only();
CREATE TRIGGER section_remark_decisions_no_truncate BEFORE TRUNCATE ON section_remark_request_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION section_remark_request_decisions_append_only();
