import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { createRepairVisitReadsRouter } from "../routes/repairVisitReads.js";
import { fixture, systems, setResult } from "./fieldCatalogFixtures.test-support.js";
import { readFindingParts, type R } from "./fieldCatalogReaders.js";
import { fingerprint } from "./fieldCatalogSource.js";
import { listPreviousVisits } from "./previousVisits.js";
import { readPreviousVisitCatalog } from "./fieldCatalog.js";
import type { CurrentUser } from "../auth/authTypes.js";
import { legacyFireAlarmV7Fixture } from "./historicalFixtures.test-support.js";

const url = process.env.SEED_INTEGRATION_DATABASE_URL;
assert.ok(url, "Cold disposable database required"); assert.equal(process.env.DATABASE_URL, url); assert.equal(process.env.NODE_ENV, "test");
assert.equal(new URL(url).hostname, "127.0.0.1"); assert.equal(new URL(url).port, "55432"); assert.equal(new URL(url).pathname, "/phase6_seed_integration");
const id = () => randomUUID();
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("cold read API: all systems, service and repair authority, own visits and protected Before bytes", { timeout: 120000 }, async t => {
  const db = new pg.Pool({ connectionString: url }); const lock = await db.connect(); await lock.query("SELECT pg_advisory_lock(819276)");
  const uploads = await mkdtemp(path.join(tmpdir(), "rv-2b-")); process.env.UPLOADS_PATH = uploads;
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public"); await runMigrations(db);
    const actor = async (role: CurrentUser["role"]): Promise<CurrentUser> => {
      const username = `rv-${id()}`;
      const row = (await db.query("INSERT INTO users(username,password_hash,role) VALUES($1,'fixture',$2) RETURNING id", [username, role])).rows[0];
      return { id: Number(row.id), username, role };
    };
    const owner = await actor("inspector"), foreign = await actor("inspector"), manager = await actor("supervisor"), admin = await actor("admin");
    const testSites = new Map<string, string>();
    let seedSequence = 0;
    async function seed(row:R, evidence: Array<{fieldPath:string;photoUuid:string;sourceSha256:string}>) {
      const snap=row.inspectionSnapshot as R, customer=snap.customer as R, config=snap.configuration as R, template=snap.template as R;
      const siteId=id(); testSites.set(String(row.jobId),siteId); const reference=`SV-20261012-${++seedSequence}`;row.jobReference=reference;(snap.job as R).reference=reference;
      const enabled=id(), group=id();
      customer.displayName=`Fixture ${customer.id}`;row.customerName=customer.displayName;
      await db.query("INSERT INTO customers(id,customer_code,display_name) VALUES($1,$2,$3)",[customer.id,`fixture-${customer.id}`,customer.displayName]);
      // Historical Fire Alarm reads require the original code; keep snapshot and DB identical.
      customer.code=`fixture-${customer.id}`; if (row.systemKey==="fire_alarm_detector") row.customerCode=customer.code;
      await db.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')",[config.revisionId,customer.id,template.id]);
      await db.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,$4,1,'{}')",[enabled,config.revisionId,template.id,row.systemKey]);
      if (row.locationId) await db.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,sort_order) VALUES($1,$2,NULL,'room','Room',1)",[row.locationId,enabled]);
      await db.query("INSERT INTO customer_sites(id,customer_id,site_code,display_name) VALUES($1,$2,$3,'Fixture site')",[siteId,customer.id,siteId]);
      const jobSnapshot={customer,site:{id:siteId,displayName:"Fixture site"},template,configuration:config,enabledSystems:[{enabledSystemId:enabled,systemKey:row.systemKey,definitionStatus:"confirmed",zones:[],locations:row.locationId?[{id:row.locationId,zoneId:null,key:"room",displayName:"Room",sortOrder:1}]:[]}]};
      await db.query(`INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id,site_id)
        VALUES($1,$2,$7,'fixture','open',false,true,$3,$4,$5,'2026-10-12',$6,$8)`,[row.jobId,template.id,customer.id,config.revisionId,jobSnapshot,owner.id,reference,siteId]);
      await db.query("INSERT INTO master_system_inspections(id,job_id,system_key) VALUES($1,$2,$3)",[group,row.jobId,row.systemKey]);
      // Insert a validated accepted fixture through the existing DB identity guards.
      const extracted=readFindingParts(row);
      await db.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id)
        VALUES($1,$2,$3,$4,NULL,$5,1,$6,$7,$8,$9,$8,$10,$11,'submitted','2026-10-12T00:00:00Z',$12)`,[row.serverFormInstanceId,group,row.clientUuid,row.instanceKey,row.locationId,template.id,config.revisionId,snap.schemaVersion,snap,row.responses,fingerprint(row),owner.id]);
      const paths=extracted.manifest ?? evidence;
      if (paths.length) await db.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[row.clientUuid,row.jobId,row.systemKey,template.id,template.version,extracted.contractSha256,owner.id]);
      for (const [index,m] of paths.entries()) {
        const bytes=await sharp({create:{width:2,height:2,channels:3,background:{r:index*7%255,g:80,b:130}}}).jpeg().toBuffer();
        const relative=`inspections/${row.clientUuid}/${m.photoUuid}.jpg`;await mkdir(path.dirname(path.join(uploads,relative)),{recursive:true});await writeFile(path.join(uploads,relative),bytes);
        // Manifest source hashes are deliberately distinct from normalized stored hashes.
        await db.query(`INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status,form_instance_id,accepted_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'image/jpeg',$13,2,2,$13,2,2,$14,'accepted',$15,now())`,[m.photoUuid,row.clientUuid,row.jobId,row.systemKey,m.fieldPath,template.id,template.version,extracted.contractSha256,owner.id,fingerprint(m),m.sourceSha256||hash(bytes),hash(bytes),bytes.length,relative,row.serverFormInstanceId]);
      }
      return row;
    }


    const seeded: R[] = [];
    for (const system of systems) {
      const f = fixture(system), paths = f.adapter.derivePoorFieldPaths(f.response)!;
      // Keep one Not Good and two Good fields, one with optional evidence.
      paths.slice(1).forEach(p => setResult(system, f.response, p, "good"));
      const photoPaths = f.adapter.derivePhotoFieldPaths(f.response)!;
      const selected = [...photoPaths.required, ...photoPaths.optional.slice(0, 1)];
      f.manifest.splice(0, f.manifest.length, ...selected.map((fieldPath, index) => ({ fieldPath, photoUuid: id(), sourceSha256: index.toString(16).padStart(64, "0") })));
      const row = await seed(f.row, f.manifest); seeded.push(row);
      const snapshot = row.inspectionSnapshot as R, customerId = String((snapshot.customer as R).id), siteId = testSites.get(String(row.jobId))!;
      await approve(row);
      const fields = await readPreviousVisitCatalog(db, owner, customerId, siteId, { kind: "service", visitId: String(row.jobId) });
      assert.ok(fields.length > 0, system); assert.equal(fields[0]!.before!.result, "not_good", system);
      if (fields.filter(f => f.before?.result === "good").length > 1) {
        assert.ok(fields.some(f => f.before?.result === "good" && f.before.photo), system);
        assert.ok(fields.some(f => f.before?.result === "good" && !f.before.photo), system);
      }
      assert.ok(!JSON.stringify(fields).includes("storageRelativePath"));
    }
    async function approve(row: R, sequence = 1, decision = "approved") {
      await db.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,report_number=$3,technician_team_snapshot='[]'::jsonb WHERE id=$1 AND status='open'", [row.jobId, owner.id, `MFE/SR/2026/${id()}`]);
      await db.query(`INSERT INTO report_approvals(id,job_id,decision,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
        VALUES($1,$2,$3,$4,'supervisor',$5,$6,$7)`, [id(), row.jobId, decision, manager.id, sequence, id(), "a".repeat(64)]);
    }
    const row = seeded.find(r => r.systemKey === "hydrant")!, snapshot = row.inspectionSnapshot as R;
    const customerId = String((snapshot.customer as R).id), siteId = testSites.get(String(row.jobId))!;
    const previous = { kind: "service" as const, visitId: String(row.jobId) };
    const base = `/repair-visits/customers/${customerId}/sites/${siteId}`;
    const app = express(); app.use((req, _res, next) => { const who = req.header("x-test-user"); req.currentUser = who === "owner" ? owner : who === "foreign" ? foreign : who === "manager" ? manager : who === "admin" ? admin : undefined; next(); });
    app.use(createRepairVisitReadsRouter(db));
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const get = (route: string, user = "owner") => fetch(`http://127.0.0.1:${address.port}${route}`, { headers: { "x-test-user": user } });
    await t.test("HTTP auth, scope, strict parameters and private responses", async () => {
      assert.equal((await get(`${base}/previous-visits`, "")).status, 401);
      assert.equal((await get(`${base}/previous-visits`, "foreign")).status, 200);
      assert.deepEqual((await (await get(`${base}/previous-visits`, "foreign")).json()).visits, []);
      assert.equal((await get(`${base}/previous-visits/service/${row.jobId}/catalog`, "foreign")).status, 404);
      assert.equal((await get(`${base}/previous-visits/service/${row.jobId}/catalog`, "manager")).status, 200);
      assert.equal((await get(`${base}/previous-visits/service/${row.jobId}/catalog`, "admin")).status, 200);
      assert.equal((await get(`${base}/previous-visits?foreign=true`)).status, 400);
      assert.equal((await get(`${base}/previous-visits/other/${row.jobId}/catalog`)).status, 400);
      assert.equal((await get(`${base}/previous-visits/service/no-uuid/catalog`)).status, 400);
      const response = await get(`${base}/previous-visits`); assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal((await response.json()).visits.length, 1);
      const enabled = (await db.query("SELECT id FROM customer_enabled_systems WHERE configuration_revision_id=$1", [(snapshot.configuration as R).revisionId])).rows[0].id;
      await db.query(`INSERT INTO customer_system_locations(id,enabled_system_id,location_key,display_name,sort_order,preset_row_count,row_preset)
        VALUES($1,$2,'saved','Saved Room',1,2,$3)`, [id(), enabled, { rows: [{ assetReference: "H1", locationText: "Level 1" }, { assetReference: "H2", locationText: "Level 2" }] }]);
      const current = await get(`${base}/catalog`); assert.equal(current.status, 200);
      const configured = (await current.json()).fields;
      assert.equal(new Set(configured.map((f: { identity: { rowUuid: string } }) => f.identity.rowUuid)).size, 2);
      assert.ok(configured.every((f: { before: unknown }) => f.before === null));
      // Supported count-only layouts and duplicate labels must not make the
      // customer's entire no-previous catalog unavailable.
      await db.query("UPDATE customer_system_locations SET row_preset='{}'::jsonb WHERE enabled_system_id=$1", [enabled]);
      const unnamed = await get(`${base}/catalog`); assert.equal(unnamed.status, 200);
      assert.equal(new Set((await unnamed.json()).fields.map((f: { identity: { rowUuid: string } }) => f.identity.rowUuid)).size, 2);
      await db.query("UPDATE customer_system_locations SET row_preset=$2 WHERE enabled_system_id=$1", [enabled, { rows: [{ assetReference: "", locationText: "Saved Room" }, { assetReference: "", locationText: "Saved Room" }] }]);
      const duplicate = await get(`${base}/catalog`); assert.equal(duplicate.status, 200);
      assert.equal(new Set((await duplicate.json()).fields.map((f: { identity: { rowUuid: string } }) => f.identity.rowUuid)).size, 2);
      assert.equal((await get(`/repair-visits/customers/${customerId}/sites/${id()}/catalog`)).status, 404);
      assert.equal((await get(`/repair-visits/customers/${customerId}/sites/${id()}/previous-visits/service/${row.jobId}/catalog`)).status, 404);
      const photo = (await readPreviousVisitCatalog(db, owner, customerId, siteId, previous))[0]!.before!.photo!;
      const photoPath = `${base}/previous-visits/service/${row.jobId}/photos/${photo.photoUuid}/content`;
      const image = await get(photoPath); assert.equal(image.status, 200); assert.equal(image.headers.get("content-type"), "image/jpeg");
      assert.equal(hash(Buffer.from(await image.arrayBuffer())), photo.storedSha256);
      assert.equal((await get(photoPath, "foreign")).status, 404);
      assert.equal((await get(`${base}/previous-visits/service/${row.jobId}/photos/${id()}/content`)).status, 404);
    });
    await t.test("approved frozen earlier Fire Alarm V7 lists and serves every result and bound Before photo", async () => {
      const legacy = legacyFireAlarmV7Fixture();
      await seed(legacy, []); await approve(legacy);
      const legacyCustomer = String(((legacy.inspectionSnapshot as R).customer as R).id);
      const legacySite = testSites.get(String(legacy.jobId))!;
      const legacyBase = `/repair-visits/customers/${legacyCustomer}/sites/${legacySite}`;
      const previousPath = `${legacyBase}/previous-visits/service/${legacy.jobId}`;
      assert.equal((await (await get(`${legacyBase}/previous-visits`)).json()).visits[0].visitId, legacy.jobId);
      const response = await get(`${previousPath}/catalog`); assert.equal(response.status, 200);
      const fields = (await response.json()).fields;
      assert.equal(fields.length, 13);
      assert.equal(fields.filter((f: { before: { result: string } }) => f.before.result === "not_good").length, 10);
      assert.ok(fields.some((f: { before: { result: string; photo: unknown } }) => f.before.result === "good" && f.before.photo === null));
      assert.ok(fields.some((f: { before: { result: string; photo: unknown } }) => f.before.result === "na" && f.before.photo === null));
      const photo = fields[0].before.photo;
      const image = await get(`${previousPath}/photos/${photo.photoUuid}/content`); assert.equal(image.status, 200);
      assert.equal(hash(Buffer.from(await image.arrayBuffer())), photo.storedSha256);
      assert.equal((await get(`${previousPath}/catalog`, "foreign")).status, 404);
      const fieldPath = `secondaryAlarmDeviceRows.${((legacy.responses as R).secondaryAlarmDeviceRows as R[])[0]!.rowUuid}.fieldRemarks.alarmBell`;
      await db.query(`INSERT INTO inspection_corrections(id,form_instance_id,job_id,system_key,field_path,previous_value,new_value,reason,corrected_by_user_id,corrected_by_role,sequence,request_id,request_fingerprint)
        VALUES($1,$2,$3,'fire_alarm_detector',$4,$5,$6,'Correction fixture',$7,'supervisor',1,$8,$9)`,
      [id(), legacy.serverFormInstanceId, legacy.jobId, fieldPath, JSON.stringify("Own original remark"), JSON.stringify("Corrected legacy remark"), manager.id, id(), "a".repeat(64)]);
      assert.equal((await get(`${previousPath}/catalog`)).status, 404);
      await approve(legacy, 2);
      const corrected = await get(`${previousPath}/catalog`); assert.equal(corrected.status, 200);
      assert.ok((await corrected.json()).fields.some((f: { before: { remark: string } }) => f.before.remark === "Corrected legacy remark"));
      assert.deepEqual((await db.query("SELECT response_payload FROM master_system_form_instances WHERE id=$1", [legacy.serverFormInstanceId])).rows[0].response_payload, legacy.responses);
    });
    await t.test("zoned Roller Shutter catalogs preserve unit selection and exact accepted Before bindings", async () => {
      const f = fixture("fire_rated_roller_shutter");
      f.response.schemaVersion = 2;
      const shutterRows = f.response.rows as R[];
      Object.assign(shutterRows[0]!, { assetReference: "S1", locationText: "Lobby", zoneText: "North" });
      shutterRows.push({ ...structuredClone(shutterRows[0]!), rowUuid: id(), sortOrder: 2, zoneText: "South" });
      f.snapshot.evidenceManifest = f.adapter.derivePhotoFieldPaths(f.response)!.required.map((fieldPath, index) => ({
        fieldPath, photoUuid: id(), sourceSha256: index.toString(16).padStart(64, "0") }));
      await seed(f.row, []); await approve(f.row);
      const shutterCustomer = String((f.snapshot.customer as R).id), shutterSite = testSites.get(String(f.row.jobId))!;
      const shutterBase = `/repair-visits/customers/${shutterCustomer}/sites/${shutterSite}`;
      const enabled = (await db.query("SELECT id FROM customer_enabled_systems WHERE configuration_revision_id=$1", [f.row.configurationRevisionId])).rows[0].id;
      const layoutRows = shutterRows.map(row => ({ assetReference: row.assetReference, locationText: row.locationText, zoneText: row.zoneText }));
      const location = id();
      await db.query(`INSERT INTO customer_system_locations(id,enabled_system_id,location_key,display_name,sort_order,preset_row_count,row_preset)
        VALUES($1,$2,'shutters','Lobby',1,2,$3)`, [location, enabled, { rows: layoutRows }]);
      const current = await get(`${shutterBase}/catalog`); assert.equal(current.status, 200);
      const currentFields = (await current.json()).fields;
      const units = (fields: Array<{ unitLabel: string; identity: { rowUuid: string; fieldKey: string } }>) => fields
        .filter(field => field.identity.fieldKey === "auto_alarm_mode").map(field => [field.unitLabel, field.identity.rowUuid]).sort();
      const identities = units(currentFields);
      assert.deepEqual(identities.map(([label]) => label), ["North / S1 / Lobby", "South / S1 / Lobby"]);
      assert.equal(new Set(identities.map(([, uuid]) => uuid)).size, 2);
      await db.query("UPDATE customer_system_locations SET row_preset=$2 WHERE id=$1", [location, { rows: layoutRows.reverse() }]);
      assert.deepEqual(units((await (await get(`${shutterBase}/catalog`)).json()).fields), identities);
      const previousPath = `${shutterBase}/previous-visits/service/${f.row.jobId}`;
      const previous = await get(`${previousPath}/catalog`); assert.equal(previous.status, 200);
      const previousFields = (await previous.json()).fields;
      for (const row of shutterRows) for (const fieldKey of ["auto_alarm_mode", "manual_mode"]) {
        const field = previousFields.find((field: { identity: { rowUuid: string; fieldKey: string } }) => field.identity.rowUuid === row.rowUuid && field.identity.fieldKey === fieldKey);
        assert.equal(field.unitLabel, `${row.zoneText} / S1 / Lobby`);
        const expectedPhoto: { fieldPath: string; photoUuid: string; sourceSha256: string } = f.snapshot.evidenceManifest.find(entry => entry.fieldPath.endsWith(`.${row.rowUuid}.${fieldKey}`))!;
        assert.equal(field.before.photo.photoUuid, expectedPhoto.photoUuid);
        const photo = await get(`${previousPath}/photos/${expectedPhoto.photoUuid}/content`); assert.equal(photo.status, 200);
        assert.equal(hash(Buffer.from(await photo.arrayBuffer())), field.before.photo.storedSha256);
      }
      assert.deepEqual((await db.query("SELECT response_payload FROM master_system_form_instances WHERE id=$1", [f.row.serverFormInstanceId])).rows[0].response_payload, f.response);
    });
    await t.test("withdrawal and later correction remove approval; historical templates excluded", async () => {
      await approve(row, 2, "withdrawn"); assert.equal((await listPreviousVisits(db, owner, customerId, siteId)).length, 0);
      await approve(row, 3);
      const path = "rows." + ((row.responses as R).rows as R[])[0]!.rowUuid + ".fieldRemarks.canvasHose1Result";
      await db.query(`INSERT INTO inspection_corrections(id,form_instance_id,job_id,system_key,field_path,previous_value,new_value,reason,corrected_by_user_id,corrected_by_role,sequence,request_id,request_fingerprint)
        VALUES($1,$2,$3,'hydrant',$4,$5,$6,'Test correction',$7,'supervisor',1,$8,$9)`, [id(), row.serverFormInstanceId, row.jobId, path, JSON.stringify("Own original remark"), JSON.stringify("Corrected remark"), manager.id, id(), "a".repeat(64)]);
      assert.equal((await listPreviousVisits(db, owner, customerId, siteId)).length, 0);
      await approve(row, 4);
      assert.equal((await readPreviousVisitCatalog(db, owner, customerId, siteId, previous))[0]!.before!.remark, "Corrected remark");
      // Real V1-V6 template IDs are never offered, even with approval events.
      const templateIds = (await db.query("SELECT id FROM master_service_report_templates WHERE version < 7")).rows;
      for (const template of templateIds) {
        const historicalId = id(), historicalRevision = id();
        await db.query(`INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,$4,'superseded')`, [historicalRevision, customerId, template.id, 2 + templateIds.indexOf(template)]);
        await db.query(`INSERT INTO inspection_jobs(id,job_reference,title,status,is_sample,customer_id,site_id,master_template_version_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id)
          VALUES($1,$2,'History','open',false,$3,$4,$5,$8,$6,'2026-10-12',$7)`, [historicalId, `SV-20261012-${1000 + templateIds.indexOf(template)}`, customerId, siteId, template.id, { template: { id: template.id, version: 6 } }, owner.id, historicalRevision]);
        await approve({ jobId: historicalId });
      }
      assert.equal((await listPreviousVisits(db, owner, customerId, siteId)).length, 1);
    });
    await t.test("repair visit exposes only its items and uses After as Before, Not Done first", async () => {
      const repair = id(), revisionId = (snapshot.configuration as R).revisionId;
      await db.query(`INSERT INTO repair_visits(client_uuid,visit_number,customer_id,site_id,created_by_user_id,configuration_revision_id,arrival_time,visit_date,created_on_device_at,request_fingerprint)
        VALUES($1,'RV-20261019-1',$2,$3,$4,$5,'10:00','2026-10-19',now(),$6)`, [repair, customerId, siteId, owner.id, revisionId, "a".repeat(64)]);
      for (const [index, outcome] of ["done_repair", "not_done"].entries()) {
        const item = id(), photo = id(), bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().toBuffer();
        await writeFile(path.join(uploads, `${photo}.jpg`), bytes);
        await db.query(`INSERT INTO repair_visit_items(client_uuid,visit_uuid,system_key,row_uuid,section_key,field_key,system_label,unit_label,section_label,field_label,outcome,remark,sort_order)
          VALUES($1,$2,'hydrant',$3,'hydrant_set','landing_valve','Hydrant','Room','Hydrant Set','Landing Valve',$4,'After remark',$5)`, [item, repair, id(), outcome, index]);
        await db.query(`INSERT INTO repair_visit_photos(photo_uuid,visit_uuid,item_uuid,revision,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,storage_relative_path,mime_type,size_bytes,width,height,capture_source,captured_at,status,bound_item_uuid,accepted_at)
          VALUES($1,$2,$3,1,$4,$5,$5,$6,$7,'image/jpeg',$8,2,2,'camera',now(),'accepted',$3,now())`, [photo, repair, item, owner.id, "a".repeat(64), hash(bytes), `${photo}.jpg`, bytes.length]);
      }
      await db.query(`UPDATE repair_visits SET status='approved',report_number='MFE/RR/2026/0001',approved_by_user_id=$2,approved_at=now(),final_pdf=$3,final_pdf_sha256=$4 WHERE client_uuid=$1`, [repair, manager.id, Buffer.from("fixture PDF"), "a".repeat(64)]);
      const fields = await readPreviousVisitCatalog(db, owner, customerId, siteId, { kind: "repair", visitId: repair });
      assert.equal(fields.length, 2); assert.equal(fields[0]!.before!.result, "not_done"); assert.equal(fields[0]!.before!.remark, "After remark"); assert.ok(fields[0]!.before!.photo);
      assert.equal((await listPreviousVisits(db, owner, customerId, siteId))[0]!.visitId, repair);
      assert.equal((await get(`${base}/previous-visits/repair/${repair}/catalog`, "foreign")).status, 404);
      assert.equal((await get(`${base}/previous-visits/repair/${repair}/photos/${fields[0]!.before!.photo!.photoUuid}/content`)).status, 200);
    });
    await t.test("inactive technician is refused despite a stale caller identity", async () => {
      await db.query("UPDATE users SET is_active=false WHERE id=$1", [owner.id]);
      assert.equal((await get(`${base}/previous-visits`)).status, 401);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    await lock.query("SELECT pg_advisory_unlock(819276)"); lock.release(); await db.end(); await pool.end(); await rm(uploads, { recursive: true, force: true });
  }
});
