-- STEP 1.4: Dry / Wet Riser is a new V7 system contract. This is additive and
-- may be replayed after restart: the V7 definition is upserted, never
-- deleted, and no published version (V1-V6) is touched.
--
-- Source row: template_version_id '00000000-0000-4000-8000-000000000802' (V2),
-- NOT '...501' (V1) as every prior STEP 1.x migration used. V2 replaced V1's
-- Dry/Wet Riser definition for every job created since
-- (masterServiceReportV2.ts: "V1 deliberately remains untouched for
-- historical jobs"), and systemContractCompatibility.ts's
-- legacyContractTemplateVersion.dry_wet_riser is already 2 - V2 is the sole
-- authoritative confirmed contract; V1's copy is dead weight kept only so
-- jobs created before V2 shipped keep resolving.
--
-- V2's Pump House block declares the Jockey/Duty/Standby pressure judgement
-- TWICE: once as a plain good/poor checklist item (jockey_pump_pressure,
-- duty_pump_cut_in, standby_pump_cut_in) and again as the `result` on the
-- separate pump_measurements block's raw-PSI rows (jockey_psi, duty_psi,
-- standby_psi). The deployed V1-V6 response schema
-- (DryWetRiserResponses.measurements) only ever captures raw numbers for the
-- latter and never a result/remarks pair, relying solely on the checklist
-- copy for the pass/fail judgement - this is the "measurement-definition vs
-- deployed-response discrepancy" this step must resolve. V7 resolves it by
-- dropping the three duplicate checklist items and making each measurement
-- row's own values+result+remarks the single source of truth, exactly like
-- Automatic Sprinkler's PSI rows.
ALTER TABLE inspection_evidence_reservations
  DROP CONSTRAINT IF EXISTS inspection_evidence_reservations_system_key_check;
ALTER TABLE inspection_evidence_reservations
  ADD CONSTRAINT inspection_evidence_reservations_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler', 'dry_wet_riser'));

ALTER TABLE staged_inspection_evidence
  DROP CONSTRAINT IF EXISTS staged_inspection_evidence_system_key_check;
ALTER TABLE staged_inspection_evidence
  ADD CONSTRAINT staged_inspection_evidence_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler', 'dry_wet_riser'));

CREATE OR REPLACE FUNCTION v7_dry_wet_riser_four_state_definition(value JSONB)
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
    RETURN (SELECT jsonb_agg(v7_dry_wet_riser_four_state_definition(element)) FROM jsonb_array_elements(value) AS element);
  END IF;
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN value;
  END IF;
  FOR key, child IN SELECT * FROM jsonb_each(value) LOOP
    IF key = 'allowedValues' AND value->>'control' = 'good_poor' THEN
      rewritten := rewritten || jsonb_build_object(key, '["good","not_good","complete_repair","na"]'::jsonb);
    ELSE
      rewritten := rewritten || jsonb_build_object(key, v7_dry_wet_riser_four_state_definition(child));
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
  v7_dry_wet_riser_four_state_definition(definition) || jsonb_build_object(
    'sections', (
      SELECT jsonb_agg(section_value ORDER BY ordering)
      FROM (
        SELECT CASE WHEN section.value->>'key' = 'pump_house'
          THEN jsonb_set(
            v7_dry_wet_riser_four_state_definition(section.value),
            '{blocks}',
            (
              SELECT jsonb_agg(block_value ORDER BY block_ordering)
              FROM (
                SELECT CASE WHEN block.value->>'key' = 'pump_house_checks'
                  THEN jsonb_set(
                    v7_dry_wet_riser_four_state_definition(block.value),
                    '{items}',
                    (
                      SELECT jsonb_agg(item.value ORDER BY item.ordinality)
                      FROM jsonb_array_elements(v7_dry_wet_riser_four_state_definition(block.value)->'items') WITH ORDINALITY AS item(value, ordinality)
                      WHERE item.value->>'key' NOT IN ('jockey_pump_pressure', 'duty_pump_cut_in', 'standby_pump_cut_in')
                    )
                  )
                  ELSE v7_dry_wet_riser_four_state_definition(block.value)
                END AS block_value, block.ordinality AS block_ordering
                FROM jsonb_array_elements(section.value->'blocks') WITH ORDINALITY AS block(value, ordinality)
              ) AS expanded_blocks
            )
          )
          ELSE v7_dry_wet_riser_four_state_definition(section.value)
        END AS section_value, section.ordinality AS ordering
        FROM jsonb_array_elements(definition->'sections') WITH ORDINALITY AS section(value, ordinality)
      ) AS expanded_sections
    )
  )
FROM master_service_report_systems
WHERE template_version_id = '00000000-0000-4000-8000-000000000802'
  AND system_key = 'dry_wet_riser'
ON CONFLICT (template_version_id, system_key) DO UPDATE
SET definition = EXCLUDED.definition;

DROP FUNCTION v7_dry_wet_riser_four_state_definition(JSONB);
