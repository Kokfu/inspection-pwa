import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "./migrations.js";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";

// P0-M1 regression cover. The runner replays every migration on each startup.
// Migrations 018 and 021-026 DROP then re-ADD the shared evidence CHECK
// constraints narrowed to the systems known when each was written, and
// `ADD CONSTRAINT ... CHECK` re-validates existing rows. A deployed database
// that has already advanced to 026 and holds an evidence reservation for a
// later system therefore hit `23514` on the *second* `runMigrations`, before
// the widening migration downstream could run - the deployed API crash-loop.
// Every other V7 integration test starts from `DROP SCHEMA public CASCADE` and
// so exercises only the first, fresh run; this file exercises the replay path.

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const sampleJobId = "00000000-0000-4000-8000-000000000410"; // seeded by runMigrations itself
const isolationLockKey = 819276; // shared with the V7 sync integration suite
const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

const allV7SystemKeys = [
  "fire_alarm_detector",
  "co2_fire_extinguisher",
  "wet_chemical",
  "hydrant",
  "hose_reel",
  "automatic_sprinkler",
  "dry_wet_riser",
  "smoke_ventilation",
  "fire_intercom"
] as const;

async function withDisposableDatabase(run: (database: pg.Pool) => Promise<void>) {
  assert.equal(
    new URL(databaseUrl!).port,
    "55432",
    "migration replay test requires the disposable PostgreSQL port"
  );
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query(`SELECT pg_advisory_lock(${isolationLockKey})`);
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await run(database);
  } finally {
    await lock.query(`SELECT pg_advisory_unlock(${isolationLockKey})`).catch(() => undefined);
    lock.release();
    await database.end();
  }
}

async function constraintDef(database: pg.Pool, conname: string): Promise<string> {
  const result = await database.query<{ def: string }>(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1",
    [conname]
  );
  assert.equal(result.rowCount, 1, `${conname} must exist exactly once`);
  return result.rows[0]!.def;
}

async function reserveEvidence(database: pg.Pool, systemKey: string) {
  const template = await database.query<{ id: string }>(
    "SELECT id FROM master_service_report_templates WHERE version = 7"
  );
  assert.equal(template.rowCount, 1, "the V7 master template must be seeded");
  const actor = await database.query<{ id: number }>(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'inspector') RETURNING id",
    [`migration-replay-${randomUUID()}`]
  );
  await database.query(
    `INSERT INTO inspection_evidence_reservations
       (inspection_client_uuid, job_id, system_key, master_template_version_id,
        master_template_version, system_contract_sha256, reserved_by_user_id)
     VALUES ($1, $2, $3, $4, 7, $5, $6)`,
    [
      randomUUID(),
      sampleJobId,
      systemKey,
      template.rows[0]!.id,
      sha256Hex(systemKey),
      actor.rows[0]!.id
    ]
  );
}

test(
  "runMigrations replays forward-only: a deployed database with newer-system evidence reservations restarts cleanly",
  { skip: !databaseUrl },
  async () => {
    await withDisposableDatabase(async (database) => {
      // First startup: the full migration chain on a fresh database.
      await runMigrations(database);

      // A technician reserves evidence for two systems whose forward migrations
      // (021 hydrant, 026 fire_intercom) run AFTER 018. 'fire_intercom' is also
      // newer than every one of 021-025, so replaying any of them re-validates
      // this row against a list that does not contain it.
      await reserveEvidence(database, "hydrant");
      await reserveEvidence(database, "fire_intercom");

      // Second startup on the SAME database. Pre-fix this threw 23514 at
      // migration 018 (`inspection_evidence_reservations_system_key_check`).
      await runMigrations(database);

      const survivors = await database.query<{ system_key: string }>(
        "SELECT system_key FROM inspection_evidence_reservations ORDER BY system_key"
      );
      assert.deepEqual(
        survivors.rows.map((row) => row.system_key),
        ["fire_intercom", "hydrant"],
        "both reservations must survive the replay unchanged"
      );

      // The final constraint must still be the fully widened one, not a
      // re-narrowed intermediate.
      for (const conname of [
        "inspection_evidence_reservations_system_key_check",
        "staged_inspection_evidence_system_key_check"
      ]) {
        const def = await constraintDef(database, conname);
        for (const systemKey of allV7SystemKeys) {
          assert.ok(def.includes(`'${systemKey}'`), `${conname} still permits '${systemKey}' after replay`);
        }
      }

      // And it is genuinely wide, not merely wide in text: a brand-new
      // reservation for another late system is accepted.
      await reserveEvidence(database, "smoke_ventilation");
      const afterInsert = await database.query<{ count: string }>(
        "SELECT count(*) AS count FROM inspection_evidence_reservations"
      );
      assert.equal(afterInsert.rows[0]!.count, "3");

      // Idempotent a third time for good measure.
      await runMigrations(database);
    });
  }
);

