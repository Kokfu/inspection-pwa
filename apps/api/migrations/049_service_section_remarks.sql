-- CR-07 Phase 1: technician-added free-text remarks, shared per customer + system + form section.
-- Additive only: one new table. service_common_remarks (035) and every other table are untouched.
-- The inspection payload never stores a remark id -- the chosen wording is appended to the existing
-- field string -- so nothing here touches templates, evidence contracts, reports or accepted records.
CREATE TABLE IF NOT EXISTS service_section_remarks (
  -- Client-generated UUID (crypto.randomUUID() on the device): the idempotency key for the create.
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  -- The allowlist of valid (system_key, section_key) pairs lives in the API
  -- (apps/api/src/inspections/remarkSections.ts) so a new pilot system needs no migration.
  system_key text NOT NULL CHECK (length(system_key) BETWEEN 1 AND 80),
  section_key text NOT NULL CHECK (length(section_key) BETWEEN 1 AND 160),
  -- Stored already normalised (trim, NFC, collapsed whitespace); length counts code points.
  wording text NOT NULL CHECK (length(wording) BETWEEN 3 AND 300 AND wording = btrim(wording)),
  created_by_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Audit context only. No FK, as in 048: deleting an unfinished visit must not touch this row.
  job_id uuid,
  -- sha256 of the canonical (customer, system, section, wording): same id + same fingerprint is a
  -- replay; same id + a different fingerprint is refused (409) by the route.
  create_fingerprint text NOT NULL CHECK (length(create_fingerprint) = 64),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active remark per (customer, system, section, case-insensitive wording). The route resolves a
-- duplicate to the existing row (merged) under an advisory lock; this index is the backstop.
CREATE UNIQUE INDEX IF NOT EXISTS service_section_remarks_active_wording
  ON service_section_remarks (customer_id, system_key, section_key, lower(wording)) WHERE active;
CREATE INDEX IF NOT EXISTS service_section_remarks_customer
  ON service_section_remarks (customer_id, created_at, id) WHERE active;
