-- Soft-retirement for a system-wide service-catalog entry
-- (`master_service_report_systems`). Reversible: setting `retired_at` stops
-- the system from being offered for NEW customer assignment; clearing it
-- restores availability. Never a hard delete, and never affects a customer
-- who already has the system enabled (that authority lives entirely in
-- `customer_enabled_systems`, a separate table this migration does not
-- touch).
--
-- No immutability trigger exists on this table (see migration 004), so this
-- is a plain additive column with no trigger changes required.

ALTER TABLE master_service_report_systems
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ NULL;
