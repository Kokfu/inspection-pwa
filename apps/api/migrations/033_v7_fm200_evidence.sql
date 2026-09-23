-- FM200 is a brand-new V7 system contract with no V1-V6 presence at all
-- (mirroring migration 026 for Fire Intercom, and unlike every STEP 1.x
-- migration, which upgraded an already-seeded legacy row in place). There is
-- therefore no existing `master_service_report_systems` row to rewrite here -
-- the row itself is inserted by `seedMasterServiceReport.ts`'s ordinary
-- `INSERT ... ON CONFLICT (template_version_id, system_key) DO UPDATE` loop
-- over `masterServiceReportV7.systems`, which runs after migrations and
-- naturally picks up the new system key. This migration only has to widen the
-- two evidence CHECK constraints ahead of that insert so it is not rejected on
-- an already-deployed database. Migrations 017 and 018 are frozen and are
-- never edited; this is a forward migration only.
ALTER TABLE inspection_evidence_reservations
  DROP CONSTRAINT IF EXISTS inspection_evidence_reservations_system_key_check;
ALTER TABLE inspection_evidence_reservations
  ADD CONSTRAINT inspection_evidence_reservations_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler', 'dry_wet_riser', 'smoke_ventilation', 'fire_intercom', 'fm200_fire_suppression'));

ALTER TABLE staged_inspection_evidence
  DROP CONSTRAINT IF EXISTS staged_inspection_evidence_system_key_check;
ALTER TABLE staged_inspection_evidence
  ADD CONSTRAINT staged_inspection_evidence_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler', 'dry_wet_riser', 'smoke_ventilation', 'fire_intercom', 'fm200_fire_suppression'));
