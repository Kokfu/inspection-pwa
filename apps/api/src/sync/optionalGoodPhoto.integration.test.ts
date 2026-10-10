import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../db/migrations.js";
import { stagedEvidenceRouter } from "../routes/stagedEvidence.js";
import { masterSystemInspectionsRouter } from "../routes/masterSystemInspections.js";
import { syncRouter } from "../routes/sync.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { syncCo2FormInstances } from "./co2FormInstanceSync.js";
import { loadFinalServiceReport, renderFinalServiceReportPdf } from "../reports/finalServiceReport.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

// CR-01 Phase 1: an OPTIONAL photo on a Good / N.A. result, end to end on the two
// pilot systems (CO2 and Wet Chemical share co2FormInstanceSync).  Findings keep
// their required own remark + photo; nothing here may weaken that.
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const time = "2026-09-01T00:00:00.000Z";
const result = (value: "good" | "not_good" | "complete_repair" | "na", remarks = "") => ({ result: value, remarks });

type Config = { systemKey: "co2_fire_extinguisher" | "wet_chemical"; label: string; route: string; physical: readonly string[] };
const configs: readonly Config[] = [
  { systemKey: "co2_fire_extinguisher", label: "CO2", route: "co2-inspections", physical: ["co2_cylinder", "electric_actuator", "manual_release_key", "alarm_bell", "twin_flashing_light", "24v_dc_tripping_device", "manual_pull_station", "high_pressure_hose", "discharge_nozzles", "pilot_cylinder"] },
  { systemKey: "wet_chemical", label: "Wet Chemical", route: "wet-chemical-inspections", physical: ["wet_chemical_cylinder", "electric_actuator", "manual_release_key", "alarm_bell", "twin_flashing_light", "manual_pull_station", "high_pressure_hose", "discharge_nozzle"] }
];
const findingPath = "charger_batteries.charger_battery_checks.main_supply";
const naPath = "charger_batteries.charger_battery_checks.charger";

