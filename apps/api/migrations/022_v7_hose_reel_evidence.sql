-- STEP 1.2: Hose Reel is a new V7 system contract. This is additive and may
-- be replayed after restart: the V7 definition is upserted, never deleted.
ALTER TABLE inspection_evidence_reservations
  DROP CONSTRAINT IF EXISTS inspection_evidence_reservations_system_key_check;
ALTER TABLE inspection_evidence_reservations
  ADD CONSTRAINT inspection_evidence_reservations_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel'));

ALTER TABLE staged_inspection_evidence
  DROP CONSTRAINT IF EXISTS staged_inspection_evidence_system_key_check;
ALTER TABLE staged_inspection_evidence
  ADD CONSTRAINT staged_inspection_evidence_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel'));

CREATE OR REPLACE FUNCTION v7_hose_reel_four_state_definition(value JSONB)
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
    RETURN (SELECT jsonb_agg(v7_hose_reel_four_state_definition(element)) FROM jsonb_array_elements(value) AS element);
  END IF;
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN value;
  END IF;
  FOR key, child IN SELECT * FROM jsonb_each(value) LOOP
    IF key = 'allowedValues' AND value->>'control' = 'good_poor' THEN
      rewritten := rewritten || jsonb_build_object(key, '["good","not_good","complete_repair","na"]'::jsonb);
    ELSE
      rewritten := rewritten || jsonb_build_object(key, v7_hose_reel_four_state_definition(child));
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
  v7_hose_reel_four_state_definition(definition) || jsonb_build_object(
    'sections', (
      SELECT jsonb_agg(section_value ORDER BY ordering)
      FROM (
        SELECT CASE WHEN section.value->>'key' = 'hose_reel_drum'
          THEN jsonb_set(v7_hose_reel_four_state_definition(section.value), '{sortOrder}', '4'::jsonb)
          ELSE v7_hose_reel_four_state_definition(section.value)
        END AS section_value, section.ordinality * 2 AS ordering
        FROM jsonb_array_elements(definition->'sections') WITH ORDINALITY AS section(value, ordinality)
        UNION ALL SELECT '{
      "key":"test_run_fire_pump_30_minutes",
      "title":"Test Run Fire Pump 30 Minutes",
      "sortOrder":3,
      "blocks":[{
        "key":"test_run_fire_pump_checks",
        "title":"Test Run Fire Pump 30 Minutes",
        "type":"checklist",
        "sortOrder":1,
        "items":[
          {"key":"trfp_duty_pump","label":"Duty Pump","control":"good_poor","required":false,"sortOrder":1,"allowedValues":["good","not_good","complete_repair","na"],"remarksPolicy":"optional"},
          {"key":"trfp_standby_pump","label":"Standby Pump","control":"good_poor","required":false,"sortOrder":2,"allowedValues":["good","not_good","complete_repair","na"],"remarksPolicy":"optional"}
        ]
      }]
    }'::jsonb, 5
      ) AS expanded_sections
    )
  )
FROM master_service_report_systems
WHERE template_version_id = '00000000-0000-4000-8000-000000000501'
  AND system_key = 'hose_reel'
ON CONFLICT (template_version_id, system_key) DO UPDATE
SET definition = EXCLUDED.definition;

DROP FUNCTION v7_hose_reel_four_state_definition(JSONB);
