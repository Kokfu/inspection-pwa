-- Deterministic regression fixtures remain available to direct test harnesses,
-- but are not normal technician work. Real and user-created service visits
-- default to visible and are never selected by this fixed fixture identity set.
ALTER TABLE inspection_jobs
  ADD COLUMN IF NOT EXISTS technician_visible BOOLEAN NOT NULL DEFAULT true;

UPDATE inspection_jobs
SET technician_visible = false
WHERE id IN (
  '00000000-0000-4000-8000-000000000649',
  '00000000-0000-4000-8000-000000000580',
  '00000000-0000-4000-8000-000000000590',
  '00000000-0000-4000-8000-000000000679',
  '00000000-0000-4000-8000-000000000709',
  '00000000-0000-4000-8000-000000000729',
  '00000000-0000-4000-8000-000000000739',
  '00000000-0000-4000-8000-000000000749',
  '00000000-0000-4000-8000-000000000759',
  '00000000-0000-4000-8000-000000000819'
);
