import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "./migrations.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const portableJobId = "00000000-0000-4000-8000-000000000759";
const legacyJobId = "f1000000-0000-4000-8000-000000000001";
const openGroupId = "f1000000-0000-4000-8000-000000000002";
const openFormId = "f1000000-0000-4000-8000-000000000003";

/** This uses the same deliberately isolated database as the established Phase 6 integration tests. */
test("PostgreSQL 013 -> 014 preserves legacy completion proof and freezes completed report inputs", {
  skip: !databaseUrl
}, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool, { finalServiceReportMigrationTarget: 13 });
    const user = await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('history-tech','not-used','inspector') RETURNING id"
    );
    const userId = user.rows[0]?.id;
    assert.ok(userId);

    // This is an actual pre-014 completed service visit: it has no display-name snapshot.
    await pool.query(`INSERT INTO inspection_jobs(
      id, template_id, master_template_version_id, job_reference, title, status, is_sample,
      technician_visible, customer_id, customer_configuration_revision_id, configuration_snapshot,
      site_id, service_date, completed_at, completed_by_user_id
    ) SELECT $1, template_id, master_template_version_id, 'LEGACY-014-001', 'Legacy 014 Job', 'closed', false,
      true, customer_id, customer_configuration_revision_id, configuration_snapshot,
      site_id, service_date, '2026-08-19T01:02:03.000Z', $2
      FROM inspection_jobs WHERE id=$3`, [legacyJobId, userId, portableJobId]);

    await runMigrations(pool);
    const legacy = await pool.query<{ display: string; completed_at: string; completed_by_user_id: number }>(
      `SELECT completed_by_display_name AS display,
        to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at,
        completed_by_user_id
       FROM inspection_jobs WHERE id=$1`, [legacyJobId]
    );
    assert.deepEqual(legacy.rows[0], {
      display: `Legacy completion (user ${userId})`,
      completed_at: "2026-08-19T01:02:03.000Z",
      completed_by_user_id: userId
    });
    await pool.query("UPDATE users SET username='renamed-history-tech' WHERE id=$1", [userId]);
    assert.equal((await pool.query<{ display: string }>(
      "SELECT completed_by_display_name AS display FROM inspection_jobs WHERE id=$1", [legacyJobId]
    )).rows[0]?.display, `Legacy completion (user ${userId})`);

    // Existing open work remains writable; after close, report inputs are immutable.
    await pool.query("UPDATE inspection_jobs SET title='Open workflow still allowed' WHERE id=$1", [portableJobId]);
    await pool.query(
      "INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'portable_fire_extinguisher',$3)",
      [openGroupId, portableJobId, userId]
    );
    await pool.query(`INSERT INTO master_system_form_instances(
      id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,
      customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,
      response_payload,request_fingerprint,status,performed_at,synced_by_user_id
    ) SELECT $1,$2,'f1000000-0000-4000-8000-000000000004','primary',1,
      master_template_version_id,customer_configuration_revision_id,1,'{}'::jsonb,1,'{}'::jsonb,
      repeat('a',64),'submitted',now(),$3 FROM inspection_jobs WHERE id=$4`,
      [openFormId, openGroupId, userId, portableJobId]);
    await pool.query(
      "UPDATE inspection_jobs SET status='closed', completed_at=now(), completed_by_user_id=$2, completed_by_display_name='history-tech', report_number='TEST/' || id::text, technician_team_snapshot='[]'::jsonb WHERE id=$1",
      [portableJobId, userId]
    );
    await assert.rejects(
      () => pool.query("UPDATE master_system_inspections SET system_key='portable_fire_extinguisher' WHERE id=$1", [openGroupId]),
      /COMPLETED_JOB_REPORT_HISTORY_IMMUTABLE/
    );
    await assert.rejects(
      () => pool.query("DELETE FROM master_system_inspections WHERE id=$1", [openGroupId]),
      /COMPLETED_JOB_REPORT_HISTORY_IMMUTABLE/
    );
    await assert.rejects(
      () => pool.query("UPDATE master_system_form_instances SET response_payload='{}'::jsonb WHERE id=$1", [openFormId]),
      /COMPLETED_JOB_REPORT_HISTORY_IMMUTABLE/
    );
  } finally {
    await pool.end();
  }
});
