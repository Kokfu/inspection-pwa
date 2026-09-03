-- C1-REWORK: V7 alone adopts the Hokuden four-state cover legend.  Keep this
-- FK-safe: customer_enabled_systems references these rows, so never DELETE.
CREATE OR REPLACE FUNCTION v7_four_state_definition(value JSONB)
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
    RETURN (SELECT jsonb_agg(v7_four_state_definition(element)) FROM jsonb_array_elements(value) AS element);
  END IF;
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN value;
  END IF;
  FOR key, child IN SELECT * FROM jsonb_each(value) LOOP
    IF key = 'allowedValues' AND value->>'control' = 'good_poor' THEN
      rewritten := rewritten || jsonb_build_object(key, '["good","not_good","complete_repair","na"]'::jsonb);
    ELSE
      rewritten := rewritten || jsonb_build_object(key, v7_four_state_definition(child));
    END IF;
  END LOOP;
  RETURN rewritten;
END;
$$;

INSERT INTO master_service_report_systems (
  template_version_id, system_key, display_name, sort_order, definition_status, definition
)
SELECT template_version_id, system_key, display_name, sort_order, definition_status,
  v7_four_state_definition(definition)
FROM master_service_report_systems
WHERE template_version_id = '00000000-0000-4000-8000-000000000807'
  AND system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical')
ON CONFLICT (template_version_id, system_key) DO UPDATE
SET definition = EXCLUDED.definition;

DROP FUNCTION v7_four_state_definition(JSONB);
