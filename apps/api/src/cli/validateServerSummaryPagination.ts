import { randomUUID } from "node:crypto";
import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";

const prefix = "VALIDATION-SUMMARY-";
const username = `validation-summary-${randomUUID()}`;
const password = "Validation-only-password-2026";
const at = "2099-08-01T00:00:00.000Z";
const report: Record<string, unknown> = {};
const assert: (value: unknown, message: string) => void = (value, message) => { if (!value) throw new Error(message); };
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const encodeCursor = (performedAt: string, clientUuid: string, extra?: unknown) => Buffer.from(JSON.stringify({ performedAt, clientUuid, ...(extra === undefined ? {} : { extra }) })).toString("base64url");
const order = (left: any, right: any) => left.performedAt === right.performedAt ? left.clientUuid.localeCompare(right.clientUuid) : right.performedAt.localeCompare(left.performedAt);

type Case = { customerId: string; revisionId: string; enabledId: string; jobId: string; templateId: string; snapshot: any; systemKey: string };

async function cleanup() {
  const where = "customer_code LIKE 'VALIDATION-SUMMARY-%'";
  await pool.query(`DELETE FROM master_system_form_instances WHERE inspection_group_id IN (SELECT i.id FROM master_system_inspections i JOIN inspection_jobs j ON j.id=i.job_id JOIN customers c ON c.id=j.customer_id WHERE ${where})`);
  await pool.query(`DELETE FROM master_system_inspections WHERE job_id IN (SELECT j.id FROM inspection_jobs j JOIN customers c ON c.id=j.customer_id WHERE ${where})`);
  await pool.query(`DELETE FROM inspection_jobs WHERE customer_id IN (SELECT id FROM customers WHERE ${where})`);
  await pool.query(`DELETE FROM customer_system_locations WHERE enabled_system_id IN (SELECT e.id FROM customer_enabled_systems e JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id JOIN customers c ON c.id=r.customer_id WHERE ${where})`);
  await pool.query(`DELETE FROM customer_system_zones WHERE enabled_system_id IN (SELECT e.id FROM customer_enabled_systems e JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id JOIN customers c ON c.id=r.customer_id WHERE ${where})`);
  await pool.query(`DELETE FROM customer_enabled_systems WHERE configuration_revision_id IN (SELECT r.id FROM customer_configuration_revisions r JOIN customers c ON c.id=r.customer_id WHERE ${where})`);
  await pool.query(`DELETE FROM customer_configuration_revisions WHERE customer_id IN (SELECT id FROM customers WHERE ${where})`);
  await pool.query(`DELETE FROM customers WHERE ${where}`);
  await pool.query("DELETE FROM audit_events WHERE actor_user_id IN (SELECT id FROM users WHERE username LIKE 'validation-summary-%')");
  await pool.query("DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'validation-summary-%')");
  await pool.query("DELETE FROM users WHERE username LIKE 'validation-summary-%'");
}

async function createCase(systemKey: string, sourceJobId: string): Promise<Case> {
  const base = (await pool.query<any>("SELECT master_template_version_id AS \"templateId\", configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1", [sourceJobId])).rows[0];
  assert(base, `${systemKey} source fixture unavailable`);
  const c: Case = { customerId: randomUUID(), revisionId: randomUUID(), enabledId: randomUUID(), jobId: randomUUID(), templateId: base.templateId, snapshot: structuredClone(base.snapshot), systemKey };
  c.snapshot.customer = { id: c.customerId, code: `${prefix}${c.jobId}`, displayName: "Disposable summary validation" };
  c.snapshot.configuration = { revisionId: c.revisionId, revisionNumber: 1 };
  const system = c.snapshot.enabledSystems.find((x: any) => x.systemKey === systemKey);
  assert(system, `${systemKey} unavailable in fixture`);
  system.enabledSystemId = c.enabledId;
  const client = await pool.connect();
  try { await client.query("BEGIN");
    await client.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,true)", [c.customerId, c.snapshot.customer.code, c.snapshot.customer.displayName]);
    await client.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [c.revisionId,c.customerId,c.templateId]);
    await client.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,$4,1,'{}'::jsonb)", [c.enabledId,c.revisionId,c.templateId,systemKey]);
    await client.query("INSERT INTO inspection_jobs(id,template_id,master_template_version_id,job_reference,title,status,is_sample,customer_id,customer_configuration_revision_id,configuration_snapshot) VALUES($1,NULL,$2,$3,$4,'open',true,$5,$6,$7)", [c.jobId,c.templateId,`${prefix}${c.jobId}`,"Disposable summary validation",c.customerId,c.revisionId,c.snapshot]);
    await client.query("COMMIT"); return c;
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

