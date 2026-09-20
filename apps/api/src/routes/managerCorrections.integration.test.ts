import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { syncCo2FormInstances } from "../sync/co2FormInstanceSync.js";
import { inspectionJobsRouter } from "./inspectionJobs.js";
import { createManagerCorrectionsRouter } from "./managerCorrections.js";
import { createManagerServiceVisitsRouter } from "./managerServiceVisits.js";
import { masterSystemInspectionsRouter } from "./masterSystemInspections.js";
import { stagedEvidenceRouter } from "./stagedEvidence.js";

/**
 * T5a: corrections to an Accepted V7 inspection are append-only rows; the accepted record is never
 * written; the frozen contract, optimistic concurrency, idempotency, roles, audit and the PDF refusal for
 * corrected visits all hold against a real accepted Wet Chemical V7 record.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const time = "2026-09-01T00:00:00.000Z";

test("corrections: append-only, frozen-contract checked, concurrency-safe, audited; accepted record untouched; PDF refused", { skip: !databaseUrl }, async () => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    await runMigrations(pool); // 032 replay: table present, nothing re-applied
    const template = (await pool.query<{ id: string }>("SELECT template.id FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='wet_chemical'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), zone = id(), location = id(), job = id(), client = id(), detectorRow = id();
    await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Corrections V7',true)", [customer, `CORR-${customer}`]);
    await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await pool.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'wet_chemical',1,'{}')", [enabled, revision, template.id]);
    await pool.query("INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,'k','Kitchen',1)", [zone, enabled]);
    await pool.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,sort_order) VALUES($1,$2,$3,'a','Kitchen A',1)", [location, enabled, zone]);
    const system = { enabledSystemId: enabled, systemKey: "wet_chemical", displayName: "Wet Chemical", sortOrder: 1, definitionStatus: "confirmed", zones: [{ id: zone, key: "k", displayName: "Kitchen", sortOrder: 1 }], locations: [{ id: location, zoneId: zone, key: "a", displayName: "Kitchen A", sortOrder: 1 }] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `CORR-${customer}`, displayName: "Corrections V7" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Corrections V7','open',false,true,$4,$5,$6,'2026-09-05')", [job, template.id, `CORR-${job}`, customer, revision, snapshot]);
    const good = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, { result: "good", remarks: "" }]));
    const responses = { controlPanelLocation: "Kitchen A", detectorRows: [{ rowUuid: detectorRow, displaySequence: 1, alarmZone: "Kitchen", location: "Kitchen A", heatDetectorStatus: ["normal"], smokeDetectorStatus: ["normal"], remarks: "" }], chargerAndBatteries: good(["main_supply", "battery", "charger"]), physicalOutlook: good(["wet_chemical_cylinder", "electric_actuator", "manual_release_key", "alarm_bell", "twin_flashing_light", "manual_pull_station", "high_pressure_hose", "discharge_nozzle"]), mainFunctionKeys: good(["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "signal_alarm_to_mfap"]), comments: "" };
    const item = { operationId: id(), entityType: "masterSystemFormInstance", entityId: client, action: "create", payload: { clientUuid: client, jobId: job, systemKey: "wet_chemical", instanceKey: `location:${location}`, configuredZoneId: zone, configuredLocationId: location, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: time, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" }, instance: { instanceKey: `location:${location}`, displaySequence: 1 } }, responses, evidenceManifest: [], performedAt: time } };
    const user = async (username: string, role: string) => (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int AS id", [username, role])).rows[0]!.id;
    const inspector = await user("corr-tech", "inspector"), supervisor = await user("corr-review", "supervisor"), admin = await user("corr-admin", "admin");
    const foreign = await user("corr-other-tech", "inspector");
    await pool.query("UPDATE inspection_jobs SET created_by_user_id=$1 WHERE id=$2", [inspector, job]);
    assert.deepEqual((await syncCo2FormInstances([item], inspector)).acceptedIds, [client]);
    const acceptedHash = async () => createHash("sha256").update(JSON.stringify((await pool.query("SELECT response_payload, inspection_snapshot, updated_at FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0])).digest("hex");
    const before = await acceptedHash();

    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
      supervisor: { id: supervisor, username: "corr-review", role: "supervisor" }, admin: { id: admin, username: "corr-admin", role: "admin" },
      inspector: { id: inspector, username: "corr-tech", role: "inspector" }, foreign: { id: foreign, username: "corr-other-tech", role: "inspector" }
    };
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createManagerCorrectionsRouter(pool)); app.use(createManagerServiceVisitsRouter({ database: pool })); app.use(inspectionJobsRouter);
    app.use(masterSystemInspectionsRouter); app.use(stagedEvidenceRouter);
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const call = (path: string, actor: string, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "content-type": "application/json", "x-test-actor": actor }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const post = (actor: string, body: unknown) => call(`/manager/inspections/${client}/corrections`, actor, "POST", body);
    const count = async () => (await pool.query("SELECT count(*)::int AS n FROM inspection_corrections")).rows[0].n as number;
    try {
      // Editor view: correctable fields exclude identity and the N/T/I detector arrays.
      const view = await (await call(`/manager/inspections/${client}/corrections`, "supervisor")).json() as { supported: boolean; fields: Array<{ fieldPath: string; kind: string; value: unknown; label: string }> };
      assert.equal(view.supported, true);
      const paths = view.fields.map((field) => field.fieldPath);
      assert.ok(paths.includes("chargerAndBatteries.main_supply.result") && paths.includes("controlPanelLocation") && paths.includes(`detectorRows.${detectorRow}.remarks`));
      assert.ok(!paths.some((path) => /Status|rowUuid|displaySequence/.test(path)), paths.join(","));
      assert.ok(view.fields.every((field) => field.label.length > 0));

      const mainSupply = "chargerAndBatteries.main_supply.result", mainRemarks = "chargerAndBatteries.main_supply.remarks";
      const first = { requestId: id(), reason: "Terminal corrosion seen on the photos", changes: [
        { fieldPath: mainSupply, expectedCurrentValue: "good", newValue: "not_good" },
        { fieldPath: mainRemarks, expectedCurrentValue: "", newValue: "Battery terminal corroded" }
      ] };
      assert.equal((await post("inspector", first)).status, 403, "technicians never correct");
      assert.equal((await post("nobody", first)).status, 401);
      const created = await post("supervisor", first);
      assert.equal(created.status, 201, await created.clone().text());
      const createdRows = (await created.json() as { corrections: Array<{ fieldPath: string; sequence: number; previousValue: unknown; newValue: unknown; correctedBy: string; correctedByRole: string }> }).corrections;
      assert.deepEqual(createdRows.map((row) => [row.fieldPath, row.sequence, row.previousValue, row.newValue, row.correctedByRole]).sort(), [
        [mainRemarks, 1, "", "Battery terminal corroded", "supervisor"], [mainSupply, 1, "good", "not_good", "supervisor"]
      ]);
      assert.equal(await acceptedHash(), before, "the accepted record (payload, snapshot, updated_at) is byte-identical");

      // Idempotent replay; a reused request ID with a different body is refused.
      const replay = await post("supervisor", first);
      assert.equal(replay.status, 200);
      assert.equal(await count(), 2);
      assert.equal((await post("supervisor", { ...first, reason: "Something else entirely" })).status, 409);

      // Optimistic concurrency: a stale screen writes nothing.
      const stale = await post("admin", { requestId: id(), reason: "Stale screen", changes: [{ fieldPath: mainSupply, expectedCurrentValue: "good", newValue: "na" }] });
      assert.equal(stale.status, 409); assert.equal((await stale.json() as { error: string }).error, "CORRECTION_CONFLICT");
      assert.equal(await count(), 2);

      // Refusals.
      const refused = async (change: unknown, status: number, code: string) => {
        const response = await post("admin", { requestId: id(), reason: "Refusal check", changes: [change] });
        assert.equal(response.status, status, JSON.stringify(change));
        assert.equal((await response.json() as { error: string }).error, code, JSON.stringify(change));
      };
      await refused({ fieldPath: mainSupply, expectedCurrentValue: "not_good", newValue: "not_good" }, 400, "CORRECTION_NO_CHANGE");
      await refused({ fieldPath: mainSupply, expectedCurrentValue: "not_good", newValue: "poor" }, 400, "INVALID_CORRECTION_VALUE");
      await refused({ fieldPath: `detectorRows.${detectorRow}.heatDetectorStatus`, expectedCurrentValue: ["normal"], newValue: ["test"] }, 400, "FIELD_NOT_CORRECTABLE");
      await refused({ fieldPath: "chargerAndBatteries.main_supply", expectedCurrentValue: {}, newValue: {} }, 400, "FIELD_NOT_CORRECTABLE");
      await refused({ fieldPath: `detectorRows.${detectorRow}.rowUuid`, expectedCurrentValue: detectorRow, newValue: id() }, 400, "FIELD_NOT_CORRECTABLE");
      await refused({ fieldPath: "controlPanelLocation", expectedCurrentValue: "Kitchen A", newValue: "   " }, 422, "CORRECTION_CONTRACT_VIOLATION");
      await refused({ fieldPath: "controlPanelLocation", expectedCurrentValue: "Kitchen A", newValue: "x".repeat(301) }, 422, "CORRECTION_CONTRACT_VIOLATION");
      assert.equal((await post("admin", { requestId: id(), reason: "no", changes: [{ fieldPath: mainSupply, expectedCurrentValue: "not_good", newValue: "good" }] })).status, 400, "reason 3-500 chars");
      assert.equal(await count(), 2);

      // A later correction of the same field chains from the previous one.
      const second = await post("admin", { requestId: id(), reason: "Re-inspected on site: terminals cleaned", changes: [{ fieldPath: mainSupply, expectedCurrentValue: "not_good", newValue: "complete_repair" }] });
      assert.equal(second.status, 201);
      const [chained] = (await second.json() as { corrections: Array<{ sequence: number; previousValue: unknown }> }).corrections;
      assert.deepEqual([chained!.sequence, chained!.previousValue], [2, "not_good"]);
      const after = await (await call(`/manager/inspections/${client}/corrections`, "admin")).json() as { fields: Array<{ fieldPath: string; value: unknown; originalValue: unknown; corrected: boolean }>; corrections: unknown[] };
      const field = after.fields.find((entry) => entry.fieldPath === mainSupply)!;
      assert.deepEqual([field.value, field.originalValue, field.corrected], ["complete_repair", "good", true]);
      assert.equal(after.corrections.length, 3);

      // Visit list; audit pointer per stored correction.
      const visit = await (await call(`/manager/service-visits/${job}/corrections`, "supervisor")).json() as { corrections: Array<{ clientUuid: string; label: string; reason: string }> };
      assert.equal(visit.corrections.length, 3);
      assert.ok(visit.corrections.every((row) => row.clientUuid === client && row.label.includes("›")));
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='inspection.correct'")).rows[0].n, 3);

      // Fail closed for a V7 system outside the first cut: Fire Alarm keeps its own storage and validator.
      // (The non-V7 branch of the same gate is covered by the unit test of `supportedRow`.)
      const fireJob = id(), fireCustomer = id(), fireRevision = id(), fireEnabled = id(), fireClient = id();
      const fireTemplate = (await pool.query<{ id: string }>("SELECT template.id FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fire_alarm_detector'")).rows[0]!;
      await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Corrections Fire Alarm',true)", [fireCustomer, `CORRF-${fireCustomer}`]);
      await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [fireRevision, fireCustomer, fireTemplate.id]);
      await pool.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_alarm_detector',1,'{}')", [fireEnabled, fireRevision, fireTemplate.id]);
      const fireSnapshot = { schemaVersion: 1, customer: { id: fireCustomer, code: `CORRF-${fireCustomer}`, displayName: "Corrections Fire Alarm" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: fireRevision, revisionNumber: 1 }, template: { id: fireTemplate.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [{ enabledSystemId: fireEnabled, systemKey: "fire_alarm_detector", displayName: "Fire Alarm", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }] };
      await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,'Corrections Fire Alarm','open',false,true,$4,$5,$6,'2026-09-05',$7)", [fireJob, fireTemplate.id, `CORRF-${fireJob}`, fireCustomer, fireRevision, fireSnapshot, inspector]);
      const fireGroup = id();
      await pool.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3)", [fireGroup, fireJob, inspector]);
      await pool.query(`INSERT INTO master_system_form_instances
        (id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,customer_configuration_revision_id,
         snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id)
        VALUES($1,$2,$3,'primary',1,$4,$5,1,'{}'::jsonb,1,'{"controlPanelLocation":"Panel A"}'::jsonb,$6,'submitted',now(),$7)`,
      [id(), fireGroup, fireClient, fireTemplate.id, fireRevision, createHash("sha256").update(fireClient).digest("hex"), admin]);
      // The job is the technician's, but an admin synced this record: they read the record, not its corrections.
      assert.equal((await call(`/inspections/${fireClient}/corrections`, "inspector")).status, 404, "owning the job is not enough to read a record you did not sync");
      assert.equal((await call(`/inspections/${fireClient}/corrections`, "supervisor")).status, 200);
      const fireView = await (await call(`/manager/inspections/${fireClient}/corrections`, "supervisor")).json() as { supported: boolean; fields: unknown[] };
      assert.deepEqual([fireView.supported, fireView.fields.length], [false, 0], "Fire Alarm V7 is not correctable yet");
      const fireRefused = await call(`/manager/inspections/${fireClient}/corrections`, "supervisor", "POST", { requestId: id(), reason: "Should be refused outright", changes: [{ fieldPath: "controlPanelLocation", expectedCurrentValue: "Panel A", newValue: "Panel B" }] });
      assert.equal(fireRefused.status, 422);
      assert.equal((await fireRefused.json() as { error: string }).error, "CORRECTION_NOT_SUPPORTED");
      assert.equal(await count(), 3, "nothing was written for an unsupported record");

      // T5c: a supervisor reviews any accepted record and its evidence; a technician sees only their own.
      for (const [path, actor, status] of [
        [`/wet-chemical-inspections/${client}`, "supervisor", 200],
        [`/wet-chemical-inspections/${client}`, "inspector", 200],
        [`/wet-chemical-inspections/${client}`, "foreign", 404],
        [`/v7-evidence/accepted?inspectionClientUuid=${client}`, "supervisor", 200],
        [`/master-system-inspections?jobId=${job}`, "supervisor", 200],
        [`/inspections/${client}/corrections`, "supervisor", 200],
        [`/inspections/${client}/corrections`, "inspector", 200],
        [`/inspections/${client}/corrections`, "foreign", 404]
      ] as const) {
        const response = await call(path, actor);
        assert.equal(response.status, status, `${actor} ${path}`);
      }
      const technicianView = await (await call(`/inspections/${client}/corrections`, "inspector")).json() as { corrections: Array<{ label: string; reason: string; newValue: unknown }> };
      assert.equal(technicianView.corrections.length, 3, "the creating technician reads the corrections to their own record");
      assert.ok(technicianView.corrections.every((correction) => correction.label.includes("›") && correction.reason.length > 0));

      // Append-only at the database level.
      await assert.rejects(pool.query("UPDATE inspection_corrections SET reason='rewritten'"), /append-only/);
      await assert.rejects(pool.query("DELETE FROM inspection_corrections"), /append-only/);
      await assert.rejects(pool.query("TRUNCATE inspection_corrections"), /append-only/);
      assert.equal(await acceptedHash(), before);

      // The JSON report still serves the accepted values; the PDF is refused while corrections exist.
      await pool.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,completed_by_display_name='corr' WHERE id=$1", [job, inspector]);
      assert.equal((await call(`/manager/service-visits/${job}/final-report`, "supervisor")).status, 200);
      for (const [path, actor] of [[`/manager/service-visits/${job}/final-report.pdf`, "admin"], [`/inspection-jobs/${job}/final-report.pdf`, "inspector"]] as const) {
        const pdf = await call(path, actor);
        assert.equal(pdf.status, 409, path);
        assert.equal((await pdf.json() as { error: string }).error, "FINAL_REPORT_HAS_CORRECTIONS");
      }
      // A closed job still accepts review corrections.
      assert.equal((await post("supervisor", { requestId: id(), reason: "Wording fix after closure", changes: [{ fieldPath: "comments", expectedCurrentValue: "", newValue: "Checked with site lead" }] })).status, 201);
    } finally { server.close(); await once(server, "close"); }
  } finally { await pool.end(); }
});
