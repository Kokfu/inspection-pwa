-- T4: add the `supervisor` role (review + audited corrections + report approval; no user,
-- customer, template or configuration management). Forward-only; 002 stays unchanged.
-- One ALTER TABLE statement, so the swap is atomic. The DROP deliberately has no IF EXISTS:
-- if PostgreSQL named 002's inline CHECK differently, this fails loudly instead of leaving
-- the old two-role CHECK in place next to the new one. Existing rows are not changed.
ALTER TABLE users
  DROP CONSTRAINT users_role_check,
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'inspector', 'supervisor'));
