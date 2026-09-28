-- Technician-proposed, Supervisor/Admin-approved customer zone/location configuration.
-- Mirrors 045_report_approvals.sql's split of immutable submission vs. append-only
-- decision: `customer_location_proposals` holds one immutable row per technician
-- submission (their own client-generated UUID, minted offline before any network
-- call); `customer_location_proposal_decisions` is the append-only decision log.
-- The proposal's current status is DERIVED (apps/api/src/inspections/locationProposal.ts),
-- never read off a mutable column. Both decisions are terminal -- no withdraw, no
-- re-decision -- so an approved or rejected proposal never gets a second row; a
-- technician who wants to try again submits a brand-new proposal (new UUID).
CREATE TABLE customer_location_proposals (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  system_key TEXT NOT NULL,
  -- Immutable audit context. The submission route validates the visit's owner
  -- and customer. Do not add an FK: deleting an unfinished visit must not try
  -- to mutate this append-only proposal row.
  job_id UUID NOT NULL,
  submitted_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by_role TEXT NOT NULL CHECK (submitted_by_role = 'inspector'),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same {zones, locations} shape `parseLocationConfigurationInput` validates for
  -- a Manager's own `PUT .../systems/:systemKey/locations`.
  payload JSONB NOT NULL
);

CREATE INDEX idx_customer_location_proposals_customer_system ON customer_location_proposals (customer_id, system_key);
CREATE INDEX idx_customer_location_proposals_submitted_by ON customer_location_proposals (submitted_by_user_id);

CREATE OR REPLACE FUNCTION customer_location_proposals_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'customer_location_proposals is append-only (% refused)', TG_OP;
END $$;

CREATE TRIGGER customer_location_proposals_no_update_delete
  BEFORE UPDATE OR DELETE ON customer_location_proposals
  FOR EACH ROW EXECUTE FUNCTION customer_location_proposals_append_only();

CREATE TRIGGER customer_location_proposals_no_truncate
  BEFORE TRUNCATE ON customer_location_proposals
  FOR EACH STATEMENT EXECUTE FUNCTION customer_location_proposals_append_only();

CREATE TABLE customer_location_proposal_decisions (
  id UUID PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES customer_location_proposals(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  -- Reject requires a note (enforced by the route, mirroring report_approvals'
  -- withdraw-requires-note rule); approve's note is optional. The bare length
  -- bound here matches report_approvals' CHECK exactly.
  note TEXT CHECK (note IS NULL OR length(btrim(note)) BETWEEN 3 AND 500),
  decided_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_role TEXT NOT NULL CHECK (decided_by_role IN ('admin', 'supervisor')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  -- The configuration revision Approve produced via `applyManagerLocationsUpdate`
  -- (the same write path a Manager's own edit performs); NULL for a reject.
  resulting_revision_id UUID REFERENCES customer_configuration_revisions(id) ON DELETE RESTRICT,
  -- Idempotency mirrors report_approvals: same request id + same fingerprint
  -- replays the stored event; a different body under the same id is refused
  -- (409) by the route, not by a constraint.
  request_id UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  UNIQUE (proposal_id, sequence)
);

CREATE INDEX idx_customer_location_proposal_decisions_proposal ON customer_location_proposal_decisions (proposal_id);
CREATE INDEX idx_customer_location_proposal_decisions_request ON customer_location_proposal_decisions (request_id);

CREATE OR REPLACE FUNCTION customer_location_proposal_decisions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'customer_location_proposal_decisions is append-only (% refused)', TG_OP;
END $$;

CREATE TRIGGER customer_location_proposal_decisions_no_update_delete
  BEFORE UPDATE OR DELETE ON customer_location_proposal_decisions
  FOR EACH ROW EXECUTE FUNCTION customer_location_proposal_decisions_append_only();

CREATE TRIGGER customer_location_proposal_decisions_no_truncate
  BEFORE TRUNCATE ON customer_location_proposal_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION customer_location_proposal_decisions_append_only();
