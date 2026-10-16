import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID,createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir,writeFile,rm,mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { createRepairsRouter } from "../routes/repairs.js";
import { masterSystemInspectionsRouter } from "../routes/masterSystemInspections.js";
import { fixture,systems } from "./repairFixtures.js";
import { historicalFixture,legacyFireAlarmV7Fixture } from "./historicalFixtures.js";
import { readFindingParts, RepairError, type R } from "./findingReaders.js";
import { extractRepairSource,fingerprint,sourceRevision } from "./acceptedSource.js";
import { materializeRepairFindings,mutateRepairWorkOrder,reviewRepairFinding,readRepairService,correctionLock } from "./repairFoundation.js";
import type {CurrentUser} from "../auth/authTypes.js";

const url=process.env.SEED_INTEGRATION_DATABASE_URL;
// A missing disposable environment is a failing gate, never a skipped proof.
assert.ok(url);assert.equal(process.env.DATABASE_URL,url);assert.equal(process.env.NODE_ENV,"test");
assert.equal(new URL(url).hostname,"127.0.0.1");assert.equal(new URL(url).port,"55432");
const id=()=>randomUUID();
const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");

test("B1 cold schema, accepted authority, assignments, eligibility locks and cycle constraints",{timeout:120000},async t=>{
  const db=new pg.Pool({connectionString:url});const lock=await db.connect();await lock.query("SELECT pg_advisory_lock(819276)");
  const uploads=await mkdtemp(path.join(tmpdir(),"cr09-b1-"));process.env.UPLOADS_PATH=uploads;
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await db.query("DROP SCHEMA public CASCADE;CREATE SCHEMA public;");await runMigrations(db);
    const actor=async(role:CurrentUser["role"]):Promise<CurrentUser>=>{
      const username=`repair-${id()}`;const r=await db.query("INSERT INTO users(username,password_hash,role) VALUES($1,'fixture',$2) RETURNING id",[username,role]);
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
        const bytes=await sharp({create:{width:2,height:2,channels:3,background:{r:index*7%255,g:80,b:130}}}).jpeg().toBuffer();
        const relative=`inspections/${row.clientUuid}/${m.photoUuid}.jpg`;await mkdir(path.dirname(path.join(uploads,relative)),{recursive:true});await writeFile(path.join(uploads,relative),bytes);
        // Manifest source hashes are deliberately distinct from normalized stored hashes.
        await db.query(`INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status,form_instance_id,accepted_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'image/jpeg',$13,2,2,$13,2,2,$14,'accepted',$15,now())`,[m.photoUuid,row.clientUuid,row.jobId,row.systemKey,m.fieldPath,template.id,template.version,extracted.contractSha256,owner.id,fingerprint(m),m.sourceSha256||hash(bytes),hash(bytes),bytes.length,relative,row.serverFormInstanceId]);
      }
      return row;
    }
    const seeded:R[]=[];
    await t.test("all 11 V7 systems: bound photos, exact frozen identity and replayed materialization",async()=>{
      for(const system of systems){const row=await seed(fixture(system).row);seeded.push(row);
        const source=await extractRepairSource(db,String(row.serverFormInstanceId));assert.ok(source.parts.length>0);
        const first=await materializeRepairFindings(db,{jobId:String(row.jobId),limit:100});assert.equal(first.inserted,source.parts.length);
        const second=await materializeRepairFindings(db,{jobId:String(row.jobId),limit:100});assert.equal(second.inserted,0);
      }
    });
    await t.test("historical absent Before is explicit for every supported Poor shape",async()=>{
      for(const system of ["co2_fire_extinguisher","wet_chemical","hose_reel","automatic_sprinkler","dry_wet_riser","hydrant","fire_alarm_detector"]){
        const row=await seed(historicalFixture(system));
        const source=await extractRepairSource(db,String(row.serverFormInstanceId));assert.ok(source.parts.every(p=>p.beforePhotoMissing&&p.beforePhoto===null&&p.beforePhotoLabel.includes("Historical")));
        assert.ok((await materializeRepairFindings(db,{jobId:String(row.jobId),limit:100})).inserted>0);
      }
      const v6=await seed(historicalFixture("fire_alarm_detector",true));
      const source=await extractRepairSource(db,String(v6.serverFormInstanceId));assert.ok(source.parts.every(p=>!p.beforePhotoMissing&&p.beforePhoto));
      await materializeRepairFindings(db,{jobId:String(v6.jobId),limit:100});
    });
    const row=seeded[0]!,jobId=String(row.jobId),systemKey=String(row.systemKey);
    const finding=(await db.query("SELECT * FROM repair_findings WHERE job_id=$1 ORDER BY field_path LIMIT 1",[jobId])).rows[0];
    const findingId=finding.id as string;
    // Repair reads and assignments remain valid for a closed original visit; never reopen it.
    await db.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,report_number=$3,technician_team_snapshot='[]'::jsonb WHERE id=$1",[jobId,owner.id,`B1-${jobId}`]);
    const actors:Record<string,CurrentUser>={owner,other,foreign,manager,reviewer};
    const app=express();app.use(express.json());app.use((req,_res,next)=>{req.currentUser=actors[req.header("x-test-actor")??"owner"];next();});
    app.use(createRepairsRouter(db));app.use(masterSystemInspectionsRouter);
    app.use((e:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(e instanceof RepairError)res.status(e.status).json({error:e.code});else {console.error(e);res.status(500).json({error:"INTERNAL"});}});
    server=app.listen(0,"127.0.0.1");await once(server,"listening");const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const http=(p:string,actor="owner",body?:unknown)=>fetch(origin+p,{method:body===undefined?"GET":"POST",headers:{"x-test-actor":actor,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
    await t.test("legacy frozen Fire Alarm V7: batch/replay, scoped reads and required original Before bytes",async()=>{
      const legacyFixture=legacyFireAlarmV7Fixture();
      legacyFixture.serverFormInstanceId="00000000-0000-4000-8000-000000000012";
      const legacy=await seed(legacyFixture), legacyJobId=String(legacy.jobId), legacyFormId=String(legacy.serverFormInstanceId);
      const acceptedBefore=(await db.query("SELECT inspection_snapshot,response_payload FROM master_system_form_instances WHERE id=$1",[legacyFormId])).rows[0];
      const source=await extractRepairSource(db,legacyFormId);
      assert.equal(source.parts.length,10);assert.ok(source.parts.every(p=>p.result==="poor"&&!p.beforePhotoMissing&&p.beforePhoto));
      const currentFixture=fixture("fire_alarm_detector").row;
      currentFixture.serverFormInstanceId="00000000-0000-4000-8000-000000000011";
      await seed(currentFixture);
      const batch=await materializeRepairFindings(db,{afterFormId:"00000000-0000-4000-8000-000000000010",limit:2});
      assert.equal(batch.scanned,2);assert.equal(batch.nextCursor,legacyFormId);
      assert.equal(batch.inserted,source.parts.length+readFindingParts(currentFixture).parts.length);
      const frozen=(await db.query("SELECT * FROM repair_findings WHERE form_instance_id=$1 ORDER BY field_path",[legacyFormId])).rows;
      assert.equal((await materializeRepairFindings(db,{jobId:legacyJobId,limit:100})).inserted,0);
      assert.deepEqual((await db.query("SELECT * FROM repair_findings WHERE form_instance_id=$1 ORDER BY field_path",[legacyFormId])).rows,frozen);
      const service=await readRepairService(db,owner,legacyJobId,"fire_alarm_detector");assert.equal(service.findings.length,10);
      const oldFinding=frozen[0], photo=oldFinding.original_metadata.beforePhoto;
      const endpoint=`/repairs/findings/${oldFinding.id}`;
      assert.equal((await http(endpoint,"foreign")).status,200);
      assert.equal((await http(`${endpoint}/before/content`,"foreign")).status,200);
      const beforeResponse=await http(`${endpoint}/before/content`);assert.equal(beforeResponse.status,200);
      const bytes=Buffer.from(await beforeResponse.arrayBuffer());assert.equal(hash(bytes),photo.storedSha256);
      const assignment={requestId:id(),workOrderId:id(),jobId:legacyJobId,systemKey:"fire_alarm_detector",assignedToUserId:other.id,expectedRevision:0,status:"active"};
      assert.equal((await http("/repairs/work-orders","manager",assignment)).status,200);
      assert.equal((await http(endpoint,"owner")).status,200);assert.equal((await http(endpoint,"other")).status,200);
      const assignedBefore=await http(`${endpoint}/before/content`,"other");assert.equal(assignedBefore.status,200);
      assert.deepEqual(Buffer.from(await assignedBefore.arrayBuffer()),bytes);
      const filename=path.join(uploads,photo.storageRelativePath);
      await writeFile(filename,Buffer.from("corrupt legacy Before"));
      await assert.rejects(()=>extractRepairSource(db,legacyFormId),/invalid/);
      assert.equal((await http(`${endpoint}/before/content`,"other")).status,409);
      await rm(filename);await assert.rejects(()=>materializeRepairFindings(db,{jobId:legacyJobId,limit:100}),/invalid/);
      await writeFile(filename,bytes);
      await db.query("UPDATE staged_inspection_evidence SET field_path='foreign.path' WHERE photo_uuid=$1",[photo.photoUuid]);
      await assert.rejects(()=>extractRepairSource(db,legacyFormId),/invalid/);
      await db.query("UPDATE staged_inspection_evidence SET field_path=$2 WHERE photo_uuid=$1",[photo.photoUuid,photo.fieldPath]);
      assert.equal((await http(`${endpoint}/before/content`,"other")).status,200);
      assert.deepEqual((await db.query("SELECT inspection_snapshot,response_payload FROM master_system_form_instances WHERE id=$1",[legacyFormId])).rows[0],acceptedBefore);
      assert.deepEqual((await db.query("SELECT * FROM repair_findings WHERE form_instance_id=$1 ORDER BY field_path",[legacyFormId])).rows,frozen);
    });
    const detail=`/repairs/findings/${findingId}`;
    let orderId:string=id(), assignment:R;
    await t.test("HTTP authentication/owner/foreign/unknown and no original inspection widening",async()=>{
      assert.equal((await http(detail,"none")).status,401);assert.equal((await http(detail)).status,200);
      assert.equal((await http(detail,"foreign")).status,200);assert.equal((await http(`/repairs/findings/${id()}`,"foreign")).status,404);
      assert.equal((await http(`${detail}/before/content`)).status,200);assert.equal((await http(`${detail}/before/content`,"foreign")).status,200);
      assert.equal((await http(detail,"reviewer")).status,200);
      assert.equal((await http("/repairs/work-orders","reviewer",{})).status,403);
      assert.equal((await http("/repairs/work-orders/self-start","manager",{})).status,403);
      assert.equal((await http(`${detail}?unknown=true`)).status,400);
      assert.equal((await fetch(origin+detail,{headers:{"x-test-actor":"owner","x-expected-user-id":String(other.id)}})).status,409);
    });
    await t.test("self-start replay; manager reassign/revoke audited; old actor cannot self-start or replay",async()=>{
      const body={requestId:id(),workOrderId:orderId,jobId,systemKey};
      const first=await http("/repairs/work-orders/self-start","owner",body);assert.equal(first.status,200);const receipt=await first.json();
      assert.deepEqual(await(await http("/repairs/work-orders/self-start","owner",body)).json(),receipt);
      assert.equal((await http("/repairs/work-orders/self-start","owner",{...body,extra:true})).status,400);
      assignment={requestId:id(),workOrderId:orderId,jobId,systemKey,assignedToUserId:other.id,expectedRevision:1,status:"active"};
      assert.equal((await http("/repairs/work-orders","manager",assignment)).status,200);
      assert.equal((await http(detail,"other")).status,200);assert.equal((await http(`${detail}/before/content`,"other")).status,200);
      assert.equal((await http(detail)).status,200);
      assert.equal((await http(`/co2-inspections/${row.clientUuid}`,"other")).status,404);
      assert.equal((await http("/repairs/work-orders/self-start","owner",body)).status,404);
      const selfOwner=await http("/repairs/work-orders/self-start","owner",{...body,requestId:id(),workOrderId:id()});assert.equal(selfOwner.status,200);const selfReceipt=await selfOwner.json();assert.equal(selfReceipt.assignedToUserId,owner.id);
      const receipt2=await(await http("/repairs/work-orders","manager",assignment)).json();assert.equal(receipt2.revision,2);
      assert.equal((await http("/repairs/work-orders","manager",{...assignment,status:"revoked"})).status,409);
      assert.equal((await http("/repairs/work-orders","manager",{...assignment,requestId:id(),expectedRevision:2,status:"revoked"})).status,200);
      assert.equal((await http(`${detail}/before/content`,"other")).status,200);
      assert.deepEqual(await(await http("/repairs/work-orders/self-start","owner",{...body,requestId:id(),workOrderId:id()})).json(),selfReceipt);
      assert.equal((await db.query("SELECT * FROM audit_events WHERE action='repair.assignment' AND entity_id=$1",[orderId])).rows.length,3);
      assert.equal((await http("/repairs/work-orders","manager",{...assignment,requestId:id(),workOrderId:id(),expectedRevision:0,assignedToUserId:reviewer.id})).status,400);
      await db.query("UPDATE users SET is_active=false WHERE id=$1",[other.id]);
      assert.equal((await http("/repairs/work-orders","manager",{...assignment,requestId:id(),workOrderId:id(),expectedRevision:0})).status,400);
      await db.query("UPDATE users SET is_active=true WHERE id=$1",[other.id]);
      const extra={...assignment,requestId:id(),workOrderId:id(),expectedRevision:0};assert.equal((await http("/repairs/work-orders","manager",extra)).status,200);orderId=String(extra.workOrderId);
      assert.equal((await http("/repairs/work-orders","manager",{...extra,requestId:id(),status:["active"]})).status,400);
      const raced=await Promise.all([http("/repairs/work-orders","manager",{...extra,requestId:id(),expectedRevision:1}),http("/repairs/work-orders","manager",{...extra,requestId:id(),expectedRevision:1})]);
      assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);
    });
    await t.test("technician self-service: every active technician sees all services, self-start is idempotent and revocation still binds",async()=>{
      const svcRow=fixture("hydrant").row;await seed(svcRow);
      const sJob=String(svcRow.jobId),sKey=String(svcRow.systemKey);
      await materializeRepairFindings(db,{jobId:sJob,limit:100});
      const errorCode=(c:string)=>(e:unknown)=>(e as {code?:string}).code===c;
      const listed=async(who:string)=>((await(await http("/repairs/services",who)).json()) as {services:Array<{jobId:string}>}).services.map(s=>s.jobId);
      // Technician B never created, was never assigned and owns no order, yet sees every service and all findings.
      assert.ok((await listed("foreign")).includes(sJob));assert.ok((await listed("other")).includes(sJob));
      const seen=await readRepairService(db,foreign,sJob,sKey);assert.ok(seen.findings.length>0);assert.deepEqual(seen.workOrders,[]);
      const finding0=seen.findings[0].findingId;
      assert.equal((await http(`/repairs/findings/${finding0}`,"foreign")).status,200);assert.equal((await http(`/repairs/findings/${finding0}/before/content`,"foreign")).status,200);
      // Self-start creates an order; same requestId is an exact replay; a second device/order id reuses the one ACTIVE order.
      const body={requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey};
      const receipt=await mutateRepairWorkOrder(db,foreign,body,"self") as {status:string;revision:number;assignedToUserId:number;workOrderId:string};
      assert.equal(receipt.status,"active");assert.equal(receipt.revision,1);assert.equal(receipt.assignedToUserId,foreign.id);
      assert.deepEqual(await mutateRepairWorkOrder(db,foreign,body,"self"),receipt);
      assert.deepEqual(await mutateRepairWorkOrder(db,foreign,{requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey},"self"),receipt);
      const activeOf=async(user:CurrentUser)=>(await db.query("SELECT id FROM repair_work_orders WHERE job_id=$1 AND system_key=$2 AND assigned_to_user_id=$3 AND status='active'",[sJob,sKey,user.id])).rows.length;
      assert.equal(await activeOf(foreign),1);
      // Same requestId with different content is refused.
      await assert.rejects(()=>mutateRepairWorkOrder(db,foreign,{...body,workOrderId:id()},"self"),errorCode("IDEMPOTENCY_CONFLICT"));
      // Concurrent first starts from two devices still produce exactly one ACTIVE order.
      const racers=await Promise.all([1,2,3].map(()=>mutateRepairWorkOrder(db,other,{requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey},"self")));
      for(const r of racers)assert.deepEqual(r,racers[0]);assert.equal(await activeOf(other),1);
      // Technician A and B hold separate orders for the same service; each sees only their own order.
      assert.equal((await readRepairService(db,foreign,sJob,sKey)).workOrders.length,1);assert.equal((await readRepairService(db,reviewer,sJob,sKey)).workOrders.length,2);
      // Manager assignment still works alongside self orders, and revoking binds that technician out of self-start.
      const otherOrder=(racers[0] as {workOrderId:string}).workOrderId;
      assert.equal((await http("/repairs/work-orders","manager",{requestId:id(),workOrderId:otherOrder,jobId:sJob,systemKey:sKey,assignedToUserId:other.id,expectedRevision:1,status:"revoked"})).status,200);
      await assert.rejects(()=>mutateRepairWorkOrder(db,other,{requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey},"self"),errorCode("WORK_ORDER_REVOKED"));
      assert.equal((await http("/repairs/work-orders/self-start","other",{requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey})).status,403);
      assert.equal(await activeOf(other),0);assert.equal(await activeOf(foreign),1);
      // A revoked technician still reads findings (read access is open) but gains no write authority.
      assert.equal((await http(`/repairs/findings/${finding0}`,"other")).status,200);
      // Inactive users, managers/supervisors and cross-service replays are refused.
      const idle=await actor("inspector");await db.query("UPDATE users SET is_active=false WHERE id=$1",[idle.id]);
      await assert.rejects(()=>mutateRepairWorkOrder(db,idle,{requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey},"self"),errorCode("AUTH_REQUIRED"));
      assert.equal((await http("/repairs/services","none")).status,401);
      await assert.rejects(()=>mutateRepairWorkOrder(db,foreign,{requestId:id(),workOrderId:receipt.workOrderId,jobId:jobId,systemKey:sKey},"self"),errorCode("REPAIR_NOT_FOUND"));
      // Another technician cannot take over B's order id through self-start.
      await assert.rejects(()=>mutateRepairWorkOrder(db,owner,{requestId:id(),workOrderId:receipt.workOrderId,jobId:sJob,systemKey:sKey},"self"),errorCode("REPAIR_NOT_FOUND"));
      // One ACTIVE order per (technician, job, system): manager assignment cannot create a second one.
      const mgr=(o:Record<string,unknown>)=>mutateRepairWorkOrder(db,manager,{requestId:id(),jobId:sJob,systemKey:sKey,...o},"manager") as Promise<{workOrderId:string;revision:number;status:string}>;
      const activeCount=async(user:CurrentUser)=>(await db.query("SELECT id FROM repair_work_orders WHERE job_id=$1 AND system_key=$2 AND assigned_to_user_id=$3 AND status='active'",[sJob,sKey,user.id])).rows.length;
      // Self-start then manager assigns a NEW id to the same technician => 409, still one active row.
      const t1=await actor("inspector");
      const t1Self=await mutateRepairWorkOrder(db,t1,{requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey},"self") as {workOrderId:string};
      await assert.rejects(()=>mgr({workOrderId:id(),assignedToUserId:t1.id,expectedRevision:0,status:"active"}),errorCode("WORK_ORDER_ALREADY_ACTIVE"));
      assert.equal(await activeCount(t1),1);
      // Re-activating the SAME order id stays allowed (revoke, then re-activate).
      const rev=await mgr({workOrderId:t1Self.workOrderId,assignedToUserId:t1.id,expectedRevision:1,status:"revoked"});assert.equal(rev.status,"revoked");
      assert.equal(await activeCount(t1),0);
      const react=await mgr({workOrderId:t1Self.workOrderId,assignedToUserId:t1.id,expectedRevision:2,status:"active"});assert.equal(react.status,"active");assert.equal(await activeCount(t1),1);
      // Manager assigns first, then self-start returns that order's receipt without a second active row.
      const t2=await actor("inspector");const mOrder=id();
      const assigned=await mgr({workOrderId:mOrder,assignedToUserId:t2.id,expectedRevision:0,status:"active"});
      assert.deepEqual(await mutateRepairWorkOrder(db,t2,{requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey},"self"),assigned);
      assert.equal(await activeCount(t2),1);
      // Manager reassign A->B where B already holds a self-started order => 409; A unchanged.
      const t3=await actor("inspector");
      await mutateRepairWorkOrder(db,t3,{requestId:id(),workOrderId:id(),jobId:sJob,systemKey:sKey},"self");
      await assert.rejects(()=>mgr({workOrderId:mOrder,assignedToUserId:t3.id,expectedRevision:1,status:"active"}),errorCode("WORK_ORDER_ALREADY_ACTIVE"));
      assert.equal(await activeCount(t3),1);assert.equal(await activeCount(t2),1);
      // Revoke then assign a NEW id to the same technician still works.
      const t4=await actor("inspector");const a4=id();
      await mgr({workOrderId:a4,assignedToUserId:t4.id,expectedRevision:0,status:"active"});
      await mgr({workOrderId:a4,assignedToUserId:t4.id,expectedRevision:1,status:"revoked"});
      const fresh4=await mgr({workOrderId:id(),assignedToUserId:t4.id,expectedRevision:0,status:"active"});assert.equal(fresh4.status,"active");assert.equal(await activeCount(t4),1);
      // Replay of an old successful assign request after a conflicting active order exists still returns its receipt.
      const t5=await actor("inspector");const a5=id(),r5=id();
      const first5=await mgr({requestId:r5,workOrderId:a5,assignedToUserId:t5.id,expectedRevision:0,status:"active"});
      await mgr({requestId:id(),workOrderId:a5,assignedToUserId:t5.id,expectedRevision:1,status:"revoked"});
      await mgr({workOrderId:id(),assignedToUserId:t5.id,expectedRevision:0,status:"active"});
      assert.deepEqual(await mgr({requestId:r5,workOrderId:a5,assignedToUserId:t5.id,expectedRevision:0,status:"active"}),first5);
      assert.equal(await activeCount(t5),1);
    });
    await t.test("source correction revisions, stale decisions, idempotent concurrent reviews and original Before preserved",async()=>{
      const original=structuredClone(finding.original_metadata);
      const revision=await sourceRevision(db,String(row.serverFormInstanceId));
      const body={requestId:id(),expectedSourceRevision:revision.revision,expectedReviewSequence:0,decision:"eligible",reason:"Continue original repair"};
      const two=await Promise.all([reviewRepairFinding(db,reviewer,findingId,body),reviewRepairFinding(db,reviewer,findingId,body)]);assert.deepEqual(two[0],two[1]);
      await assert.rejects(()=>reviewRepairFinding(db,reviewer,findingId,{...body,decision:"not_required"}),/different content/);
      const correcting=await db.connect();await correcting.query("BEGIN");await correctionLock(correcting,String(row.serverFormInstanceId));
      let settled=false;const pending=reviewRepairFinding(db,reviewer,findingId,{...body,requestId:id(),expectedReviewSequence:1}).finally(()=>{settled=true;});
      // Correction writer holds the SAME advisory lock. The reviewer must wait until the revision changes.
      await new Promise(resolve=>setTimeout(resolve,75));assert.equal(settled,false);
      await correcting.query(`INSERT INTO inspection_corrections(id,form_instance_id,job_id,system_key,field_path,sequence,previous_value,new_value,reason,corrected_by_user_id,corrected_by_role,request_id,request_fingerprint)
        VALUES($1,$2,$3,$4,'chargerAndBatteries.battery.result',1,'"not_good"','"good"','fixture correction',$5,'supervisor',$6,$7)`,[id(),row.serverFormInstanceId,jobId,systemKey,reviewer.id,id(),fingerprint("correction")]);
      await correcting.query("COMMIT");correcting.release();await assert.rejects(()=>pending,/revision changed/);
      const after=await readRepairService(db,reviewer,jobId,systemKey);assert.ok(after.findings.every(f=>f.eligibility==="needs_review"));
      const current=await sourceRevision(db,String(row.serverFormInstanceId));
      const reviewed=await reviewRepairFinding(db,manager,findingId,{...body,requestId:id(),expectedSourceRevision:current.revision,expectedReviewSequence:1,decision:"not_required"});assert.equal(reviewed.sequence,2);
      const eligible=(await readRepairService(db,reviewer,jobId,systemKey)).findings.find(f=>f.findingId===findingId)!;assert.equal(eligible.eligibility,"not_required");
      assert.deepEqual((await db.query("SELECT original_metadata FROM repair_findings WHERE id=$1",[findingId])).rows[0].original_metadata,original);
      assert.equal((await materializeRepairFindings(db,{jobId,limit:100})).inserted,0);
      assert.equal((await http(`${detail}/source-review`,"other",body)).status,403);
      assert.equal((await http(`${detail}/source-review`,"manager",{...body,extra:true})).status,400);
      assert.equal((await http(`${detail}/source-review`,"manager",{...body,decision:["eligible"]})).status,400);
      const competing={...body,expectedSourceRevision:current.revision,expectedReviewSequence:2,decision:"eligible"};
      const decisions=await Promise.allSettled([reviewRepairFinding(db,manager,findingId,{...competing,requestId:id()}),reviewRepairFinding(db,reviewer,findingId,{...competing,requestId:id()})]);
      assert.equal(decisions.filter(r=>r.status==="fulfilled").length,1);
    });
    await t.test("repair cycles: immutable approved history, validated predecessor and only one awaiting record under race",async()=>{
      const insert=async(repairId:string,seq:number,previous:string|null)=>db.query(`INSERT INTO repair_records(client_uuid,finding_id,work_order_id,job_id,system_key,cycle_sequence,predecessor_uuid,remark,performed_at,submitted_by_user_id,source_revision,manifest,request_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,'Repaired','2026-10-12T00:00:00Z',$8,$9,'[{}]',$10)`,[repairId,findingId,orderId,jobId,systemKey,seq,previous,other.id,fingerprint("revision"),fingerprint(repairId)]);
      const first=id();await insert(first,1,null);await assert.rejects(()=>insert(id(),2,first),e=>(e as {code:string}).code==="23505");
      await db.query("INSERT INTO repair_approvals(id,repair_uuid,decision,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint) VALUES($1,$2,'approved',$3,'supervisor',1,$4,$5)",[id(),first,reviewer.id,id(),fingerprint("approval")]);
      await assert.rejects(()=>insert(id(),2,id()));
      const results=await Promise.allSettled([insert(id(),2,first),insert(id(),2,first)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      assert.equal((await db.query("SELECT * FROM repair_records WHERE finding_id=$1",[findingId])).rows.length,2);
      await assert.rejects(()=>db.query("UPDATE repair_records SET remark='Changed' WHERE client_uuid=$1",[first]),/append-only/);
      await assert.rejects(()=>db.query("DELETE FROM repair_approvals WHERE repair_uuid=$1",[first]),/append-only/);
      await assert.rejects(()=>db.query("UPDATE repair_findings SET field_path='foreign' WHERE id=$1",[findingId]),/append-only/);
      const evidence=async(repairId:string,binding:string|null,source:string,stored:string)=>db.query(`INSERT INTO staged_repair_evidence
        (photo_uuid,repair_uuid,finding_id,work_order_id,job_id,system_key,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,metadata,storage_relative_path,status,bound_repair_uuid)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}',$11,'accepted',$12)`,[id(),repairId,findingId,orderId,jobId,systemKey,other.id,fingerprint(repairId),source,stored,`repair-fixture/${id()}.jpg`,binding]);
      await assert.rejects(()=>evidence(first,null,"c".repeat(64),"d".repeat(64)),e=>(e as {code:string}).code==="23514","accepted repair evidence must actually be bound");
      await evidence(first,first,"c".repeat(64),"d".repeat(64));
      const next=(await db.query("SELECT client_uuid FROM repair_records WHERE finding_id=$1 AND cycle_sequence=2",[findingId])).rows[0].client_uuid;
      await assert.rejects(()=>evidence(next,next,"c".repeat(64),"e".repeat(64)),e=>(e as {code:string}).code==="23505");
      await assert.rejects(()=>evidence(next,next,"f".repeat(64),"d".repeat(64)),e=>(e as {code:string}).code==="23505");
    });
    await t.test("missing/corrupt required Before fails closed, no legacy fallback; strict batch and migration replay",async()=>{
      const photo=finding.original_metadata.beforePhoto;
      await db.query("UPDATE staged_inspection_evidence SET field_path='foreign.path' WHERE photo_uuid=$1",[photo.photoUuid]);
      await assert.rejects(()=>extractRepairSource(db,String(row.serverFormInstanceId)),/invalid/);
      await db.query("UPDATE staged_inspection_evidence SET field_path=$2 WHERE photo_uuid=$1",[photo.photoUuid,photo.fieldPath]);
      const filename=path.join(uploads,photo.storageRelativePath);await writeFile(filename,Buffer.from("corrupt"));
      await assert.rejects(()=>materializeRepairFindings(db,{jobId,limit:100}),/invalid/);
      assert.equal((await http(`${detail}/before/content`,"other")).status,409);
      await rm(filename);await assert.rejects(()=>extractRepairSource(db,String(row.serverFormInstanceId)),/invalid/);
      await assert.rejects(()=>materializeRepairFindings(db,{limit:0}),/invalid/);
      const before=(await db.query("SELECT count(*) AS n FROM repair_findings")).rows[0].n;
      await runMigrations(db);await runMigrations(db);assert.equal((await db.query("SELECT count(*) AS n FROM repair_findings")).rows[0].n,before);
      const batch=await materializeRepairFindings(db,{afterFormId:"ffffffff-ffff-4fff-8fff-ffffffffffff",limit:1});assert.equal(batch.scanned,0);
    });
    await t.test("a corrupt second source rolls back the first source in a multi-form backfill batch",async()=>{
      const first=fixture("hydrant").row,second=fixture("hydrant").row;
      first.serverFormInstanceId="ffffffff-ffff-4fff-bfff-fffffffffff1";
      second.serverFormInstanceId="ffffffff-ffff-4fff-bfff-fffffffffff2";
      await seed(first);await seed(second);
      const photo=(await db.query("SELECT storage_relative_path FROM staged_inspection_evidence WHERE form_instance_id=$1 LIMIT 1",[second.serverFormInstanceId])).rows[0];
      await rm(path.join(uploads,photo.storage_relative_path));
      await assert.rejects(()=>materializeRepairFindings(db,{afterFormId:"ffffffff-ffff-4fff-bfff-fffffffffff0",limit:2}),/invalid/);
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM repair_findings WHERE form_instance_id IN ($1,$2)",[first.serverFormInstanceId,second.serverFormInstanceId])).rows[0].n,0);
    });
  } finally {
    if(server)await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    await lock.query("SELECT pg_advisory_unlock(819276)");lock.release();await db.end();await pool.end();
    const absolute=path.resolve(uploads);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep));await rm(absolute,{recursive:true,force:true});
  }
});
