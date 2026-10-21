-- Manager "Confirm details" flag. Purely informational: nothing is gated on it.
-- Additive and idempotent. Every existing row defaults to confirmed (true);
-- only customers created by a technician after this migration start unconfirmed.
-- created_by_user_id stays NULL for legacy customers (creator unknown).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES users(id);
