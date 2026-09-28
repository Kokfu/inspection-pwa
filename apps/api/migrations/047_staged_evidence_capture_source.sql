-- V6/V7 accepted evidence did not persist the upload's capture source.
-- Existing rows remain NULL because the source cannot be reconstructed from
-- the request fingerprint. New uploads record the validated source directly.
ALTER TABLE staged_inspection_evidence
  ADD COLUMN capture_source TEXT
  CHECK (capture_source IN ('camera', 'gallery', 'unknown'));
