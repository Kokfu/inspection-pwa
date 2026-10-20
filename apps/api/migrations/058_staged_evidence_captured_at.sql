-- P2: internal screens label gallery photos with the photo's own capturedAt.
-- V7 staged evidence validated capturedAt on upload but never stored it.
-- Existing rows stay NULL (the value is not reconstructable); new uploads store
-- the validated client capturedAt. Nullable, additive, no backfill.
ALTER TABLE staged_inspection_evidence
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;
