ALTER TABLE customer_enabled_systems
  ADD COLUMN IF NOT EXISTS system_configuration JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE customer_enabled_systems
  ADD CONSTRAINT customer_enabled_systems_system_configuration_object
  CHECK (jsonb_typeof(system_configuration) = 'object');
