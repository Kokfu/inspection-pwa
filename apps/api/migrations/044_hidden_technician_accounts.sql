-- Keep historical user references intact while removing deactivated technicians
-- from operational staff lists. This is a forward-only account lifecycle flag.
ALTER TABLE users ADD COLUMN hidden_at TIMESTAMPTZ NULL;
