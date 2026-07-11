CREATE TABLE IF NOT EXISTS test_records (
  id BIGSERIAL PRIMARY KEY,
  client_uuid UUID NOT NULL UNIQUE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_records_created_at
  ON test_records (created_at);
