import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { inspectionJobsRouter } from "./inspectionJobs.js";
import { masterSystemInspectionsRouter } from "./masterSystemInspections.js";
import { stagedEvidenceRouter } from "./stagedEvidence.js";
import { inspectionAttachmentsRouter } from "./inspectionAttachments.js";
import { syncRouter } from "./sync.js";
import { inspectionsRouter } from "./inspections.js";
import { pool } from "../db/pool.js";
import { attachmentMaxBytes } from "../attachments/attachmentStorage.js";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";

const id = randomUUID;
const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
test("technician ownership HTTP inventory (disposable PostgreSQL)", async (t) => {
  const url = new URL(process.env.SEED_INTEGRATION_DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/phase6_seed_integration");
  const database = new pg.Pool({ connectionString: url.toString() });
  await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(database);
  const users = (await database.query("INSERT INTO users(username,password_hash,role) VALUES ('ownership-a','x','inspector'),('ownership-b','x','inspector'),('ownership-admin','x','admin') RETURNING id,username,role")).rows;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { const actor = users[Number(req.header("x-actor") ?? 0)]; if (actor) req.currentUser = { ...actor, id: Number(actor.id) }; next(); });
  app.use(inspectionJobsRouter); app.use(masterSystemInspectionsRouter); app.use(stagedEvidenceRouter);
  app.use(inspectionAttachmentsRouter); app.use(syncRouter); app.use(inspectionsRouter);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (path: string, actor = 0, body?: unknown) => fetch(origin + path, {
    method: body === undefined ? "GET" : "POST", headers: { "x-actor": String(actor), ...(body instanceof FormData ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
  });
  const visit = async (actor: number) => {
    const result = await request("/inspection-jobs/service-visits", actor, { requestId: id(), customerId: "00000000-0000-4000-8000-000000000750", siteId: "00000000-0000-4000-8000-000000000755", systemKeys: ["portable_fire_extinguisher"] });
    assert.equal(result.status, 201, await result.clone().text()); return (await result.json()).job.id as string;
  };
  try {
    const a = await visit(0), b = await visit(1);
    const legacy = "00000000-0000-4000-8000-000000000759";
    await database.query("UPDATE inspection_jobs SET technician_visible=true WHERE id=$1",[legacy]);
    await t.test("list hides other owners and NULL creators; admin sees all", async () => {
      for (const [actor, own, other] of [[0,a,b],[1,b,a]] as const) {
        const jobs = (await (await request("/inspection-jobs", actor)).json()).jobs;
        assert(jobs.some((job: {id:string}) => job.id === own));
        assert(!jobs.some((job: {id:string}) => job.id === other || job.id === legacy));
      }
      const jobs = (await (await request("/inspection-jobs", 2)).json()).jobs;
      for (const key of [a,b,legacy]) assert(jobs.some((job: {id:string}) => job.id === key));
    });
    const deny = async (path: (key: string) => string, known: string, body?: (key: string) => unknown) => {
      const absent = await request(path(missing), 1, body?.(missing));
      const denied = await request(path(known), 1, body?.(known));
      assert.equal(denied.status, 404, `${path(known)}: ${await denied.clone().text()}`);
      assert.equal(absent.status, 404); assert.deepEqual(await denied.json(), await absent.json());
    };
    for (const suffix of ["", "/completion", "/close", "/final-report", "/final-report.pdf"]) {
      await t.test(`job ${suffix || "read"}: foreign and NULL creator are indistinguishable from missing`, async () => {
        for (const key of [a, legacy]) await deny((job) => `/inspection-jobs/${job}${suffix}`, key, suffix === "/close" ? () => ({}) : undefined);
      });
    }
    await t.test("owner single-job read and admin foreign read", async () => {
      assert.equal((await request(`/inspection-jobs/${a}`)).status,200);
      assert.equal((await request(`/inspection-jobs/${a}`,2)).status,200);
      assert.equal((await request(`/inspection-jobs/${legacy}`,2)).status,200);
    });
    const group = id(), form = id();
    await database.query("INSERT INTO master_system_inspections(id,job_id,system_key) VALUES($1,$2,'portable_fire_extinguisher')", [group,a]);
    await database.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id)
      SELECT $1,$2,$1,'primary',1,master_template_version_id,customer_configuration_revision_id,1,'{}',1,'{}',$3,'submitted',now(),$4 FROM inspection_jobs WHERE id=$5`, [form,group,"a".repeat(64),users[0].id,a]);
    for (const route of ["hose-reel-inspections","co2-inspections","wet-chemical-inspections","fire-alarm-inspections","dry-wet-riser-inspections","master-system-inspections"]) {
      await t.test(`GET ${route}/:clientUuid`, () => deny((key) => `/${route}/${key}`,form));
    }
    await t.test("GET master-system-inspections filters job lists and denies explicit foreign job", async () => {
      await deny((key) => `/master-system-inspections?jobId=${key}`,a);
      const result = await request(`/master-system-inspections?jobIds=${a}` ,1);
      assert.equal(result.status,200); assert(!(await result.text()).includes(form));
    });
    for (const route of ["v6-evidence/accepted","v7-evidence/accepted","inspection-attachments"]) {
      await t.test(`GET ${route}?inspectionClientUuid`, () => deny((key) => `/${route}?inspectionClientUuid=${key}`,form));
    }
    await t.test("sync cannot disguise a foreign accepted UUID behind an owned job", async () => {
      const response = await request("/sync",1,{items:[{entityType:"masterSystemInspection",entityId:form,payload:{jobId:b,clientUuid:form,systemKey:"portable_fire_extinguisher"}}]});
      assert.equal(response.status,404); assert.deepEqual(await response.json(),{error:"JOB_NOT_FOUND"});
    });
    const evidence = id(), attachment = id(), policy = id();
    await database.query(`INSERT INTO inspection_evidence_policies(id,code,version,schema_version,system_key,definition,definition_sha256,publication_status)
      VALUES($1,'ownership-fixture',1,1,'portable_fire_extinguisher','{"points":{"test.field":{"allowed":true,"maxCount":1}}}',$2,'published')`,[policy,"b".repeat(64)]);
    await database.query(`UPDATE master_system_form_instances SET evidence_policy_id=policy.id,evidence_policy_version=policy.version,evidence_policy_snapshot=policy.definition,evidence_policy_sha256=policy.definition_sha256 FROM inspection_evidence_policies policy WHERE master_system_form_instances.id=$1 AND policy.id=$2`,[form,policy]);
    await database.query(`INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id)
      SELECT $1,id,'fire_alarm_detector',master_template_version_id,7,$2,$3 FROM inspection_jobs WHERE id=$4`,[form,"a".repeat(64),users[0].id,a]);
    await database.query(`INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status,form_instance_id,accepted_at)
      SELECT $1,$2,id,'fire_alarm_detector','test.field',master_template_version_id,7,$3,$4,$3,$3,$3,'image/jpeg',1,1,1,1,1,1,'ownership/test.jpg','accepted',$2,now() FROM inspection_jobs WHERE id=$5`,[evidence,form,"a".repeat(64),users[0].id,a]);
    await database.query(`INSERT INTO inspection_attachments(id,client_uuid,form_instance_id,evidence_policy_id,field_path,capture_source,storage_relative_path,source_sha256,stored_sha256,request_fingerprint,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,captured_at,uploaded_by_user_id)
      SELECT $1,$1,$2,id,'test.field','unknown','ownership/attachment.jpg',$3,$3,$3,'image/jpeg',1,1,1,1,1,1,now(),$4 FROM inspection_evidence_policies WHERE id=$5`,[attachment,form,"b".repeat(64),users[0].id,policy]);
    assert.equal((await database.query("SELECT 1 FROM inspection_attachments WHERE client_uuid=$1",[attachment])).rowCount,1);
    for (const route of ["v6-evidence/accepted","v7-evidence/accepted","inspection-attachments"]) {
      await t.test(`GET ${route}/:photoUuid/content`, () => deny((key) => `/${route}/${key}/content`,route === "inspection-attachments" ? attachment : evidence));
    }
    await t.test("GET inspections does not expose other owners' legacy summaries", async () => {
      const result = await request("/inspections",1); assert.equal(result.status,200);
      assert.deepEqual((await result.json()).inspections,[]);
    });
    for (const systemKey of ["hose_reel","co2_fire_extinguisher","wet_chemical","automatic_sprinkler","dry_wet_riser","fire_alarm_detector","hydrant","portable_fire_extinguisher","smoke_ventilation","fire_intercom","legacy"]) {
      await t.test(`POST sync dispatch ${systemKey}: foreign, NULL, missing`, async () => {
        const body = (jobId: string) => ({ items: [{ operationId: id(), entityId: form, entityType: systemKey === "legacy" ? "inspection" : ["co2_fire_extinguisher","wet_chemical"].includes(systemKey) ? "masterSystemFormInstance" : "masterSystemInspection", action: "create", payload: { jobId, clientUuid: form, systemKey } }] });
        for (const key of [a,legacy]) await deny(() => "/sync",key,body);
      });
    }
    for (const route of ["v6-evidence/stage","v7-evidence/stage","inspection-attachments"]) {
      await t.test(`POST ${route}: ownership before multipart business validation`, async () => {
        await deny(() => `/${route}`,route === "inspection-attachments" ? form : a,(key) => {
          const data = new FormData(); data.set(route === "inspection-attachments" ? "inspectionClientUuid" : "jobId",key);
          data.set("file",new Blob(["test"],{type:"image/jpeg"}),"photo.jpg"); return data;
        });
      });
    }
    await t.test("oversized Content-Length is rejected before any body bytes arrive", async () => {
      for (const [route, overhead, status] of [["inspection-attachments",32,413],["v6-evidence/stage",64,400],["v7-evidence/stage",64,400]] as const) {
        const result = await new Promise<{status: number; body: string}>((resolve,reject) => {
          const req = httpRequest(origin + "/" + route, {method:"POST", headers:{"x-actor":"0","content-type":"multipart/form-data; boundary=test", "content-length":String(attachmentMaxBytes + overhead * 1024 + 1)}}, response => {
            let body=""; response.on("data", chunk=>body+=chunk); response.on("end",()=>{resolve({status:response.statusCode!,body});req.destroy();});
          });
          req.on("error",reject); req.setTimeout(3000,()=>{req.destroy(new Error("server waited for oversized body"));});
          req.flushHeaders(); // Deliberately never send the advertised body.
        });
        assert.equal(result.status,status,route); assert.equal(JSON.parse(result.body).error,"VALIDATION_ERROR");
      }
    });
    await t.test("oversized chunked attachment retains 413", async () => {
      const result = await new Promise<number>((resolve,reject) => {
        const req=httpRequest(origin+"/inspection-attachments",{method:"POST",headers:{"x-actor":"0","content-type":"multipart/form-data; boundary=test"}},response=>{response.resume();response.on("end",()=>resolve(response.statusCode!));});
        req.on("error",reject); req.write(Buffer.alloc(attachmentMaxBytes+32*1024+1));req.end();
      });
      assert.equal(result,413);
    });
    await t.test("mixed owned/foreign sync batch writes nothing in either ordering", async () => {
      const job=(await database.query("SELECT configuration_snapshot FROM inspection_jobs WHERE id=$1",[b])).rows[0].configuration_snapshot;
      const clientUuid=id(), at=new Date().toISOString();
      const definition=masterServiceReportV7.systems.find(x=>x.key==="portable_fire_extinguisher")!;
      const system=job.enabledSystems.find((x:{systemKey:string})=>x.systemKey==="portable_fire_extinguisher");
      const owned={operationId:id(),entityType:"masterSystemInspection",entityId:clientUuid,action:"create",payload:{clientUuid,jobId:b,systemKey:"portable_fire_extinguisher",instanceKey:"primary",configuredZoneId:null,configuredLocationId:null,displaySequence:1,originalCreatorSnapshot:null,masterTemplate:{id:job.template.id,code:"MFE-FSSR",version:job.template.version},configuration:job.configuration,inspectionSnapshot:{schemaVersion:1,capturedAt:at,job:{id:b,reference:"owned",title:"owned"},customer:{id:job.customer.id,code:job.customer.code,displayName:job.customer.displayName},configuration:job.configuration,template:job.template,system:{...system,definition,repetitionMode:"single_quantity_summary"}},responses:{schemaVersion:1,total:1,dryPowder9kg:1,co2_2kg:0,others:"",comments:""},performedAt:at}};
      const foreign={...owned,operationId:id(),entityId:id(),payload:{...owned.payload,jobId:a,clientUuid:id()}};
      for(const items of [[owned,foreign],[foreign,owned]]) {
        const response=await request("/sync",1,{items});assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:"JOB_NOT_FOUND"});
        assert.equal((await database.query("SELECT 1 FROM master_system_form_instances WHERE client_uuid=$1",[clientUuid])).rowCount,0);
      }
      const valid=await request("/sync",1,{items:[owned]});assert.equal(valid.status,200);
      const result=await valid.json();assert.deepEqual(result.acceptedIds,[clientUuid],JSON.stringify(result));
    });
    await t.test("unsupported entity types keep per-item validation instead of a batch 404", async () => {
      const unsupported = { operationId: id(), entityType: "notARealEntity", entityId: id(), action: "create", payload: {} };
      const response = await request("/sync", 0, { items: [unsupported] });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.deepEqual(result.failed, [{ id: unsupported.entityId, code: "VALIDATION_ERROR", message: "entityType is unsupported" }]);
    });
    await t.test("a request whose session no longer matches the queued work's owner is refused", async () => {
      const users0 = String(users[0].id), users1 = String(users[1].id);
      const post = (path: string, expected: string, body: unknown) => fetch(origin + path, { method: "POST",
        headers: { "x-actor": "1", "x-expected-user-id": expected, ...(body instanceof FormData ? {} : { "content-type": "application/json" }) },
        body: body instanceof FormData ? body : JSON.stringify(body) });
      for (const path of ["/sync", "/v6-evidence/stage", "/v7-evidence/stage", "/inspection-attachments"]) {
        const body = path === "/sync" ? { items: [] } : new FormData();
        const mismatch = await post(path, users0, body);
        assert.equal(mismatch.status, 409, path); assert.deepEqual(await mismatch.json(), { error: "IDENTITY_MISMATCH" }, path);
      }
      const matching = await post("/sync", users1, { items: [] });
      assert.equal(matching.status, 200, "the current owner's own request proceeds");
      assert((await database.query("SELECT 1 FROM audit_events WHERE result='failure' AND reason='IDENTITY_MISMATCH'")).rowCount! >= 4);
    });
    await t.test("failure audits retain sync, close and upload denials", async () => {
      for (const action of ["sync_write","inspection_job_close","v6_evidence_stage","v7_evidence_stage","inspection_attachment_upload"]) {
        assert((await database.query("SELECT 1 FROM audit_events WHERE action=$1 AND result='failure' AND reason='JOB_NOT_FOUND'",[action])).rowCount! > 0,action);
      }
    });
  } finally {
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
    await database.end(); await pool.end();
  }
});
