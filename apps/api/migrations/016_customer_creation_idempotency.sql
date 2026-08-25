-- Active customer names are the existing shared-business identity: the
-- application has always rejected duplicates by lower(btrim(display_name)).
-- Enforce that exact, narrow rule in PostgreSQL so concurrent creators cannot
-- pass an application-level pre-check and create two shared customers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_active_canonical_display_name
  ON customers ((lower(btrim(display_name))))
  WHERE is_active;

-- The reservation is created and completed in the same transaction as the
-- customer, site, revision, and enabled-system records. A rollback removes it,
-- so it can never point at an incomplete customer.
CREATE TABLE IF NOT EXISTS customer_creation_requests (
  request_id UUID PRIMARY KEY,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  customer_id UUID REFERENCES customers(id),
  created_by_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_creation_requests_customer
  ON customer_creation_requests (customer_id);
