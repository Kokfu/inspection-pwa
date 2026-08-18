import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "./migrations.js";
import { seedMasterServiceReport } from "./seedMasterServiceReport.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const portableJobId = "00000000-0000-4000-8000-000000000759";
const historyId = "90000000-0000-4000-8000-000000000001";
const completedAt = "2026-08-13T01:02:03.456Z";
const portableSiteId = "00000000-0000-4000-8000-000000000755";

test("production seed preserves completed demo runtime state and rejects immutable drift", {
  skip: !databaseUrl
}, async () => {
  assert.equal(
    new URL(databaseUrl!).pathname,
    "/phase6_seed_integration",
    "seed integration test only permits its dedicated database"
  );
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);

    const fresh = await pool.query<{ status: string }>(
      "SELECT status FROM inspection_jobs WHERE id = $1",
      [portableJobId]
    );
    assert.equal(fresh.rowCount, 1, "fresh startup seed creates Portable demo job");
    assert.equal(fresh.rows[0]?.status, "open");

    await seedMasterServiceReport(pool);
    const untouched = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE id = $1",
      [portableJobId]
    );
    assert.equal(untouched.rows[0]?.count, "1", "untouched rerun is idempotent");

    const seededSite = await pool.query<{ customer_id: string; site_code: string; display_name: string; is_active: boolean }>(
      "SELECT customer_id, site_code, display_name, is_active FROM customer_sites WHERE id = $1",
      [portableSiteId]
    );
    assert.deepEqual(seededSite.rows[0], {
      customer_id: "00000000-0000-4000-8000-000000000750",
      site_code: "PRIMARY",
      display_name: "Primary Service Site",
      is_active: true
    }, "fresh startup creates deterministic Site master data");
    await pool.query("UPDATE customer_sites SET display_name = 'drifted site' WHERE id = $1", [portableSiteId]);
    await assert.rejects(
      () => seedMasterServiceReport(pool),
      /Demo site 00000000-0000-4000-8000-000000000755 differs from the deterministic seed/
    );
    await pool.query("UPDATE customer_sites SET display_name = 'Primary Service Site' WHERE id = $1", [portableSiteId]);
    await seedMasterServiceReport(pool);

    const user = await pool.query<{ id: number }>(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'inspector') RETURNING id",
      ["seed-integration-inspector", "not-used-by-test"]
    );
    const userId = user.rows[0]?.id;
    assert.ok(userId);
    await pool.query(
      "INSERT INTO master_system_inspections (id, job_id, system_key, created_by_user_id) VALUES ($1, $2, $3, $4)",
      [historyId, portableJobId, "portable_fire_extinguisher", userId]
    );
    await pool.query(
      "UPDATE inspection_jobs SET status = 'closed', completed_at = $2, completed_by_user_id = $3 WHERE id = $1",
      [portableJobId, completedAt, userId]
    );

    await seedMasterServiceReport(pool);
    const completed = await pool.query<{
      status: string;
      completed_at_matches: boolean;
      completed_by_user_id: number;
      history_count: string;
    }>(
      `SELECT job.status, job.completed_at = $2::timestamptz AS completed_at_matches, job.completed_by_user_id,
              (SELECT count(*)::text FROM master_system_inspections WHERE job_id = job.id) AS history_count
         FROM inspection_jobs job WHERE job.id = $1`,
      [portableJobId, completedAt]
    );
    assert.deepEqual(completed.rows[0], {
      status: "closed",
      completed_at_matches: true,
      completed_by_user_id: userId,
      history_count: "1"
    });

    await assert.rejects(
      () => pool.query("UPDATE inspection_jobs SET title = 'immutable drift' WHERE id = $1", [portableJobId]),
      /Completed inspection jobs are immutable historical service data/
    );
    await seedMasterServiceReport(pool);
  } finally {
    await pool.end();
  }
});
