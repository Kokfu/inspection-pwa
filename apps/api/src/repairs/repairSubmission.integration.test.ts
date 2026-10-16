import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile, readFile, rm, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { createRepairsRouter } from "../routes/repairs.js";
import { reconcileAttachmentStorage } from "../attachments/attachmentStorage.js";
import { fixture } from "./repairFixtures.js";
import { historicalFixture } from "./historicalFixtures.js";
import { readFindingParts, RepairError, type R } from "./findingReaders.js";
import { extractRepairSource, fingerprint, sourceRevision } from "./acceptedSource.js";
import { materializeRepairFindings, mutateRepairWorkOrder, reviewRepairFinding, correctionLock } from "./repairFoundation.js";
import { stageRepairPhoto, submitRepairPart, submitRepairBatch, decideRepair, readSubmittedRepair, parseRepairPart, parseRepairPhoto } from "./repairSubmission.js";
import type { CurrentUser } from "../auth/authTypes.js";
const url=process.env.SEED_INTEGRATION_DATABASE_URL;
assert.ok(url);assert.equal(process.env.DATABASE_URL,url);assert.equal(process.env.NODE_ENV,"test");
assert.equal(new URL(url).hostname,"127.0.0.1");assert.equal(new URL(url).port,"55432");
const id=()=>randomUUID();const hash=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
const code=(c:string)=>(e:unknown)=>e instanceof RepairError && e.code===c;

