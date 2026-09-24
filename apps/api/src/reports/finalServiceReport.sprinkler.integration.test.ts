import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../db/migrations.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { automaticSprinklerPsiEvidencePolicyV1 } from "../inspections/evidence/automaticSprinklerPsiEvidencePolicyV1.js";
import { FinalReportError, loadFinalServiceReport, renderFinalServiceReportPdf } from "./finalServiceReport.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const photoSeedJobId = "00000000-0000-4000-8000-000000000729";
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`
    : JSON.stringify(value);
const sha = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

function sprinklerResponse(controls: ReturnType<typeof resolveAutomaticSprinklerControls>) {
  const checklist = (items: typeof controls.checklist.waterTank) => Object.fromEntries(items.map((item) => [item.key, { result: item.result.options[0]!.value, remarks: "" }]));
  return {
    schemaVersion: 1, waterTank: checklist(controls.checklist.waterTank), pumpHouse: checklist(controls.checklist.pumpHouse),
    measurements: Object.fromEntries(controls.measurements.map((item) => [item.key, {
      values: Object.fromEntries(item.values.map((value) => [value.key, 1])), unit: item.values[0]!.unit,
      result: item.result.options[0]!.value, remarks: ""
    }])), mainAlarmValve: checklist(controls.checklist.mainAlarmValve), comments: "Accepted sprinkler evidence report"
  };
}

test("PostgreSQL final report validates frozen Automatic Sprinkler evidence and payloads", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration");
  const uploadsPath = path.join(tmpdir(), `phase7-sprinkler-${randomUUID()}`);
  process.env.UPLOADS_PATH = uploadsPath;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES('sprinkler-report-tech','not-used','inspector') RETURNING id")).rows[0]!.id;
    const policyId = randomUUID();
    const policyDefinition = { ...automaticSprinklerPsiEvidencePolicyV1, points: {
      ...automaticSprinklerPsiEvidencePolicyV1.points,
      "measurements.jockey_pump_pressure.cut_in": { allowed: true, required: true, maxCount: 1 }
    } };
    const policyHash = sha(policyDefinition);
    await pool.query(`INSERT INTO inspection_evidence_policies(id,code,version,schema_version,system_key,definition,definition_sha256,publication_status)
      VALUES($1,'phase7-required-sprinkler-evidence',1,1,'automatic_sprinkler',$2,$3,'published')`, [policyId, policyDefinition, policyHash]);
    const seed = (await pool.query<any>("SELECT * FROM inspection_jobs WHERE id=$1", [photoSeedJobId])).rows[0];
    assert.ok(seed);
    const site = (await pool.query<{ id: string; display_name: string }>("SELECT id,display_name FROM customer_sites WHERE customer_id=$1 AND is_active=true ORDER BY site_code LIMIT 1", [seed.customer_id])).rows[0];
    assert.ok(site, "seed customer needs an active Phase-6B site");

    let sequence = 0;
    const createCompleted = async (options: { evidence: "valid" | "missing" | "corrupt" | "wrong_form"; malformed?: boolean }) => {
      sequence += 1;
      const jobId = randomUUID(), groupId = randomUUID(), formId = randomUUID(), clientUuid = randomUUID();
      const snapshot = structuredClone(seed.configuration_snapshot) as Record<string, any>;
      snapshot.site = { id: site!.id, displayName: site!.display_name };
      const system = snapshot.enabledSystems.find((item: any) => item.systemKey === "automatic_sprinkler");
      assert.ok(system);
      system.evidencePolicy = { id: policyId, code: "phase7-required-sprinkler-evidence", version: 1, schemaVersion: 1, definition: policyDefinition, definitionSha256: policyHash };
      const reference = `SV-20260820-${9100 + sequence}`;
      await pool.query(`INSERT INTO inspection_jobs(id,template_id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,site_id,service_date)
        VALUES($1,$2,$3,$4,$5,'open',false,true,$6,$7,$8,$9,'2026-08-20'::date)`, [jobId, seed.template_id, seed.master_template_version_id, reference, site!.display_name, seed.customer_id, seed.customer_configuration_revision_id, snapshot, site!.id]);
      const definition = (await pool.query<{ definition: unknown }>("SELECT definition FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='automatic_sprinkler'", [seed.master_template_version_id])).rows[0]!.definition;
      const controls = resolveAutomaticSprinklerControls(definition, "MFE-FSSR", 1);
      const acceptedSnapshot = { schemaVersion: 1, acceptedAt: "2026-08-20T01:02:03.000Z", job: { id: jobId, reference, title: site!.display_name }, customer: snapshot.customer, configuration: snapshot.configuration, template: { id: seed.master_template_version_id, code: "MFE-FSSR", version: 1 }, system: { ...system, definition, resolvedControls: controls, repetitionMode: "single" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null } };
      const response = sprinklerResponse(controls);
      if (options.malformed) response.measurements = {} as never;
      await pool.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'automatic_sprinkler',$3)", [groupId, jobId, userId]);
      await pool.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id,evidence_policy_id,evidence_policy_version,evidence_policy_snapshot,evidence_policy_sha256)
        VALUES($1,$2,$3,'primary',1,$4,$5,1,$6,1,$7,$8,'submitted',now(),$9,$10,1,$11,$12)`, [formId, groupId, clientUuid, seed.master_template_version_id, seed.customer_configuration_revision_id, acceptedSnapshot, response, "b".repeat(64), userId, policyId, policyDefinition, policyHash]);
      if (options.evidence !== "missing") {
        let evidenceFormId = formId, evidenceClientUuid = clientUuid;
        if (options.evidence === "wrong_form") {
          evidenceFormId = randomUUID(); evidenceClientUuid = randomUUID();
          const secondarySnapshot = { ...acceptedSnapshot, instance: { instanceKey: "secondary", displaySequence: 2, zone: null, location: null } };
          await pool.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id,evidence_policy_id,evidence_policy_version,evidence_policy_snapshot,evidence_policy_sha256)
            VALUES($1,$2,$3,'secondary',2,$4,$5,1,$6,1,$7,$8,'submitted',now(),$9,$10,1,$11,$12)`, [evidenceFormId, groupId, evidenceClientUuid, seed.master_template_version_id, seed.customer_configuration_revision_id, secondarySnapshot, response, "c".repeat(64), userId, policyId, policyDefinition, policyHash]);
        }
        const content = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).jpeg().toBuffer();
        const relative = `inspections/${evidenceClientUuid}/evidence.jpg`, file = path.join(uploadsPath, ...relative.split("/"));
        await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, options.evidence === "corrupt" ? Buffer.from("corrupt") : content);
        const digest = createHash("sha256").update(content).digest("hex");
        await pool.query(`INSERT INTO inspection_attachments(id,client_uuid,form_instance_id,evidence_policy_id,field_path,capture_source,storage_relative_path,source_sha256,stored_sha256,request_fingerprint,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,captured_at,uploaded_by_user_id)
          VALUES($1,$2,$3,$4,'measurements.jockey_pump_pressure.cut_in','camera',$5,$6,$6,$6,'image/jpeg',$7,8,8,$7,8,8,now(),$8)`, [randomUUID(), randomUUID(), evidenceFormId, policyId, relative, digest, content.length, userId]);
      }
      await pool.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,completed_by_display_name='sprinkler-report-tech',report_number='TEST/' || id::text,technician_team_snapshot='[]'::jsonb WHERE id=$1", [jobId, userId]);
      return jobId;
    };

    const valid = await createCompleted({ evidence: "valid" });
    const report = await loadFinalServiceReport(valid, pool);
    assert.equal(report.sections[0]?.evidence.length, 1); assert.equal((await renderFinalServiceReportPdf(report)).subarray(0, 5).toString(), "%PDF-");
    // The valid attachment above belongs to another completed job. A report may
    // only join evidence through its own submitted form instance, never by file,
    // policy, technician, or any cross-job lookup.
    const wrongJobEvidence = await createCompleted({ evidence: "missing" });
    await assert.rejects(() => loadFinalServiceReport(wrongJobEvidence, pool), (error: unknown) => error instanceof FinalReportError && error.code === "FINAL_REPORT_DATA_INVALID");
    // A file in the uploads tree with no accepted attachment row is local or
    // unaccepted evidence and must likewise be invisible to the report.
    await mkdir(path.join(uploadsPath, "inspections", "unaccepted"), { recursive: true });
    await writeFile(path.join(uploadsPath, "inspections", "unaccepted", "local.jpg"), "not authoritative");
    const unacceptedEvidence = await createCompleted({ evidence: "missing" });
    await assert.rejects(() => loadFinalServiceReport(unacceptedEvidence, pool), (error: unknown) => error instanceof FinalReportError && error.code === "FINAL_REPORT_DATA_INVALID");
    for (const options of [{ evidence: "wrong_form" as const }, { evidence: "corrupt" as const }, { evidence: "valid" as const, malformed: true }]) {
      const jobId = await createCompleted(options);
      await assert.rejects(() => loadFinalServiceReport(jobId, pool), (error: unknown) => error instanceof FinalReportError && error.code === "FINAL_REPORT_DATA_INVALID");
    }
  } finally { await pool.end(); await rm(uploadsPath, { recursive: true, force: true }); }
});
