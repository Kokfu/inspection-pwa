import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { closeInspectionJob } from "../jobs/jobCompletion.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const sourceJobId = "00000000-0000-4000-8000-000000000580";
const jobIds = ["f3100000-0000-4000-8000-000000000001", "f3100000-0000-4000-8000-000000000002"];

test("R4 migration replays forward and concurrent completion allocates one immutable per-year number", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).hostname, "127.0.0.1");
  assert.equal(new URL(databaseUrl!).port, "55432");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const user = (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES('r4-assigned-tech','unused','inspector') RETURNING id")).rows[0]!;
    const source = (await pool.query<any>("SELECT * FROM inspection_jobs WHERE id=$1", [sourceJobId])).rows[0];
    assert.ok(source);
    const enabledSystemId = "f3100000-0000-4000-8000-000000000010";
    const snapshot = {
      schemaVersion: 1,
      customer: { id: source.customer_id, code: "R4", displayName: "Frozen R4 Customer", contactPhone: "03-111", contactPerson: "Frozen Contact", fax: "03-222", contractNumber: "C-44", serviceFrequency: "QUARTERLY" },
      site: { id: source.site_id, displayName: "Frozen Site", address: "44 Frozen Road" },
      configuration: { revisionId: source.customer_configuration_revision_id, revisionNumber: 1 },
      template: { id: source.master_template_version_id, code: "MFE-FSSR", name: "Master", version: 7 },
      enabledSystems: [{ enabledSystemId, systemKey: "hose_reel", displayName: "Hose Reel", definitionStatus: "confirmed", sortOrder: 1, zones: [], locations: [] }]
    };
    for (const [index, jobId] of jobIds.entries()) {
      await pool.query(`INSERT INTO inspection_jobs(id,template_id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,site_id,service_date,created_by_user_id)
        VALUES($1,NULL,$2,$3,'Frozen Site','open',false,true,$4,$5,$6,$7,'2026-04-05',$8)`,
      [jobId, source.master_template_version_id, `R4-${index + 1}`, source.customer_id, source.customer_configuration_revision_id, snapshot, source.site_id, user.id]);
      const groupId = `f3100000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`;
      await pool.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'hose_reel',$3)", [groupId, jobId, user.id]);
      await pool.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id)
        VALUES($1,$2,$3,'primary',NULL,NULL,1,$4,$5,1,'{}',1,'{}',$6,'submitted',now(),$7)`,
      [`f3100000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`, groupId,
       `f3100000-0000-4000-8000-${String(300 + index).padStart(12, "0")}`, source.master_template_version_id,
       source.customer_configuration_revision_id, String(index + 1).repeat(64), user.id]);
    }

    const results = await Promise.all(jobIds.map((jobId) => closeInspectionJob(jobId, { id: user.id, username: "r4-assigned-tech" }, pool)));
    assert.ok(results.every((result) => result.kind === "closed" && !result.alreadyCompleted));
    const rows = (await pool.query<{ id: string; reportNumber: string; technicians: string[] }>(`SELECT id, report_number AS "reportNumber", technician_team_snapshot AS technicians FROM inspection_jobs WHERE id=ANY($1::uuid[]) ORDER BY id`, [jobIds])).rows;
    assert.deepEqual(rows.map((row) => row.reportNumber), ["MFE/SR/2026/0001", "MFE/SR/2026/0002"]);
    assert.ok(rows.every((row) => JSON.stringify(row.technicians) === JSON.stringify(["r4-assigned-tech"])));

    const replay = await closeInspectionJob(jobIds[0]!, { id: user.id, username: "changed-name" }, pool);
    assert.equal(replay.kind, "closed");
    assert.equal(replay.kind === "closed" && replay.alreadyCompleted, true);
    const unchanged = (await pool.query<{ reportNumber: string; technicians: string[] }>(`SELECT report_number AS "reportNumber", technician_team_snapshot AS technicians FROM inspection_jobs WHERE id=$1`, [jobIds[0]])).rows[0]!;
    assert.equal(unchanged.reportNumber, "MFE/SR/2026/0001");
    assert.deepEqual(unchanged.technicians, ["r4-assigned-tech"]);

    await runMigrations(pool);
    const afterReplay = await pool.query("SELECT report_number FROM inspection_jobs WHERE id=ANY($1::uuid[]) ORDER BY id", [jobIds]);
    assert.deepEqual(afterReplay.rows.map((row) => row.report_number), ["MFE/SR/2026/0001", "MFE/SR/2026/0002"]);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM report_number_year_counters WHERE report_year=2026 AND last_sequence=2")).rows[0]?.count, 1);
  } finally { await pool.end(); }
});
