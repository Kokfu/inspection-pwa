import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { pool } from "./pool.js";
import { seedMasterServiceReport } from "./seedMasterServiceReport.js";

const masterServiceReportMigrationUrl = new URL(
  "../../migrations/004_master_service_report_v1.sql",
  import.meta.url
);
const technicianJobNavigationMigrationUrl = new URL(
  "../../migrations/005_technician_job_navigation.sql",
  import.meta.url
);
const masterSystemInspectionMigrationUrl = new URL(
  "../../migrations/006_master_system_inspections.sql",
  import.meta.url
);
const inspectionPhotoEvidenceMigrationUrl = new URL(
  "../../migrations/007_inspection_photo_evidence.sql",
  import.meta.url
);
const customerEnabledSystemConfigurationMigrationUrl = new URL(
  "../../migrations/008_customer_enabled_system_configuration.sql", import.meta.url
);
const jobCompletionMigrationUrl = new URL(
  "../../migrations/009_job_completion.sql", import.meta.url
);
const serviceVisitsMigrationUrl = new URL(
  "../../migrations/010_service_visits.sql", import.meta.url
);
const serviceVisitActorIdempotencyMigrationUrl = new URL(
  "../../migrations/011_service_visit_idempotency_actor_scope.sql", import.meta.url
);
const serviceVisitLegacyIdempotencyMigrationUrl = new URL(
  "../../migrations/012_service_visit_legacy_idempotency.sql", import.meta.url
);
const technicianJobVisibilityMigrationUrl = new URL(
  "../../migrations/013_technician_job_visibility.sql", import.meta.url
);
const finalServiceReportHistoryMigrationUrl = new URL(
  "../../migrations/014_final_service_report_history.sql", import.meta.url
);
const serviceVisitScheduleTimeMigrationUrl = new URL(
  "../../migrations/015_service_visit_schedule_time.sql", import.meta.url
);
const customerCreationIdempotencyMigrationUrl = new URL(
  "../../migrations/016_customer_creation_idempotency.sql", import.meta.url
);
const v6StagedEvidenceMigrationUrl = new URL(
  "../../migrations/017_v6_staged_evidence.sql", import.meta.url
);
const v7SharedStagedEvidenceMigrationUrl = new URL(
  "../../migrations/018_v7_shared_staged_evidence.sql", import.meta.url
);
const v7DetectorStateMultiselectMigrationUrl = new URL(
  "../../migrations/019_v7_detector_state_multiselect.sql", import.meta.url
);
const v7FourStateResultModelMigrationUrl = new URL(
  "../../migrations/020_v7_four_state_result_model.sql", import.meta.url
);
const v7HydrantEvidenceMigrationUrl = new URL(
  "../../migrations/021_v7_hydrant_evidence.sql", import.meta.url
);
const v7HoseReelEvidenceMigrationUrl = new URL(
  "../../migrations/022_v7_hose_reel_evidence.sql", import.meta.url
);
const v7AutomaticSprinklerEvidenceMigrationUrl = new URL(
  "../../migrations/023_v7_automatic_sprinkler_evidence.sql", import.meta.url
);
const v7DryWetRiserEvidenceMigrationUrl = new URL(
  "../../migrations/024_v7_dry_wet_riser_evidence.sql", import.meta.url
);
const v7SmokeVentilationEvidenceMigrationUrl = new URL(
  "../../migrations/025_v7_smoke_ventilation_evidence.sql", import.meta.url
);
const v7FireIntercomEvidenceMigrationUrl = new URL(
  "../../migrations/026_v7_fire_intercom_evidence.sql", import.meta.url
);
const customerLabelOverridesMigrationUrl = new URL(
  "../../migrations/027_customer_label_overrides.sql", import.meta.url
);
const managerSchedulingMigrationUrl = new URL(
  "../../migrations/028_manager_technicians_and_scheduling.sql", import.meta.url
);
const customerContactDetailsMigrationUrl = new URL(
  "../../migrations/029_customer_contact_details.sql", import.meta.url
);
const serviceVisitCoverFieldsMigrationUrl = new URL(
  "../../migrations/030_service_visit_cover_fields.sql", import.meta.url
);
const reportCoverFieldsMigrationUrl = new URL(
  "../../migrations/031_report_cover_fields.sql", import.meta.url
);
const userDisplayNamesMigrationUrl = new URL(
  "../../migrations/032_user_display_names.sql", import.meta.url
);
const v7Fm200EvidenceMigrationUrl = new URL(
  "../../migrations/033_v7_fm200_evidence.sql", import.meta.url
);
const reportNumberRequiredMigrationUrl = new URL(
  "../../migrations/034_report_number_required.sql", import.meta.url
);

