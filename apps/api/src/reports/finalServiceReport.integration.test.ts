import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { FinalReportError, loadFinalServiceReport, renderFinalServiceReportPdf } from "./finalServiceReport.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "../routes/managerCustomers.js";
import { extractPdfText } from "./pdf/extractPdfText.testSupport.js";
import { closeInspectionJob } from "../jobs/jobCompletion.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const seedCo2JobId = "00000000-0000-4000-8000-000000000679";
const reportJobId = "f2000000-0000-4000-8000-000000000001";
const inspectionId = "f2000000-0000-4000-8000-000000000002";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

/** Exercises the production report SQL against PostgreSQL, never a runtime/customer database. */
test("PostgreSQL final-report service accepts completed frozen CO2 history and fails closed", {
  skip: !databaseUrl
}, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const user = await pool.query<{ id: number }>(
      "INSERT INTO users(username,display_name,password_hash,role) VALUES('report-tech','Alice Tan','not-used','inspector') RETURNING id"
    );
    const userId = user.rows[0]?.id;
    assert.ok(userId);
    const seedJob = (await pool.query<{ customer_id: string }>("SELECT customer_id FROM inspection_jobs WHERE id=$1", [seedCo2JobId])).rows[0]!;
    const site = (await pool.query<{ id: string; display_name: string }>("SELECT id,display_name FROM customer_sites WHERE customer_id=$1 AND is_active=true ORDER BY site_code LIMIT 1", [seedJob.customer_id])).rows[0];
    assert.ok(site, "seed customer needs an active Phase-6B site");
    await pool.query(`INSERT INTO inspection_jobs(
      id, template_id, master_template_version_id, job_reference, title, status, is_sample,
      technician_visible, customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date
    ) SELECT $1, template_id, master_template_version_id, 'SV-20260820-9001',
      $2::text, 'open', false, true, customer_id, customer_configuration_revision_id,
      configuration_snapshot || jsonb_build_object(
        'customer', configuration_snapshot->'customer' || jsonb_build_object('fax','03-222','contractNumber','C-44','serviceFrequency','QUARTERLY'),
        'site', jsonb_build_object('id',$3::uuid,'displayName',$2::text,'address','44 Frozen Road')),
      $3::uuid, '2026-08-20'::date FROM inspection_jobs WHERE id=$4`, [reportJobId, site!.display_name, site!.id, seedCo2JobId]);
    const job = (await pool.query<any>("SELECT * FROM inspection_jobs WHERE id=$1", [reportJobId])).rows[0];
    const frozenSystem = job.configuration_snapshot.enabledSystems.find((system: any) => system.systemKey === "co2_fire_extinguisher");
    assert.ok(frozenSystem);
    const definition = (await pool.query<{ definition: unknown }>("SELECT definition FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='co2_fire_extinguisher'", [job.master_template_version_id])).rows[0]?.definition;
    const co2Controls = resolveCo2Controls(definition, "MFE-FSSR", 1);
    const co2Checklist = (items: Array<{ key: string; result: { options: Array<{ value: string }> } }>) => Object.fromEntries(items.map((item) => [item.key, { result: item.result.options[0]!.value, remarks: "" }]));
    const zones = new Map<string, any>(frozenSystem.zones.map((zone: any): [string, any] => [zone.id, zone]));
    const locations = [...frozenSystem.locations].sort((left: any, right: any) => {
      const leftZone = zones.get(left.zoneId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightZone = zones.get(right.zoneId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      return leftZone - rightZone || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
    });
    const fixture = async (values: {
      jobId: string; groupId: string; identityBase: number; reference: string;
      variation?: "valid" | "missing" | "malformed" | "wrong-template" | "wrong-template-version" | "corrupt-controls" | "wrong-instance";
    }) => {
      const variation = values.variation ?? "valid";
      await pool.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'co2_fire_extinguisher',$3)", [values.groupId, values.jobId, userId]);
      for (const [index, location] of locations.entries()) {
        if (variation === "missing" && index === locations.length - 1) continue;
        const response = variation === "malformed" && index === 0 ? {} : { controlPanelLocation: "Control Room", detectorRows: [{ rowUuid: `f2000000-0000-4000-8000-${String(values.identityBase + 400 + index).padStart(12, "0")}`, displaySequence: 1, alarmZone: "Zone", location: location.displayName, heatDetectorStatus: co2Controls.detectorRows.heatDetector.result.options[0]!.value, smokeDetectorStatus: null, remarks: "" }], chargerAndBatteries: co2Checklist(co2Controls.chargerAndBatteries), physicalOutlook: co2Checklist(co2Controls.physicalOutlook), mainFunctionKeys: co2Checklist(co2Controls.mainFunctionKeys), comments: "PostgreSQL accepted history" };
        const zone = location.zoneId === null ? null : zones.get(location.zoneId);
        assert.ok(zone !== undefined, "each frozen CO2 location must retain its authoritative zone");
        const acceptedSnapshot = { schemaVersion: 1, acceptedAt: "2026-08-20T01:02:03.000Z", job: { id: values.jobId, reference: values.reference, title: job.title }, customer: job.configuration_snapshot.customer, configuration: job.configuration_snapshot.configuration, template: { id: variation === "wrong-template" && index === 0 ? "00000000-0000-4000-8000-000000000502" : job.master_template_version_id, code: "MFE-FSSR", version: variation === "wrong-template-version" && index === 0 ? 2 : 1 }, system: { key: "co2_fire_extinguisher", displayName: frozenSystem.displayName, definition, resolvedControls: variation === "corrupt-controls" && index === 0 ? { corrupt: true } : co2Controls, repetitionMode: "per_location" }, instance: { instanceKey: `location:${location.id}`, displaySequence: index + 1, zone: zone === null ? null : { id: zone.id, key: zone.key, displayName: variation === "wrong-instance" && index === 0 ? "Forged zone" : zone.displayName, sortOrder: zone.sortOrder }, location: { id: location.id, key: location.key, displayName: location.displayName, sortOrder: location.sortOrder } } };
        await pool.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,1,$11,$12,'submitted',now(),$13)`, [
        `f2000000-0000-4000-8000-${String(values.identityBase + index).padStart(12, "0")}`, values.groupId,
        `f2000000-0000-4000-8000-${String(values.identityBase + 100 + index).padStart(12, "0")}`,
        `location:${location.id}`, location.zoneId, location.id, index + 1, job.master_template_version_id,
        job.customer_configuration_revision_id, acceptedSnapshot, response, "a".repeat(64), userId
      ]);
      }
      if (values.jobId === reportJobId) {
        const completion = await closeInspectionJob(values.jobId, { id: userId!, username: "report-tech" }, pool);
        assert.equal(completion.kind, "closed");
      } else {
        await pool.query("UPDATE inspection_jobs SET status='closed', completed_at=now(), completed_by_user_id=$2, completed_by_display_name='Alice Tan', report_number='TEST/' || id::text, technician_team_snapshot='[]'::jsonb WHERE id=$1", [values.jobId, userId]);
      }
    };
    await fixture({ jobId: reportJobId, groupId: inspectionId, identityBase: 100, reference: job.job_reference });

    const report = await loadFinalServiceReport(reportJobId, pool);
    assert.match(report.reportNumber ?? "", /^MFE\/SR\/2026\/\d{4}$/);
    assert.equal(report.completedBy, "Alice Tan");
    assert.equal(report.fax, "03-222");
    assert.equal(report.contractNumber, "C-44");
    assert.equal(report.serviceFrequency, "QUARTERLY");
    assert.equal(report.siteAddress, "44 Frozen Road");
    assert.equal(report.sections.length, 6, "all frozen CO2 locations remain distinct report units");
    assert.equal(new Set(report.sections.map((section) => section.location?.instanceKey)).size, 6);
    assert.ok(report.sections.every((section) => section.location?.zoneLabel && section.location.locationLabel));
    const pdf = await renderFinalServiceReportPdf(report);
    assert.equal(pdf.subarray(0, 5).toString("binary"), "%PDF-");

    await pool.query("UPDATE customers SET fax='changed', contract_number='changed', service_frequency='ANNUALLY' WHERE id=$1", [job.customer_id]);
    await pool.query("UPDATE customer_sites SET address='Changed live address' WHERE id=$1", [site!.id]);
    const frozenAfterCustomerEdit = await loadFinalServiceReport(reportJobId, pool);
    assert.equal(frozenAfterCustomerEdit.fax, "03-222");
    assert.equal(frozenAfterCustomerEdit.contractNumber, "C-44");
    assert.equal(frozenAfterCustomerEdit.serviceFrequency, "QUARTERLY");
    assert.equal(frozenAfterCustomerEdit.siteAddress, "44 Frozen Road");
    const stablePdf = (value: Buffer) => value.toString("binary")
      .replace(/\/(CreationDate|ModDate) \(D:[^)]+\)/g, "/$1 (VOLATILE)");
    assert.equal(stablePdf(await renderFinalServiceReportPdf(frozenAfterCustomerEdit)), stablePdf(pdf), "live customer/site edits cannot change the issued PDF content");
    const historicalText = (await extractPdfText(pdf)).join("");
    assert.ok(historicalText.includes("Alice Tan"), "signature block prints the frozen person's name");
    await pool.query("ALTER TABLE users DROP CONSTRAINT users_display_name_check; ALTER TABLE users DROP COLUMN display_name");
    await runMigrations(pool); // Forward migration must leave the already-closed report untouched.
    const afterNameMigration = await renderFinalServiceReportPdf(await loadFinalServiceReport(reportJobId, pool));
    assert.equal((await extractPdfText(afterNameMigration)).join(""), historicalText, "already-closed PDF text is byte-identical after migration 032");
    assert.equal((await pool.query("SELECT display_name FROM users WHERE id=$1", [userId])).rows[0]?.display_name, null);

    const frozenRevision = job.customer_configuration_revision_id as string;
    const frozenSnapshot = JSON.stringify(job.configuration_snapshot);
    await pool.query("UPDATE customers SET is_demo=false WHERE id=$1", [job.customer_id]);
    const managerApp = express(); managerApp.use(express.json());
    managerApp.use((request, _response, next) => { request.currentUser = { id: userId, username: "report-manager", role: "admin" }; next(); });
    managerApp.use(createManagerCustomersRouter(pool));
    managerApp.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    });
    const managerServer = managerApp.listen(0, "127.0.0.1"); await once(managerServer, "listening");
    try {
      const address = managerServer.address() as { port: number };
      const activation = await fetch(`http://127.0.0.1:${address.port}/manager/customers/${job.customer_id}/configuration-revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemKeys: ["co2_fire_extinguisher", "automatic_sprinkler"] })
      });
      assert.equal(activation.status, 201, "actual Manager activation produces N+1");
    } finally { await close(managerServer); }
    const activeRevision = await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [job.customer_id]);
    assert.notEqual(activeRevision.rows[0]?.id, frozenRevision, "Manager activation replaced the active configuration");
    const frozenJobAfterActivation = await pool.query<{ revision: string; snapshot: unknown }>("SELECT customer_configuration_revision_id::text AS revision, configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1", [reportJobId]);
    assert.equal(frozenJobAfterActivation.rows[0]?.revision, frozenRevision, "completed report job remains bound to N");
    assert.equal(JSON.stringify(frozenJobAfterActivation.rows[0]?.snapshot), frozenSnapshot, "completed report job snapshot remains frozen at N");
    const reportAfterActivation = await loadFinalServiceReport(reportJobId, pool);
    assert.deepEqual(reportAfterActivation.systems, report.systems, "final report continues to render N after Manager activates N+1");
    assert.deepEqual(reportAfterActivation.sections, report.sections, "final report section authority remains at N");

    for (const [jobId, groupId, identityBase, variation] of [
      ["f2000000-0000-4000-8000-000000000011", "f2000000-0000-4000-8000-000000000012", 300, "missing"],
      ["f2000000-0000-4000-8000-000000000021", "f2000000-0000-4000-8000-000000000022", 500, "malformed"],
      ["f2000000-0000-4000-8000-000000000031", "f2000000-0000-4000-8000-000000000032", 700, "wrong-template"],
      ["f2000000-0000-4000-8000-000000000035", "f2000000-0000-4000-8000-000000000036", 800, "wrong-template-version"],
      ["f2000000-0000-4000-8000-000000000041", "f2000000-0000-4000-8000-000000000042", 900, "corrupt-controls"],
      ["f2000000-0000-4000-8000-000000000051", "f2000000-0000-4000-8000-000000000052", 1100, "wrong-instance"]
    ] as const) {
      const reference = `SV-20260820-${identityBase}`;
      await pool.query(`INSERT INTO inspection_jobs(
        id, template_id, master_template_version_id, job_reference, title, status, is_sample,
        technician_visible, customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date
      ) SELECT $1, template_id, master_template_version_id, $2, title, 'open', false, true, customer_id,
        customer_configuration_revision_id, configuration_snapshot, site_id, service_date FROM inspection_jobs WHERE id=$3`, [jobId, reference, reportJobId]);
      await fixture({ jobId, groupId, identityBase, reference, variation });
      await assert.rejects(() => loadFinalServiceReport(jobId, pool), (error: unknown) => error instanceof FinalReportError && error.code === "FINAL_REPORT_DATA_INVALID");
    }

    await pool.query("UPDATE inspection_jobs SET technician_visible=false WHERE id=$1", [reportJobId]);
    await assert.rejects(() => loadFinalServiceReport(reportJobId, pool), (error: unknown) => error instanceof FinalReportError && error.code === "JOB_NOT_FOUND");
    await pool.query("UPDATE inspection_jobs SET technician_visible=true WHERE id=$1", [reportJobId]);
    await assert.rejects(
      () => pool.query("UPDATE master_system_form_instances SET response_payload='{}'::jsonb WHERE inspection_group_id=$1", [inspectionId]),
      /COMPLETED_JOB_REPORT_HISTORY_IMMUTABLE/
    );
  } finally {
    await pool.end();
  }
});