for (const config of configs) {
  test(`${config.label} V7 accepts, serves and reports an optional photo on Good / N.A. results`, { skip: !databaseUrl, timeout: 120_000 }, async (t) => {
    const database = new pg.Pool({ connectionString: databaseUrl });
    const isolationLock = await database.connect(); await isolationLock.query("SELECT pg_advisory_lock(819276)");
    const uploads = path.join(tmpdir(), `cr01-optional-photo-${id()}`);
    process.env.UPLOADS_PATH = uploads;
    const goodPath = `physical_outlook.physical_outlook_checks.${config.physical[0]}`;
    try {
      await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
      const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key=$1", [config.systemKey])).rows[0]!;
      const customer = id(), revision = id(), enabled = id(), zone = id(), job = id();
      const locations = ["a", "b", "c", "d", "e"].map((key, index) => ({ id: id(), zoneId: zone, key, displayName: `Room ${key.toUpperCase()}`, sortOrder: index + 1 }));
      await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,true)", [customer, `CR01-${customer}`, `${config.label} CR-01`]);
      await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
      await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,$4,1,'{}')", [enabled, revision, template.id, config.systemKey]);
      await database.query("INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,'z','Zone',1)", [zone, enabled]);
      for (const location of locations) await database.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,sort_order) VALUES($1,$2,$3,$4,$5,$6)", [location.id, enabled, zone, location.key, location.displayName, location.sortOrder]);
      const system = { enabledSystemId: enabled, systemKey: config.systemKey, displayName: config.label, sortOrder: 1, definitionStatus: "confirmed", zones: [{ id: zone, key: "z", displayName: "Zone", sortOrder: 1 }], locations };
      const snapshot = { schemaVersion: 1, customer: { id: customer, code: `CR01-${customer}`, displayName: `${config.label} CR-01` }, site: { id: id(), displayName: "CR-01 Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
      await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,$4,'open',false,true,$5,$6,$7,'2026-09-01')", [job, template.id, `CR01-${job}`, `${config.label} CR-01`, customer, revision, snapshot]);
      const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`cr01-${id()}`])).rows[0]!.id;
      const foreign = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`cr01-foreign-${id()}`])).rows[0]!.id;
      await database.query("UPDATE inspection_jobs SET created_by_user_id=$1 WHERE id=$2", [actor, job]);
      const contract = v7EvidenceContractSha256(template.definition);

      const app = express(); app.use(express.json());
      app.use((request, _response, next) => { const mode = request.header("x-test-actor"); if (mode !== "none") request.currentUser = { id: mode === "foreign" ? foreign : actor, username: "cr01", role: "inspector" }; next(); });
      app.use(stagedEvidenceRouter); app.use(masterSystemInspectionsRouter); app.use(syncRouter);
      const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

      const stage = async (clientUuid: string, fieldPath: string, color: string) => {
        const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: color } }).jpeg({ quality: 80 }).toBuffer();
        const photoUuid = id(); const form = new FormData();
        const values: Record<string, string> = { photoUuid, inspectionClientUuid: clientUuid, jobId: job, systemKey: config.systemKey, fieldPath, masterTemplateId: template.id, masterTemplateVersion: "7", contractSha256: contract, captureSource: "camera", capturedAt: time, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: String(bytes.length), width: "2", height: "2" };
        for (const [key, value] of Object.entries(values)) form.set(key, value);
        form.set("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "photo.jpg");
        const http = await fetch(`${origin}/v7-evidence/stage`, { method: "POST", body: form });
        assert.equal(http.status, 201, `${fieldPath} stages`);
        return { photoUuid, fieldPath, sourceSha256: values.sha256! };
      };
      const manifest = (...items: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>) => items.map(({ photoUuid, fieldPath, sourceSha256 }) => ({ photoUuid, fieldPath, sourceSha256 })).sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
      const responsesFor = (cells: Record<string, ReturnType<typeof result>> = {}) => {
        const group = (name: string, keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, cells[`${name}.${key}`] ?? result("good")]));
        return { controlPanelLocation: "Room", detectorRows: [{ rowUuid: id(), displaySequence: 1, alarmZone: "Zone", location: "Room", heatDetectorStatus: ["normal"], smokeDetectorStatus: ["normal"], remarks: "" }], chargerAndBatteries: group("chargerAndBatteries", ["main_supply", "battery", "charger"]), physicalOutlook: group("physicalOutlook", config.physical), mainFunctionKeys: group("mainFunctionKeys", ["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "signal_alarm_to_mfap"]), comments: "" };
      };
      const finding = { "chargerAndBatteries.main_supply": result("not_good", "Main supply is failing - own remark") };
      const item = (clientUuid: string, locationIndex: number, responses: unknown, evidenceManifest: ReturnType<typeof manifest>) => ({
        operationId: id(), entityType: "masterSystemFormInstance", entityId: clientUuid, action: "create",
        payload: { clientUuid, jobId: job, systemKey: config.systemKey, instanceKey: `location:${locations[locationIndex]!.id}`, configuredZoneId: zone, configuredLocationId: locations[locationIndex]!.id, displaySequence: locationIndex + 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: time, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" }, instance: { instanceKey: `location:${locations[locationIndex]!.id}`, displaySequence: locationIndex + 1 } }, responses, evidenceManifest, performedAt: time }
      });
      const rows = async (clientUuid: string) => (await database.query<{ field_path: string; status: string; form_instance_id: string | null }>("SELECT field_path,status,form_instance_id FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid])).rows;
      const formCount = async (clientUuid: string) => Number((await database.query("SELECT count(*) AS n FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rows[0].n);

      let firstItem: ReturnType<typeof item> | undefined;
      try {
        await t.test("a finding + an optional Good photo + an optional N.A. photo are accepted atomically and served", async () => {
          const client = id();
          const responses = responsesFor({ ...finding, "chargerAndBatteries.charger": result("na") });
          const proof = await stage(client, findingPath, "white"); const na = await stage(client, naPath, "black"); const good = await stage(client, goodPath, "blue");
          const first = item(client, 0, responses, manifest(proof, na, good)); firstItem = first;
          const accepted = await syncCo2FormInstances([first], actor); assert.deepEqual(accepted.acceptedIds, [client], JSON.stringify(accepted));
          const bound = await rows(client);
          assert.deepEqual(bound.map((row) => row.field_path), [findingPath, naPath, goodPath].sort());
          assert.ok(bound.every((row) => row.status === "accepted" && row.form_instance_id), "every manifest photo is bound to the accepted form");
          assert.equal(new Set(bound.map((row) => row.form_instance_id)).size, 1);

          assert.deepEqual((await syncCo2FormInstances([first], actor)).duplicateIds, [client], "an exact retry is idempotent");
          assert.equal(await formCount(client), 1);

          const detail = await fetch(`${origin}/${config.route}/${client}`); assert.equal(detail.status, 200);
          const body = await detail.json() as { inspection: { responses: ReturnType<typeof responsesFor> } };
          assert.equal(body.inspection.responses.chargerAndBatteries.charger.result, "na");
          assert.equal(body.inspection.responses.physicalOutlook[config.physical[0]!]!.result, "good");
          const listed = await (await fetch(`${origin}/v7-evidence/accepted?inspectionClientUuid=${client}`)).json() as { evidence: Array<{ photoUuid: string; fieldPath: string }> };
          assert.deepEqual(listed.evidence.map((entry) => entry.fieldPath), [findingPath, naPath, goodPath].sort(), "Accepted Detail lists the optional photos beside the required one");
          for (const entry of [proof, na, good]) {
            const content = await fetch(`${origin}/v7-evidence/accepted/${entry.photoUuid}/content`);
            assert.equal(content.status, 200, `${entry.fieldPath} content`); assert.equal(content.headers.get("content-type"), "image/jpeg");
          }
          assert.equal((await fetch(`${origin}/v7-evidence/accepted/${good.photoUuid}/content`, { headers: { "x-test-actor": "none" } })).status, 401);
          assert.equal((await fetch(`${origin}/v7-evidence/accepted/${good.photoUuid}/content`, { headers: { "x-test-actor": "foreign" } })).status, 404, "a foreign technician cannot read an optional photo");
        });

        await t.test("forged, missing or extra evidence is rejected and leaves no accepted rows", async () => {
          const client = id();
          const responses = responsesFor(finding);
          const proof = await stage(client, findingPath, "orange"); const optional = await stage(client, goodPath, "purple");
          const attempts: Array<[string, unknown, string]> = [
            ["a finding without its own photo (an optional photo cannot stand in)", manifest(optional), "VALIDATION_ERROR"],
            ["an unknown field path", [...manifest(proof), { photoUuid: id(), fieldPath: "main_function_key.function_checks.not_a_field", sourceSha256: "c".repeat(64) }], "VALIDATION_ERROR"],
            ["a staged optional photo the manifest does not list", manifest(proof), "JOB_ACCESS_DENIED"],
            ["an optional manifest entry that was never staged", manifest(proof, optional, { photoUuid: id(), fieldPath: naPath, sourceSha256: "d".repeat(64) }), "JOB_ACCESS_DENIED"],
            ["a staged photo moved to a different path", manifest(proof, { ...optional, fieldPath: "main_function_key.function_checks.lamp_test" }), "JOB_ACCESS_DENIED"]
          ];
          for (const [label, evidenceManifest, code] of attempts) {
            const rejected = await syncCo2FormInstances([item(client, 1, responses, evidenceManifest as ReturnType<typeof manifest>)], actor);
            assert.equal(rejected.acceptedIds.length, 0, label); assert.equal(rejected.failed[0]?.code, code, label);
            assert.equal(await formCount(client), 0, `${label}: no form instance`);
            assert.ok((await rows(client)).every((row) => row.status === "staged" && row.form_instance_id === null), `${label}: nothing became accepted`);
          }
          const ok = await syncCo2FormInstances([item(client, 1, responses, manifest(proof, optional))], actor);
          assert.deepEqual(ok.acceptedIds, [client], JSON.stringify(ok));
          assert.deepEqual((await rows(client)).map((row) => row.status), ["accepted", "accepted"]);
        });

        await t.test("a Poor photo kept after the result flipped to Good is accepted as the optional photo; concurrent duplicate acceptance binds at most once", async () => {
          const client = id();
          const flipped = await stage(client, findingPath, "green"); // main_supply was Poor, is Good now
          const duplicate = item(client, 2, responsesFor(), manifest(flipped));
          const outcomes = await Promise.all([syncCo2FormInstances([duplicate], actor), syncCo2FormInstances([structuredClone(duplicate)], actor)]);
          const acceptedCount = outcomes.reduce((count, outcome) => count + outcome.acceptedIds.length, 0);
          assert.equal(acceptedCount, 1, JSON.stringify(outcomes));
          assert.equal(outcomes.reduce((count, outcome) => count + outcome.duplicateIds.length + outcome.failed.length, 0), 1, "the other racer is a duplicate or a safe failure");
          assert.equal(await formCount(client), 1);
          assert.deepEqual((await rows(client)).map((row) => row.status), ["accepted"]);
          assert.deepEqual((await syncCo2FormInstances([duplicate], actor)).duplicateIds, [client]);
        });

        await t.test("identical optional photo bytes on two locations of one Job race: at most one is accepted, the loser is told which field conflicts", async () => {
          const left = id(), right = id();
          const leftPhoto = await stage(left, goodPath, "red"); const rightPhoto = await stage(right, goodPath, "red");
          assert.equal(leftPhoto.sourceSha256, rightPhoto.sourceSha256, "same bytes");
          const outcomes = await Promise.all([syncCo2FormInstances([item(left, 3, responsesFor(), manifest(leftPhoto))], actor), syncCo2FormInstances([item(right, 4, responsesFor(), manifest(rightPhoto))], actor)]);
          assert.equal(outcomes.reduce((count, outcome) => count + outcome.acceptedIds.length, 0), 1, JSON.stringify(outcomes));
          const loser = outcomes.flatMap((outcome) => outcome.failed);
          assert.equal(loser.length, 1); assert.equal(loser[0]!.code, "EVIDENCE_CONFLICT");
          const acceptedRows = await database.query("SELECT 1 FROM staged_inspection_evidence WHERE inspection_client_uuid=ANY($1::uuid[]) AND status='accepted'", [[left, right]]);
          assert.equal(acceptedRows.rowCount, 1, "exactly one accepted binding for the shared bytes");
          const loserClient = loser[0]!.id === left ? left : right; const loserIndex = loserClient === left ? 3 : 4;
          assert.equal(await formCount(loserClient), 0, "the loser left no form behind");
          // The loser retakes the photo under a fresh form UUID and is accepted.
          const retry = id(); const fresh = await stage(retry, goodPath, "teal");
          assert.deepEqual((await syncCo2FormInstances([item(retry, loserIndex, responsesFor(), manifest(fresh))], actor)).acceptedIds, [retry]);
        });

        await database.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,completed_by_display_name='cr01',report_number='TEST/' || id::text,technician_team_snapshot='[]'::jsonb WHERE id=$1", [job, actor]);
        await t.test("an exact retry after the Job closed is the same authority; a genuinely new acceptance is refused", async () => {
          assert.ok(firstItem, "the first acceptance ran");
          const replay = await syncCo2FormInstances([firstItem!], actor);
          assert.deepEqual(replay.duplicateIds, [firstItem!.entityId], "same accepted authority, never JOB_CLOSED");
          assert.equal(replay.failed.length, 0);
          const fresh = item(id(), 0, responsesFor(), []);
          assert.equal((await syncCo2FormInstances([fresh], actor)).failed[0]?.code, "JOB_ACCESS_DENIED");
        });

        await t.test("the Final Report and PDF embed the required and the optional photo bytes", async () => {
          const report = await loadFinalServiceReport(job, database);
          assert.equal(report.sections.length, 5);
          const acceptedRows = await database.query<{ location_id: string; field_path: string; stored_sha256: string }>("SELECT form.location_id,evidence.field_path,evidence.stored_sha256 FROM staged_inspection_evidence evidence INNER JOIN master_system_form_instances form ON form.id=evidence.form_instance_id WHERE evidence.status='accepted' AND evidence.job_id=$1", [job]);
          assert.equal(acceptedRows.rowCount, 8, "3 + 2 + 1 + 2 accepted photos");
          assert.equal(report.sections.reduce((count, section) => count + section.evidence.length, 0), 8, "every accepted photo - required or optional - is in the report");
          assert.deepEqual(report.sections.flatMap((section) => section.evidence.map((entry) => createHash("sha256").update(entry.content).digest("hex"))).sort(), acceptedRows.rows.map((row) => row.stored_sha256).sort(), "report bytes are exactly the accepted bytes");
          for (const section of report.sections) {
            assert.deepEqual(section.evidence.map((entry) => entry.field).sort(), acceptedRows.rows.filter((row) => row.location_id === section.location?.locationId).map((row) => row.field_path).sort(), "each location reports only its own accepted photos");
          }
          const pdf = await renderFinalServiceReportPdf(report);
          assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
          assert.ok((pdf.toString("latin1").match(/\/DCTDecode/g) ?? []).length >= 8, "the PDF physically embeds every accepted JPEG");
        });
      } finally { server.close(); await once(server, "close"); }
    } finally { await isolationLock.query("SELECT pg_advisory_unlock(819276)").catch(() => undefined); isolationLock.release(); await database.end(); await rm(uploads, { recursive: true, force: true }); }
  });
}