export type ServiceVisitMigrationTarget = 10 | 11 | 12 | 15;
export type FinalServiceReportMigrationTarget = 13 | 14;

/**
 * Migrations 018 and 021–026 each DROP then re-ADD the shared evidence
 * `system_key` (and, for 018, `master_template_version`) CHECK constraints,
 * narrowed to the set of systems known when that migration was written.
 * `ALTER TABLE … ADD CONSTRAINT … CHECK` re-validates every existing row, so
 * replaying one of them against a database that a *later* forward migration has
 * already widened — and which now holds an evidence reservation or staged row
 * for a newer system — raises `23514` and aborts startup before the later
 * migration can re-widen (the P0-M1 crash-loop). Each migration file is one
 * implicit transaction (multi-statement simple query, no explicit
 * BEGIN/COMMIT), so the widened constraint definition is a faithful
 * "this migration already applied" marker: replay only when it is absent.
 * A fresh database has none of these markers and still runs every migration in
 * full. Only migration 026 carries the full nine-system list, so it is the only
 * one of 021–026 that is safe to (re-)apply against an already-rolled-out
 * database; 021–025 are gated so they run only while the schema has not yet
 * reached 026 at all.
 *
 * `mode: "both"` (default) is `true` only when BOTH `<table>_system_key_check`
 * constraints exist AND BOTH already list this exact key — the "this migration
 * is fully applied" test. `mode: "either"` is `true` when at least one side
 * lists the key — the "the schema has been through this migration at least
 * once" test, used to recognise an already-rolled-out database whose two CHECKs
 * have since drifted apart (a hand-applied stop-gap, a half-restored dump).
 *
 * The key is matched as a quoted literal via `position(text in text)`, which —
 * unlike `LIKE` — has no `_` / `%` wildcards, so `'hose_reel'` cannot be
 * satisfied by a constraint that merely lists `'hose-reel'`, and a short key
 * cannot match a fragment of a longer token. A missing constraint contributes
 * nothing, so `"both"` yields `false` ("not yet applied") and `"either"` falls
 * back to whichever side still exists.
 */
async function evidenceSystemKeyCheckListsKey(
  database: Pool,
  systemKey: string,
  mode: "both" | "either" = "both"
): Promise<boolean> {
  const result = await database.query<{ satisfied: boolean }>(
    `WITH evidence_checks AS (
       SELECT position('''' || $1 || '''' IN pg_get_constraintdef(pc.oid)) > 0 AS lists_key
       FROM pg_constraint pc
       WHERE pc.conname IN (
               'inspection_evidence_reservations_system_key_check',
               'staged_inspection_evidence_system_key_check'
             )
         AND pc.conrelid IN (
               to_regclass('inspection_evidence_reservations'),
               to_regclass('staged_inspection_evidence')
             )
     )
     SELECT CASE $2
              WHEN 'both'
                THEN (SELECT count(*) FROM evidence_checks) = 2
                     AND NOT EXISTS (SELECT 1 FROM evidence_checks WHERE NOT lists_key)
              ELSE EXISTS (SELECT 1 FROM evidence_checks WHERE lists_key)
            END AS satisfied`,
    [systemKey, mode]
  );
  return result.rows[0]?.satisfied ?? false;
}

/**
 * `true` when a row already exists in either evidence table for a `system_key`
 * that `allowedSystemKeys` does not contain — i.e. a row that at least one of
 * migrations 021–025 would reject with `23514` if replayed. It backs the
 * "schema is past the incremental rollout" decision for the case the CHECK
 * predicate cannot see: BOTH `system_key` CHECKs dropped (hand surgery, a
 * half-restored dump) while a reservation or staged row for a later system
 * survives. `bool_or` over an empty table is NULL, coalesced to `false`.
 */
async function evidenceRowExistsForSystemOutside(
  database: Pool,
  allowedSystemKeys: string[]
): Promise<boolean> {
  const result = await database.query<{ present: boolean }>(
    `SELECT
       COALESCE((SELECT bool_or(system_key <> ALL ($1::text[]))
                   FROM inspection_evidence_reservations), false)
       OR COALESCE((SELECT bool_or(system_key <> ALL ($1::text[]))
                   FROM staged_inspection_evidence), false) AS present`,
    [allowedSystemKeys]
  );
  return result.rows[0]?.present ?? false;
}

