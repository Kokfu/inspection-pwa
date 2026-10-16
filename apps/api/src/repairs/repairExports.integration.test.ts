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
import { issueRepairExport, previewRepairExport, downloadRepairExport, repairExportHistory, parseExportRequest } from "./repairExports.js";
import { closePdfEngine } from "../reports/pdf/htmlToPdf.js";
import { PDFDocument, PDFRawStream, PDFName } from "pdf-lib";
import { extractPdfText } from "../reports/pdf/extractPdfText.testSupport.js";
const url=process.env.SEED_INTEGRATION_DATABASE_URL;
assert.ok(url);assert.equal(process.env.DATABASE_URL,url);assert.equal(process.env.NODE_ENV,"test");
assert.equal(new URL(url).hostname,"127.0.0.1");assert.equal(new URL(url).port,"55432");
const id=()=>randomUUID();const hash=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
const code=(c:string)=>(e:unknown)=>e instanceof RepairError && e.code===c;

test("D approved subsets, PDF evidence, immutable issuance and authority races",{timeout:120000},async t=>{
  const db=new pg.Pool({connectionString:url});const lock=await db.connect();await lock.query("SELECT pg_advisory_lock(819276)");
  const uploads=await mkdtemp(path.join(tmpdir(),"cr09-d-"));const oldUploads=process.env.UPLOADS_PATH;process.env.UPLOADS_PATH=uploads;
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
    async function approved(s: Service,index=0,cycle=1,predecessor:string|null=null) {
      const p=part(s,index,cycle,predecessor);await stage(p);await submitRepairPart(db,owner,p);await decideRepair(db,reviewer,p.clientUuid,decision(s,p));return p;
    }
    function request(s: Service,parts: Part[]) { return {requestId:id(),jobId:s.jobId,systemKey:s.systemKey,
      selection:parts.map(p=>({clientUuid:p.clientUuid,approvalSequence:1,sourceRevision:s.revision,reviewSequence:0})).sort((a,b)=>a.clientUuid.localeCompare(b.clientUuid))}; }
    async function issue(s: Service,parts: Part[]) { const b=request(s,parts);return {b,r:await issueRepairExport(db,reviewer,b)}; }
    await t.test("explicit subset and repeated cycles; both exact JPEG streams embedded; escaped long remarks and page breaks",async()=>{
      const s=await service(true),p=part(s);p.remark='<script>escaped & "long"</script>\n'+("Repair detail with long words. ".repeat(125));
      await stage(p);await submitRepairPart(db,owner,p);await decideRepair(db,reviewer,p.clientUuid,decision(s,p));
      const repeat=await approved(s,0,2,p.clientUuid),pending=part(s,1);await stage(pending);await submitRepairPart(db,owner,pending);
      const b=request(s,[p,repeat]),preview=await previewRepairExport(db,reviewer,b);
      assert.match(preview.html,/PREVIEW - NOT ISSUED/);assert.match(preview.html,/&lt;script&gt;escaped &amp;/);assert.ok(!preview.html.includes(pending.clientUuid));
      const r=await issueRepairExport(db,reviewer,b),download=await downloadRepairExport(db,manager,String(r.exportId));
      assert.deepEqual(r.selection.map((p: R)=>p.clientUuid),b.selection.map(p=>p.clientUuid));
      const pdf=await PDFDocument.load(download.bytes);assert.ok(pdf.getPageCount()>=3);
      const pages=await extractPdfText(download.bytes);
      for(const [index,text] of pages.entries()) { assert.match(text,/FIRE SYSTEM REPAIR REPORT/,`running header on issued page ${index+1}`);assert.ok(text.includes(`Page ${index+1} of ${pages.length}`)); }
      const streams=pdf.context.enumerateIndirectObjects().filter(([,v])=>v instanceof PDFRawStream && v.dict.get(PDFName.of("Subtype"))===PDFName.of("Image")).map(([,v])=>(v as PDFRawStream).getContents());
      const original=s.findings[0].original_metadata.beforePhoto;
      const before=await readFile(path.join(uploads,original.storageRelativePath));
      const afterRow=(await db.query("SELECT storage_relative_path FROM staged_repair_evidence WHERE bound_repair_uuid=$1",[p.clientUuid])).rows[0];
      const after=await readFile(path.join(uploads,afterRow.storage_relative_path));
      assert.ok(streams.some(b=>Buffer.from(b).equals(before)));assert.ok(streams.some(b=>Buffer.from(b).equals(after)));
      await mkdir('../../logs',{recursive:true});await writeFile('../../logs/cr09-d-representative.pdf',download.bytes);await writeFile('../../logs/cr09-d-representative.html',preview.html);
      const originalRows=(await db.query("SELECT response_payload,inspection_snapshot FROM master_system_form_instances WHERE id=$1",[s.row.serverFormInstanceId])).rows;
      assert.ok(originalRows.length);assert.equal((await db.query("SELECT count(*) AS n FROM report_approvals")).rows[0].n,'0');
    });
    await t.test("historical absence is explicit; missing and corrupt required Before/After fail closed",async()=>{
      const s=await service(),p=await approved(s),b=request(s,[p]);
      assert.match((await previewRepairExport(db,reviewer,b)).html,/Historical finding: no original Before photo/);
      const current=await service(true),cp=await approved(current),cb=request(current,[cp]);
      const before=current.findings[0].original_metadata.beforePhoto,filepath=path.join(uploads,before.storageRelativePath),bytes=await readFile(filepath);
      await rm(filepath);await assert.rejects(issueRepairExport(db,reviewer,cb),code('REPAIR_SOURCE_INVALID'));await writeFile(filepath,bytes);
      await writeFile(filepath,Buffer.from('corrupt'));await assert.rejects(previewRepairExport(db,reviewer,cb),code('REPAIR_SOURCE_INVALID'));await writeFile(filepath,bytes);
      const e=(await db.query("SELECT * FROM staged_repair_evidence WHERE bound_repair_uuid=$1",[p.clientUuid])).rows[0],afterPath=path.join(uploads,e.storage_relative_path),after=await readFile(afterPath);
      await writeFile(afterPath,Buffer.from('corrupt'));await assert.rejects(issueRepairExport(db,reviewer,b),code('REPAIR_EVIDENCE_INVALID'));await writeFile(afterPath,after);
      await db.query("UPDATE staged_repair_evidence SET status='staged',bound_repair_uuid=NULL WHERE photo_uuid=$1",[e.photo_uuid]);
      await assert.rejects(issueRepairExport(db,reviewer,b),code('REPAIR_EVIDENCE_INVALID'));
    });
    await t.test("foreign/mixed service, unknown/draft/pending/rejected/withdrawn and unauthorized identities refused",async()=>{
      const s=await service(),p=await approved(s),foreignService=await service(),fp=await approved(foreignService),b=request(s,[p]);
      await assert.rejects(issueRepairExport(db,reviewer,request(s,[p,fp])),code('REPAIR_EXPORT_SCOPE'));
      await assert.rejects(issueRepairExport(db,reviewer,{...b,systemKey:'hydrant'}),code('REPAIR_NOT_FOUND'));
      await assert.rejects(issueRepairExport(db,reviewer,{...b,selection:[{...b.selection[0],clientUuid:id()}]}),code('REPAIR_EXPORT_SCOPE'));
      await assert.rejects(issueRepairExport(db,owner,b),code('FORBIDDEN'));
      await db.query("UPDATE users SET is_active=false WHERE id=$1",[manager.id]);await assert.rejects(issueRepairExport(db,manager,b),code('AUTH_REQUIRED'));await db.query("UPDATE users SET is_active=true WHERE id=$1",[manager.id]);
      for (const state of ['pending','rejected']) { const ss=await service(),pp=part(ss);await stage(pp);await submitRepairPart(db,owner,pp);if(state==='rejected') await decideRepair(db,reviewer,pp.clientUuid,decision(ss,pp,'rejected'));
        await assert.rejects(issueRepairExport(db,reviewer,request(ss,[pp])),code('REPAIR_NOT_APPROVED')); }
      await decideRepair(db,reviewer,p.clientUuid,decision(s,p,'withdrawn',1));await assert.rejects(issueRepairExport(db,reviewer,b),code('REPAIR_NOT_APPROVED'));
      for(const invalid of [{...b,unknown:true},{...b,selection:[]},{...b,selection:[b.selection[0],b.selection[0]]},{...b,selection:[{...b.selection[0],approvalSequence:'1'}]}]) assert.throws(()=>parseExportRequest(invalid),code('INVALID_REPAIR_EXPORT'));
    });
    await t.test("same UUID concurrent/retry returns same number selection and bytes; changed content conflicts globally",async()=>{
      const s=await service(),p=await approved(s),b=request(s,[p]);const results=await Promise.all([issueRepairExport(db,reviewer,b),issueRepairExport(db,reviewer,b)]);
      assert.deepEqual(results[0],results[1]);assert.equal((await db.query("SELECT count(*) AS n FROM repair_exports WHERE request_id=$1",[b.requestId])).rows[0].n,'1');
      await assert.rejects(issueRepairExport(db,manager,b),code('IDEMPOTENCY_CONFLICT'));
      await assert.rejects(issueRepairExport(db,reviewer,{...b,selection:[{...b.selection[0],approvalSequence:2}]}),code('IDEMPOTENCY_CONFLICT'));
      const s2=await service(),p2=await approved(s2);await assert.rejects(issueRepairExport(db,reviewer,{...request(s2,[p2]),requestId:b.requestId}),code('IDEMPOTENCY_CONFLICT'));
      const first=await downloadRepairExport(db,reviewer,String(results[0].exportId));await decideRepair(db,reviewer,p.clientUuid,decision(s,p,'withdrawn',1));
      assert.deepEqual(await issueRepairExport(db,reviewer,b),results[0]);assert.deepEqual((await downloadRepairExport(db,reviewer,String(results[0].exportId))).bytes,first.bytes);
      assert.equal((await repairExportHistory(db,reviewer,s.jobId,s.systemKey)).exports[0].validity[0].state,'approval_withdrawn');
      await assert.rejects(db.query("UPDATE repair_exports SET presentation='changed' WHERE id=$1",[results[0].exportId]),/append-only/);
      await assert.rejects(db.query("DELETE FROM repair_exports WHERE id=$1",[results[0].exportId]),/append-only/);
    });
    await t.test("withdrawal wins locking race: issuance waits then refuses; export wins: immutable history marked withdrawn",async()=>{
      const s=await service(),p=await approved(s),b=request(s,[p]);const hold=await db.connect();
      await hold.query('BEGIN');await hold.query("SELECT pg_advisory_xact_lock(hashtext('repair_service:' || $1 || ':' || $2))",[s.jobId,s.systemKey]);
      let done=false;const attempt=issueRepairExport(db,reviewer,b).then(()=>{done=true;return 'issued';},e=>{done=true;return e.code;});
      await new Promise(r=>setTimeout(r,100));assert.equal(done,false);
      // Use normal decision implementation in the same held transaction.
      const heldDatabase={query:db.query.bind(db),connect:async()=>({query:async(text:string,values?:unknown[])=>['BEGIN','COMMIT','ROLLBACK'].includes(text)?{rows:[]}:hold.query(text,values),release:()=>{}})} as unknown as typeof db;
      await decideRepair(heldDatabase,reviewer,p.clientUuid,decision(s,p,'withdrawn',1));await hold.query('COMMIT');hold.release();assert.equal(await attempt,'REPAIR_NOT_APPROVED');
      const s2=await service(),p2=await approved(s2);const r=await issue(s2,[p2]);await decideRepair(db,reviewer,p2.clientUuid,decision(s2,p2,'withdrawn',1));
      assert.equal((await repairExportHistory(db,reviewer,s2.jobId,s2.systemKey)).exports[0].validity[0].state,'approval_withdrawn');assert.ok((await downloadRepairExport(db,reviewer,String(r.r.exportId))).bytes.length);
    });
    await t.test("correction and source-review races serialize all revisions; stale review blocks export",async()=>{
      const s=await service(),p=await approved(s),b=request(s,[p]),hold=await db.connect();await hold.query('BEGIN');await correctionLock(hold,String(s.row.serverFormInstanceId));
      let done=false;const attempt=issueRepairExport(db,reviewer,b).then(()=>{done=true;return 'issued';},e=>{done=true;return e.code;});await new Promise(r=>setTimeout(r,100));assert.equal(done,false);
      const revision=(await sourceRevision(hold,String(s.row.serverFormInstanceId))).revision;
      await hold.query(`INSERT INTO repair_finding_reviews(id,finding_id,source_revision,decision,reason,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
        VALUES($1,$2,$3,'not_required','Correction reviewed',$4,'supervisor',1,$5,$6)`,[id(),p.findingId,revision,reviewer.id,id(),'0'.repeat(64)]);
      await hold.query('COMMIT');hold.release();assert.equal(await attempt,'STALE_SOURCE_REVIEW');
      const s2=await service(),p2=await approved(s2),issued=await issue(s2,[p2]);
      await reviewRepairFinding(db,reviewer,p2.findingId,{requestId:id(),expectedSourceRevision:s2.revision,expectedReviewSequence:0,decision:'not_required',reason:'Source corrected by reviewer'});
      assert.equal((await repairExportHistory(db,reviewer,s2.jobId,s2.systemKey)).exports[0].validity[0].state,'source_eligibility_changed');
      assert.ok((await downloadRepairExport(db,reviewer,String(issued.r.exportId))).bytes.length);
    });
    await t.test("actual source-correction wins race; old export remains frozen, new request needs explicit current eligibility review",async()=>{
      const s=await service(),p=await approved(s),issued=await issue(s,[p]),b=request(s,[p]),hold=await db.connect();await hold.query('BEGIN');await correctionLock(hold,String(s.row.serverFormInstanceId));
      let done=false;const attempt=issueRepairExport(db,reviewer,b).then(()=>{done=true;return 'issued';},e=>{done=true;return e.code;});await new Promise(r=>setTimeout(r,100));assert.equal(done,false);
      await hold.query(`INSERT INTO inspection_corrections(id,form_instance_id,job_id,system_key,field_path,sequence,previous_value,new_value,reason,corrected_by_user_id,corrected_by_role,request_id,request_fingerprint)
        VALUES($1,$2,$3,$4,'physicalOutlook.cylinderCondition.result',1,'"poor"','"good"','fixture correction',$5,'supervisor',$6,$7)`,[id(),s.row.serverFormInstanceId,s.jobId,s.systemKey,reviewer.id,id(),fingerprint(id())]);
      await hold.query('COMMIT');hold.release();assert.equal(await attempt,'STALE_SOURCE_REVIEW');
      assert.deepEqual(await issueRepairExport(db,reviewer,issued.b),issued.r);
      assert.equal((await repairExportHistory(db,reviewer,s.jobId,s.systemKey)).exports[0].validity[0].state,'source_eligibility_changed');
      const revision=(await sourceRevision(db,String(s.row.serverFormInstanceId))).revision;
      await reviewRepairFinding(db,reviewer,p.findingId,{requestId:id(),expectedSourceRevision:revision,expectedReviewSequence:0,decision:'eligible',reason:'Continue repair after correction review'});
      const current={...b,selection:[{...b.selection[0],sourceRevision:revision,reviewSequence:1}]};assert.ok((await issueRepairExport(db,reviewer,current)).exportId);
    });
    await t.test("export owns locks through rendering/commit: concurrent withdrawal and correction wait",async()=>{
      const s=await service(),p=await approved(s),b=request(s,[p]);let reached!:()=>void,resume!:()=>void;
      const atInsert=new Promise<void>(r=>{reached=r;}),release=new Promise<void>(r=>{resume=r;});
      const intercepted={query:db.query.bind(db),connect:async()=>{const c=await db.connect();return {release:()=>c.release(),query:async(text:string,values?:unknown[])=>{
        if(text.startsWith('INSERT INTO repair_exports')){reached();await release;}return c.query(text,values);
      }};}} as unknown as typeof db;
      const issuing=issueRepairExport(intercepted,reviewer,b);await atInsert;let withdrawalDone=false,correctionDone=false;
      const withdrawing=decideRepair(db,reviewer,p.clientUuid,decision(s,p,'withdrawn',1)).finally(()=>{withdrawalDone=true;});
      const correcting=(async()=>{const c=await db.connect();try{await c.query('BEGIN');await correctionLock(c,String(s.row.serverFormInstanceId));
        await c.query(`INSERT INTO inspection_corrections(id,form_instance_id,job_id,system_key,field_path,sequence,previous_value,new_value,reason,corrected_by_user_id,corrected_by_role,request_id,request_fingerprint)
          VALUES($1,$2,$3,$4,'physicalOutlook.cylinderCondition.result',1,'"poor"','"good"','concurrent correction',$5,'supervisor',$6,$7)`,[id(),s.row.serverFormInstanceId,s.jobId,s.systemKey,reviewer.id,id(),fingerprint(id())]);await c.query('COMMIT');
        }finally{c.release();correctionDone=true;}})();
      await new Promise(r=>setTimeout(r,100));assert.equal(withdrawalDone,false);assert.equal(correctionDone,false);resume();const issued=await issuing;
      const completed=await Promise.allSettled([withdrawing,correcting]);assert.equal(completed[1].status,'fulfilled');
      // Depending on correction/withdrawal order, withdrawal either succeeds or
      // refuses its stale revision. Neither can rewrite the issued selection.
      if(completed[0].status==='rejected') assert.ok(code('STALE_SOURCE_REVIEW')(completed[0].reason));
      assert.deepEqual(await issueRepairExport(db,reviewer,b),issued);assert.ok((await downloadRepairExport(db,reviewer,issued.exportId)).bytes.length);
      const state=(await repairExportHistory(db,reviewer,s.jobId,s.systemKey)).exports[0].validity[0].state;
      assert.ok(['approval_withdrawn','source_eligibility_changed'].includes(state));
    });
    await t.test("production routes role gate, expected actor, no-store and immutable download",async()=>{
      const s=await service(),p=await approved(s),b=request(s,[p]);const app=express();app.use(express.json());const actors:Record<string,CurrentUser>={owner,manager,reviewer};
      app.use((req,_res,next)=>{req.currentUser=actors[req.header('x-test-actor')??'none'];next();});app.use(createRepairsRouter(db));
      app.use((e:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(e instanceof RepairError?e.status:500).json({error:e instanceof RepairError?e.code:'INTERNAL'});});
      server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
      const post=(actor:string,headers:Record<string,string>={})=>fetch(origin+'/repairs/exports',{method:'POST',headers:{'x-test-actor':actor,'Content-Type':'application/json',...headers},body:JSON.stringify(b)});
      assert.equal((await post('none')).status,401);assert.equal((await post('owner')).status,403);assert.equal((await post('reviewer',{'x-expected-user-id':String(owner.id)})).status,409);
      const r=await post('reviewer');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');const value=await r.json() as {exportId:string};
      const d=await fetch(`${origin}/repairs/exports/${value.exportId}/pdf`,{headers:{'x-test-actor':'manager'}});assert.equal(d.status,200);assert.equal(d.headers.get('content-type'),'application/pdf');assert.match(d.headers.get('content-disposition')!,/attachment/);
      await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));server=undefined;
    });
    await t.test("stale approval/review sequences and malformed authority refused; no ordinary report side effects",async()=>{
      const s=await service(),p=await approved(s),b=request(s,[p]);
      for(const selection of [{...b.selection[0],approvalSequence:2},{...b.selection[0],sourceRevision:'f'.repeat(64)},{...b.selection[0],reviewSequence:1}]) await assert.rejects(issueRepairExport(db,reviewer,{...b,selection:[selection]}),e=>e instanceof RepairError);
      await db.query("DELETE FROM audit_events WHERE action='repair.decision' AND entity_id=$1",[p.clientUuid]);await assert.rejects(issueRepairExport(db,reviewer,b),code('INVALID_REPAIR_APPROVAL'));
      assert.equal((await db.query("SELECT count(*) AS n FROM report_approvals")).rows[0].n,'0');
    });
  } finally {
    if(server) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    await closePdfEngine();process.env.UPLOADS_PATH=oldUploads;
    await rm(uploads,{recursive:true,force:true});await lock.query("SELECT pg_advisory_unlock(819276)");lock.release();await db.end();await pool.end();
  }
});