test(
  "runMigrations on a fresh database still applies migration 018 in full",
  { skip: !databaseUrl },
  async () => {
    await withDisposableDatabase(async (database) => {
      await runMigrations(database);

      // 018's tables.
      const tables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('inspection_evidence_reservations', 'staged_inspection_evidence')
         ORDER BY table_name`
      );
      assert.deepEqual(
        tables.rows.map((row) => row.table_name),
        ["inspection_evidence_reservations", "staged_inspection_evidence"]
      );

      // 018's version widening (6 -> 6,7) on both tables.
      for (const conname of [
        "inspection_evidence_reservations_master_template_version_check",
        "staged_inspection_evidence_master_template_version_check"
      ]) {
        const def = await constraintDef(database, conname);
        assert.ok(def.includes("6") && def.includes("7"), `${conname} permits both 6 and 7`);
      }

      // 018's two partial unique indexes for accepted V7 evidence scoping.
      const indexes = await database.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'staged_inspection_evidence'
           AND indexname IN (
             'staged_inspection_evidence_v7_accepted_source_per_job_system',
             'staged_inspection_evidence_v7_accepted_stored_per_job_system'
           )
         ORDER BY indexname`
      );
      assert.deepEqual(
        indexes.rows.map((row) => row.indexname),
        [
          "staged_inspection_evidence_v7_accepted_source_per_job_system",
          "staged_inspection_evidence_v7_accepted_stored_per_job_system"
        ],
        "both migration 018 partial unique indexes exist on a fresh install"
      );

      // The later forward migrations still ran on top: the system_key check is
      // fully widened, and Fire Intercom (026) is seeded on V7.
      const systemKeyDef = await constraintDef(
        database,
        "inspection_evidence_reservations_system_key_check"
      );
      for (const systemKey of allV7SystemKeys) {
        assert.ok(systemKeyDef.includes(`'${systemKey}'`), `fresh install permits '${systemKey}'`);
      }
      const fireIntercom = await database.query(
        `SELECT 1 FROM master_service_report_systems system
         INNER JOIN master_service_report_templates template ON template.id = system.template_version_id
         WHERE template.version = 7 AND system.system_key = 'fire_intercom'`
      );
      assert.equal(fireIntercom.rowCount, 1, "Fire Intercom is seeded on V7 after a fresh migrate");
    });
  }
);

