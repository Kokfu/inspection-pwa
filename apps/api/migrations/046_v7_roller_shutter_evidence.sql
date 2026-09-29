-- Widen the shared V7 evidence key checks for the new Roller Shutter system.
-- Existing migration files and accepted rows are unchanged.
ALTER TABLE inspection_evidence_reservations
  DROP CONSTRAINT IF EXISTS inspection_evidence_reservations_system_key_check;
ALTER TABLE inspection_evidence_reservations
  ADD CONSTRAINT inspection_evidence_reservations_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler', 'dry_wet_riser', 'smoke_ventilation', 'fire_intercom', 'fm200_fire_suppression', 'fire_rated_roller_shutter'));

ALTER TABLE staged_inspection_evidence
  DROP CONSTRAINT IF EXISTS staged_inspection_evidence_system_key_check;
ALTER TABLE staged_inspection_evidence
  ADD CONSTRAINT staged_inspection_evidence_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler', 'dry_wet_riser', 'smoke_ventilation', 'fire_intercom', 'fm200_fire_suppression', 'fire_rated_roller_shutter'));
