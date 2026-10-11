-- CR-02 Phase 1: a technician may type a site that is not in the customer's list when creating a service
-- visit. The site is created INACTIVE (so every existing site list keeps hiding it), the visit proceeds, and an
-- Admin (admin or supervisor role) approves it (the site becomes active) or rejects it (it stays inactive).
-- Mirrors 048_customer_location_proposals.sql: one immutable submission row per proposed site, plus an
-- append-only decision log. The proposal's current status is DERIVED from the decisions
-- (apps/api/src/inspections/siteProposal.ts), never read off a mutable column. Both decisions are terminal.
-- Additive only: customer_sites and every other existing table are untouched; there is no backfill.
CREATE TABLE customer_site_proposals (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  -- The pending customer_sites row this proposal is about. One proposal per site.
  site_id UUID NOT NULL UNIQUE REFERENCES customer_sites(id) ON DELETE RESTRICT,
  -- Audit context only (the visit that first proposed the site). No FK, as in 048: deleting an unstarted
  -- visit must not touch this append-only row.
  job_id UUID,
  submitted_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by_role TEXT NOT NULL CHECK (submitted_by_role = 'inspector'),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- What the technician typed, normalised (trim + collapsed whitespace). Approve uses exactly this.
  proposed_display_name TEXT NOT NULL CHECK (length(proposed_display_name) BETWEEN 1 AND 160 AND proposed_display_name = btrim(proposed_display_name)),
  proposed_address TEXT CHECK (proposed_address IS NULL OR length(proposed_address) BETWEEN 1 AND 500)
);

CREATE INDEX idx_customer_site_proposals_customer ON customer_site_proposals (customer_id);
CREATE INDEX idx_customer_site_proposals_submitted_by ON customer_site_proposals (submitted_by_user_id);

CREATE OR REPLACE FUNCTION customer_site_proposals_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'customer_site_proposals is append-only (% refused)', TG_OP;
END $$;

CREATE TRIGGER customer_site_proposals_no_update_delete
  BEFORE UPDATE OR DELETE ON customer_site_proposals
  FOR EACH ROW EXECUTE FUNCTION customer_site_proposals_append_only();

CREATE TRIGGER customer_site_proposals_no_truncate
  BEFORE TRUNCATE ON customer_site_proposals
  FOR EACH STATEMENT EXECUTE FUNCTION customer_site_proposals_append_only();

CREATE TABLE customer_site_proposal_decisions (
  id UUID PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES customer_site_proposals(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  -- Reject requires a note (enforced by the route); approve's note is optional. The bound matches 048 / 045.
  note TEXT CHECK (note IS NULL OR length(btrim(note)) BETWEEN 3 AND 500),
  decided_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_role TEXT NOT NULL CHECK (decided_by_role IN ('admin', 'supervisor')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  -- Idempotency: same request id + same fingerprint replays the stored decision; a different body under the
  -- same id is refused (409) by the route, not by a constraint.
  request_id UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  UNIQUE (proposal_id, sequence)
);

CREATE INDEX idx_customer_site_proposal_decisions_proposal ON customer_site_proposal_decisions (proposal_id);
CREATE INDEX idx_customer_site_proposal_decisions_request ON customer_site_proposal_decisions (request_id);

CREATE OR REPLACE FUNCTION customer_site_proposal_decisions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'customer_site_proposal_decisions is append-only (% refused)', TG_OP;
END $$;

CREATE TRIGGER customer_site_proposal_decisions_no_update_delete
  BEFORE UPDATE OR DELETE ON customer_site_proposal_decisions
  FOR EACH ROW EXECUTE FUNCTION customer_site_proposal_decisions_append_only();

CREATE TRIGGER customer_site_proposal_decisions_no_truncate
  BEFORE TRUNCATE ON customer_site_proposal_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION customer_site_proposal_decisions_append_only();
