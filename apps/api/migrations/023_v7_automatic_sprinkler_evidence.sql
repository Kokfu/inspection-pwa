-- STEP 1.3: Automatic Sprinkler is a new V7 system contract. This is additive
-- and may be replayed after restart: the V7 definition is upserted, never
-- deleted, and no published version (V1-V6) is touched.
ALTER TABLE inspection_evidence_reservations
  DROP CONSTRAINT IF EXISTS inspection_evidence_reservations_system_key_check;
ALTER TABLE inspection_evidence_reservations
  ADD CONSTRAINT inspection_evidence_reservations_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler'));

ALTER TABLE staged_inspection_evidence
  DROP CONSTRAINT IF EXISTS staged_inspection_evidence_system_key_check;
ALTER TABLE staged_inspection_evidence
  ADD CONSTRAINT staged_inspection_evidence_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler'));

CREATE OR REPLACE FUNCTION v7_automatic_sprinkler_four_state_definition(value JSONB)
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
    RETURN (SELECT jsonb_agg(v7_automatic_sprinkler_four_state_definition(element)) FROM jsonb_array_elements(value) AS element);
  END IF;
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN value;
  END IF;
  FOR key, child IN SELECT * FROM jsonb_each(value) LOOP
    IF key = 'allowedValues' AND value->>'control' = 'good_poor' THEN
      rewritten := rewritten || jsonb_build_object(key, '["good","not_good","complete_repair","na"]'::jsonb);
    ELSE
      rewritten := rewritten || jsonb_build_object(key, v7_automatic_sprinkler_four_state_definition(child));
    END IF;
  END LOOP;
  RETURN rewritten;
END;
$$;

-- The Comments block lives inside the Main Alarm Valve section on this form, so
-- TEST RUN FIRE PUMP 30 MINUTES is appended to that section immediately before
-- Comments, which is where the paper form (Revision B) places it. It has three
-- rows here; Hose Reel's equivalent block has two.
INSERT INTO master_service_report_systems (
  template_version_id, system_key, display_name, sort_order, definition_status, definition
)
SELECT
  '00000000-0000-4000-8000-000000000807', system_key, display_name, sort_order, definition_status,
  v7_automatic_sprinkler_four_state_definition(definition) || jsonb_build_object(
    'sections', (
      SELECT jsonb_agg(section_value ORDER BY ordering)
      FROM (
        SELECT CASE WHEN section.value->>'key' = 'main_alarm_valve'
          THEN jsonb_set(
            v7_automatic_sprinkler_four_state_definition(section.value),
            '{blocks}',
            (
              SELECT jsonb_agg(block_value ORDER BY block_ordering)
              FROM (
                SELECT v7_automatic_sprinkler_four_state_definition(block.value) AS block_value,
                       block.ordinality AS block_ordering
                FROM jsonb_array_elements(section.value->'blocks') WITH ORDINALITY AS block(value, ordinality)
                WHERE block.value->>'type' <> 'comments'
                UNION ALL SELECT '{
      "key":"test_run_fire_pump_checks",
      "title":"Test Run Fire Pump 30 Minutes",
      "type":"checklist",
      "sortOrder":3,
      "items":[
        {"key":"trfp_jockey_pump","label":"Jockey Pump","control":"good_poor","required":false,"sortOrder":1,"allowedValues":["good","not_good","complete_repair","na"],"remarksPolicy":"optional"},
        {"key":"trfp_duty_pump","label":"Duty Pump","control":"good_poor","required":false,"sortOrder":2,"allowedValues":["good","not_good","complete_repair","na"],"remarksPolicy":"optional"},
        {"key":"trfp_standby_pump","label":"Standby Pump","control":"good_poor","required":false,"sortOrder":3,"allowedValues":["good","not_good","complete_repair","na"],"remarksPolicy":"optional"}
      ]
    }'::jsonb, 1000
                UNION ALL SELECT jsonb_set(v7_automatic_sprinkler_four_state_definition(block.value), '{sortOrder}', '4'::jsonb), 1001
                FROM jsonb_array_elements(section.value->'blocks') AS block(value)
                WHERE block.value->>'type' = 'comments'
              ) AS expanded_blocks
            )
          )
          ELSE v7_automatic_sprinkler_four_state_definition(section.value)
        END AS section_value, section.ordinality AS ordering
        FROM jsonb_array_elements(definition->'sections') WITH ORDINALITY AS section(value, ordinality)
      ) AS expanded_sections
    )
  )
FROM master_service_report_systems
WHERE template_version_id = '00000000-0000-4000-8000-000000000501'
  AND system_key = 'automatic_sprinkler'
ON CONFLICT (template_version_id, system_key) DO UPDATE
SET definition = EXCLUDED.definition;

DROP FUNCTION v7_automatic_sprinkler_four_state_definition(JSONB);
