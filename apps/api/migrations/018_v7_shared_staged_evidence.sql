-- V7 extends the accepted staged-evidence model without changing migration 017
-- or any existing V6 Fire Alarm reservation/evidence row.
ALTER TABLE inspection_evidence_reservations
  DROP CONSTRAINT IF EXISTS inspection_evidence_reservations_system_key_check;
ALTER TABLE inspection_evidence_reservations
  ADD CONSTRAINT inspection_evidence_reservations_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical'));

ALTER TABLE staged_inspection_evidence
  DROP CONSTRAINT IF EXISTS staged_inspection_evidence_system_key_check;
ALTER TABLE staged_inspection_evidence
  ADD CONSTRAINT staged_inspection_evidence_system_key_check
  CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical'));

-- V6 and V7 are both legitimate frozen identities. Runtime contract adapters,
-- rather than these storage checks, decide which tuple is authorized.
ALTER TABLE inspection_evidence_reservations
  DROP CONSTRAINT IF EXISTS inspection_evidence_reservations_master_template_version_check;
ALTER TABLE inspection_evidence_reservations
  ADD CONSTRAINT inspection_evidence_reservations_master_template_version_check
  CHECK (master_template_version IN (6, 7));

ALTER TABLE staged_inspection_evidence
  DROP CONSTRAINT IF EXISTS staged_inspection_evidence_master_template_version_check;
ALTER TABLE staged_inspection_evidence
  ADD CONSTRAINT staged_inspection_evidence_master_template_version_check
  CHECK (master_template_version IN (6, 7));

-- A V7 Poor photo is field-specific within one Job/system inspection group.
-- Staging remains reusable until acceptance; only accepted bindings are scoped.
CREATE UNIQUE INDEX IF NOT EXISTS staged_inspection_evidence_v7_accepted_source_per_job_system
  ON staged_inspection_evidence(job_id, system_key, source_sha256)
  WHERE master_template_version=7 AND status='accepted';
CREATE UNIQUE INDEX IF NOT EXISTS staged_inspection_evidence_v7_accepted_stored_per_job_system
  ON staged_inspection_evidence(job_id, system_key, stored_sha256)
  WHERE master_template_version=7 AND status='accepted';