test(
  "runMigrations reconciles a one-sided evidence CHECK (reservations widened, staged left narrow) without re-narrowing",
  { skip: !databaseUrl },
  async () => {
    await withDisposableDatabase(async (database) => {
      await runMigrations(database);

      // Simulate a hand-applied stop-gap / half-restored dump: reservations
      // permits every system, staged is back to the three-system list, and a
      // reservation exists for a system (fire_intercom) that migrations 021-025
      // would each reject.
      await database.query(
        `ALTER TABLE staged_inspection_evidence
           DROP CONSTRAINT staged_inspection_evidence_system_key_check;
         ALTER TABLE staged_inspection_evidence
           ADD CONSTRAINT staged_inspection_evidence_system_key_check
           CHECK (system_key IN ('fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical'));`
      );
      await reserveEvidence(database, "fire_intercom");

      // A guard that inspected only the reservations CHECK would skip every
      // migration and leave staged narrow. A guard that re-ran 021-025 to fix
      // staged would re-narrow reservations and raise 23514 on the fire_intercom
      // row. The runner must instead recognise the schema is past 026 and
      // reconcile via 026's nine-system list only.
      await runMigrations(database);

      for (const conname of [
        "inspection_evidence_reservations_system_key_check",
        "staged_inspection_evidence_system_key_check"
      ]) {
        const def = await constraintDef(database, conname);
        for (const systemKey of allV7SystemKeys) {
          assert.ok(def.includes(`'${systemKey}'`), `${conname} lists '${systemKey}' after reconcile`);
        }
      }
      const survivors = await database.query<{ system_key: string }>(
        "SELECT system_key FROM inspection_evidence_reservations ORDER BY system_key"
      );
      assert.deepEqual(survivors.rows.map((row) => row.system_key), ["fire_intercom"]);
    });
  }
);

test(
  "runMigrations rebuilds both evidence CHECKs when both were dropped and a late-system reservation survives",
  { skip: !databaseUrl },
  async () => {
    await withDisposableDatabase(async (database) => {
      await runMigrations(database);

      // Hand surgery / half-restored dump: BOTH system_key CHECKs gone, but the
      // reservation for a system beyond the incremental rollout is still there.
      // The CHECK predicate now sees nothing, so the runner must fall back to
      // the surviving row to know it is past the rollout and reconcile via 026
      // only - re-running 021 here would raise 23514 on the fire_intercom row.
      await database.query(
        `ALTER TABLE inspection_evidence_reservations
           DROP CONSTRAINT inspection_evidence_reservations_system_key_check;
         ALTER TABLE staged_inspection_evidence
           DROP CONSTRAINT staged_inspection_evidence_system_key_check;`
      );
      await reserveEvidence(database, "fire_intercom");

      await runMigrations(database);

      for (const conname of [
        "inspection_evidence_reservations_system_key_check",
        "staged_inspection_evidence_system_key_check"
      ]) {
        const def = await constraintDef(database, conname);
        for (const systemKey of allV7SystemKeys) {
          assert.ok(def.includes(`'${systemKey}'`), `${conname} rebuilt with '${systemKey}'`);
        }
      }
      const survivors = await database.query<{ system_key: string }>(
        "SELECT system_key FROM inspection_evidence_reservations ORDER BY system_key"
      );
      assert.deepEqual(survivors.rows.map((row) => row.system_key), ["fire_intercom"]);
    });
  }
);

// Companion to the CHECK-constraint cases above: the 023/024 legacy-source
// drift. Migrations 021-026 publish the V7 system definitions with
// `INSERT ... SELECT` from the V1/V2 legacy rows and `ON CONFLICT DO UPDATE`,
// and they replay on every startup. A later edit to `masterServiceReportV7.ts`
// with no matching migration leaves the migration-computed `automatic_sprinkler`
// / `dry_wet_riser` definition diverging from the tracked TS source, and the
// seed's strict published-template assertion then crash-loops the API. The seed
// re-homes V7 definition publication (`DO UPDATE`, not `DO NOTHING`), so the
// canonical definition is restored on the next boot.
const downgradeFourStateControls = (value: unknown): unknown => Array.isArray(value)
  ? value.map(downgradeFourStateControls)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      key === "allowedValues" && (value as Record<string, unknown>).control === "good_poor"
        ? ["good", "poor"]
        : downgradeFourStateControls(child)
    ]))
    : value;

