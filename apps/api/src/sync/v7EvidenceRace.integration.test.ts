import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { isV7AcceptedEvidenceUniqueViolation } from "./co2FormInstanceSync.js";
import { isFireAlarmV7AcceptedEvidenceUniqueViolation } from "./fireAlarmV7Acceptance.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const hash = (char: string) => char.repeat(64);
const systems = ["co2_fire_extinguisher", "wet_chemical", "fire_alarm_detector"] as const;
type SystemKey = typeof systems[number];

test("V7 accepted-evidence indexes make source/stored identity races retryable for CO2, Wet Chemical, and Fire Alarm", { skip: !databaseUrl, timeout: 30_000 }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const isolationLock = await database.connect(); await isolationLock.query("SELECT pg_advisory_lock(819276)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const template = (await database.query<{ id: string }>("SELECT id FROM master_service_report_templates WHERE version=7 LIMIT 1")).rows[0]!;
    const customer = id(), revision = id(), actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`race-${id()}`])).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'V7 race',true)", [customer, `RACE-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    const configuration = { revisionId: revision, revisionNumber: 1 };
    const makeJob = async () => {
      const job = id();
      const enabledSystems = systems.map((systemKey, index) => ({ enabledSystemId: id(), systemKey, displayName: systemKey, sortOrder: index + 1, definitionStatus: "confirmed", zones: [], locations: [] }));
      const snapshot = { schemaVersion: 1, customer: { id: customer, code: `RACE-${customer}`, displayName: "V7 race" }, configuration, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems };
      await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'V7 race','open',false,true,$4,$5,$6,'2026-09-02')", [job, template.id, `RACE-${job}`, customer, revision, snapshot]);
      return job;
    };
    const job = await makeJob(), otherJob = await makeJob();
    const groups = new Map<string, string>();
    const candidate = async (jobId: string, systemKey: SystemKey, sourceSha256: string, storedSha256: string) => {
      const clientUuid = id(), photoUuid = id(), key = `${jobId}:${systemKey}`;
      let groupId = groups.get(key);
      if (!groupId) { groupId = id(); groups.set(key, groupId); await database.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,$3,$4)", [groupId, jobId, systemKey, actor]); }
      const formId = id();
      await database.query("INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) VALUES($1,$2,$3,$4,NULL,NULL,1,$5,$6,2,'{}',2,'{}',$7,'submitted','2026-09-02T00:00:00.000Z',NULL,$8)", [formId, groupId, id(), `race:${clientUuid}`, template.id, revision, hash("f"), actor]);
      await database.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,$3,$4,7,$5,$6)", [clientUuid, jobId, systemKey, template.id, hash("c"), actor]);
      await database.query("INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,$4,'race.field',$5,7,$6,$7,$8,$9,$10,'image/jpeg',1,1,1,1,1,1,$11,'staged')", [photoUuid, clientUuid, jobId, systemKey, template.id, hash("c"), actor, hash("d"), sourceSha256, storedSha256, `race/${photoUuid}.jpg`]);
      return { clientUuid, formId, photoUuid };
    };
    const accept = (client: pg.PoolClient, candidateRow: { clientUuid: string; formId: string }) => client.query("UPDATE staged_inspection_evidence SET status='accepted',form_instance_id=$1,accepted_at=now() WHERE inspection_client_uuid=$2", [candidateRow.formId, candidateRow.clientUuid]);
    const race = async (systemKey: SystemKey, kind: "source" | "stored") => {
      const source = kind === "source" ? hash("a") : hash("b"); const stored = kind === "stored" ? hash("a") : hash("b");
      const first = await candidate(job, systemKey, source, stored);
      const second = await candidate(job, systemKey, kind === "source" ? source : hash("e"), kind === "stored" ? stored : hash("f"));
      const left = await database.connect(), right = await database.connect();
      try {
        await left.query("BEGIN"); await right.query("BEGIN");
        const prebind = "SELECT count(*)::int AS count FROM staged_inspection_evidence WHERE job_id=$1 AND system_key=$2 AND master_template_version=7 AND status='accepted' AND (source_sha256=$3 OR stored_sha256=$4)";
        assert.equal((await left.query<{ count: number }>(prebind, [job, systemKey, source, stored])).rows[0]!.count, 0);
        assert.equal((await right.query<{ count: number }>(prebind, [job, systemKey, source, stored])).rows[0]!.count, 0);
        const leftUpdate = accept(left, first).then(() => ({ kind: "accepted" as const }), (error) => ({ kind: "rejected" as const, error }));
        const rightUpdate = accept(right, second).then(() => ({ kind: "accepted" as const }), (error) => ({ kind: "rejected" as const, error }));
        const winner = await Promise.race([
          leftUpdate.then((outcome) => ({ client: left, outcome })),
          rightUpdate.then((outcome) => ({ client: right, outcome })),
        ]);
        assert.equal(winner.outcome.kind, "accepted", `${systemKey} ${kind} one concurrent bind succeeds`);
        await winner.client.query("COMMIT");
        const loser = winner.client === left ? await rightUpdate : await leftUpdate;
        assert.equal(loser.kind, "rejected", `${systemKey} ${kind} other concurrent bind is rejected`);
        const pgError = (loser as { error: { code?: string; constraint?: string } }).error;
        assert.ok(pgError.code === "23505" && (isV7AcceptedEvidenceUniqueViolation(pgError) || isFireAlarmV7AcceptedEvidenceUniqueViolation(pgError)), `${systemKey} ${kind} loser is a retryable accepted-evidence uniqueness conflict`);
        await (winner.client === left ? right : left).query("ROLLBACK");
      } finally { left.release(); right.release(); }
      const accepted = await database.query<{ count: string }>("SELECT count(*)::text FROM staged_inspection_evidence WHERE inspection_client_uuid=ANY($1::uuid[]) AND status='accepted'", [[first.clientUuid, second.clientUuid]]);
      assert.equal(accepted.rows[0]!.count, "1", `${systemKey} ${kind} race binds exactly one row`);
    };
    for (const systemKey of systems) { await race(systemKey, "source"); await race(systemKey, "stored"); }
    for (const systemKey of systems) {
      const allowed = await candidate(otherJob, systemKey, hash("9"), hash("8"));
      await database.query("UPDATE staged_inspection_evidence SET status='accepted',form_instance_id=$1,accepted_at=now() WHERE inspection_client_uuid=$2", [allowed.formId, allowed.clientUuid]);
      assert.equal((await database.query("SELECT 1 FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 AND status='accepted'", [allowed.clientUuid])).rowCount, 1, `${systemKey} permits identical evidence in another Job`);
    }
  } finally { await isolationLock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); isolationLock.release(); await database.end(); }
});
