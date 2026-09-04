-- STEP 1.1: Hydrant is a new V7 system contract. This is additive: it
-- expands V7 storage keys and upserts its definition from the immutable V1 source.
ALTER TABLE inspection_evidence_reservations
  DROP CONSTRAINT IF EXISTS inspection_evidence_reservations_system_key_check;
ALTER TABLE inspection_evidence_reservations
  ADD CONSTRAINT inspection_evidence_reservations_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant'));

ALTER TABLE staged_inspection_evidence
  DROP CONSTRAINT IF EXISTS staged_inspection_evidence_system_key_check;
ALTER TABLE staged_inspection_evidence
  ADD CONSTRAINT staged_inspection_evidence_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant'));

CREATE OR REPLACE FUNCTION v7_hydrant_four_state_definition(value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key TEXT;
  child JSONB;
  rewritten JSONB := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(value) = 'array' THEN
    RETURN (SELECT jsonb_agg(v7_hydrant_four_state_definition(element)) FROM jsonb_array_elements(value) AS element);
  END IF;
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN value;
  END IF;
  FOR key, child IN SELECT * FROM jsonb_each(value) LOOP
    IF key = 'allowedValues' AND value->>'control' = 'good_poor' THEN
      rewritten := rewritten || jsonb_build_object(key, '["good","not_good","complete_repair","na"]'::jsonb);
    ELSE
      rewritten := rewritten || jsonb_build_object(key, v7_hydrant_four_state_definition(child));
    END IF;
  END LOOP;
  RETURN rewritten;
END;
$$;

INSERT INTO master_service_report_systems (
  template_version_id, system_key, display_name, sort_order, definition_status, definition
)
SELECT
  '00000000-0000-4000-8000-000000000807', system_key, display_name, sort_order, definition_status,
  v7_hydrant_four_state_definition(definition)
FROM master_service_report_systems
WHERE template_version_id = '00000000-0000-4000-8000-000000000501'
  AND system_key = 'hydrant'
ON CONFLICT (template_version_id, system_key) DO UPDATE
SET definition = EXCLUDED.definition;

DROP FUNCTION v7_hydrant_four_state_definition(JSONB);
