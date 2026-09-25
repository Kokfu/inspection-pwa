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
import { syncFm200FormInstances } from "./fm200FormInstanceSync.js";
import { loadFinalServiceReport, renderFinalServiceReportPdf } from "../reports/finalServiceReport.js";
import { v7IntegrationDatabaseUrl } from "./v7IntegrationTestDatabase.js";

/**
 * FM200 clone of `co2V7.integration.test.ts`, retargeted at the independent
 * `fm200_fire_suppression` system key / `syncFm200FormInstances` handler and
 * the `/fm200-inspections/:clientUuid` route, using a different advisory-lock
 * id so it can run concurrently with the CO2 integration test against the
 * same disposable database.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const time = "2026-09-01T00:00:00.000Z";
const result = (value: "good" | "not_good" | "complete_repair" | "na", remarks = "") => ({ result: value, remarks });
const checklist = (keys: readonly string[], finding: string, na: string) => Object.fromEntries(keys.map((key) => [key, key === finding ? result("not_good", `${key} own remark`) : key === na ? result("na") : result("good")]));

test("FM200 V7 stages distinct multipart evidence and atomically binds it to its own location form, independent of CO2", { skip: !databaseUrl }, async (t) => {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const isolationLock = await database.connect(); await isolationLock.query("SELECT pg_advisory_lock(819277)");
  const uploads = path.join(tmpdir(), `phase8f-fm200-v7-${id()}`);
  process.env.UPLOADS_PATH = uploads;
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fm200_fire_suppression'")).rows[0]!;
    assert.ok(template, "fm200_fire_suppression must be seeded on V7");
    const customer = id(), revision = id(), enabled = id(), zone = id(), location = id(), locationB = id(), locationC = id(), job = id(), clientUuid = id();
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'FM200 V7',true)", [customer, `FM200-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fm200_fire_suppression',1,'{}')", [enabled, revision, template.id]);
    await database.query("INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,'z','Zone',1)", [zone, enabled]);
    await database.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,sort_order) VALUES($1,$2,$3,'fm200','FM200 Room',1),($4,$2,$3,'fm200-b','FM200 Room B',2),($5,$2,$3,'fm200-c','FM200 Room C',3)", [location, enabled, zone, locationB, locationC]);
    const system = { enabledSystemId: enabled, systemKey: "fm200_fire_suppression", displayName: "FM200 System", sortOrder: 12, definitionStatus: "confirmed", zones: [{ id: zone, key: "z", displayName: "Zone", sortOrder: 1 }], locations: [{ id: location, zoneId: zone, key: "fm200", displayName: "FM200 Room", sortOrder: 1 }, { id: locationB, zoneId: zone, key: "fm200-b", displayName: "FM200 Room B", sortOrder: 2 }, { id: locationC, zoneId: zone, key: "fm200-c", displayName: "FM200 Room C", sortOrder: 3 }] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `FM200-${customer}`, displayName: "FM200 V7" }, site: { id: id(), displayName: "FM200 V7 Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'FM200 V7','open',false,true,$4,$5,$6,'2026-09-01')", [job, template.id, `FM200-${job}`, customer, revision, snapshot]);
    const actor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fm200-v7-${id()}`])).rows[0]!.id;
    const foreignActor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fm200-v7-foreign-${id()}`])).rows[0]!.id;
    const adminActor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','admin') RETURNING id", [`fm200-admin-${id()}`])).rows[0]!.id;
    const supervisorActor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','supervisor') RETURNING id", [`fm200-supervisor-${id()}`])).rows[0]!.id;
    const contract = v7EvidenceContractSha256(template.definition);
    const response = { controlPanelLocation: "FM200 Room", detectorRows: [{ rowUuid: id(), displaySequence: 1, alarmZone: "Zone", location: "FM200 Room", heatDetectorStatus: ["normal", "test"], smokeDetectorStatus: ["test"], remarks: "" }, { rowUuid: id(), displaySequence: 2, alarmZone: "Zone", location: "FM200 Room", heatDetectorStatus: ["isolation"], smokeDetectorStatus: ["normal"], remarks: "" }], chargerAndBatteries: checklist(["main_supply", "battery", "charger"], "main_supply", "charger"), physicalOutlook: checklist(["co2_cylinder", "electric_actuator", "manual_release_key", "alarm_bell", "twin_flashing_light", "24v_dc_tripping_device", "manual_pull_station", "high_pressure_hose", "discharge_nozzles", "pilot_cylinder"], "co2_cylinder", "pilot_cylinder"), mainFunctionKeys: checklist(["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "signal_alarm_to_mfap"], "not-a-field", "signal_alarm_to_mfap"), comments: "" };
    response.chargerAndBatteries.main_supply.remarks = "Runtime FM200 Poor A";
    response.physicalOutlook.co2_cylinder.remarks = "Runtime FM200 Poor B";
    await database.query("UPDATE inspection_jobs SET created_by_user_id=$1 WHERE id=$2", [actor, job]);
    const app = express(); app.use(express.json()); app.use((request, _response, next) => { const requested = request.header("x-test-actor"); if (requested !== "none") { const userId = requested === "admin" ? adminActor : requested === "supervisor" ? supervisorActor : requested === "foreign" ? foreignActor : actor; request.currentUser = { id: userId, username: "fm200", role: requested === "admin" ? "admin" : requested === "supervisor" ? "supervisor" : "inspector" }; } next(); }); app.use(stagedEvidenceRouter); app.use(masterSystemInspectionsRouter); app.use(syncRouter);
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const stage = async (inspectionClientUuid: string, fieldPath: string, color: string, options: { actor?: "owner" | "foreign" | "admin"; photoUuid?: string; quality?: number; jobId?: string; systemKey?: string; templateId?: string; contractSha256?: string } = {}) => { const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: color } }).jpeg({ quality: options.quality ?? 80 }).toBuffer(); const photoUuid = options.photoUuid ?? id(); const form = new FormData(); const values: Record<string, string> = { photoUuid, inspectionClientUuid, jobId: options.jobId ?? job, systemKey: options.systemKey ?? "fm200_fire_suppression", fieldPath, masterTemplateId: options.templateId ?? template.id, masterTemplateVersion: "7", contractSha256: options.contractSha256 ?? contract, captureSource: "camera", capturedAt: time, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: String(bytes.length), width: "2", height: "2" }; for (const [key, value] of Object.entries(values)) form.set(key, value); form.set("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "photo.jpg"); const http = await fetch(`${origin}/v7-evidence/stage`, { method: "POST", body: form, headers: options.actor ? { "x-test-actor": options.actor } : undefined }); return { http, photoUuid, fieldPath, sourceSha256: values.sha256 }; };
    const manifest = (...evidence: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>) => evidence.map(({ photoUuid, fieldPath, sourceSha256 }) => ({ photoUuid, fieldPath, sourceSha256 })).sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
    try {
      const a = await stage(clientUuid, "charger_batteries.charger_battery_checks.main_supply", "white"); const b = await stage(clientUuid, "physical_outlook.physical_outlook_checks.co2_cylinder", "black"); assert.equal(a.http.status, 201); assert.equal(b.http.status, 201);
      const item = { operationId: id(), entityType: "masterSystemFormInstance", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "fm200_fire_suppression", instanceKey: `location:${location}`, configuredZoneId: zone, configuredLocationId: location, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: time, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" }, instance: { instanceKey: `location:${location}`, displaySequence: 1 } }, responses: response, evidenceManifest: manifest(a, b), performedAt: time } };
      const accepted = await syncFm200FormInstances([item], actor); assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
      const evidence = await database.query<{ status: string; form_instance_id: string | null }>("SELECT status,form_instance_id FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 ORDER BY field_path", [clientUuid]); assert.deepEqual(evidence.rows.map((row) => row.status), ["accepted", "accepted"]); assert.ok(evidence.rows.every((row) => row.form_instance_id)); assert.equal(new Set(evidence.rows.map((row) => row.form_instance_id)).size, 1);
      const exactRetry = await syncFm200FormInstances([item], actor); assert.deepEqual(exactRetry.duplicateIds, [clientUuid]);
      const changedResponse = structuredClone(item); (changedResponse.payload.responses as Record<string, unknown>).comments = "changed"; assert.equal((await syncFm200FormInstances([changedResponse], actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
      assert.equal((await syncFm200FormInstances([item], foreignActor)).failed[0]?.code, "JOB_ACCESS_DENIED");

      // G9: the same bytes on another configured FM200 location are a permanent
      // job+system conflict, scoped independently of CO2's own conflicts.
      const conflictingClient = id();
      const conflictingA = await stage(conflictingClient, "charger_batteries.charger_battery_checks.main_supply", "white");
      const conflictingB = await stage(conflictingClient, "physical_outlook.physical_outlook_checks.co2_cylinder", "orange");
      const conflictingItem = structuredClone(item); conflictingItem.operationId = id(); conflictingItem.entityId = conflictingClient; conflictingItem.payload.clientUuid = conflictingClient; conflictingItem.payload.instanceKey = `location:${locationB}`; conflictingItem.payload.configuredLocationId = locationB; conflictingItem.payload.displaySequence = 2; conflictingItem.payload.inspectionSnapshot.instance = { instanceKey: `location:${locationB}`, displaySequence: 2 }; conflictingItem.payload.evidenceManifest = manifest(conflictingA, conflictingB);
      assert.deepEqual(
        { ...(await syncFm200FormInstances([conflictingItem], actor)).failed[0], id: undefined },
        { id: undefined, code: "EVIDENCE_CONFLICT", message: "V7 evidence for charger_batteries.charger_battery_checks.main_supply is already bound to another location in this Job" },
        "cross-location reuse is a truthful terminal evidence conflict (G9)"
      );

      const clientB = id(); const bA = await stage(clientB, "charger_batteries.charger_battery_checks.main_supply", "red"); const bB = await stage(clientB, "physical_outlook.physical_outlook_checks.co2_cylinder", "green"); assert.equal(bA.http.status, 201); assert.equal(bB.http.status, 201);
      const itemB = structuredClone(item); itemB.operationId = id(); itemB.entityId = clientB; itemB.payload.clientUuid = clientB; itemB.payload.instanceKey = `location:${locationB}`; itemB.payload.configuredLocationId = locationB; itemB.payload.displaySequence = 2; itemB.payload.inspectionSnapshot.instance = { instanceKey: `location:${locationB}`, displaySequence: 2 }; itemB.payload.evidenceManifest = manifest(bA, bB);
      const invalid = structuredClone(itemB); (invalid.payload.responses.physicalOutlook as Record<string, { result: string; remarks: string }>).co2_cylinder.remarks = "";
      assert.equal((await syncFm200FormInstances([invalid], actor)).failed[0]?.code, "VALIDATION_ERROR");
      const acceptedB = await syncFm200FormInstances([itemB], actor); assert.deepEqual(acceptedB.acceptedIds, [clientB]);
      const detail = await fetch(`${origin}/fm200-inspections/${clientUuid}`); assert.equal(detail.status, 200, "owner reads accepted FM200 V7 detail"); const detailBody = await detail.json() as { inspection?: { responses?: typeof response; template?: { version?: number }; systemLabel?: string } }; assert.equal(detailBody.inspection?.template?.version, 7); assert.equal(detailBody.inspection?.systemLabel, "FM200 System"); assert.equal(detailBody.inspection?.responses?.chargerAndBatteries.main_supply.remarks, "Runtime FM200 Poor A"); assert.equal(detailBody.inspection?.responses?.physicalOutlook.co2_cylinder.remarks, "Runtime FM200 Poor B"); assert.equal(detailBody.inspection?.responses?.physicalOutlook.co2_cylinder.result, "not_good");
      await assert.rejects(() => database.query("DELETE FROM customer_system_locations WHERE id=$1", [location]), /Accepted form still references this customer system location/, "accepted configured locations retain FK-equivalent delete protection");
      assert.equal((await fetch(`${origin}/fm200-inspections/${clientUuid}`, { headers: { "x-test-actor": "foreign" } })).status, 404, "foreign actor cannot load another actor's FM200 V7 accepted detail");

      // T5c-equivalent (owner decision, merge review): a supervisor reviews any accepted
      // FM200 record, including one owned by a different technician, unlike a foreign
      // technician above. Matches the same widening already applied to the other 8 V7
      // systems and to FM200's own evidence routes.
      const supervisorDetail = await fetch(`${origin}/fm200-inspections/${clientUuid}`, { headers: { "x-test-actor": "supervisor" } });
      assert.equal(supervisorDetail.status, 200, "supervisor reads accepted FM200 V7 detail for a job they do not own");
      const supervisorDetailBody = await supervisorDetail.json() as { inspection?: { systemLabel?: string } };
      assert.equal(supervisorDetailBody.inspection?.systemLabel, "FM200 System");

      const clientD = id(); const dA = await stage(clientD, "charger_batteries.charger_battery_checks.main_supply", "yellow"); const dB = await stage(clientD, "physical_outlook.physical_outlook_checks.co2_cylinder", "purple"); assert.equal(dA.http.status, 201); assert.equal(dB.http.status, 201); const itemD = structuredClone(itemB); itemD.operationId = id(); itemD.entityId = clientD; itemD.payload.clientUuid = clientD; itemD.payload.instanceKey = `location:${locationC}`; itemD.payload.configuredLocationId = locationC; itemD.payload.displaySequence = 3; itemD.payload.inspectionSnapshot.instance = { instanceKey: `location:${locationC}`, displaySequence: 3 }; itemD.payload.evidenceManifest = manifest(dA, dB); assert.deepEqual((await syncFm200FormInstances([itemD], actor)).acceptedIds, [clientD]);
      await database.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,completed_by_display_name='fm200-v7', report_number='TEST/' || id::text, technician_team_snapshot='[]'::jsonb WHERE id=$1", [job, actor]); assert.deepEqual((await syncFm200FormInstances([item], actor)).duplicateIds, [clientUuid]); const closedChanged = structuredClone(item); closedChanged.payload.responses.comments = "closed change"; assert.equal((await syncFm200FormInstances([closedChanged], actor)).failed[0]?.code, "IDEMPOTENCY_CONFLICT");
      const report = await loadFinalServiceReport(job, database); assert.equal(report.sections.length, 3, "closed FM200 job reports exactly its accepted locations"); assert.equal(report.sections.reduce((count, section) => count + section.evidence.length, 0), 6, "report uses only accepted finding evidence");
      const pdf = await renderFinalServiceReportPdf(report); assert.equal(pdf.subarray(0, 5).toString(), "%PDF-"); assert.ok((pdf.toString("latin1").match(/\/DCTDecode/g) ?? []).length >= 6, "PDF physically embeds accepted JPEG evidence");
    } finally { server.close(); await once(server, "close"); }
  } finally { await isolationLock.query("SELECT pg_advisory_unlock(819277)").catch(() => undefined); isolationLock.release(); await database.end(); await rm(uploads, { recursive: true, force: true }); }
});

test("FM200 V7 accepts a no-preset General location, retries exactly, and leaves CO2 unaffected", { skip: !databaseUrl }, async () => {
  const database = new pg.Pool({ connectionString: databaseUrl });
  const isolationLock = await database.connect(); await isolationLock.query("SELECT pg_advisory_lock(819277)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(database);
    const template = (await database.query<{ id: string; definition: unknown }>("SELECT template.id,system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='fm200_fire_suppression'")).rows[0]!;
    const co2Template = (await database.query<{ id: string }>("SELECT template.id FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='co2_fire_extinguisher'")).rows[0]!;
    assert.equal(co2Template.id, template.id, "CO2 and FM200 share the same V7 template row, but remain independent system keys");
    const customer = id(), revision = id(), enabled = id(), zone = id(), location = id(), job = id(), clientUuid = id();
    await database.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'FM200 V7 Clean',true)", [customer, `FM200C-${customer}`]);
    await database.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await database.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fm200_fire_suppression',1,'{}')", [enabled, revision, template.id]);
    const system = { enabledSystemId: enabled, systemKey: "fm200_fire_suppression", displayName: "FM200 System", sortOrder: 12, definitionStatus: "confirmed", zones: [{ id: zone, enabledSystemId: enabled, key: "general", displayName: "General", sortOrder: 1 }], locations: [{ id: location, enabledSystemId: enabled, zoneId: zone, key: "general", displayName: "General", presetRowCount: 1, rowPreset: {}, sortOrder: 1 }] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `FM200C-${customer}`, displayName: "FM200 V7 Clean", contactPhone: null, contactPerson: null, fax: null, contractNumber: null, serviceFrequency: null }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await database.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'FM200 V7 Clean','open',false,true,$4,$5,$6,'2026-09-05')", [job, template.id, `FM200C-${job}`, customer, revision, snapshot]);
    const allGood = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, result("good")]));
    const response = {
      controlPanelLocation: "FM200 Room",
      detectorRows: [{ rowUuid: id(), displaySequence: 1, alarmZone: "Zone", location: "FM200 Room", heatDetectorStatus: ["normal"], smokeDetectorStatus: ["normal"], remarks: "" }],
      chargerAndBatteries: allGood(["main_supply", "battery", "charger"]),
      physicalOutlook: allGood(["co2_cylinder", "electric_actuator", "manual_release_key", "alarm_bell", "twin_flashing_light", "24v_dc_tripping_device", "manual_pull_station", "high_pressure_hose", "discharge_nozzles", "pilot_cylinder"]),
      mainFunctionKeys: allGood(["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "signal_alarm_to_mfap"]),
      comments: ""
    };
    const item = { operationId: id(), entityType: "masterSystemFormInstance", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: job, systemKey: "fm200_fire_suppression", instanceKey: `location:${location}`, configuredZoneId: zone, configuredLocationId: location, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: time, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" }, instance: { instanceKey: `location:${location}`, displaySequence: 1 } }, responses: response, evidenceManifest: [], performedAt: time } };
    const actorId = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','inspector') RETURNING id", [`fm200-v7-clean-${id()}`])).rows[0]!.id;
    const accepted = await syncFm200FormInstances([item], actorId);
    assert.deepEqual(accepted.acceptedIds, [clientUuid], JSON.stringify(accepted));
    await runMigrations(database);
    assert.deepEqual((await syncFm200FormInstances([item], actorId)).duplicateIds, [clientUuid], "the exact General-location retry is idempotent");
    assert.equal((await database.query("SELECT 1 FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid])).rowCount, 1);
    assert.equal((await database.query("SELECT 1 FROM master_system_inspections WHERE job_id=$1 AND system_key='co2_fire_extinguisher'", [job])).rowCount, 0, "FM200 acceptance creates no CO2 row");
    await database.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,completed_by_display_name='fm200-v7', report_number='TEST/' || id::text, technician_team_snapshot='[]'::jsonb WHERE id=$1", [job, actorId]);
    const report = await loadFinalServiceReport(job, database);
    assert.equal(report.sections.length, 1, "the no-preset General FM200 form appears in the final report with the current customer snapshot");
    assert.equal(report.sections[0]?.systemKey, "fm200_fire_suppression");
  } finally { await isolationLock.query("SELECT pg_advisory_unlock(819277)").catch(() => undefined); isolationLock.release(); await database.end(); }
});