test("B2 repair evidence, immutable atomic submissions and independent decisions",{timeout:120000},async t=>{
  const db=new pg.Pool({connectionString:url});const lock=await db.connect();await lock.query("SELECT pg_advisory_lock(819276)");
  const uploads=await mkdtemp(path.join(tmpdir(),"cr09-b2-"));const oldUploads=process.env.UPLOADS_PATH;process.env.UPLOADS_PATH=uploads;
  let server:ReturnType<ReturnType<typeof express>["listen"]>|undefined;
  try {
    await db.query("DROP SCHEMA public CASCADE;CREATE SCHEMA public;");await runMigrations(db);
    const actor=async(role:CurrentUser["role"]):Promise<CurrentUser>=>{
      const username=`b2-${id()}`;const r=await db.query("INSERT INTO users(username,password_hash,role) VALUES($1,'fixture',$2) RETURNING id",[username,role]);
      return {id:Number(r.rows[0].id),username,role};
    };
    const owner=await actor("inspector"),other=await actor("inspector"),foreign=await actor("inspector"),manager=await actor("admin"),reviewer=await actor("supervisor");
    async function seed(row:R) {
      const snap=row.inspectionSnapshot as R, customer=snap.customer as R, config=snap.configuration as R, template=snap.template as R;
      const reference=`fixture-${row.jobId}`;row.jobReference=reference;(snap.job as R).reference=reference;
      const enabled=id(), group=id();
      customer.displayName=`Fixture ${customer.id}`;row.customerName=customer.displayName;
      await db.query("INSERT INTO customers(id,customer_code,display_name) VALUES($1,$2,$3)",[customer.id,`fixture-${customer.id}`,customer.displayName]);
      // Historical Fire Alarm reads require the original code; keep snapshot and DB identical.
      customer.code=`fixture-${customer.id}`; if (row.systemKey==="fire_alarm_detector") row.customerCode=customer.code;
      await db.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')",[config.revisionId,customer.id,template.id]);
      await db.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,$4,1,'{}')",[enabled,config.revisionId,template.id,row.systemKey]);
      if (row.locationId) await db.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,sort_order) VALUES($1,$2,NULL,'room','Room',1)",[row.locationId,enabled]);
      const jobSnapshot={customer,site:{id:id(),displayName:"Fixture site"},template,configuration:config,enabledSystems:[{enabledSystemId:enabled,systemKey:row.systemKey,definitionStatus:"confirmed",zones:[],locations:row.locationId?[{id:row.locationId,zoneId:null,key:"room",displayName:"Room",sortOrder:1}]:[]}]};
      await db.query(`INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id)
        VALUES($1,$2,$7,'fixture','open',false,true,$3,$4,$5,'2026-10-12',$6)`,[row.jobId,template.id,customer.id,config.revisionId,jobSnapshot,owner.id,reference]);
      await db.query("INSERT INTO master_system_inspections(id,job_id,system_key) VALUES($1,$2,$3)",[group,row.jobId,row.systemKey]);
      // Insert a validated accepted fixture through the existing DB identity guards.
      const extracted=readFindingParts(row);
      await db.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id)
        VALUES($1,$2,$3,$4,NULL,$5,1,$6,$7,$8,$9,$8,$10,$11,'submitted','2026-10-12T00:00:00Z',$12)`,[row.serverFormInstanceId,group,row.clientUuid,row.instanceKey,row.locationId,template.id,config.revisionId,snap.schemaVersion,snap,row.responses,fingerprint(row),owner.id]);
      const paths=extracted.manifest ?? extracted.requiredPaths.map(fieldPath=>({fieldPath,photoUuid:id(),sourceSha256:""}));
      if (paths.length) await db.query("INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[row.clientUuid,row.jobId,row.systemKey,template.id,template.version,extracted.contractSha256,owner.id]);
      for (const [index,m] of paths.entries()) {
        const bytes=await sharp({create:{width:2,height:2,channels:3,background:{r:index*7%255,g:80,b:130}}}).jpeg({quality:82,mozjpeg:true}).toBuffer();
        const relative=`inspections/${row.clientUuid}/${m.photoUuid}.jpg`;await mkdir(path.dirname(path.join(uploads,relative)),{recursive:true});await writeFile(path.join(uploads,relative),bytes);
        // Manifest source hashes are deliberately distinct from normalized stored hashes.
        await db.query(`INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status,form_instance_id,accepted_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'image/jpeg',$13,2,2,$13,2,2,$14,'accepted',$15,now())`,[m.photoUuid,row.clientUuid,row.jobId,row.systemKey,m.fieldPath,template.id,template.version,extracted.contractSha256,owner.id,fingerprint(m),m.sourceSha256||hash(bytes),hash(bytes),bytes.length,relative,row.serverFormInstanceId]);
      }
      return row;
    }
    let color=1;
    const image=()=>sharp({create:{width:16,height:12,channels:3,background:{r:(color++*19)%255,g:(color*31)%255,b:70}}}).jpeg({quality:95}).toBuffer();
    async function service(current=false) {
      const row=await seed(current?fixture("co2_fire_extinguisher").row:historicalFixture("co2_fire_extinguisher"));
      const jobId=String(row.jobId),systemKey=String(row.systemKey);
      await materializeRepairFindings(db,{jobId,limit:100});
      await db.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,report_number=$3,technician_team_snapshot='[]' WHERE id=$1",[jobId,owner.id,`B2-${jobId}`]);
      const findings=(await db.query("SELECT * FROM repair_findings WHERE job_id=$1 ORDER BY field_path",[jobId])).rows;
      const order=await mutateRepairWorkOrder(db,owner,{requestId:id(),workOrderId:id(),jobId,systemKey},"self") as {workOrderId:string;revision:number};
      const revision=(await sourceRevision(db,String(row.serverFormInstanceId))).revision;
      return {row,jobId,systemKey,findings,order,revision};
    }
    type Service=Awaited<ReturnType<typeof service>>;
    function part(s:Service,index=0,cycle=1,predecessor:string|null=null) {
      const f=s.findings[index];
      return {clientUuid:id(),findingId:f.id,workOrderId:s.order.workOrderId,jobId:s.jobId,systemKey:s.systemKey,
        expectedWorkOrderRevision:s.order.revision,expectedSourceRevision:s.revision,sourceFingerprint:f.source_fingerprint,
        cycleSequence:cycle,predecessorUuid:predecessor,remark:"Replaced damaged component.",performedAt:"2026-10-12T05:00:00.123Z",
        manifest:[{photoUuid:id(),fieldPath:f.field_path,sourceSha256:"0".repeat(64)}]};
    }
    type Part=ReturnType<typeof part>;
    function photo(p:Part,bytes:Buffer) {
      return {findingId:p.findingId,workOrderId:p.workOrderId,jobId:p.jobId,systemKey:p.systemKey,expectedWorkOrderRevision:p.expectedWorkOrderRevision,
        expectedSourceRevision:p.expectedSourceRevision,sourceFingerprint:p.sourceFingerprint,photoUuid:p.manifest[0].photoUuid,repairUuid:p.clientUuid,
        captureSource:"camera",capturedAt:p.performedAt,sourceSha256:hash(bytes),sizeBytes:bytes.length,width:16,height:12};
    }
    const stage=async(p:Part,bytes?:Buffer,actor=owner)=>{
      bytes??=await image();p.manifest[0].sourceSha256=hash(bytes);
      const source=path.join(uploads,`${id()}.upload`);await writeFile(source,bytes);
      return stageRepairPhoto(db,actor,photo(p,bytes),source);
    };
    const decision=(s:Service,p:Part,d="approved",sequence=0)=>({requestId:id(),expectedSequence:sequence,expectedSourceRevision:s.revision,decision:d,reason:d==="approved"?null:"Component needs further work."});
    let receiptCommitted: (()=>void)|undefined;
    const app=express();app.use(express.json());const actors:Record<string,CurrentUser>={owner,other,foreign,manager,reviewer};
    app.use((req,res,next)=>{
      if(req.header("x-test-drop-receipt")==="yes") res.json=(()=>{receiptCommitted?.();return res;}) as typeof res.json;
      next();
    });
    app.use((req,_res,next)=>{req.currentUser=actors[req.header("x-test-actor")??"none"];next();});app.use(createRepairsRouter(db));
    app.use((e:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(e instanceof RepairError)res.status(e.status).json({error:e.code});else {console.error(e);res.status(500).json({error:"INTERNAL"});}});
    server=app.listen(0,"127.0.0.1");await once(server,"listening");const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const http=(p:string,actor="owner",body?:unknown,extra:Record<string,string>={})=>fetch(origin+p,{method:body===undefined?"GET":"POST",headers:{"x-test-actor":actor,...extra,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});

    await t.test("strict identities, manifests, enums, timestamps and service envelopes",async()=>{
      const s=await service(),p=part(s),b=await image(),m=photo(p,b);
      for(const value of [{...m,unknown:1},{...m,captureSource:["camera"]},{...m,capturedAt:"2026-02-30T00:00:00.000Z"},{...m,width:"16"}]) assert.throws(()=>parseRepairPhoto(value),code("INVALID_REPAIR_REQUEST"));
      for(const value of [{...p,extra:true},{...p,remark:"   "},{...p,manifest:[]},{...p,manifest:[...p.manifest,...p.manifest]},{...p,manifest:[{...p.manifest[0],extra:1}]},{...p,performedAt:"yesterday"},{...p,performedAt:"0000-01-01T00:00:00.000Z"}]) assert.throws(()=>parseRepairPart(value),code("INVALID_REPAIR_REQUEST"));
      await assert.rejects(()=>submitRepairBatch(db,owner,{jobId:s.jobId,systemKey:s.systemKey,parts:[p,{...p,clientUuid:id()}]}),code("INVALID_REPAIR_REQUEST"));
      await assert.rejects(()=>submitRepairBatch(db,owner,{jobId:id(),systemKey:s.systemKey,parts:[p]}),code("INVALID_REPAIR_REQUEST"));
      assert.equal((await db.query("SELECT count(*) FROM repair_records")).rows[0].count,"0");
    });
    await t.test("evidence first; missing/extra/foreign manifest and corrupted After fail closed",async()=>{
      const s=await service(),p=part(s);
      await assert.rejects(()=>submitRepairPart(db,owner,p),code("EVIDENCE_NOT_STAGED"));
      await stage(p);
      for(const manifest of [[{...p.manifest[0],photoUuid:id()}],[{...p.manifest[0],sourceSha256:"1".repeat(64)}],[{...p.manifest[0],fieldPath:"foreign.path"}]]) await assert.rejects(()=>submitRepairPart(db,owner,{...p,manifest}),code("EVIDENCE_NOT_STAGED"));
      const e=(await db.query("SELECT * FROM staged_repair_evidence WHERE repair_uuid=$1",[p.clientUuid])).rows[0];
      const file=path.join(uploads,e.storage_relative_path),bytes=await readFile(file);await writeFile(file,Buffer.alloc(bytes.length));
      await assert.rejects(()=>submitRepairPart(db,owner,p),code("REPAIR_EVIDENCE_INVALID"));await writeFile(file,bytes);
      const accepted=await submitRepairPart(db,owner,p);assert.equal(accepted.clientUuid,p.clientUuid);
    });
    await t.test("normalized immutable photo, metadata verification and timeout/identical replay",async()=>{
      const s=await service(),p=part(s),bytes=await image();
      const first=await stage(p,bytes);assert.deepEqual(await stage(p,bytes),first);
      const changed=await image();await assert.rejects(()=>stage(p,changed),code("IDEMPOTENCY_CONFLICT"));p.manifest[0].sourceSha256=hash(bytes);
      const receipt=await submitRepairPart(db,owner,p);assert.deepEqual(await submitRepairPart(db,owner,p),receipt);
      await assert.rejects(()=>submitRepairPart(db,owner,{...p,remark:"Changed under same UUID"}),code("IDEMPOTENCY_CONFLICT"));
      await decideRepair(db,reviewer,p.clientUuid,decision(s,p));assert.deepEqual(await submitRepairPart(db,owner,p),receipt);
      assert.deepEqual(await stage(p,bytes),first,"accepted photo replay is identical");
      const content=await readSubmittedRepair(db,owner,p.clientUuid,true);assert.ok("bytes" in content);
      const m=photo(part(s,1),bytes);m.sizeBytes++;const source=path.join(uploads,id());await writeFile(source,bytes);
      await assert.rejects(()=>stageRepairPhoto(db,owner,m,source),code("PHOTO_METADATA_MISMATCH"));
      const before=await db.query("SELECT * FROM repair_records WHERE client_uuid=$1",[p.clientUuid]);
      await assert.rejects(()=>db.query("UPDATE repair_records SET remark='changed' WHERE client_uuid=$1",[p.clientUuid]));
      assert.deepEqual((await db.query("SELECT * FROM repair_records WHERE client_uuid=$1",[p.clientUuid])).rows,before.rows);
    });
    await t.test("one photo slot; cross-finding identity, source and normalized hash scope; cross-job independence",async()=>{
      const s=await service(),p=part(s),q=part(s,1),bytes=await image();await stage(p,bytes);await submitRepairPart(db,owner,p);
      await stage(q,bytes);await assert.rejects(()=>submitRepairPart(db,owner,q),code("REPAIR_PHOTO_REUSED"));
      const e=(await db.query("SELECT status,bound_repair_uuid FROM staged_repair_evidence WHERE repair_uuid=$1",[q.clientUuid])).rows[0];assert.deepEqual(e,{status:"staged",bound_repair_uuid:null});
      const s2=await service(),p2=part(s2);await stage(p2,bytes);await submitRepairPart(db,owner,p2);
      const normalized=part(s,2),differentSource=Buffer.concat([bytes,Buffer.from("trailing-metadata")]);await stage(normalized,differentSource);
      assert.notEqual(normalized.manifest[0].sourceSha256,p.manifest[0].sourceSha256);
      await assert.rejects(()=>submitRepairPart(db,owner,normalized),code("REPAIR_PHOTO_REUSED"));
      await assert.rejects(async()=>stage({...q,manifest:[{...q.manifest[0],photoUuid:id()}]},await image()),code("IDEMPOTENCY_CONFLICT"));
      await assert.rejects(()=>submitRepairPart(db,owner,{...q,manifest:p.manifest}),code("EVIDENCE_NOT_STAGED"));
    });
    await t.test("After cannot reuse own original Before source or normalized bytes; historical absence allowed",async()=>{
      const s=await service(true),p=part(s),f=s.findings[0];
      const before=f.original_metadata.beforePhoto,bytes=await readFile(path.join(uploads,before.storageRelativePath));
      await writeFile(path.join(uploads,before.storageRelativePath),Buffer.alloc(bytes.length));
      await assert.rejects(async()=>stage(p,await image()),code("REPAIR_SOURCE_INVALID"));
      await writeFile(path.join(uploads,before.storageRelativePath),bytes);
      const m=photo(p,bytes);m.width=2;m.height=2;const source=path.join(uploads,id());await writeFile(source,bytes);
      assert.equal(hash(bytes),before.sourceSha256,"exact original source bytes");
      await assert.rejects(()=>stageRepairPhoto(db,owner,m,source),code("AFTER_EQUALS_BEFORE"));
      const appended=Buffer.concat([bytes,Buffer.from("different-source-metadata")]);
      assert.notEqual(hash(appended),before.sourceSha256);
      assert.equal(hash(await sharp(appended).rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true}).toBuffer()),before.storedSha256);
      const source2=path.join(uploads,id());await writeFile(source2,appended);const m2={...m,sourceSha256:hash(appended),sizeBytes:appended.length};
      await assert.rejects(()=>stageRepairPhoto(db,owner,m2,source2),code("AFTER_EQUALS_BEFORE"));
      const historical=await service(),h=part(historical);await stage(h);await submitRepairPart(db,owner,h);
      assert.equal(historical.findings[0].original_metadata.beforePhotoMissing,true);
    });
    await t.test("partial service batches confirm only successful UUIDs",async()=>{
      const s=await service(),p=part(s),q=part(s,1);await stage(p);
      const result=await submitRepairBatch(db,owner,{jobId:s.jobId,systemKey:s.systemKey,parts:[p,q]});
      assert.equal(result.results[0].outcome,"submitted");assert.equal(result.results[1].outcome,"failed");assert.equal(result.results[1].clientUuid,q.clientUuid);
      await stage(q);const retry=await submitRepairBatch(db,owner,{jobId:s.jobId,systemKey:s.systemKey,parts:[p,q]});assert.ok(retry.results.every(r=>r.outcome==="submitted"));
    });
    await t.test("committed HTTP response loss retries exact UUID without another repair or photo",async()=>{
      const s=await service(),p=part(s);await stage(p);
      const controller=new AbortController();const committed=new Promise<void>(resolve=>{receiptCommitted=resolve;});
      const body={jobId:s.jobId,systemKey:s.systemKey,parts:[p]};
      const interrupted=fetch(origin+"/repairs/submissions",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json","x-test-actor":"owner","x-test-drop-receipt":"yes"},body:JSON.stringify(body)});
      const observed=interrupted.then(()=>false,()=>true);
      await committed;controller.abort();assert.equal(await observed,true);receiptCommitted=undefined;
      const retry=await http("/repairs/submissions","owner",body);assert.equal(retry.status,200);
      const response=await retry.json() as {results:Array<{receipt:{clientUuid:string}}>};assert.equal(response.results[0].receipt.clientUuid,p.clientUuid);
      assert.equal((await db.query("SELECT count(*) FROM repair_records WHERE client_uuid=$1",[p.clientUuid])).rows[0].count,"1");
      assert.equal((await db.query("SELECT count(*) FROM staged_repair_evidence WHERE bound_repair_uuid=$1",[p.clientUuid])).rows[0].count,"1");
    });
    await t.test("parent insert, evidence binding and audit roll back together",async()=>{
      const s=await service(),p=part(s);await stage(p);
      await db.query(`CREATE FUNCTION b2_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='repair.submit' THEN RAISE EXCEPTION 'injected rollback' USING ERRCODE='40001'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER b2_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION b2_fail_audit()`);
      try {await assert.rejects(()=>submitRepairPart(db,owner,p),code("REPAIR_CONFLICT"));} finally {await db.query("DROP TRIGGER b2_audit_failure ON audit_events;DROP FUNCTION b2_fail_audit()");}
      assert.equal((await db.query("SELECT 1 FROM repair_records WHERE client_uuid=$1",[p.clientUuid])).rows.length,0);
      assert.deepEqual((await db.query("SELECT status,bound_repair_uuid FROM staged_repair_evidence WHERE repair_uuid=$1",[p.clientUuid])).rows[0],{status:"staged",bound_repair_uuid:null});
      await submitRepairPart(db,owner,p);
    });
    await t.test("competing finding submissions have one winner; simultaneous exact replay returns same receipt",async()=>{
      const s=await service(),p=part(s),q=part(s);await stage(p);await stage(q);
      const results=await Promise.allSettled([submitRepairPart(db,owner,p),submitRepairPart(db,owner,q)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      const winner=results[0].status==="fulfilled"?p:q;
      const identical=await Promise.all([submitRepairPart(db,owner,winner),submitRepairPart(db,owner,winner)]);assert.deepEqual(identical[0],identical[1]);
    });
    await t.test("independent per-part approve/reject; reasons, approval races, withdrawals and repeat lineage",async()=>{
      const s=await service(),p=part(s),q=part(s,1);await stage(p);await stage(q);await submitRepairPart(db,owner,p);await submitRepairPart(db,owner,q);
      const approve=decision(s,p);const pair=await Promise.all([decideRepair(db,reviewer,p.clientUuid,approve),decideRepair(db,reviewer,p.clientUuid,approve)]);
      const receipt=pair[0];assert.deepEqual(pair[1],receipt);assert.deepEqual(await decideRepair(db,reviewer,p.clientUuid,approve),receipt);
      await assert.rejects(()=>decideRepair(db,reviewer,p.clientUuid,{...approve,reason:"Changed content"}),code("IDEMPOTENCY_CONFLICT"));
      await assert.rejects(()=>decideRepair(db,reviewer,q.clientUuid,{...decision(s,q,"rejected"),reason:null}),code("INVALID_REPAIR_REQUEST"));
      await decideRepair(db,reviewer,q.clientUuid,decision(s,q,"rejected"));
      assert.equal((await readSubmittedRepair(db,owner,q.clientUuid)).reviewState,"rejected");
      assert.equal((await readSubmittedRepair(db,owner,p.clientUuid)).reviewState,"approved");
      const third=part(s,2);await stage(third);await submitRepairPart(db,owner,third);
      const race=await Promise.allSettled([decideRepair(db,reviewer,third.clientUuid,decision(s,third,"rejected")),decideRepair(db,manager,third.clientUuid,decision(s,third))]);assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
      const prior=(await db.query("SELECT * FROM repair_records WHERE client_uuid=$1",[p.clientUuid])).rows[0];
      const again=part(s,0,2,p.clientUuid);await stage(again);await submitRepairPart(db,owner,again);
      const invalidLineage=part(s,1,2,p.clientUuid);await stage(invalidLineage);await assert.rejects(()=>submitRepairPart(db,owner,invalidLineage),code("REPAIR_CYCLE_OCCUPIED"));
      await decideRepair(db,manager,p.clientUuid,decision(s,p,"withdrawn",1));
      await assert.rejects(()=>decideRepair(db,reviewer,p.clientUuid,decision(s,p,"approved",2)),code("STALE_REPAIR_DECISION"));
      assert.deepEqual((await db.query("SELECT * FROM repair_records WHERE client_uuid=$1",[p.clientUuid])).rows[0],prior);
      assert.equal((await readSubmittedRepair(db,owner,again.clientUuid)).reviewState,"awaiting_approval");
      const rejected=(await db.query("SELECT decision FROM repair_approvals WHERE repair_uuid=$1 ORDER BY sequence DESC LIMIT 1",[q.clientUuid])).rows[0];
      if(rejected.decision==="approved") await decideRepair(db,manager,q.clientUuid,decision(s,q,"withdrawn",1));
      const resubmit=part(s,1,2,q.clientUuid);await stage(resubmit);await submitRepairPart(db,owner,resubmit);
    });
    await t.test("active actor, assignment revocation/reassignment and source eligibility rechecked before writes/replay",async()=>{
      const s=await service(),p=part(s),bytes=await image();await stage(p,bytes);await submitRepairPart(db,owner,p);
      await assert.rejects(()=>submitRepairPart(db,foreign,p),code("REPAIR_NOT_FOUND"));
      // Self-service: read access is open, but write/read-record authority needs the actor's own ACTIVE order. Tech B cannot act under tech A's order.
      await assert.rejects(()=>readSubmittedRepair(db,foreign,p.clientUuid),code("REPAIR_NOT_FOUND"));await assert.rejects(()=>stage(p,bytes,foreign),code("REPAIR_NOT_FOUND"));
      await mutateRepairWorkOrder(db,foreign,{requestId:id(),workOrderId:id(),jobId:s.jobId,systemKey:s.systemKey},"self");
      await assert.rejects(()=>submitRepairPart(db,foreign,p),code("REPAIR_NOT_FOUND"));await assert.rejects(()=>stage(p,bytes,foreign),code("REPAIR_NOT_FOUND"));
      assert.ok(await readSubmittedRepair(db,foreign,p.clientUuid));
      await db.query("UPDATE users SET is_active=false WHERE id=$1",[owner.id]);await assert.rejects(()=>submitRepairPart(db,owner,p),code("AUTH_REQUIRED"));await db.query("UPDATE users SET is_active=true WHERE id=$1",[owner.id]);
      await mutateRepairWorkOrder(db,manager,{requestId:id(),workOrderId:s.order.workOrderId,jobId:s.jobId,systemKey:s.systemKey,assignedToUserId:other.id,expectedRevision:1,status:"active"},"manager");
      await assert.rejects(()=>submitRepairPart(db,owner,p),code("REPAIR_NOT_FOUND"));await assert.rejects(()=>stage(p,bytes),code("REPAIR_NOT_FOUND"));
      await assert.rejects(()=>submitRepairPart(db,other,p),code("STALE_WORK_ORDER"));
      await assert.rejects(()=>submitRepairPart(db,other,{...p,expectedWorkOrderRevision:2}),code("IDEMPOTENCY_CONFLICT"));
      assert.ok(await readSubmittedRepair(db,other,p.clientUuid));
      const q=part(s,1);q.expectedWorkOrderRevision=2;await stage(q,await image(),other);await submitRepairPart(db,other,q);
      await mutateRepairWorkOrder(db,manager,{requestId:id(),workOrderId:s.order.workOrderId,jobId:s.jobId,systemKey:s.systemKey,assignedToUserId:other.id,expectedRevision:2,status:"revoked"},"manager");
      await assert.rejects(()=>readSubmittedRepair(db,other,q.clientUuid),code("REPAIR_NOT_FOUND"));
    });
    async function correct(s:Service,dbClient:Pick<pg.PoolClient,"query">) {
      await dbClient.query(`INSERT INTO inspection_corrections(id,form_instance_id,job_id,system_key,field_path,sequence,previous_value,new_value,reason,corrected_by_user_id,corrected_by_role,request_id,request_fingerprint)
        VALUES($1,$2,$3,$4,'physicalOutlook.cylinderCondition.result',1,'"poor"','"good"','fixture correction',$5,'supervisor',$6,$7)`,[id(),s.row.serverFormInstanceId,s.jobId,s.systemKey,reviewer.id,id(),fingerprint(id())]);
    }
    await t.test("correction races block submit and approval; explicit current eligibility review required",async()=>{
      const s=await service(),p=part(s),q=part(s,1);await stage(p);await stage(q);await submitRepairPart(db,owner,p);
      const correcting=await db.connect();await correcting.query("BEGIN");await correctionLock(correcting,String(s.row.serverFormInstanceId));
      let submitted=false,approved=false;
      const submit=submitRepairPart(db,owner,q).finally(()=>{submitted=true;});const approve=decideRepair(db,reviewer,p.clientUuid,decision(s,p)).finally(()=>{approved=true;});
      // Attach rejection handlers immediately to avoid an unhandled rejection while awaiting the competing caller.
      const observed=Promise.allSettled([submit,approve]);
      await new Promise(r=>setTimeout(r,75));assert.equal(submitted,false);assert.equal(approved,false);
      await correct(s,correcting);await correcting.query("COMMIT");correcting.release();
      const outcomes=await observed;assert.ok(outcomes.every(o=>o.status==="rejected" && code("STALE_SOURCE_REVIEW")(o.reason)));
      s.revision=(await sourceRevision(db,String(s.row.serverFormInstanceId))).revision;
      await assert.rejects(()=>decideRepair(db,reviewer,p.clientUuid,decision(s,p)),code("SOURCE_NOT_ELIGIBLE"));
      await reviewRepairFinding(db,reviewer,p.findingId,{requestId:id(),expectedSourceRevision:s.revision,expectedReviewSequence:0,decision:"eligible",reason:"Repair remains required."});
      await decideRepair(db,reviewer,p.clientUuid,decision(s,p));
      // Authorized receipt replay precedes changed eligibility/lifecycle checks.
      assert.equal((await submitRepairPart(db,owner,p)).clientUuid,p.clientUuid);
      const fresh=part(s,1);await assert.rejects(()=>stage(fresh),code("SOURCE_NOT_ELIGIBLE"));
      await reviewRepairFinding(db,reviewer,fresh.findingId,{requestId:id(),expectedSourceRevision:s.revision,expectedReviewSequence:0,decision:"not_required",reason:"Correction removes requirement."});
      await assert.rejects(()=>stage(fresh),code("SOURCE_NOT_ELIGIBLE"));
    });
    await t.test("multipart auth, strict files, exact receipts and authorized bound After reads",async()=>{
      const s=await service(),p=part(s),bytes=await image();p.manifest[0].sourceSha256=hash(bytes);
      const sourceDetail=await http(`/repairs/findings/${p.findingId}`,"owner");
      assert.equal((await sourceDetail.json() as R).sourceFingerprint,p.sourceFingerprint,"client receives the server fingerprint without internal paths");
      assert.equal((await http("/repairs/submissions","none",{jobId:s.jobId,systemKey:s.systemKey,parts:[p]})).status,401);
      assert.equal((await http("/repairs/submissions","manager",{jobId:s.jobId,systemKey:s.systemKey,parts:[p]})).status,403);
      assert.equal((await http("/repairs/submissions","owner",{jobId:s.jobId,systemKey:s.systemKey,parts:[p]},{"x-expected-user-id":String(other.id)})).status,409);
      const upload=async(actor:string,extra=false,mime="image/jpeg")=>{
        const form=new FormData();form.append("metadata",JSON.stringify(photo(p,bytes)));form.append("file",new Blob([new Uint8Array(bytes)],{type:mime}),"after.jpg");if(extra)form.append("foreign","bad");
        return fetch(origin+"/repairs/evidence/stage",{method:"POST",headers:{"x-test-actor":actor},body:form});
      };
      assert.equal((await upload("none")).status,401);assert.equal((await upload("manager")).status,403);assert.equal((await upload("foreign")).status,404);
      assert.equal((await upload("owner",true)).status,400);assert.equal((await upload("owner",false,"image/png")).status,400);
      const first=await upload("owner");assert.equal(first.status,200);assert.equal((await first.json() as R).photoUuid,p.manifest[0].photoUuid);
      assert.equal((await http(`/repairs/records/${p.clientUuid}/after/content`)).status,404,"staged files cannot be read as submitted");
      const response=await http("/repairs/submissions","owner",{jobId:s.jobId,systemKey:s.systemKey,parts:[p]});assert.equal(response.status,200);
      const result=await response.json() as {results:Array<{receipt:{clientUuid:string}}>};assert.equal(result.results[0].receipt.clientUuid,p.clientUuid);
      assert.equal((await http(`/repairs/records/${p.clientUuid}/after/content`,"foreign")).status,404);
      const content=await http(`/repairs/records/${p.clientUuid}/after/content`,"reviewer");assert.equal(content.status,200);assert.equal(content.headers.get("cache-control"),"private, no-store");
      const actual=(await db.query("SELECT storage_relative_path FROM staged_repair_evidence WHERE repair_uuid=$1",[p.clientUuid])).rows[0];assert.deepEqual(Buffer.from(await content.arrayBuffer()),await readFile(path.join(uploads,actual.storage_relative_path)));
      const detail=await http(`/repairs/records/${p.clientUuid}`,"owner");assert.ok(!JSON.stringify(await detail.json()).includes("storage_relative_path"));
      assert.equal((await http(`/repairs/records/${p.clientUuid}/decisions`,"owner",decision(s,p))).status,403);
      assert.equal((await http(`/repairs/records/${p.clientUuid}/decisions`,"reviewer",{...decision(s,p),decision:["approved"]})).status,400);
    });
    await t.test("reconciliation retains staged/accepted repairs and identifies missing, corrupt and orphan files read-only",async()=>{
      const s=await service(),p=part(s),q=part(s,1);await stage(p);await stage(q);await submitRepairPart(db,owner,p);
      const rows=(await db.query("SELECT * FROM staged_repair_evidence WHERE repair_uuid=ANY($1::uuid[])",[[p.clientUuid,q.clientUuid]])).rows;
      const initial=await reconcileAttachmentStorage();for(const e of rows) assert.ok(!initial.orphanFiles.includes(e.storage_relative_path));
      const accepted=rows.find(e=>e.repair_uuid===p.clientUuid)!,staged=rows.find(e=>e.repair_uuid===q.clientUuid)!;
      await db.query("UPDATE staged_repair_evidence SET metadata=jsonb_set(metadata,'{fieldPath}','\"foreign.path\"') WHERE photo_uuid=$1",[accepted.photo_uuid]);
      await assert.rejects(()=>readSubmittedRepair(db,reviewer,p.clientUuid),code("REPAIR_EVIDENCE_INVALID"));
      await assert.rejects(()=>decideRepair(db,reviewer,p.clientUuid,decision(s,p)),code("REPAIR_EVIDENCE_INVALID"));
      await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[accepted.photo_uuid,accepted.metadata]);
      const ap=path.join(uploads,accepted.storage_relative_path),sp=path.join(uploads,staged.storage_relative_path),a=await readFile(ap),b=await readFile(sp);
      await writeFile(ap,Buffer.alloc(a.length));await rm(sp);const orphan="repairs/orphan/file.jpg";await mkdir(path.dirname(path.join(uploads,orphan)),{recursive:true});await writeFile(path.join(uploads,orphan),a);
      const result=await reconcileAttachmentStorage();assert.ok(result.wrongHashFiles.includes(accepted.storage_relative_path));assert.ok(result.missingFiles.includes(staged.storage_relative_path));assert.ok(result.orphanFiles.includes(orphan));
      assert.deepEqual(await readFile(ap),Buffer.alloc(a.length));assert.deepEqual(await readFile(path.join(uploads,orphan)),a);
      await assert.rejects(()=>readSubmittedRepair(db,reviewer,p.clientUuid),code("REPAIR_EVIDENCE_INVALID"));await writeFile(ap,a);await writeFile(sp,b);
      await writeFile(ap,a.subarray(0,a.length-1));assert.ok((await reconcileAttachmentStorage()).wrongSizeFiles.includes(accepted.storage_relative_path));await writeFile(ap,a);
    });
    await t.test("frozen template, contract and Before absence metadata fail closed on staging and accepted replay/read/decision",async()=>{
      const s=await service(true),p=part(s),bytes=await image();await stage(p,bytes);
      const e=(await db.query("SELECT * FROM staged_repair_evidence WHERE repair_uuid=$1",[p.clientUuid])).rows[0];
      const corruptions=[{...e.metadata,template:{}},{...e.metadata,contractSha256:"0".repeat(64)},
        {...e.metadata,beforePhotoMissing:!e.metadata.beforePhotoMissing},{...e.metadata,unexpected:true}];
      for (const metadata of corruptions) {
        await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[e.photo_uuid,metadata]);
        await assert.rejects(()=>stage(p,bytes),code("REPAIR_EVIDENCE_INVALID"));
        await assert.rejects(()=>submitRepairPart(db,owner,p),code(Object.hasOwn(metadata,"unexpected")?"REPAIR_EVIDENCE_INVALID":"EVIDENCE_NOT_STAGED"));
        assert.equal((await db.query("SELECT 1 FROM repair_records WHERE client_uuid=$1",[p.clientUuid])).rows.length,0);
      }
      await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[e.photo_uuid,e.metadata]);
      const receipt=await submitRepairPart(db,owner,p),approval=decision(s,p);
      for (const metadata of corruptions) {
        await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[e.photo_uuid,metadata]);
        for (const content of [false,true]) await assert.rejects(()=>readSubmittedRepair(db,reviewer,p.clientUuid,content),code("REPAIR_EVIDENCE_INVALID"));
        await assert.rejects(()=>submitRepairPart(db,owner,p),code("REPAIR_EVIDENCE_INVALID"));
        await assert.rejects(()=>stage(p,bytes),code("REPAIR_EVIDENCE_INVALID"));
        await assert.rejects(()=>decideRepair(db,reviewer,p.clientUuid,approval),code("REPAIR_EVIDENCE_INVALID"));
        assert.equal((await db.query("SELECT 1 FROM repair_approvals WHERE repair_uuid=$1",[p.clientUuid])).rows.length,0);
      }
      await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[e.photo_uuid,e.metadata]);
      const approved=await decideRepair(db,reviewer,p.clientUuid,approval);
      for (const metadata of corruptions) {
        await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[e.photo_uuid,metadata]);
        await assert.rejects(()=>decideRepair(db,reviewer,p.clientUuid,approval),code("REPAIR_EVIDENCE_INVALID"));
      }
      await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[e.photo_uuid,e.metadata]);
      assert.deepEqual(await submitRepairPart(db,owner,p),receipt);
      assert.deepEqual(await decideRepair(db,reviewer,p.clientUuid,approval),approved);
      const restored=await readSubmittedRepair(db,reviewer,p.clientUuid);
      assert.equal(new Date(restored.performedAt).toISOString(),p.performedAt);
      assert.equal(restored.reviewState,"approved");
      assert.equal((await db.query("SELECT count(*) FROM repair_approvals WHERE repair_uuid=$1",[p.clientUuid])).rows[0].count,"1");
    });
    await t.test("malformed staged and accepted repair sizes are diagnosed without aborting reconciliation or changing files",async()=>{
      const s=await service(),p=part(s),q=part(s,1);await stage(p);await stage(q);await submitRepairPart(db,owner,p);
      const rows=(await db.query("SELECT * FROM staged_repair_evidence WHERE repair_uuid=ANY($1::uuid[])",[[p.clientUuid,q.clientUuid]])).rows;
      const files=await Promise.all(rows.map(e=>readFile(path.join(uploads,e.storage_relative_path))));
      const healthy=await reconcileAttachmentStorage();
      for (const e of rows) {
        for (const size of ["broken","2147483648",2147483648,Number.MAX_SAFE_INTEGER,1.5,0,-1,null,{},undefined]) {
          await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[e.photo_uuid,{...e.metadata,storedSizeBytes:size}]);
          const result=await reconcileAttachmentStorage();
          assert.ok(result.wrongSizeFiles.includes(e.storage_relative_path));
          assert.ok(!result.orphanFiles.includes(e.storage_relative_path));
          const other=rows.find(row=>row.photo_uuid!==e.photo_uuid)!;
          assert.ok(![...result.missingFiles,...result.wrongSizeFiles,...result.wrongHashFiles].includes(other.storage_relative_path));
        }
        await db.query("UPDATE staged_repair_evidence SET metadata=$2 WHERE photo_uuid=$1",[e.photo_uuid,e.metadata]);
      }
      assert.deepEqual(await reconcileAttachmentStorage(),healthy);
      for (const [index,e] of rows.entries()) assert.deepEqual(await readFile(path.join(uploads,e.storage_relative_path)),files[index]);
    });
    await t.test("inspection authority and closed original visits stay unchanged",async()=>{
      assert.equal((await db.query("SELECT 1 FROM inspection_jobs WHERE is_sample=false AND status<>'closed'")).rows.length,0);
      assert.equal((await db.query("SELECT 1 FROM report_approvals")).rows.length,0);
      assert.ok((await db.query("SELECT count(*) FROM audit_events WHERE action LIKE 'repair.%'")).rows[0].count>0);
      const original=await db.query("SELECT original_metadata,source_fingerprint FROM repair_findings");
      for(const f of original.rows) assert.equal(fingerprint(f.original_metadata),f.source_fingerprint);
    });
  } finally {
    if(server) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    process.env.UPLOADS_PATH=oldUploads;
    await rm(uploads,{recursive:true,force:true});await lock.query("SELECT pg_advisory_unlock(819276)");lock.release();await db.end();await pool.end();
  }
});
