-- Per-customer display-label overrides for enabled systems.
--
-- Additive and label-only. This column NEVER feeds
-- `canonical(master_service_report_systems.definition)` /
-- `contractSha256`, response keys, `validResponses()` lists, evidence
-- `fieldPath`s or the frozen attachment manifest. A missing or blank override
-- falls back to the definition label. The map is versioned through the existing
-- `customer_configuration_revisions` mechanism (a new revision forward-copies
-- it, exactly like `system_configuration`) and is frozen into the job's
-- `configuration_snapshot` at creation.
--
-- The CHECK mirrors migration 008's `system_configuration` object CHECK so the
-- runner can skip the migration once applied (PostgreSQL has no
-- `ADD CONSTRAINT IF NOT EXISTS`).
ALTER TABLE customer_enabled_systems
  ADD COLUMN IF NOT EXISTS label_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE customer_enabled_systems
  ADD CONSTRAINT customer_enabled_systems_label_overrides_object
  CHECK (jsonb_typeof(label_overrides) = 'object');
