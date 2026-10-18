-- Online visits retain NULL; offline retries compare the original device instant.
-- Job UUID and configuration revision already have authoritative columns.
ALTER TABLE inspection_jobs ADD COLUMN IF NOT EXISTS created_on_device_at TIMESTAMPTZ;