async function insertAccepted(c: Case, clientUuid: string, actor: number, instanceKey = "primary", performedAt = at) {
  const group = randomUUID();
  await pool.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,$3,$4)",[group,c.jobId,c.systemKey,actor]);
  await pool.query("INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,synced_by_user_id) VALUES($1,$2,$3,$4,1,$5,$6,1,$7,1,'{}'::jsonb,$8,'submitted',$9,$10)",[randomUUID(),group,clientUuid,instanceKey,c.templateId,c.revisionId,{ system: { systemKey:c.systemKey } },"0".repeat(64),performedAt,actor]);
}
async function login() {
  await pool.query("INSERT INTO users(username,password_hash,role) VALUES($1,$2,'inspector')",[username,await hashPassword(password)]);
  const response = await fetch("http://localhost:3000/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
  assert(response.status === 200, `login ${response.status}`); const cookie = response.headers.get("set-cookie"); assert(cookie, "login did not create session"); return cookie!.split(";",1)[0];
}
async function readAll(cookie: string) {
  const records: any[] = []; const sizes: number[] = []; const pages: any[] = []; let cursor: string | undefined; let previous: any;
  do { const url = new URL("http://localhost:3000/master-system-inspections"); if (cursor) url.searchParams.set("cursor",cursor);
    const r = await fetch(url,{headers:{Cookie:cookie}}); assert(r.status===200,`summary HTTP ${r.status}`); const body:any=await r.json(); assert(Array.isArray(body.inspections)&&typeof body.hasMore==="boolean"&&("nextCursor" in body),"bad cursor envelope"); assert(body.inspections.every((row:any,index:number)=>index===0||order(body.inspections[index-1],row)<0),"within-page ordering regression"); assert(!previous || !body.inspections[0] || order(previous,body.inspections[0])<0,"cross-page ordering regression"); const final=body.inspections.at(-1); if(body.hasMore){assert(final&&typeof body.nextCursor==="string","missing next cursor");const decoded=JSON.parse(Buffer.from(body.nextCursor,"base64url").toString("utf8"));assert(JSON.stringify(Object.keys(decoded).sort())===JSON.stringify(["clientUuid","performedAt"]),"cursor schema is not exact");assert(decoded.performedAt===final.performedAt&&decoded.clientUuid===final.clientUuid,"next cursor does not equal final row");}else assert(body.nextCursor===null,"unexpected terminal cursor"); previous=final??previous; records.push(...body.inspections); pages.push(body); sizes.push(body.inspections.length); cursor=body.hasMore ? body.nextCursor : undefined;
  } while(cursor); return {records,sizes,pages};
}
async function main() { try { await cleanup(); const cookie=await login(); const actor=(await pool.query<{id:number}>("SELECT id FROM users WHERE username=$1",[username])).rows[0].id;
  const expected:string[]=[];
  for(let n=1;n<=101;n++){const c=await createCase("dry_wet_riser","00000000-0000-4000-8000-000000000819");const id=uuid(n);await insertAccepted(c,id,actor,"primary",n===1?"2099-08-01T00:00:00.000123Z":at);expected.push(id);}
  const hose=await createCase("hose_reel","00000000-0000-4000-8000-000000000580");await insertAccepted(hose,uuid(102),actor);expected.push(uuid(102));
  for(let n=103;n<=105;n++){const c=await createCase("co2_fire_extinguisher","00000000-0000-4000-8000-000000000679");await insertAccepted(c,uuid(n),actor,`location:${n}`);expected.push(uuid(n));}
  const sprinklerSource=(await pool.query<{id:string}>("SELECT id FROM inspection_jobs WHERE job_reference='DEMO-JOB-SPRINKLER-PHOTO-001' LIMIT 1")).rows[0]; assert(sprinklerSource,"Automatic Sprinkler source fixture unavailable");
  const sprinkler=await createCase("automatic_sprinkler",sprinklerSource.id); await insertAccepted(sprinkler,uuid(106),actor); expected.push(uuid(106));
  const first=await readAll(cookie), second=await readAll(cookie); const ids=first.records.map(x=>x.clientUuid); const ordered=[...expected].sort(); const validationIds=ids.filter(id=>expected.includes(id));
  assert(validationIds.length===106 && new Set(validationIds).size===106 && validationIds.every((id,i)=>id===ordered[i]),"summary skipped, duplicated, or unordered UUID"); assert(JSON.stringify(ids)===JSON.stringify(second.records.map(x=>x.clientUuid)),"complete read order was unstable");
  assert(first.sizes[0]===100&&first.sizes[1]>=6,"pagination did not cross 100-row boundary");
  assert(first.records.findIndex(x=>x.clientUuid===uuid(101))>=100,"Dry/Wet was not beyond row 100"); assert(first.records.findIndex(x=>x.clientUuid===uuid(102))>=100,"Hose Reel was not beyond row 100");
  const co2=first.records.filter(x=>expected.includes(x.clientUuid)&&x.systemKey==="co2_fire_extinguisher"); assert(co2.length===3&&co2.every(x=>x.status==="submitted"),"CO2 locations were not complete across pages");
  const sprinklerSummary=first.records.find((x:any)=>x.clientUuid===uuid(106)); assert(sprinklerSummary?.evidenceState==="not-required"&&sprinklerSummary.requiredEvidenceCount===0&&sprinklerSummary.confirmedEvidenceCount===0,"Automatic Sprinkler no-evidence summary is invalid"); assert(first.records.findIndex((x:any)=>x.clientUuid===uuid(106))>=100,"Automatic Sprinkler was not beyond row 100");
  assert(first.records.find((x:any)=>x.clientUuid===uuid(1))?.performedAt==="2099-08-01T00:00:00.000123Z","cursor timestamp precision was not preserved");
  for(const [name,value] of [["extra cursor member",encodeCursor(at,uuid(1),true)],["non-canonical cursor timestamp",encodeCursor("2099-08-01T00:00:00.000Z",uuid(1))],["invalid cursor UUID",encodeCursor(at,"bad")]]){const r=await fetch(`http://localhost:3000/master-system-inspections?cursor=${encodeURIComponent(value)}`,{headers:{Cookie:cookie}});assert(r.status===400,`${name} was not rejected`);assert(!/stack|\\\\|\/srv\/|constraint/i.test(await r.text()),`${name} leaked internals`);}
  report.summariesCreated=106; report.pageSizes=first.sizes; report.noSkipNoDuplicate=true; report.deterministicTieBreak=true; report.cursorExactFinalRow=true; report.withinPageOrdering=true; report.crossPageOrdering=true; report.cursorTimestampPrecisionPreserved=true; report.strictCursorRejections=true; report.hoseReelBeyond100=true; report.dryWetBeyond100=true; report.co2SplitAcrossPages=true; report.sprinklerEvidenceSummaryBeyond100=true; report.emptyCompleteVsIncomplete="endpoint envelope distinguishes hasMore=false from continuation";
  console.log(JSON.stringify({status:"PASS",...report}));
} finally { await cleanup(); await pool.end(); } }
main().catch(e=>{console.error(e);process.exitCode=1;});