test(
  "runMigrations heals a drifted V7 system definition (023/024 legacy-source drift) on replay",
  { skip: !databaseUrl },
  async () => {
    await withDisposableDatabase(async (database) => {
      await runMigrations(database);

      // Simulate the deployed precondition: an earlier TS revision published a
      // two-state `automatic_sprinkler` / `dry_wet_riser` before the four-state
      // model landed, and the migration `INSERT ... SELECT` replay cannot rebuild
      // the current shape from the frozen legacy rows.
      const drifted = ["automatic_sprinkler", "dry_wet_riser"] as const;
      for (const key of drifted) {
        const system = masterServiceReportV7.systems.find((candidate) => candidate.key === key);
        assert.ok(system, `${key} is a tracked V7 system`);
        await database.query(
          `UPDATE master_service_report_systems SET definition = $3::jsonb
           WHERE template_version_id = $1 AND system_key = $2`,
          [masterServiceReportV7.id, key, JSON.stringify(downgradeFourStateControls(system))]
        );
      }

      // Second startup on the SAME database. Pre-fix the seed's
      // `assertPublishedMasterServiceReportTemplate` threw here (the drifted rows
      // survived its `ON CONFLICT DO NOTHING`).
      await runMigrations(database);

      const stored = await database.query<{ system_key: string; definition: unknown }>(
        `SELECT system_key, definition FROM master_service_report_systems
         WHERE template_version_id = $1 AND system_key = ANY($2::text[])
         ORDER BY system_key`,
        [masterServiceReportV7.id, [...drifted]]
      );
      assert.deepEqual(
        stored.rows.map((row) => row.system_key),
        ["automatic_sprinkler", "dry_wet_riser"]
      );
      for (const row of stored.rows) {
        const expected = masterServiceReportV7.systems.find((candidate) => candidate.key === row.system_key);
        assert.deepEqual(
          row.definition,
          JSON.parse(JSON.stringify(expected)),
          `${row.system_key} is healed back to the tracked V7 definition`
        );
      }

      // Idempotent: a third startup on the now-consistent database is a no-op.
      await runMigrations(database);
    });
  }
);

test(
  "runMigrations rolls a part-way rollout forward through the remaining constraint-only migrations",
  { skip: !databaseUrl },
  async () => {
    await withDisposableDatabase(async (database) => {
      await runMigrations(database);

      // Roll BOTH evidence CHECKs back to the seven-system list migration 024
      // left behind: a database last deployed after Dry/Wet Riser (STEP 1.4) but
      // before Smoke Ventilation / Fire Intercom. Migrations 025 and 026 are
      // pure constraint widening (no definition upsert), so the roll-forward
      // does not touch any V7 system definition.
      const listThroughRiser =
        "'fire_alarm_detector', 'co2_fire_extinguisher', 'wet_chemical', 'hydrant', 'hose_reel', 'automatic_sprinkler', 'dry_wet_riser'";
      for (const table of ["inspection_evidence_reservations", "staged_inspection_evidence"]) {
        await database.query(
          `ALTER TABLE ${table} DROP CONSTRAINT ${table}_system_key_check;
           ALTER TABLE ${table} ADD CONSTRAINT ${table}_system_key_check
             CHECK (system_key IN (${listThroughRiser}));`
        );
      }

      await runMigrations(database);

      for (const conname of [
        "inspection_evidence_reservations_system_key_check",
        "staged_inspection_evidence_system_key_check"
      ]) {
        const def = await constraintDef(database, conname);
        for (const systemKey of allV7SystemKeys) {
          assert.ok(def.includes(`'${systemKey}'`), `${conname} rolled forward to '${systemKey}'`);
        }
      }
      await reserveEvidence(database, "smoke_ventilation");
      const count = await database.query<{ count: string }>(
        "SELECT count(*) AS count FROM inspection_evidence_reservations"
      );
      assert.equal(count.rows[0]!.count, "1");
    });
  }
);
