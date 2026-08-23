import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "./migrations.js";
import { seedMasterServiceReport } from "./seedMasterServiceReport.js";
import { listTechnicianInspectionJobs } from "../routes/inspectionJobs.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const portableJobId = "00000000-0000-4000-8000-000000000759";
const co2JobId = "00000000-0000-4000-8000-000000000679";
const co2V1JobId = "00000000-0000-4000-8000-000000000649";
const historyId = "90000000-0000-4000-8000-000000000001";
const completedAt = "2026-08-13T01:02:03.456Z";
const realCompletedAt = "2026-08-18T01:02:03.456Z";
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

    const fresh = await pool.query<{ status: string; technician_visible: boolean }>(
      "SELECT status, technician_visible FROM inspection_jobs WHERE id = $1",
      [portableJobId]
    );
    assert.equal(fresh.rowCount, 1, "fresh startup seed creates Portable demo job");
    assert.equal(fresh.rows[0]?.status, "open");
    assert.equal(fresh.rows[0]?.technician_visible, false, "seeded regression fixture is not technician-visible");

    assert.deepEqual(await listTechnicianInspectionJobs(pool), [], "normal technician listing excludes deterministic seed fixtures");

    const operationalCustomers = await pool.query<{ customer_code: string; display_name: string; is_active: boolean }>(
      "SELECT customer_code, display_name, is_active FROM customers WHERE customer_code IN ('MAK-SITI-PRODUCTS','HOKUDEN-MALAYSIA','DEMO-SINGLE-ZONE','DEMO-MULTI-ZONE') ORDER BY customer_code"
    );
    assert.deepEqual(operationalCustomers.rows, [
      { customer_code: "DEMO-MULTI-ZONE", display_name: "Demo Multi-Zone Client", is_active: false },
      { customer_code: "DEMO-SINGLE-ZONE", display_name: "Demo Single-Zone Client", is_active: false },
      { customer_code: "HOKUDEN-MALAYSIA", display_name: "Hokuden (Malaysia) Sdn Bhd", is_active: true },
      { customer_code: "MAK-SITI-PRODUCTS", display_name: "Mak Siti Products (M) Sdn Bhd", is_active: true }
    ], "operational master data is seeded while the two named general fixtures stay inactive");
    const hokuden = await pool.query<{ system_key: string; zone_count: string }>(`
      SELECT enabled.system_key, count(zone.id)::text AS zone_count
      FROM customer_enabled_systems enabled
      INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
      LEFT JOIN customer_system_zones zone ON zone.enabled_system_id = enabled.id
      WHERE revision.customer_id = '00000000-0000-4000-8000-000000000840'
      GROUP BY enabled.system_key ORDER BY enabled.system_key`);
    assert.deepEqual(hokuden.rows, [
      { system_key: "automatic_sprinkler", zone_count: "0" }, { system_key: "fire_alarm_detector", zone_count: "0" },
      { system_key: "hose_reel", zone_count: "0" }, { system_key: "hydrant", zone_count: "0" }
    ], "Hokuden activates only usable services and does not assign supplied zones to an unsupported system owner");

    await seedMasterServiceReport(pool);
    const untouched = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE id = $1",
      [portableJobId]
    );
    assert.equal(untouched.rows[0]?.count, "1", "untouched rerun is idempotent");
    assert.equal((await pool.query<{ technician_visible: boolean }>(
      "SELECT technician_visible FROM inspection_jobs WHERE id = $1", [portableJobId]
    )).rows[0]?.technician_visible, false, "seed rerun does not re-expose hidden fixtures");

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

    await pool.query("UPDATE inspection_jobs SET title = 'immutable job drift' WHERE id = $1", [co2JobId]);
    await assert.rejects(
      () => seedMasterServiceReport(pool),
      /Existing CO2 demo job differs from the deterministic seed/
    );
    await pool.query("UPDATE inspection_jobs SET title = 'Demo CO2 Multi-Zone Job' WHERE id = $1", [co2JobId]);
    await seedMasterServiceReport(pool);

    const user = await pool.query<{ id: number }>(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'inspector') RETURNING id",
      ["seed-integration-inspector", "not-used-by-test"]
    );
    const userId = user.rows[0]?.id;
    assert.ok(userId);

    await pool.query(`
      INSERT INTO inspection_jobs (
        id, template_id, master_template_version_id, job_reference, title, status,
        is_sample, technician_visible, customer_id, customer_configuration_revision_id,
        configuration_snapshot, completed_at, completed_by_user_id, completed_by_display_name
      )
      SELECT $1, template_id, master_template_version_id, 'DEMO-JOB-CO2-V1-001',
        'Demo CO2 V1 Regression Job', 'closed', true, true, customer_id,
        customer_configuration_revision_id, configuration_snapshot, $2::timestamptz, $3, 'seed-integration-inspector'
      FROM inspection_jobs WHERE id = $4`,
      [co2V1JobId, completedAt, userId, co2JobId]
    );
    await seedMasterServiceReport(pool);
    const completeFixtureSet = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE id = ANY($1::uuid[]) AND technician_visible = false",
      [["00000000-0000-4000-8000-000000000580", "00000000-0000-4000-8000-000000000590", co2V1JobId,
        co2JobId, "00000000-0000-4000-8000-000000000709", "00000000-0000-4000-8000-000000000729",
        "00000000-0000-4000-8000-000000000739", "00000000-0000-4000-8000-000000000749",
        portableJobId, "00000000-0000-4000-8000-000000000819"]]
    );
    assert.equal(completeFixtureSet.rows[0]?.count, "10", "the complete deterministic regression fixture set is hidden");

    const serviceVisitClient = await pool.connect();
    let realServiceVisit;
    try {
      realServiceVisit = await createServiceVisit(serviceVisitClient, {
        requestId: "91000000-0000-4000-8000-000000000001",
        customerId: "00000000-0000-4000-8000-000000000750",
        siteId: portableSiteId,
        serviceDate: "2026-08-18",
        systemKeys: ["portable_fire_extinguisher"]
      }, userId);
    } finally {
      serviceVisitClient.release();
    }
    assert.equal(realServiceVisit.idempotent, false);
    assert.ok((await listTechnicianInspectionJobs(pool)).some((job) => job.id === realServiceVisit.id),
      "normal technician listing retains a real Phase 6B service visit");

    await pool.query(
      "UPDATE inspection_jobs SET status = 'closed', completed_at = $2, completed_by_user_id = $3, completed_by_display_name = $4 WHERE id = $1",
      [realServiceVisit.id, realCompletedAt, userId, "seed-integration-inspector"]
    );
    assert.ok((await listTechnicianInspectionJobs(pool)).some((job) => job.id === realServiceVisit.id && job.status === "closed"),
      "normal technician listing retains a completed real Phase 6B service visit");

    await pool.query("UPDATE inspection_jobs SET technician_visible = true WHERE id IN ($1, $2, $3)", [portableJobId, co2JobId, co2V1JobId]);
    await seedMasterServiceReport(pool);
    const directReseedVisibility = await pool.query<{ id: string; technician_visible: boolean }>(
      "SELECT id, technician_visible FROM inspection_jobs WHERE id IN ($1, $2, $3) ORDER BY id",
      [portableJobId, co2JobId, co2V1JobId]
    );
    assert.deepEqual(directReseedVisibility.rows, [
      { id: co2V1JobId, technician_visible: false },
      { id: co2JobId, technician_visible: false },
      { id: portableJobId, technician_visible: false }
    ], "direct seed repairs deterministic visibility drift without rerunning migrations");
    assert.deepEqual((await pool.query<{ status: string; completed_at_matches: boolean }>(
      "SELECT status, completed_at = $2::timestamptz AS completed_at_matches FROM inspection_jobs WHERE id = $1",
      [co2V1JobId, completedAt]
    )).rows[0], { status: "closed", completed_at_matches: true },
    "CO2 V1 visibility convergence preserves its historical completed state");
    assert.ok((await listTechnicianInspectionJobs(pool)).some((job) => job.id === realServiceVisit.id && job.status === "closed"),
      "direct seed leaves completed real service visits visible");

    await pool.query(
      "INSERT INTO master_system_inspections (id, job_id, system_key, created_by_user_id) VALUES ($1, $2, $3, $4)",
      [historyId, portableJobId, "portable_fire_extinguisher", userId]
    );
    await pool.query(
      "UPDATE inspection_jobs SET status = 'closed', completed_at = $2, completed_by_user_id = $3, completed_by_display_name = $4 WHERE id = $1",
      [portableJobId, completedAt, userId, "seed-integration-inspector"]
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
    assert.ok((await listTechnicianInspectionJobs(pool)).some((job) => job.id === realServiceVisit.id),
      "seed rerun preserves and continues listing real service visits");

    await pool.query("UPDATE inspection_jobs SET technician_visible = true WHERE id = $1", [portableJobId]);
    await runMigrations(pool);
    const restartState = await pool.query<{
      status: string; technician_visible: boolean; completed_at_matches: boolean; completed_by_user_id: number;
    }>(`SELECT status, technician_visible, completed_at = $2::timestamptz AS completed_at_matches, completed_by_user_id
        FROM inspection_jobs WHERE id = $1`, [portableJobId, completedAt]);
    assert.deepEqual(restartState.rows[0], {
      status: "closed", technician_visible: false, completed_at_matches: true, completed_by_user_id: userId
    }, "restart migration re-hides only the deterministic fixture without altering completed history");
    assert.ok((await listTechnicianInspectionJobs(pool)).some((job) => job.id === realServiceVisit.id),
      "restart migration keeps real service visits visible");
  } finally {
    await pool.end();
  }
});