export async function runMigrations(
  database: Pool = pool,
  options: {
    serviceVisitMigrationTarget?: ServiceVisitMigrationTarget;
    finalServiceReportMigrationTarget?: FinalServiceReportMigrationTarget;
    /** Test-only: prepare schema/migrations without publishing deterministic fixtures. */
    seed?: boolean;
  } = {}
) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS test_records (
      id BIGSERIAL PRIMARY KEY,
      client_uuid UUID NOT NULL UNIQUE,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await database.query(`
    CREATE INDEX IF NOT EXISTS idx_test_records_created_at
      ON test_records (created_at);
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'inspector')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    );
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      result TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await database.query(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash
      ON user_sessions (token_hash);
  `);

  await database.query(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
      ON user_sessions (user_id);
  `);

  await database.query(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
      ON user_sessions (expires_at);
  `);

  await database.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
      ON audit_events (created_at);
  `);

  await database.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user_id
      ON audit_events (actor_user_id);
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS inspection_templates (
      id UUID PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0), is_sample BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS inspection_template_sections (
      id UUID PRIMARY KEY, template_id UUID NOT NULL REFERENCES inspection_templates(id),
      title TEXT NOT NULL, sort_order INTEGER NOT NULL CHECK (sort_order >= 0)
    );
    CREATE TABLE IF NOT EXISTS inspection_template_items (
      id UUID PRIMARY KEY, section_id UUID NOT NULL REFERENCES inspection_template_sections(id),
      label TEXT NOT NULL, response_type TEXT NOT NULL CHECK (response_type IN ('status', 'number', 'text')),
      required BOOLEAN NOT NULL DEFAULT false, options JSONB NOT NULL DEFAULT '[]'::jsonb,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0)
    );
    CREATE TABLE IF NOT EXISTS inspection_jobs (
      id UUID PRIMARY KEY, template_id UUID NOT NULL REFERENCES inspection_templates(id),
      job_reference TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      is_sample BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS inspections (
      id UUID PRIMARY KEY, client_uuid UUID NOT NULL UNIQUE,
      job_id UUID NOT NULL REFERENCES inspection_jobs(id),
      template_id UUID NOT NULL REFERENCES inspection_templates(id),
      template_version INTEGER NOT NULL CHECK (template_version > 0), template_snapshot JSONB NOT NULL,
      header JSONB NOT NULL, performed_at TIMESTAMPTZ NOT NULL,
      created_by_user_id BIGINT REFERENCES users(id), received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS inspection_responses (
      inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
      template_item_id UUID NOT NULL REFERENCES inspection_template_items(id),
      response_value TEXT NOT NULL, remarks TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      PRIMARY KEY (inspection_id, template_item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_inspections_performed_at ON inspections (performed_at);
    CREATE INDEX IF NOT EXISTS idx_inspections_job_id ON inspections (job_id);
    CREATE INDEX IF NOT EXISTS idx_inspection_template_sections_template_id ON inspection_template_sections (template_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_inspection_template_items_section_id ON inspection_template_items (section_id, sort_order);
  `);

  await database.query(`
    INSERT INTO inspection_templates (id, code, name, version, is_sample)
    VALUES ('00000000-0000-4000-8000-000000000401', 'SAMPLE-INSPECTION-V1', 'Sample Inspection Template', 1, true)
    ON CONFLICT DO NOTHING;
    INSERT INTO inspection_template_sections (id, template_id, title, sort_order)
    VALUES ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'Sample Inspection Section', 1)
    ON CONFLICT DO NOTHING;
    INSERT INTO inspection_template_items (id, section_id, label, response_type, required, options, sort_order)
    VALUES
      ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000402', 'General condition', 'status', true, '["pass", "fail", "not_applicable"]'::jsonb, 1),
      ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000402', 'Sample measurement', 'number', true, '[]'::jsonb, 2),
      ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000402', 'Safety check', 'status', true, '["pass", "fail", "not_applicable"]'::jsonb, 3),
      ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000402', 'Additional observation', 'text', false, '[]'::jsonb, 4)
    ON CONFLICT DO NOTHING;
    INSERT INTO inspection_jobs (id, template_id, job_reference, title, status, is_sample)
    VALUES ('00000000-0000-4000-8000-000000000410', '00000000-0000-4000-8000-000000000401', 'SAMPLE-JOB-001', 'Sample Inspection Job', 'open', true)
    ON CONFLICT DO NOTHING;
  `);

  const masterServiceReportMigrationSql = await readFile(masterServiceReportMigrationUrl, "utf8");
  await database.query(masterServiceReportMigrationSql);
  const technicianJobNavigationMigrationSql = await readFile(technicianJobNavigationMigrationUrl, "utf8");
  await database.query(technicianJobNavigationMigrationSql);
  const masterSystemInspectionMigrationSql = await readFile(masterSystemInspectionMigrationUrl, "utf8");
  await database.query(masterSystemInspectionMigrationSql);
  const inspectionPhotoEvidenceMigrationSql = await readFile(
    inspectionPhotoEvidenceMigrationUrl,
    "utf8"
  );
  await database.query(inspectionPhotoEvidenceMigrationSql);
  // Migration 008 intentionally keeps its named CHECK constraint simple and
  // immutable. PostgreSQL has no `ADD CONSTRAINT IF NOT EXISTS`, so the runner
  // must avoid executing that unchanged migration again on subsequent starts.
  const configurationConstraint = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'customer_enabled_systems_system_configuration_object'
         AND conrelid = 'customer_enabled_systems'::regclass
     ) AS exists`
  );
  if (!configurationConstraint.rows[0]?.exists) {
    await database.query(await readFile(customerEnabledSystemConfigurationMigrationUrl, "utf8"));
  }
  await database.query(await readFile(jobCompletionMigrationUrl, "utf8"));
  await database.query(await readFile(serviceVisitsMigrationUrl, "utf8"));
  const target = options.serviceVisitMigrationTarget ?? 15;
  if (target >= 11) {
    await database.query(await readFile(serviceVisitActorIdempotencyMigrationUrl, "utf8"));
  }
  if (target >= 12) {
    await database.query(await readFile(serviceVisitLegacyIdempotencyMigrationUrl, "utf8"));
  }
  await database.query(await readFile(technicianJobVisibilityMigrationUrl, "utf8"));
  if ((options.finalServiceReportMigrationTarget ?? 14) >= 14) {
    await database.query(await readFile(finalServiceReportHistoryMigrationUrl, "utf8"));
  }
  if (target >= 15) {
    await database.query(await readFile(serviceVisitScheduleTimeMigrationUrl, "utf8"));
  }
  await database.query(await readFile(customerCreationIdempotencyMigrationUrl, "utf8"));
  // Migration 017 predates V7 and temporarily narrows these checks to V6 while
  // it runs. Once migration 018 has widened them to V6+V7, replaying either 017
  // or 018 would re-narrow the shared evidence checks and reject valid rows
  // that migrations 021–026 later depend on — 018's own `ADD CONSTRAINT … CHECK`
  // raises `23514` on any database that already holds a reservation for a
  // system newer than Fire Alarm / CO2 / Wet Chemical. The
  // `master_template_version` check gains `7` only in 018 and only after 018
  // completes, so it is a faithful "schema is already at ≥018" marker for both.
  const hasV7StagedEvidenceConstraint = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'staged_inspection_evidence_master_template_version_check'
         AND conrelid = to_regclass('staged_inspection_evidence')
         AND pg_get_constraintdef(oid) LIKE '%7%'
     ) AS exists`
  );
  if (!hasV7StagedEvidenceConstraint.rows[0]?.exists) {
    await database.query(await readFile(v6StagedEvidenceMigrationUrl, "utf8"));
    await database.query(await readFile(v7SharedStagedEvidenceMigrationUrl, "utf8"));
  }
  await database.query(await readFile(v7DetectorStateMultiselectMigrationUrl, "utf8"));
  await database.query(await readFile(v7FourStateResultModelMigrationUrl, "utf8"));
  // Migrations 021–025 each re-ADD the evidence `system_key` CHECK narrowed to
  // the systems known when they were written. Replaying one on a database that
  // already reached a later system re-validates that system's rows against a
  // list that excludes it → `23514`. So run 021–025 only while the schema has
  // NOT been through migration 026 at all (fresh install, or a rollout that
  // stopped part-way): mid-rollout each still runs once, in order, safely.
  // Two independent signals of "already past the incremental rollout": either
  // `system_key` CHECK still lists `fire_intercom` (normal case), or — for a
  // database where BOTH CHECKs were dropped by hand — an evidence row survives
  // for a system beyond `hydrant` that 021–025 would reject. Either way, only
  // migration 026 (full nine-system list) runs below, and it is safe.
  const rolloutSystemKeys = [
    "fire_alarm_detector",
    "co2_fire_extinguisher",
    "wet_chemical",
    "hydrant"
  ];
  const schemaReachedNewestSystem =
    (await evidenceSystemKeyCheckListsKey(database, "fire_intercom", "either")) ||
    (await evidenceRowExistsForSystemOutside(database, rolloutSystemKeys));
  if (!schemaReachedNewestSystem) {
    if (!(await evidenceSystemKeyCheckListsKey(database, "hydrant"))) {
      await database.query(await readFile(v7HydrantEvidenceMigrationUrl, "utf8"));
    }
    if (!(await evidenceSystemKeyCheckListsKey(database, "hose_reel"))) {
      await database.query(await readFile(v7HoseReelEvidenceMigrationUrl, "utf8"));
    }
    if (!(await evidenceSystemKeyCheckListsKey(database, "automatic_sprinkler"))) {
      await database.query(await readFile(v7AutomaticSprinklerEvidenceMigrationUrl, "utf8"));
    }
    if (!(await evidenceSystemKeyCheckListsKey(database, "dry_wet_riser"))) {
      await database.query(await readFile(v7DryWetRiserEvidenceMigrationUrl, "utf8"));
    }
    if (!(await evidenceSystemKeyCheckListsKey(database, "smoke_ventilation"))) {
      await database.query(await readFile(v7SmokeVentilationEvidenceMigrationUrl, "utf8"));
    }
  }
  // Migration 026 carries the full nine-system list on BOTH evidence tables, so
  // it is safe to apply against any database and is also the reconciliation
  // step: run it on a fresh install, to finish a part-way rollout, or to bring
  // a database whose two evidence CHECKs have drifted apart back into agreement.
  if (!(await evidenceSystemKeyCheckListsKey(database, "fire_intercom"))) {
    await database.query(await readFile(v7FireIntercomEvidenceMigrationUrl, "utf8"));
  }
  // Migration 033 is the FM200 equivalent of migration 026: FM200 has no
  // V1-V6 presence at all, so this widens the two evidence CHECK constraints
  // (the only stateful part) and is safe to (re-)apply against any database,
  // gated the same way on "does the CHECK already list this key".
  if (!(await evidenceSystemKeyCheckListsKey(database, "fm200_fire_suppression"))) {
    await database.query(await readFile(v7Fm200EvidenceMigrationUrl, "utf8"));
  }
  // Migration 027 adds `customer_enabled_systems.label_overrides` (per-customer
  // display-label overrides). Its named CHECK is immutable like migration 008's
  // `system_configuration` object CHECK, and PostgreSQL has no
  // `ADD CONSTRAINT IF NOT EXISTS`, so gate replay on the constraint's presence.
  const labelOverridesConstraint = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'customer_enabled_systems_label_overrides_object'
         AND conrelid = 'customer_enabled_systems'::regclass
     ) AS exists`
  );
  if (!labelOverridesConstraint.rows[0]?.exists) {
    await database.query(await readFile(customerLabelOverridesMigrationUrl, "utf8"));
  }
  // Migration 028 is atomic; its due-date column is the replay marker.
  const managerScheduling = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='customers'::regclass
      AND attname='next_service_due_date' AND NOT attisdropped) AS exists`
  );
  if (!managerScheduling.rows[0]?.exists) {
    await database.query(await readFile(managerSchedulingMigrationUrl, "utf8"));
  }
  // Migration 029 adds `customers.contact_person`; its presence is the replay marker.
  const customerContactDetails = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='customers'::regclass
      AND attname='contact_person' AND NOT attisdropped) AS exists`
  );
  if (!customerContactDetails.rows[0]?.exists) {
    await database.query(await readFile(customerContactDetailsMigrationUrl, "utf8"));
  }
  // Migration 030 adds `inspection_jobs.service_call_number`/`arrival_time`/
  // `departure_time`; presence of the first column is the replay marker.
  const serviceVisitCoverFields = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='inspection_jobs'::regclass
      AND attname='service_call_number' AND NOT attisdropped) AS exists`
  );
  if (!serviceVisitCoverFields.rows[0]?.exists) {
    await database.query(await readFile(serviceVisitCoverFieldsMigrationUrl, "utf8"));
  }
  const reportCoverFields = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='inspection_jobs'::regclass
      AND attname='report_number' AND NOT attisdropped) AS exists`
  );
  if (!reportCoverFields.rows[0]?.exists) {
    await database.query(await readFile(reportCoverFieldsMigrationUrl, "utf8"));
  }
  const userDisplayNames = await database.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='users'::regclass
      AND attname='display_name' AND NOT attisdropped) AS exists`
  );
  if (!userDisplayNames.rows[0]?.exists) {
    await database.query(await readFile(userDisplayNamesMigrationUrl, "utf8"));
  }
  // CREATE OR REPLACE FUNCTION is safe to replay on an upgraded database.
  await database.query(await readFile(reportNumberRequiredMigrationUrl, "utf8"));
  if (options.seed !== false) {
    await seedMasterServiceReport(database);
  }
}
