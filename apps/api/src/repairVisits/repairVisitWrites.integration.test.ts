import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, writeFile, rm, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { pool } from "../db/pool.js";
import { runMigrations } from "../db/migrations.js";
import { reconcileAttachmentStorage } from "../attachments/attachmentStorage.js";
import type { CurrentUser } from "../auth/authTypes.js";
import { readCurrentConfigurationCatalog, readPreviousVisitCatalog } from "./fieldCatalog.js";
import { createRepairVisit, submitRepairVisit, stageRepairVisitPhoto, decideRepairVisit, repairVisitPdf, deleteRepairVisit, malaysiaDay, readRepairVisit, listRepairVisits, readRepairVisitPhoto } from "./repairVisitWrites.js";
import { createRepairVisitWritesRouter } from "../routes/repairVisitWrites.js";
import { fingerprint, parseCreate, parseSubmit } from "./repairVisitWriteContract.js";
import { fixture, setResult } from "./fieldCatalogFixtures.test-support.js";
import { listCorrectableFields, type Json } from "../corrections/inspectionCorrections.js";

const url = process.env.SEED_INTEGRATION_DATABASE_URL;
assert.ok(url, "Cold disposable database required; skip is not a pass");
assert.equal(process.env.DATABASE_URL,url); assert.equal(process.env.NODE_ENV,"test");
assert.equal(new URL(url).hostname,"127.0.0.1"); assert.equal(new URL(url).port,"55432"); assert.equal(new URL(url).pathname,"/phase6_seed_integration");
const id = () => randomUUID();
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const code = (expected: string) => (e: unknown) => Boolean(e && typeof e === "object" && "code" in e && e.code === expected);

