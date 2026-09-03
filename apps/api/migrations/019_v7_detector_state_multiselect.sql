-- Upgrade only the three V7 detector-state definitions published before the
-- Normal/Test/Isolation multi-select contract existed. V1-V6 definitions are
-- frozen historical contracts and must remain untouched.
UPDATE master_service_report_systems AS system
SET definition = jsonb_set(
  system.definition,
  '{sections}',
  (
    SELECT jsonb_agg(
      section.value || jsonb_build_object(
        'blocks',
        (
          SELECT jsonb_agg(
            block.value || CASE
              WHEN block.value->>'type' = 'repeatable_table' THEN jsonb_build_object(
                'columns',
                (
                  SELECT jsonb_agg(
                    CASE
                      WHEN column_definition.value->>'control' = 'normal_test_isolation'
                        THEN jsonb_set(
                          column_definition.value,
                          '{control}',
                          '"normal_test_isolation_multi"'::jsonb
                        )
                      ELSE column_definition.value
                    END
                    ORDER BY column_definition.ordinality
                  )
                  FROM jsonb_array_elements(block.value->'columns') WITH ORDINALITY
                    AS column_definition(value, ordinality)
                )
              )
              ELSE '{}'::jsonb
            END
            ORDER BY block.ordinality
          )
          FROM jsonb_array_elements(section.value->'blocks') WITH ORDINALITY
            AS block(value, ordinality)
        )
      )
      ORDER BY section.ordinality
    )
    FROM jsonb_array_elements(system.definition->'sections') WITH ORDINALITY
      AS section(value, ordinality)
  )
)
WHERE system.template_version_id = '00000000-0000-4000-8000-000000000807'
  AND system.system_key IN (
    'fire_alarm_detector',
    'co2_fire_extinguisher',
    'wet_chemical'
  );
