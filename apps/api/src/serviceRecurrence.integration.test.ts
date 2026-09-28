import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "./db/migrations.js";
import { closeInspectionJob } from "./jobs/jobCompletion.js";

const url = process.env.SEED_INTEGRATION_DATABASE_URL;
test("close advances recurrence once and rollback keeps date and job open", { skip: !url }, async () => {
  const parsed = new URL(url!);
  assert.equal(process.env.NODE_ENV, "test"); assert.equal(parsed.hostname, "127.0.0.1"); assert.equal(parsed.port, "55432");
  assert.equal(parsed.pathname, "/phase6_seed_integration");
  const database = new pg.Pool({ connectionString: url });
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const source = (await database.query<Record<string, unknown>>("SELECT * FROM inspection_jobs WHERE id='00000000-0000-4000-8000-000000000580'")).rows[0]!;
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES('recurrence-tech','x','inspector') RETURNING id::int AS id")).rows[0]!.id;
    const customerId = source.customer_id as string;
    await database.query(`UPDATE customers SET next_service_due_date='2026-09-29',service_recurrence_kind='weekly',service_recurrence_interval=2,service_recurrence_day=2 WHERE id=$1`, [customerId]);
    const oldPlan = (await database.query<{ id: string }>(`INSERT INTO service_due_reminder_plans(customer_id,due_date,created_by_user_id,updated_by_user_id)
      VALUES($1,'2026-09-29',$2,$2) RETURNING id::text AS id`, [customerId, actor])).rows[0]!.id;
    await database.query("INSERT INTO service_due_reminder_recipients(plan_id,extra_name,extra_email) VALUES($1,'Planner','planner@example.test')", [oldPlan]);
    async function makeJob(serviceDate: string) {
      const jobId = randomUUID(), groupId = randomUUID(), instanceId = randomUUID();
      const snapshot = {
        schemaVersion: 1, customer: { id: customerId, code: "R", displayName: "Recurrence" },
        site: { id: source.site_id, displayName: "Site" },
        configuration: { revisionId: source.customer_configuration_revision_id, revisionNumber: 1 },
        template: { id: source.master_template_version_id, code: "MFE-FSSR", name: "Master", version: 7 },
        enabledSystems: [{ enabledSystemId: randomUUID(), systemKey: "hose_reel", displayName: "Hose Reel", definitionStatus: "confirmed", sortOrder: 1, zones: [], locations: [] }]
      };
      await database.query(`INSERT INTO inspection_jobs(id,template_id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,site_id,service_date,created_by_user_id)
        VALUES($1,NULL,$2,$3,'Site','open',false,true,$4,$5,$6,$7,$8::date,$9)`, [jobId, source.master_template_version_id, `REC-${jobId}`, customerId, source.customer_configuration_revision_id, snapshot, source.site_id, serviceDate, actor]);
      await database.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'hose_reel',$3)", [groupId, jobId, actor]);
      await database.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id)
        VALUES($1,$2,$3,'primary',NULL,NULL,1,$4,$5,1,'{}',1,'{}',$6,'submitted',now(),$7)`, [instanceId, groupId, randomUUID(), source.master_template_version_id, source.customer_configuration_revision_id, randomUUID().replaceAll("-", "").repeat(2), actor]);
      return jobId;
    }
    const firstJob = await makeJob("2026-10-01");
    const first = await closeInspectionJob(firstJob, { id: actor, username: "recurrence-tech" }, database);
    assert.equal(first.kind, "closed");
    const due = async () => (await database.query<{ due: string }>("SELECT next_service_due_date::text AS due FROM customers WHERE id=$1", [customerId])).rows[0]!.due;
    assert.equal(await due(), "2026-10-13");
    const replay = await closeInspectionJob(firstJob, { id: actor, username: "recurrence-tech" }, database);
    assert.equal(replay.kind === "closed" && replay.alreadyCompleted, true);
    assert.equal(await due(), "2026-10-13");
    const copied = await database.query("SELECT recipient.extra_email FROM service_due_reminder_recipients recipient JOIN service_due_reminder_plans plan ON plan.id=recipient.plan_id WHERE plan.customer_id=$1 AND plan.due_date='2026-10-13'", [customerId]);
    assert.deepEqual(copied.rows.map((row) => row.extra_email), ["planner@example.test"]);
    const secondJob = await makeJob("2026-10-15");
    await database.query(`CREATE FUNCTION fail_recurrence_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.service_recurrence_last_job_id IS DISTINCT FROM OLD.service_recurrence_last_job_id THEN RAISE EXCEPTION 'forced recurrence failure'; END IF; RETURN NEW; END $$`);
    await database.query("CREATE TRIGGER fail_recurrence BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION fail_recurrence_update()");
    await assert.rejects(() => closeInspectionJob(secondJob, { id: actor, username: "recurrence-tech" }, database), /forced recurrence failure/);
    assert.equal(await due(), "2026-10-13");
    assert.equal((await database.query("SELECT status FROM inspection_jobs WHERE id=$1", [secondJob])).rows[0]!.status, "open");
  } finally { await database.end(); }
});