test("repair write lifecycle: authority, atomic evidence, retries, revisions, competing transitions and PDFs", { timeout: 240000 }, async t => {
  const db = new pg.Pool({ connectionString: url });
  const lock = await db.connect(); await lock.query("SELECT pg_advisory_lock(819276)");
  const uploads = await mkdtemp(path.join(tmpdir(),"rv-3a-")); process.env.UPLOADS_PATH = uploads;
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public"); await runMigrations(db);
    const actor = async (role: CurrentUser["role"]): Promise<CurrentUser> => {
      const username = `rv-${id()}`;
      const row = (await db.query("INSERT INTO users(username,password_hash,role) VALUES($1,'fixture',$2) RETURNING id",[username,role])).rows[0];
      return { id: Number(row.id), username, role };
    };
    const owner = await actor("inspector"), foreign = await actor("inspector"), manager = await actor("supervisor"), admin = await actor("admin");
    const customer = id(), site = id(), revision = id(), enabled = id();
    await db.query("INSERT INTO customers(id,customer_code,display_name) VALUES($1,$1::uuid::text,'Test repair customer')",[customer]);
    await db.query("INSERT INTO customer_sites(id,customer_id,site_code,display_name) VALUES($1,$2,'site','Test site')",[site,customer]);
    await db.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,'00000000-0000-4000-8000-000000000807',1,'active')",[revision,customer]);
    await db.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order) VALUES($1,$2,'00000000-0000-4000-8000-000000000807','automatic_sprinkler',1)",[enabled,revision]);
    const catalog = await readCurrentConfigurationCatalog(db,owner,customer,site); assert.ok(catalog.fields.length > 2);
    const newRequest = () => ({ clientUuid: id(), customerId: customer, siteId: site, configurationRevisionId: revision,
      deviceCreatedAt: new Date().toISOString(), visitDate: malaysiaDay(new Date()), arrivalTime: "10:05", serviceCallNumber: null,
      previousVisit: null as { kind: "repair" | "service"; visitId: string } | null,
      items: [{ clientUuid: id(), identity: catalog.fields[0].identity }] });
    let color = 0;
    async function stage(visit: string, item: string, revision = 1, source: "camera" | "gallery" = "camera") {
      const bytes = await sharp({ create: { width: 12,height: 10,channels: 3,background: { r: ++color*19%255,g: 33,b: 80 } } }).jpeg().toBuffer();
      const photo = { photoUuid: id(),itemUuid: item,revision,sourceSha256: sha(bytes),sizeBytes: bytes.length,width: 12,height: 10,captureSource: source,capturedAt: new Date().toISOString() };
      const send = async () => { const source = path.join(uploads,`${id()}.upload`); await writeFile(source,bytes); return stageRepairVisitPhoto(db,owner,visit,photo,source); };
      const receipt = await send(); return { photo,receipt,send,bytes };
    }
    const submission = (b: ReturnType<typeof newRequest>, photo: Awaited<ReturnType<typeof stage>>["photo"], rev = 1, expected = 1) => ({ operationUuid: id(),expectedRevision: expected,revision: rev,
      items: b.items.map(i => ({ ...i,outcome: "done_repair",remark: "Replaced valve",photoUuid: photo.photoUuid,sourceSha256: photo.sourceSha256 })) });
    const createSubmitted = async () => { const b = newRequest(); await createRepairVisit(db,owner,b); const p = await stage(b.clientUuid,b.items[0].clientUuid); const s = submission(b,p.photo); await submitRepairVisit(db,owner,b.clientUuid,s); return { b,p,s }; };
    const decision = (rev = 1) => ({ operationUuid: id(),expectedRevision: rev });
    const afterQuery = (hook: (sql: string) => Promise<void>) => ({ connect: async () => {
      const client = await db.connect();
      return new Proxy(client, { get(target, key) {
        if (key === "query") return async (sql: string, values?: unknown[]) => {
          const result = await target.query(sql, values); await hook(sql); return result;
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } });
    } });
    await t.test("strict contracts and canonical fingerprint", () => {
      const b = newRequest(); assert.throws(() => parseCreate({ ...b,before: {} }));
      assert.throws(() => parseCreate({ ...b,deviceCreatedAt: "bad" }));
      assert.throws(() => parseSubmit({ operationUuid: id(),expectedRevision: 1,revision: 1,items: [] }));
      assert.equal(fingerprint({ a: 1,b: { c: 2,d: 3 } }), fingerprint({ b: { d: 3,c: 2 },a: 1 }));
    });
    await t.test("create UUID, concurrent duplicates, changed request, offline date and inactive authority", async () => {
      const b = newRequest(); const receipts = await Promise.all([createRepairVisit(db,owner,b),createRepairVisit(db,owner,b)]);
      assert.deepEqual(receipts[0],receipts[1]); assert.equal(receipts[0].clientUuid,b.clientUuid);
      assert.match(receipts[0].visitNumber,/^RV-\d{8}-[1-9]\d*$/);
      await assert.rejects(createRepairVisit(db,owner,{ ...b,arrivalTime: "11:00" }),code("IDEMPOTENCY_CONFLICT"));
      await assert.rejects(createRepairVisit(db,foreign,b),code("FORBIDDEN"));
      await assert.rejects(createRepairVisit(db,owner,{ ...newRequest(),deviceCreatedAt: "2020-01-01T00:00:00.000Z",visitDate: "2020-01-01" }),code("DEVICE_DATE_OUT_OF_WINDOW"));
      const future = new Date(Date.now()+3*86400000);
      await assert.rejects(createRepairVisit(db,owner,{ ...newRequest(),deviceCreatedAt: future.toISOString(),visitDate: malaysiaDay(future) }),code("DEVICE_DATE_OUT_OF_WINDOW"));
      await assert.rejects(createRepairVisit(db,owner,{ ...newRequest(),configurationRevisionId: id() }),code("CONFIGURATION_CHANGED"));
      await db.query("UPDATE customers SET is_active=false WHERE id=$1",[customer]);
      await assert.rejects(createRepairVisit(db,owner,newRequest()),code("CUSTOMER_INACTIVE"));
      assert.deepEqual(await createRepairVisit(db,owner,b),receipts[0]);
      await db.query("UPDATE customers SET is_active=true WHERE id=$1",[customer]);
      await db.query("UPDATE customer_sites SET is_active=false WHERE id=$1",[site]);
      await assert.rejects(createRepairVisit(db,owner,newRequest()),code("SITE_INACTIVE"));
      await db.query("UPDATE customer_sites SET is_active=true WHERE id=$1",[site]);
      const deletion = await deleteRepairVisit(db,owner,b.clientUuid,{ expectedRevision: 1 });
      assert.deepEqual(await deleteRepairVisit(db,owner,b.clientUuid,{ expectedRevision: 1 }),deletion);
      await assert.rejects(createRepairVisit(db,owner,b),code("VISIT_DELETED"));
      await db.query("UPDATE users SET is_active=false WHERE id=$1",[owner.id]);
      await assert.rejects(createRepairVisit(db,owner,newRequest()),code("AUTH_REQUIRED"));
      await db.query("UPDATE users SET is_active=true WHERE id=$1",[owner.id]);
    });
    await t.test("concurrent item UUID collision never overwrites another technician's visit", async () => {
      // Either actor may win and retain its visit. Keep both independent of the
      // later ownership tests, whose foreign technician must still have no visits.
      const raceActors = [await actor("inspector"),await actor("inspector")];
      const a = newRequest(), b = newRequest();
      b.items = [{ clientUuid: a.items[0].clientUuid, identity: catalog.fields[1].identity }];
      let arrivals = 0, release!: () => void;
      const barrier = new Promise<void>(resolve => { release = resolve; });
      const timeout = setTimeout(release, 5000);
      const racing = afterQuery(async sql => {
        if (sql === "SELECT visit_uuid FROM repair_visit_items WHERE client_uuid=$1") {
          if (++arrivals === 2) release(); await barrier;
        }
      });
      let results;
      try { results = await Promise.allSettled([createRepairVisit(racing,raceActors[0],a),createRepairVisit(racing,raceActors[1],b)]); }
      finally { clearTimeout(timeout); release(); }
      assert.equal(arrivals,2,"both ownership prechecks must observe the initially absent item");
      assert.equal(results.filter(r => r.status === "fulfilled").length,1);
      const loser = results.findIndex(r => r.status === "rejected"), winner = 1-loser;
      assert.ok(code("IDEMPOTENCY_CONFLICT")((results[loser] as PromiseRejectedResult).reason));
      const requests = [a,b], winnerActor = raceActors[winner];
      assert.equal((await db.query("SELECT 1 FROM repair_visits WHERE client_uuid=$1",[requests[loser].clientUuid])).rowCount,0);
      const detail = await readRepairVisit(db,winnerActor,requests[winner].clientUuid);
      assert.equal(detail.items.length,1);
      assert.deepEqual(detail.items[0].identity,requests[winner].items[0].identity);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1",[requests[loser].clientUuid])).rows[0].n,0);
      assert.deepEqual((await listRepairVisits(db,winnerActor)).visits.map(v => v.clientUuid),[requests[winner].clientUuid]);
      assert.deepEqual((await listRepairVisits(db,raceActors[loser])).visits,[]);
      await assert.rejects(readRepairVisit(db,raceActors[loser],requests[winner].clientUuid),code("FORBIDDEN"));
    });
    await t.test("missing photo rolls back every item/binding/event; double submit and exact later retry", async () => {
      const b = newRequest(); b.items.push({ clientUuid: id(),identity: catalog.fields[1].identity }); await createRepairVisit(db,owner,b);
      const p = await stage(b.clientUuid,b.items[0].clientUuid); assert.deepEqual(await p.send(),p.receipt);
      const s = submission(b,p.photo); s.items[1].photoUuid = id();
      await assert.rejects(submitRepairVisit(db,owner,b.clientUuid,s),code("EVIDENCE_NOT_STAGED"));
      assert.equal((await db.query("SELECT status FROM repair_visits WHERE client_uuid=$1",[b.clientUuid])).rows[0].status,"draft");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM repair_visit_items WHERE visit_uuid=$1 AND outcome IS NOT NULL",[b.clientUuid])).rows[0].n,0);
      assert.equal((await db.query("SELECT status FROM repair_visit_photos WHERE photo_uuid=$1",[p.photo.photoUuid])).rows[0].status,"staged");
      s.items.pop(); const receipts = await Promise.all([submitRepairVisit(db,owner,b.clientUuid,s),submitRepairVisit(db,owner,b.clientUuid,s)]);
      assert.deepEqual(receipts[0],receipts[1]); assert.equal(receipts[0].clientUuid,b.clientUuid);
      await assert.rejects(submitRepairVisit(db,foreign,b.clientUuid,s),code("FORBIDDEN"));
      await assert.rejects(submitRepairVisit(db,owner,b.clientUuid,{ ...s,items: [{ ...s.items[0],remark: "Changed" }] }),code("IDEMPOTENCY_CONFLICT"));
      await decideRepairVisit(db,manager,b.clientUuid,{ ...decision(),reason: "Please revise" },true);
      assert.deepEqual(await submitRepairVisit(db,owner,b.clientUuid,s),receipts[0]);
    });
    let approved: Awaited<ReturnType<typeof createSubmitted>>;
    await t.test("preview, return, add/remove/edit, photo replacement, next revision and report allocated once", async () => {
      const a = await createSubmitted(); approved = a;
      const preview = await repairVisitPdf(db,manager,a.b.clientUuid,true,1); assert.ok((await PDFDocument.load(preview)).getPageCount() >= 3);
      await assert.rejects(decideRepairVisit(db,owner,a.b.clientUuid,decision(),false),code("FORBIDDEN"));
      await assert.rejects(decideRepairVisit(db,manager,a.b.clientUuid,{ ...decision(),reason: " " },true),code("INVALID_REPAIR_VISIT_REQUEST"));
      const r = { ...decision(),reason: "Use the other field" }; const rr = await decideRepairVisit(db,manager,a.b.clientUuid,r,true);
      assert.deepEqual(await decideRepairVisit(db,manager,a.b.clientUuid,r,true),rr);
      const item = { clientUuid: id(),identity: catalog.fields[1].identity };
      const p2 = await stage(a.b.clientUuid,item.clientUuid,2);
      const s2 = { operationUuid: id(),expectedRevision: 1,revision: 2,items: [{ ...item,outcome: "not_done",remark: "Awaiting spare part",photoUuid: p2.photo.photoUuid,sourceSha256: p2.photo.sourceSha256 }] };
      await submitRepairVisit(db,owner,a.b.clientUuid,s2);
      await assert.rejects(decideRepairVisit(db,manager,a.b.clientUuid,decision(1),false),code("STALE_REVISION"));
      const d = decision(2); const receipts = await Promise.all([decideRepairVisit(db,manager,a.b.clientUuid,d,false),decideRepairVisit(db,manager,a.b.clientUuid,d,false)]);
      assert.deepEqual(receipts[0],receipts[1]); assert.ok("reportNumber" in receipts[0]); assert.match(receipts[0].reportNumber!,/^MFE\/RR\/\d{4}\/\d{4}$/);
      assert.equal((await db.query("SELECT last_sequence FROM repair_report_number_year_counters")).rows[0].last_sequence,"1");
      const pdf = await repairVisitPdf(db,owner,a.b.clientUuid,false,2); assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 3);
      assert.notEqual(sha(pdf),sha(preview));
      assert.deepEqual(await submitRepairVisit(db,owner,a.b.clientUuid,s2),await submitRepairVisit(db,owner,a.b.clientUuid,s2));
      await assert.rejects(deleteRepairVisit(db,owner,a.b.clientUuid,{ expectedRevision: 2 }),code("VISIT_ALREADY_STARTED"));
      assert.deepEqual((await db.query("SELECT event_type FROM repair_visit_events WHERE visit_uuid=$1 ORDER BY occurred_at",[a.b.clientUuid])).rows.map(r => r.event_type),["submitted","returned","resubmitted","approved"]);
      const reconcile = await reconcileAttachmentStorage(); assert.ok(!reconcile.orphanFiles.includes(`repairs/${a.b.clientUuid}/${p2.photo.photoUuid}.jpg`));
    });
    await t.test("approved previous visit ownership, same site, frozen Before, PDF and previous rows unchanged", async () => {
      const prev = approved!.b.clientUuid; const original = (await db.query("SELECT row_to_json(r) AS r FROM repair_visits r WHERE client_uuid=$1",[prev])).rows[0].r;
      const originalPdf = await repairVisitPdf(db,owner,prev,false,2);
      const fields = await readPreviousVisitCatalog(db,owner,customer,site,{ kind: "repair",visitId: prev });
      const b = newRequest(); b.previousVisit = { kind: "repair",visitId: prev }; b.items = [{ clientUuid: id(),identity: fields[0].identity }];
      await assert.rejects(createRepairVisit(db,foreign,b),code("REPAIR_VISIT_NOT_FOUND"));
      await assert.rejects(createRepairVisit(db,owner,{ ...b,siteId: id() }),code("SITE_INACTIVE"));
      await createRepairVisit(db,owner,b); const p = await stage(b.clientUuid,b.items[0].clientUuid,1,"gallery");
      await submitRepairVisit(db,owner,b.clientUuid,submission(b,p.photo));
      assert.deepEqual((await db.query("SELECT before_snapshot FROM repair_visit_items WHERE visit_uuid=$1",[b.clientUuid])).rows[0].before_snapshot,fields[0].before);
      await decideRepairVisit(db,admin,b.clientUuid,decision(),false);
      const final = await repairVisitPdf(db,owner,b.clientUuid,false,1);
      const pdf = await PDFDocument.load(final);
      const images = pdf.context.enumerateIndirectObjects().filter(([,o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
      assert.ok(images.length >= 2,"final PDF embeds both Before and After bytes");
      assert.deepEqual((await db.query("SELECT row_to_json(r) AS r FROM repair_visits r WHERE client_uuid=$1",[prev])).rows[0].r,original);
      assert.deepEqual(await repairVisitPdf(db,owner,prev,false,2),originalPdf);
      const detail = await readRepairVisit(db,owner,b.clientUuid);
      assert.equal(detail.visit.status,"approved"); assert.equal(detail.items[0].photoUuid,p.photo.photoUuid);
      // P2: the source is internal. Admin/Manager reads carry it; the technician read has no such key.
      assert.equal("photoSources" in detail,false,"technician read exposes no photo source");
      for (const reviewer of [manager,admin]) assert.deepEqual((await readRepairVisit(db,reviewer,b.clientUuid) as { photoSources?: unknown }).photoSources,[{ photoUuid: p.photo.photoUuid,captureSource: "gallery",capturedAt: p.photo.capturedAt }]);
      assert.deepEqual(await readRepairVisitPhoto(db,manager,b.clientUuid,p.photo.photoUuid),await readFile(path.join(uploads,`repairs/${b.clientUuid}/${p.photo.photoUuid}.jpg`)));
      await assert.rejects(readRepairVisit(db,foreign,b.clientUuid),code("FORBIDDEN"));
      await assert.rejects(readRepairVisitPhoto(db,foreign,b.clientUuid,p.photo.photoUuid),code("FORBIDDEN"));
      assert.deepEqual((await listRepairVisits(db,foreign)).visits,[]);
    });
    await t.test("approve vs return and approve vs resubmit serialize; stale callers never win", async () => {
      const a = await createSubmitted();
      const results = await Promise.allSettled([decideRepairVisit(db,manager,a.b.clientUuid,decision(),false),decideRepairVisit(db,admin,a.b.clientUuid,{ ...decision(),reason: "Fix it" },true)]);
      assert.equal(results.filter(r => r.status === "fulfilled").length,1);
      const b = await createSubmitted(); await decideRepairVisit(db,manager,b.b.clientUuid,{ ...decision(),reason: "Revise remark" },true);
      const s2 = { ...b.s,operationUuid: id(),revision: 2,expectedRevision: 1,items: b.s.items.map(i => ({ ...i,remark: "Rechecked" })) };
      const raced = await Promise.allSettled([decideRepairVisit(db,manager,b.b.clientUuid,decision(),false),submitRepairVisit(db,owner,b.b.clientUuid,s2)]);
      assert.equal(raced[0].status,"rejected"); assert.equal(raced[1].status,"fulfilled");
      await assert.rejects(decideRepairVisit(db,manager,b.b.clientUuid,decision(1),false),code("STALE_REVISION"));
      await decideRepairVisit(db,manager,b.b.clientUuid,decision(2),false);
    });
    await t.test("previous approved V7 service source freezes server data and stays unchanged", async () => {
      const f = fixture("automatic_sprinkler");
      for (const p of f.adapter.derivePoorFieldPaths(f.response)!) setResult("automatic_sprinkler",f.response,p,"good");
      f.manifest.splice(0); const group = id(), job = String(f.row.jobId), form = String(f.row.serverFormInstanceId);
      f.snapshot.customer = { id: customer,code: customer,displayName: "Test repair customer" };
      f.snapshot.configuration = { revisionId: revision,revisionNumber: 1 };
      f.snapshot.job.reference = "SV-20261012-98765";
      const snapshot = { customer: f.snapshot.customer,site: { id: site,displayName: "Test site" },template: f.snapshot.template,
        configuration: f.snapshot.configuration,enabledSystems: [{ enabledSystemId: enabled,systemKey: "automatic_sprinkler",definitionStatus: "confirmed",zones: [],locations: [] }] };
      await db.query(`INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,
        customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id,site_id)
        VALUES($1,$2,'SV-20261012-98765','fixture','open',false,true,$3,$4,$5,'2026-10-12',$6,$7)`,[job,f.snapshot.template.id,customer,revision,snapshot,owner.id,site]);
      await db.query("INSERT INTO master_system_inspections(id,job_id,system_key) VALUES($1,$2,'automatic_sprinkler')",[group,job]);
      await db.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,
        customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id)
        VALUES($1,$2,$3,'primary',1,$4,$5,2,$6,2,$7,$8,'submitted','2026-10-12T00:00:00Z',$9)`,
      [form,group,f.row.clientUuid,f.snapshot.template.id,revision,f.snapshot,f.response,fingerprint(f.row),owner.id]);
      await db.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,report_number='MFE/SR/2026/98765',technician_team_snapshot='[]'::jsonb WHERE id=$1",[job,owner.id]);
      const b = newRequest(); b.previousVisit = { kind: "service",visitId: job };
      await assert.rejects(createRepairVisit(db,owner,b),code("REPAIR_VISIT_NOT_FOUND"));
      await db.query(`INSERT INTO report_approvals(id,job_id,decision,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
        VALUES($1,$2,'approved',$3,'supervisor',1,$4,$5)`,[id(),job,manager.id,id(),"a".repeat(64)]);
      await assert.rejects(createRepairVisit(db,foreign,b),code("REPAIR_VISIT_NOT_FOUND"));
      const oldJob = (await db.query("SELECT row_to_json(j) AS r FROM inspection_jobs j WHERE id=$1",[job])).rows[0].r;
      const oldForm = (await db.query("SELECT row_to_json(f) AS r FROM master_system_form_instances f WHERE id=$1",[form])).rows[0].r;
      await createRepairVisit(db,owner,b);
      const p = await stage(b.clientUuid,b.items[0].clientUuid); await submitRepairVisit(db,owner,b.clientUuid,submission(b,p.photo));
      const before = (await readRepairVisit(db,owner,b.clientUuid)).items[0].before;
      assert.equal(before?.result,"good"); assert.equal(before?.photo,null); assert.equal(before?.previousVisit.visitId,job);
      await decideRepairVisit(db,manager,b.clientUuid,decision(),false);
      assert.deepEqual((await db.query("SELECT row_to_json(j) AS r FROM inspection_jobs j WHERE id=$1",[job])).rows[0].r,oldJob);
      assert.deepEqual((await db.query("SELECT row_to_json(f) AS r FROM master_system_form_instances f WHERE id=$1",[form])).rows[0].r,oldForm);
      // A writer that wins before Submit must invalidate approval before Before
      // is read. Observe real PostgreSQL blocking rather than a timing-only race.
      const correctable = listCorrectableFields(f.response as Json,f.snapshot).find(field => field.kind === "result");
      assert.ok(correctable);
      for (const change of ["withdrawal","correction"] as const) {
        const next = { ...newRequest(), previousVisit: { kind: "service" as const, visitId: job } };
        await createRepairVisit(db,owner,next);
        const staged = await stage(next.clientUuid,next.items[0].clientUuid);
        const writer = await db.connect(), submitter = await db.connect();
        const writerPid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        const submitPid = (await submitter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        let pending: Promise<PromiseSettledResult<unknown>> | undefined, settled = false;
        try {
          await writer.query("BEGIN");
          await writer.query(change === "withdrawal"
            ? "SELECT pg_advisory_xact_lock(hashtext('report_approvals:' || $1))"
            : "SELECT pg_advisory_xact_lock(hashtext('inspection_corrections:' || $1))",[change === "withdrawal" ? job : form]);
          if (change === "withdrawal") {
            await writer.query(`INSERT INTO report_approvals(id,job_id,decision,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
              VALUES($1,$2,'withdrawn',$3,'admin',2,$4,$5)`,[id(),job,admin.id,id(),"b".repeat(64)]);
          } else {
            await writer.query(`INSERT INTO inspection_corrections(id,form_instance_id,job_id,system_key,field_path,sequence,previous_value,new_value,
              reason,corrected_by_user_id,corrected_by_role,request_id,request_fingerprint,corrected_at)
              VALUES($1,$2,$3,'automatic_sprinkler',$4,1,$5::jsonb,'"na"'::jsonb,'Review correction',$6,'admin',$7,$8,clock_timestamp())`,
            [id(),form,job,correctable.fieldPath,JSON.stringify(correctable.value),admin.id,id(),"c".repeat(64)]);
          }
          const connection = new Proxy(submitter, { get(target,key) {
            if (key === "release") return () => undefined;
            const value = Reflect.get(target,key); return typeof value === "function" ? value.bind(target) : value;
          } });
          pending = submitRepairVisit({ connect: async () => connection },owner,next.clientUuid,submission(next,staged.photo))
            .then(value => { settled = true; return { status: "fulfilled" as const,value }; }, reason => { settled = true; return { status: "rejected" as const,reason }; });
          let blocked = false;
          for (let attempt=0; attempt<200 && !settled; attempt++) {
            blocked = (await db.query("SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked",[submitPid,writerPid])).rows[0].blocked;
            if (blocked) break;
            await new Promise(resolve => setTimeout(resolve,10));
          }
          assert.equal(blocked,true,`Submit must wait for the ${change} writer`);
        } finally {
          await writer.query("COMMIT");
          await pending;
          submitter.release(); writer.release();
        }
        const result = await pending;
        assert.equal(result?.status,"rejected");
        if (result?.status === "rejected") assert.ok(code("REPAIR_VISIT_NOT_FOUND")(result.reason));
        const detail = await readRepairVisit(db,owner,next.clientUuid);
        assert.equal(detail.visit.status,"draft"); assert.equal(detail.items[0].before,null); assert.equal(detail.events.length,0);
        assert.equal((await db.query("SELECT status FROM repair_visit_photos WHERE photo_uuid=$1",[staged.photo.photoUuid])).rows[0].status,"staged");
        if (change === "withdrawal") await db.query(`INSERT INTO report_approvals(id,job_id,decision,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
          VALUES($1,$2,'approved',$3,'admin',3,$4,$5)`,[id(),job,admin.id,id(),"d".repeat(64)]);
      }
    });
    await t.test("tampered/missing stored bytes roll back submit and approval with no report allocation", async () => {
      const b = newRequest(); await createRepairVisit(db,owner,b); const p = await stage(b.clientUuid,b.items[0].clientUuid);
      const file = path.join(uploads,`repairs/${b.clientUuid}/${p.photo.photoUuid}.jpg`), bytes = await readFile(file);
      await writeFile(file,Buffer.alloc(bytes.length));
      await assert.rejects(submitRepairVisit(db,owner,b.clientUuid,submission(b,p.photo)),code("REPAIR_SOURCE_INVALID"));
      await writeFile(file,bytes); await submitRepairVisit(db,owner,b.clientUuid,submission(b,p.photo));
      const counters = (await db.query("SELECT * FROM repair_report_number_year_counters")).rows;
      await unlink(file); await assert.rejects(decideRepairVisit(db,manager,b.clientUuid,decision(),false),code("REPAIR_SOURCE_INVALID"));
      assert.deepEqual((await db.query("SELECT * FROM repair_report_number_year_counters")).rows,counters);
      assert.equal((await db.query("SELECT status FROM repair_visits WHERE client_uuid=$1",[b.clientUuid])).rows[0].status,"awaiting_approval");
    });
    await t.test("two distinct item/photo UUIDs cannot share source/stored bytes within one system", async () => {
      const b = newRequest(); b.items.push({ clientUuid: id(),identity: catalog.fields[1].identity });
      await createRepairVisit(db,owner,b); const p = await stage(b.clientUuid,b.items[0].clientUuid);
      const other = { ...p.photo,photoUuid: id(),itemUuid: b.items[1].clientUuid };
      const file = path.join(uploads,`${id()}.upload`); await writeFile(file,p.bytes);
      await stageRepairVisitPhoto(db,owner,b.clientUuid,other,file);
      const s = submission(b,p.photo); s.items[1].photoUuid = other.photoUuid;
      await assert.rejects(submitRepairVisit(db,owner,b.clientUuid,s),code("DUPLICATE_ITEM_EVIDENCE"));
      assert.equal((await db.query("SELECT count(*)::int AS n FROM repair_visit_events WHERE visit_uuid=$1",[b.clientUuid])).rows[0].n,0);
    });
    await t.test("returned same item replaces its photo and keeps the old file as superseded", async () => {
      const a = await createSubmitted();
      await decideRepairVisit(db,admin,a.b.clientUuid,{ ...decision(),reason: "Retake the photo" },true);
      const replacement = await stage(a.b.clientUuid,a.b.items[0].clientUuid,2);
      const s = submission(a.b,replacement.photo,2,1); s.items[0].outcome = "not_done"; s.items[0].remark = "Needs a replacement part";
      await submitRepairVisit(db,owner,a.b.clientUuid,s);
      assert.equal((await db.query("SELECT status FROM repair_visit_photos WHERE photo_uuid=$1",[a.p.photo.photoUuid])).rows[0].status,"superseded");
      const detail = await readRepairVisit(db,owner,a.b.clientUuid);
      assert.equal(detail.items[0].photoUuid,replacement.photo.photoUuid); assert.equal(detail.items[0].outcome,"not_done");
      assert.ok(!(await reconcileAttachmentStorage()).orphanFiles.includes(`repairs/${a.b.clientUuid}/${a.p.photo.photoUuid}.jpg`));
    });
    await t.test("HTTP authentication, stale session identity, upload and exact receipts", async () => {
      const app = express(); app.use(express.json()); app.use((req,_res,next) => { req.currentUser = req.header("x-test-user") === "owner" ? owner : req.header("x-test-user") === "foreign" ? foreign : undefined; next(); });
      app.use(createRepairVisitWritesRouter(db)); server = app.listen(0,"127.0.0.1"); await once(server,"listening");
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const base = `http://127.0.0.1:${address.port}/repair-visits`;
      const post = (body: unknown,user = "owner",extra = {}) => fetch(base,{ method: "POST",headers: { "content-type": "application/json","x-test-user": user,...extra },body: JSON.stringify(body) });
      const b = newRequest(); assert.equal((await post(b,"")).status,401);
      assert.equal((await post(b,"owner",{ "x-expected-user-id": String(foreign.id) })).status,409);
      const response = await post(b); assert.equal(response.status,200); assert.equal((await response.json()).clientUuid,b.clientUuid);
      assert.equal(response.headers.get("cache-control"),"private, no-store");
      for (const [contentType,body] of [["application/json","{}"],["text/plain","not multipart"],["multipart/form-data","missing boundary"]]) {
        const rejected = await fetch(`${base}/${b.clientUuid}/photos`,{ method: "POST",
          headers: { "content-type": contentType,"x-test-user": "owner" },body,signal: AbortSignal.timeout(3000) });
        assert.equal(rejected.status,400,`${contentType} must be rejected without waiting on a consumed stream`);
        assert.equal((await rejected.json()).error,"INVALID_REPAIR_REQUEST");
      }
      assert.equal((await db.query("SELECT count(*)::int AS n FROM repair_visit_photos WHERE visit_uuid=$1",[b.clientUuid])).rows[0].n,0);
      const bytes = await sharp({ create: { width: 3,height: 4,channels: 3,background: "red" } }).jpeg().toBuffer();
      const photo = { photoUuid: id(),itemUuid: b.items[0].clientUuid,revision: 1,sourceSha256: sha(bytes),sizeBytes: bytes.length,width: 3,height: 4,captureSource: "camera" as const,capturedAt: new Date().toISOString() };
      const form = new FormData(); form.set("metadata",JSON.stringify(photo)); form.set("file",new Blob([bytes]),"image.jpg");
      // Explicit JPEG type is mandatory.
      form.set("file",new Blob([bytes],{ type: "image/jpeg" }),"image.jpg");
      const upload = await fetch(`${base}/${b.clientUuid}/photos`,{ method: "POST",headers: { "x-test-user": "owner" },body: form });
      assert.equal(upload.status,200); assert.equal((await upload.json()).photoUuid,photo.photoUuid);
      const foreignSubmit = await fetch(`${base}/${b.clientUuid}/submit`,{ method: "POST",headers: { "content-type": "application/json","x-test-user": "foreign" },body: JSON.stringify(submission(b,photo)) });
      assert.equal(foreignSubmit.status,403);
      await assert.rejects(deleteRepairVisit(db,owner,b.clientUuid,{ expectedRevision: 1 }),code("VISIT_ALREADY_STARTED"));
    });
  } finally {
    if (server) await new Promise<void>((resolve,reject) => server!.close(e => e ? reject(e) : resolve()));
    await lock.query("SELECT pg_advisory_unlock(819276)"); lock.release(); await db.end(); await pool.end();
    await rm(uploads,{ recursive: true,force: true });
  }
});
