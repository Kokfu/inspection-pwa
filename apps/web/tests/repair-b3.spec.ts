import { test, expect, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
// Independent server fingerprint implementation: catches browser canonicalization drift.
import { fingerprint as serverFingerprint } from "../../api/src/repairs/acceptedSource";
import { fixture as sourceFixture, systems } from "../../api/src/repairs/repairFixtures";
import { historicalFixture, legacyFireAlarmV7Fixture } from "../../api/src/repairs/historicalFixtures";
import { readFindingParts, type R } from "../../api/src/repairs/findingReaders";

const id = () => randomUUID(), at = "2026-10-13T01:02:03.123Z";
const sum = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const jobId=id(),systemKey="co2_fire_extinguisher",orderId=id();
  const findings=[0,1,2].map(i=>({findingId:id(),sourceFingerprint:String(i+1).repeat(64),sourceRevision:"a".repeat(64),eligibility:"eligible",reviewSequence:0,reviews:[],history:[],
    original:{jobId,systemKey,fieldPath:`checks.part${i}`,responsePath:`checks.part${i}.result`,result:"poor",remark:"Original failed part",template:{id:id(),code:'MFE-FSSR',version:1},contractSha256:"b".repeat(64),
      beforePhotoMissing:true,beforePhoto:null,beforePhotoLabel:'Historical finding: no original Before photo',formInstanceId:id(),sourceClientUuid:id(),rowUuid:null,
      caption:'Original part',sectionLabel:'Checks',fieldLabel:`Part ${i}`,unit:null,sourceJob:{id:jobId,reference:'fixture',title:'Fixture'},
      instanceKey:'primary',locationId:null,zoneId:null,configuration:{revisionId:id(),revisionNumber:1},customer:{id:id(),code:'fixture',displayName:'Fixture'},site:null,system:'CO2',instance:null}}));
  return {jobId,systemKey,findings,workOrders:[{workOrderId:orderId,jobId,systemKey,assignedToUserId:71,revision:1,status:"active"}]};
}
async function ready(page:Page) {
  await page.goto("/tests/repair-b3.html");
  await page.waitForFunction(()=> (window as any).b3Ready && navigator.serviceWorker.controller);
  await page.reload();
  await page.waitForFunction(()=> (window as any).b3Ready);
}
async function login(page:Page,actor=71) {
  await page.evaluate(async(actor)=>{const {db}= (window as any).b3;await db.deviceDatabase.open();
    await db.deviceDatabase.authState.put({key:"device-auth",userId:actor,username:`fixture-${actor}`,role:"inspector",cachedAt:"2026-10-13T00:00:00.123Z",serverLogoutPending:false});
    await db.activateUserWorkspace(actor);},actor);
}
async function download(page:Page,s:ReturnType<typeof fixture>) {
  await page.route(`**/api/repairs/services/${s.jobId}/${s.systemKey}`,r=>r.fulfill({json:s}));
  await page.evaluate(async({jobId,systemKey})=>{await (window as any).b3.repo.downloadRepairService(jobId,systemKey,false);},s);
}
async function draft(page:Page,s:ReturnType<typeof fixture>,index=0) {
  return page.evaluate(async({findingId,workOrderId})=>{
    const {repo}= (window as any).b3;const r=await repo.createRepairDraft(findingId,workOrderId);
    sessionStorage.setItem('b3-selected',r.clientUuid);return r.clientUuid;
  },{findingId:s.findings[index].findingId,workOrderId:s.workOrders[0].workOrderId});
}
async function sourcePhoto(page:Page) {
  return page.evaluate(async()=>{const c=document.createElement('canvas');c.width=64;c.height=48;const x=c.getContext('2d')!;
    x.fillStyle='#617eb3';x.fillRect(0,0,64,48);return c.toDataURL('image/png').split(',')[1];});
}
async function fill(page:Page,clientUuid:string) {
  await page.evaluate(u=>sessionStorage.setItem('b3-selected',u),clientUuid);
  await page.locator('#remark').fill('Replaced the damaged part offline');await page.locator('#save').click();await expect(page.locator('#result')).toHaveText('saved');
  const bytes=Buffer.from(await sourcePhoto(page),'base64');
  await page.locator('#photo').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:bytes});await expect(page.locator('#result')).toHaveText('captured');
  await page.locator('#submit').click();await expect(page.locator('#result')).toHaveText('submitted');
}
async function row(page:Page,u:string) {return page.evaluate(u=>(window as any).b3.db.localDatabase.repairRecords.get(u),u);}
async function sync(page:Page) {await page.evaluate(async()=>{await (window as any).b3.sync.syncPendingRecords(71);});}

test('v9 additive upgrade preserves all stores, indexes, pending/failed data and exact Blobs; offline local flow reloads',async({page,context})=>{
  await ready(page);
  const legacy=await page.evaluate(async()=>{
    const {default:Dexie}=await import('/node_modules/.vite/deps/dexie.js');
    const db=new Dexie('inspection-pwa:user:71');
    // The actual frozen v9 declarations, including the unique active-operation and evidence indexes.
    const stores={drafts:'id, entityType, updatedAt',testRecords:'clientUuid, syncStatus, localUpdatedAt, createdAt',inspectionRecords:'clientUuid, syncStatus, jobId, systemKey, [jobId+systemKey], templateId, localUpdatedAt',
      masterSystemInspections:'clientUuid, &jobSystemKey, jobId, systemKey, syncStatus, localUpdatedAt',masterSystemInspectionGroups:'groupKey, jobId, systemKey, localUpdatedAt',masterSystemFormInstances:'clientUuid, &[groupKey+instanceKey], groupKey, jobId, systemKey, configuredLocationId, syncStatus, localUpdatedAt',
      syncOutbox:'operationId, entityType, entityId, status, createdAt, &activeKey',referenceData:'key, version, fetchedAt, expiresAt',authState:'key',inspectionAttachments:'photoUuid, &[inspectionClientUuid+fieldPath], inspectionClientUuid, systemKey, syncStatus, localUpdatedAt, serverAttachmentId'};
    db.version(9).stores(stores);await db.open();
    const keys={};for(const t of db.tables){const key=crypto.randomUUID();keys[t.name]=key;
      const value={[t.schema.primKey.keyPath]:key,sentinel:`preserve-${t.name}`,syncStatus:'Failed'};
      if(t.name==='syncOutbox')Object.assign(value,{operationId:key,entityType:'inspection',entityId:crypto.randomUUID(),action:'create',status:'Pending',payload:{immutable:true},activeKey:`inspection:create:${key}`,attempts:3});
      if(t.name==='inspectionAttachments')Object.assign(value,{blob:new Blob(['retained pending bytes']),syncStatus:'Failed'});
      await t.add(value);}
    const schemas=db.tables.map(t=>({name:t.name,primary:t.schema.primKey.src,indexes:t.schema.indexes.map(i=>i.src)}));db.close();return {keys,schemas};
  });
  await login(page);
  const proof=await page.evaluate(async({keys,schemas})=>{const db=(window as any).b3.db.localDatabase;const out=[];
    for(const s of schemas){const t=db.table(s.name),r=await t.get(keys[s.name]);out.push({name:s.name,preserved:r.sentinel===`preserve-${s.name}`,
      primary:t.schema.primKey.src===s.primary,indexes:JSON.stringify(t.schema.indexes.map(i=>i.src))===JSON.stringify(s.indexes)});}
    return {version:db.verno,out,blob:await (await db.inspectionAttachments.get(keys.inspectionAttachments)).blob.text(),operation:await db.syncOutbox.get(keys.syncOutbox)};},legacy);
  expect(proof.version).toBe(11);expect(proof.out.every(x=>x.preserved&&x.primary&&x.indexes)).toBe(true);expect(proof.blob).toBe('retained pending bytes');expect(proof.operation.status).toBe('Pending');expect(proof.operation.attempts).toBe(3);
  // This synthetic legacy operation intentionally has no inspection parent; do not dispatch it in this test.
  const s=fixture();await download(page,s);const u=await draft(page,s);
  await context.setOffline(true);await fill(page,u);
  const before=await row(page,u);expect(before.syncStatus).toBe('Pending');expect(before.frozen.performedAt).toBe(at);
  expect(before.requestFingerprint).toBe(serverFingerprint({actorId:71,...before.frozen}));
  await page.reload();await page.waitForFunction(()=> (window as any).b3Ready);await login(page);
  expect(await row(page,u)).toEqual(before);
  const local=await page.evaluate(async u=>{const {db,repo}= (window as any).b3;const r=await db.localDatabase.repairRecords.get(u),a=await db.localDatabase.repairAttachments.get(r.photoUuid);
    return {bytes:a.blob.size,digest:await (window as any).b3.contract.sha256(await a.blob.arrayBuffer()),meta:a.sourceSha256,ops:(await db.localDatabase.syncOutbox.toArray()).filter(o=>o.entityType.startsWith('repair')),state:await repo.repairBeforePhotoState(r.findingId)};},u);
  expect(local.bytes).toBeGreaterThan(0);expect(local.digest).toBe(local.meta);expect(local.ops).toHaveLength(2);expect(local.state.state).toBe('historical_absence');
  await expect(page.evaluate(u=>(window as any).b3.repo.saveRepairDraft(u,'changed', '2026-10-13T01:02:03.123Z'),u)).rejects.toThrow('REPAIR_IMMUTABLE');
  await context.setOffline(false);
});

test('unchanged Before cache verifies bytes and separates historical absence, download failure and corruption',async({page})=>{
  await ready(page);await login(page);const s=fixture();
  const png=await sourcePhoto(page);const jpeg=await page.evaluate(async p=>{const b=await (window as any).b3.repo;const {processInspectionPhoto}=await import('/src/attachments/imageProcessing.ts');
    const bytes=Uint8Array.from(atob(p),c=>c.charCodeAt(0));const result=await processInspectionPhoto(new Blob([bytes],{type:'image/png'}));
    return {bytes:Array.from(new Uint8Array(await result.blob.arrayBuffer())),width:result.width,height:result.height};},png);
  const bytes=Buffer.from(jpeg.bytes);const p={photoUuid:id(),fieldPath:s.findings[0].original.fieldPath,sourceSha256:'c'.repeat(64),storedSha256:sum(bytes),sizeBytes:bytes.length,width:jpeg.width,height:jpeg.height};
  Object.assign(s.findings[0].original,{beforePhoto:p,beforePhotoMissing:false});await download(page,s);
  expect(await page.evaluate(f=>(window as any).b3.repo.repairBeforePhotoState(f),s.findings[0].findingId)).toEqual({state:'not_downloaded'});
  await page.route(`**/api/repairs/findings/${s.findings[0].findingId}/before/content`,r=>r.fulfill({body:bytes,contentType:'image/jpeg'}));
  await page.evaluate(f=>(window as any).b3.repo.cacheRepairBeforePhoto(f),s.findings[0].findingId);
  const cached=await page.evaluate(async f=>{const r=await (window as any).b3.repo.repairBeforePhotoState(f);return {state:r.state,bytes:Array.from(new Uint8Array(await r.photo.blob.arrayBuffer()))};},s.findings[0].findingId);
  expect(cached).toEqual({state:'cached',bytes:jpeg.bytes});
  await page.evaluate(async f=>{const db=(window as any).b3.db.localDatabase;await db.repairBeforePhotos.update(f,{blob:new Blob(['corrupt'],{type:'image/jpeg'})});},s.findings[0].findingId);
  await expect(page.evaluate(f=>(window as any).b3.repo.repairBeforePhotoState(f),s.findings[0].findingId)).rejects.toThrow('REPAIR_PHOTO_INTEGRITY');
  await page.unroute(`**/api/repairs/services/${s.jobId}/${s.systemKey}`);
  await page.route(`**/api/repairs/services/${s.jobId}/${s.systemKey}`,r=>r.fulfill({status:404,json:{error:'REPAIR_NOT_FOUND'}}));
  await expect(page.evaluate(s=>(window as any).b3.repo.downloadRepairService(s.jobId,s.systemKey),s)).rejects.toThrow('REPAIR_NOT_FOUND');
  expect(await page.evaluate(f=>(window as any).b3.db.localDatabase.repairFindings.get(f),s.findings[0].findingId)).toMatchObject({refreshError:'REPAIR_NOT_FOUND'});
});

test('exact evidence-first receipts, committed response loss, partial parts and interrupted recovery retain immutable operations',async({page})=>{
  await ready(page);await login(page);const s=fixture();await download(page,s);const uuids=[];
  for(let i=0;i<2;i++){const u=await draft(page,s,i);uuids.push(u);await fill(page,u);}
  const before=await page.evaluate(()=>(window as any).b3.db.localDatabase.syncOutbox.toArray());
  const calls:string[]=[],photos=new Map(),parts=new Map();let lose=true,loseParent=true,partial=true;
  await page.route('**/api/repairs/evidence/stage',async route=>{
    expect(route.request().headers()['x-expected-user-id']).toBe('71');
    const raw=route.request().postDataBuffer()!.toString();const input=JSON.parse(raw.match(/name="metadata"\r\n\r\n([^\r]+)/)![1]);calls.push(`photo:${input.repairUuid}`);
    const receipt={photoUuid:input.photoUuid,repairUuid:input.repairUuid,requestFingerprint:serverFingerprint({actorId:71,...input}),sourceSha256:input.sourceSha256,storedSha256:'f'.repeat(64),findingId:input.findingId,workOrderId:input.workOrderId,jobId:input.jobId,systemKey:input.systemKey};photos.set(input.photoUuid,receipt);
    if(lose&&input.repairUuid===uuids[0]){lose=false;await route.abort('timedout');}else await route.fulfill({json:receipt});
  });
  await page.route('**/api/repairs/submissions',async route=>{const body=route.request().postDataJSON();const p=body.parts[0];calls.push(`parent:${p.clientUuid}`);expect(photos.has(p.manifest[0].photoUuid)).toBe(true);
    const receipt={clientUuid:p.clientUuid,requestFingerprint:serverFingerprint({actorId:71,...p}),findingId:p.findingId,workOrderId:p.workOrderId,jobId:p.jobId,systemKey:p.systemKey,cycleSequence:p.cycleSequence,predecessorUuid:p.predecessorUuid,sourceRevision:p.expectedSourceRevision};
    if(parts.has(p.clientUuid))expect(receipt).toEqual(parts.get(p.clientUuid));
    parts.set(p.clientUuid,receipt);
    if(loseParent&&p.clientUuid===uuids[0]){loseParent=false;await route.abort('timedout');return;}
    await route.fulfill({json:{jobId:body.jobId,systemKey:body.systemKey,results:[partial&&p.clientUuid===uuids[1]?{clientUuid:p.clientUuid,outcome:'failed',error:'STALE_SOURCE_REVIEW'}:{clientUuid:p.clientUuid,outcome:'submitted',receipt}]}});
  });
  await page.route('**/api/sync',()=>{throw new Error('Repair escaped into generic inspection sync');});
  await sync(page);expect((await row(page,uuids[0])).syncStatus).toBe('Pending');expect((await row(page,uuids[1])).lastSyncError).toBe('STALE_SOURCE_REVIEW');
  // Simulate interruption after request began. Recovery must retain exact queued payload and Blob.
  await page.evaluate(async u=>{const db=(window as any).b3.db.localDatabase,r=await db.repairRecords.get(u);
    await db.repairRecords.update(u,{syncStatus:'Syncing'});await db.repairAttachments.update(r.photoUuid,{syncStatus:'Uploading'});
    const ops=await db.syncOutbox.toArray();for(const op of ops.filter(o=>o.status!=='Completed'))await db.syncOutbox.update(op.operationId,{status:'Syncing'});},uuids[0]);
  await page.evaluate(()=>(window as any).b3.sync.recoverInterruptedSync());
  partial=false;await sync(page);await sync(page);
  for(const u of uuids){expect((await row(page,u))).toMatchObject({syncStatus:'Synced',reviewState:'awaiting_approval'});}
  expect(parts.size).toBe(2);expect(photos.size).toBe(2);expect(calls.filter(c=>c===`photo:${uuids[0]}`)).toHaveLength(2);
  expect(calls.filter(c=>c===`parent:${uuids[0]}`)).toHaveLength(2);
  const after=await page.evaluate(()=>(window as any).b3.db.localDatabase.syncOutbox.toArray());
  expect(after.map(o=>({id:o.operationId,p:o.payload}))).toEqual(before.map(o=>({id:o.operationId,p:o.payload})));
  expect(after.every(o=>o.status==='Completed')).toBe(true);
  const firstParent=calls.findIndex(c=>c.startsWith('parent:'));expect(calls.slice(0,firstParent).every(c=>c.startsWith('photo:'))).toBe(true);
});

test('forged photo/parent receipts never confirm; stale dispatch/workspace/actor never apply late success',async({page})=>{
  await ready(page);await login(page);const s=fixture();await download(page,s);const u=await draft(page,s);await fill(page,u);
  let mode='wrongPhoto';
  await page.route('**/api/repairs/evidence/stage',async route=>{
    const raw=route.request().postDataBuffer()!.toString(),p=JSON.parse(raw.match(/name="metadata"\r\n\r\n([^\r]+)/)![1]);
    const receipt={photoUuid:p.photoUuid,repairUuid:p.repairUuid,requestFingerprint:serverFingerprint({actorId:71,...p}),sourceSha256:p.sourceSha256,storedSha256:'f'.repeat(64),findingId:p.findingId,workOrderId:p.workOrderId,jobId:p.jobId,systemKey:p.systemKey};
    if(mode==='wrongPhoto')receipt.photoUuid=id();
    if(mode==='stale')await page.evaluate(async u=>{const db=(window as any).b3.db.localDatabase,op=(await db.syncOutbox.toArray()).find(o=>o.entityType==='repairEvidence');await db.syncOutbox.update(op.operationId,{payload:{...op.payload,capturedAt:'2026-10-13T01:02:03.124Z'}});},u);
    if(mode==='actor')await page.evaluate(async()=>{await (window as any).b3.db.deviceDatabase.authState.update('device-auth',{explicitLogout:true});});
    if(mode==='workspace')await login(page,72);
    await route.fulfill({json:receipt});
  });
  let parents=0;await page.route('**/api/repairs/submissions',async route=>{parents++;const b=route.request().postDataJSON(),p=b.parts[0];
    await route.fulfill({json:{jobId:b.jobId,systemKey:b.systemKey,results:[{clientUuid:p.clientUuid,outcome:'submitted',receipt:{clientUuid:p.clientUuid,requestFingerprint:'0'.repeat(64),findingId:p.findingId,workOrderId:p.workOrderId,jobId:p.jobId,systemKey:p.systemKey,cycleSequence:p.cycleSequence,predecessorUuid:p.predecessorUuid,sourceRevision:p.expectedSourceRevision}}]}});});
  await sync(page);expect(parents).toBe(0);expect((await row(page,u)).syncStatus).toBe('Pending');
  mode='healthy';await sync(page);expect((await row(page,u)).lastSyncError).toBe('REPAIR_RECEIPT_MISMATCH');expect((await row(page,u)).syncStatus).toBe('Failed');
  // Requeue the photo to exercise each late-response boundary, preserving exact identities.
  const reset=()=>page.evaluate(async u=>{const db=(window as any).b3.db.localDatabase,r=await db.repairRecords.get(u),a=await db.repairAttachments.get(r.photoUuid),op=(await db.syncOutbox.toArray()).find(o=>o.entityType==='repairEvidence');
    await db.repairAttachments.update(a.photoUuid,{syncStatus:'Pending'});await db.syncOutbox.update(op.operationId,{status:'Pending',activeKey:`repairEvidence:create:${a.photoUuid}`,payload:a.frozen});},u);
  mode='stale';await reset();await sync(page);expect((await row(page,u)).syncStatus).not.toBe('Synced');
  mode='actor';await reset();await sync(page);await login(page);expect((await row(page,u)).syncStatus).not.toBe('Synced');
  mode='workspace';await reset();await sync(page);expect(await row(page,u)).toBeUndefined();await login(page);expect((await row(page,u)).syncStatus).not.toBe('Synced');
  const a=await page.evaluate(async u=>{const db=(window as any).b3.db.localDatabase,r=await db.repairRecords.get(u),a=await db.repairAttachments.get(r.photoUuid);return {state:a.syncStatus,bytes:a.blob.size};},u);
  expect(a.state).not.toBe('Synced');expect(a.bytes).toBeGreaterThan(0);
});

test('revoked assignment and changed eligibility retain offline work; rejected revision and approved repeat use new lineage',async({page})=>{
  await ready(page);await login(page);const s=fixture();s.workOrders[0].status='revoked';s.findings[0].eligibility='needs_review';await download(page,s);
  await page.evaluate(async id=>{await (window as any).b3.db.localDatabase.repairWorkOrders.update(id,{expiresAt:'2020-01-01T00:00:00.000Z'});},s.workOrders[0].workOrderId);
  const u=await draft(page,s);
  const omitted=structuredClone(s);omitted.workOrders=[];await download(page,omitted);
  expect(await page.evaluate(id=>(window as any).b3.db.localDatabase.repairWorkOrders.get(id),s.workOrders[0].workOrderId)).toMatchObject({status:'revoked'});
  await fill(page,u);
  await page.route('**/api/repairs/evidence/stage',r=>r.fulfill({status:404,json:{error:'REPAIR_NOT_FOUND'}}));await sync(page);
  expect((await row(page,u)).syncStatus).toBe('Pending');
  expect(await page.evaluate(async u=>{const db=(window as any).b3.db.localDatabase;const r=await db.repairRecords.get(u),a=await db.repairAttachments.get(r.photoUuid);return {bytes:a.blob.size,error:a.lastSyncError};},u)).toMatchObject({error:'REPAIR_NOT_FOUND'});
  await page.unroute('**/api/repairs/evidence/stage');await page.route('**/api/repairs/evidence/stage',r=>r.fulfill({status:409,json:{error:'SOURCE_NOT_ELIGIBLE'}}));await sync(page);
  expect(await page.evaluate(async u=>{const db=(window as any).b3.db.localDatabase,r=await db.repairRecords.get(u);return (await db.repairAttachments.get(r.photoUuid)).lastSyncError;},u)).toBe('SOURCE_NOT_ELIGIBLE');
  // Exact synced receipt is already tested above. Here seed its local projection to isolate history/revision behavior.
  await page.evaluate(async u=>(window as any).b3.db.localDatabase.repairRecords.update(u,{syncStatus:'Synced',reviewState:'awaiting_approval'}),u);
  s.workOrders[0].status='active';s.workOrders[0].revision=2;s.findings[0].eligibility='eligible';s.findings[0].sourceRevision='d'.repeat(64);
  s.findings[0].history.push({client_uuid:u,cycle_sequence:1,predecessor_uuid:null,remark:(await row(page,u)).remark,performed_at:at,submitted_by_user_id:71,review_state:'rejected'} as never);
  await download(page,s);const previous=await row(page,u);expect(previous.reviewState).toBe('rejected');
  const revision=await draft(page,s);expect(revision).not.toBe(u);await fill(page,revision);
  expect((await row(page,revision))).toMatchObject({cycleSequence:2,predecessorUuid:u,frozen:{expectedWorkOrderRevision:2,expectedSourceRevision:'d'.repeat(64)}});
  await page.evaluate(async u=>(window as any).b3.db.localDatabase.repairRecords.update(u,{syncStatus:'Synced'}),revision);
  s.findings[0].history.push({client_uuid:revision,cycle_sequence:2,predecessor_uuid:u,remark:(await row(page,revision)).remark,performed_at:at,submitted_by_user_id:71,review_state:'approved'} as never);
  await download(page,s);const repeat=await draft(page,s);expect(repeat).not.toBe(revision);
  expect((await row(page,repeat))).toMatchObject({cycleSequence:3,predecessorUuid:revision});
  const retained=await row(page,u);
  expect({...retained,reviewFetchedAt:undefined}).toEqual({...previous,reviewFetchedAt:undefined});
  expect(await page.evaluate(()=>(window as any).b3.db.localDatabase.repairAttachments.count())).toBe(2);
});

test('malformed/stale downloads fail closed, Submit rollback is atomic and concurrent Submit cannot duplicate operations',async({page})=>{
  await ready(page);await login(page);const s=fixture();await download(page,s);const u=await draft(page,s);
  await page.locator('#remark').fill('Valid draft');await page.locator('#save').click();await expect(page.locator('#result')).toHaveText('saved');
  await page.locator('#photo').setInputFiles({name:'part.png',mimeType:'image/png',buffer:Buffer.from(await sourcePhoto(page),'base64')});await expect(page.locator('#result')).toHaveText('captured');
  const draftBefore=await row(page,u);
  const rollback=await page.evaluate(async u=>{const {db,repo}=(window as any).b3;const table=db.localDatabase.syncOutbox;
    const reject=(_key,obj)=>{if(obj.entityType==='repairRecord')throw new Error('fixture outbox failure');};table.hook('creating',reject);
    try{await repo.submitRepairLocal(u);return 'unexpected success';}catch(e){return e.message;}finally{table.hook('creating').unsubscribe(reject);}},u);
  expect(rollback).toBe('fixture outbox failure');expect(await row(page,u)).toEqual(draftBefore);
  expect(await page.evaluate(()=>(window as any).b3.db.localDatabase.syncOutbox.count())).toBe(0);
  const outcomes=await page.evaluate(async u=>{const results=await Promise.allSettled([(window as any).b3.repo.submitRepairLocal(u),(window as any).b3.repo.submitRepairLocal(u)]);return results.map(r=>r.status);},u);
  expect(outcomes.filter(x=>x==='fulfilled')).toHaveLength(1);expect(await page.evaluate(()=>(window as any).b3.db.localDatabase.syncOutbox.count())).toBe(2);
  const frozen=await row(page,u);await page.unroute(`**/api/repairs/services/${s.jobId}/${s.systemKey}`);
  const bad=structuredClone(s);bad.findings[0].original.template.version=7;
  await page.route(`**/api/repairs/services/${s.jobId}/${s.systemKey}`,r=>r.fulfill({json:bad}));
  await expect(page.evaluate(s=>(window as any).b3.repo.downloadRepairService(s.jobId,s.systemKey,false),s)).rejects.toThrow('INVALID_REPAIR_AUTHORITY');
  expect(await row(page,u)).toEqual(frozen);
  await page.unroute(`**/api/repairs/services/${s.jobId}/${s.systemKey}`);
  let resolveOld:()=>void;const blocked=new Promise<void>(r=>resolveOld=r);let reads=0;
  const newer=structuredClone(s);newer.findings[0].sourceRevision='e'.repeat(64);
  await page.route(`**/api/repairs/services/${s.jobId}/${s.systemKey}`,async r=>{reads++;if(reads===1){await blocked;await r.fulfill({json:s});}else await r.fulfill({json:newer});});
  await page.evaluate(s=>{(window as any).oldDownload=(window as any).b3.repo.downloadRepairService(s.jobId,s.systemKey,false).then(()=> 'unexpected success',e=>e.message);},s);
  await expect.poll(()=>reads).toBe(1);
  await page.evaluate(s=>(window as any).b3.repo.downloadRepairService(s.jobId,s.systemKey,false),s);resolveOld!();
  expect(await page.evaluate(()=>(window as any).oldDownload)).toBe('REPAIR_REFRESH_SUPERSEDED');
  expect(await page.evaluate(f=>(window as any).b3.db.localDatabase.repairFindings.get(f),s.findings[0].findingId)).toMatchObject({sourceRevision:'e'.repeat(64)});
  expect(await row(page,u)).toEqual(frozen);
});

test('B3 remediation: malformed authority is refused before cache replacement',async({page})=>{
  await ready(page);await login(page);const s=fixture();await download(page,s);
  const results=await page.evaluate(async s=>{
    const {repo,db}=(window as any).b3;const originalFetch=window.fetch;
    const mutations:[string,(s:any)=>void][]=[
      ['eligibility array',s=>s.findings[0].eligibility=['eligible']],
      ['result array',s=>s.findings[0].original.result=['poor']],
      ['status array',s=>s.workOrders[0].status=['active']],
      ['form UUID',s=>s.findings[0].original.formInstanceId='forged'],
      ['client UUID',s=>s.findings[0].original.sourceClientUuid='forged'],
      ['row UUID',s=>s.findings[0].original.rowUuid='forged'],
      ['original extra key',s=>s.findings[0].original.unexpected=true],
      ['template extra key',s=>s.findings[0].original.template.unexpected=true],
      ['missing identity',s=>delete s.findings[0].original.formInstanceId],
      ['history actor boolean',s=>s.findings[0].history[0].submitted_by_user_id=true],
      ['history actor array',s=>s.findings[0].history[0].submitted_by_user_id=[71]],
      ['history enum array',s=>s.findings[0].history[0].review_state=['approved']],
      ['awaiting predecessor',s=>{const h=s.findings[0].history[0];h.review_state=['awaiting_approval'];s.findings[0].history.push({...h,client_uuid:crypto.randomUUID(),cycle_sequence:2,predecessor_uuid:h.client_uuid,review_state:'approved'});}],
      ['review actor boolean',s=>s.findings[0].reviews[0].decided_by_user_id=true],
      ['review actor malformed string',s=>s.findings[0].reviews[0].decided_by_user_id=' 71 '],
      ['review enum array',s=>s.findings[0].reviews[0].decision=['eligible']],
      ['duplicate history across findings',s=>s.findings[1].history=structuredClone(s.findings[0].history)]
    ];
    const before=await db.localDatabase.repairFindings.get(s.findings[0].findingId),order=await db.localDatabase.repairWorkOrders.get(s.workOrders[0].workOrderId);
    const out=[];
    try{for(const [name,mutate] of mutations){const bad=structuredClone(s) as any;
      bad.workOrders[0].revision=2;
      bad.findings[0].history=[{client_uuid:crypto.randomUUID(),cycle_sequence:1,predecessor_uuid:null,remark:'History',performed_at:'2026-10-13T01:02:03.123Z',submitted_by_user_id:'71',review_state:'approved'}];
      bad.findings[0].reviews=[{id:crypto.randomUUID(),sequence:1,source_revision:bad.findings[0].sourceRevision,decided_at:'2026-10-13T01:02:03.123Z',decided_by_user_id:'71',reason:'Review reason',decision:'eligible'}];bad.findings[0].reviewSequence=1;
      mutate(bad);window.fetch=async()=>new Response(JSON.stringify(bad),{headers:{'Content-Type':'application/json'}});
      let error='accepted';try{await repo.downloadRepairService(s.jobId,s.systemKey,false);}catch(e){error=e.message;}
      const after=await db.localDatabase.repairFindings.get(before.findingId);
      out.push({name,error,preserved:JSON.stringify({...after,refreshError:undefined})===JSON.stringify(before),orderPreserved:JSON.stringify(await db.localDatabase.repairWorkOrders.get(order.workOrderId))===JSON.stringify(order)});
    }}finally{window.fetch=originalFetch;}return out;
  },s);
  for(const result of results){expect(result,errorLabel(result)).toMatchObject({error:'INVALID_REPAIR_AUTHORITY',preserved:true,orderPreserved:true});}
});
function errorLabel(result:unknown){return JSON.stringify(result);}

test('B3 remediation: strict original DTO accepts all supported frozen source readers',async({page})=>{
  await ready(page);
  const rows=[...systems.map(key=>sourceFixture(key).row),
    ...['co2_fire_extinguisher','wet_chemical','hose_reel','automatic_sprinkler','dry_wet_riser','hydrant','fire_alarm_detector'].map(key=>historicalFixture(key)),
    historicalFixture('fire_alarm_detector',true),legacyFireAlarmV7Fixture()];
  const services=rows.map(row=>{
    const source=readFindingParts(row),snapshot=row.inspectionSnapshot as R;
    const findings=source.parts.map(part=>{
      const beforePhoto=source.requiredPaths.includes(part.fieldPath)?{photoUuid:id(),fieldPath:part.fieldPath,sourceSha256:'c'.repeat(64),storedSha256:'d'.repeat(64),sizeBytes:128,width:24,height:18}:null;
      // Public shape produced by extractRepairSource/readRepairService, using the
      // actual version-specific reader output, including historical unit rows.
      return {findingId:id(),sourceFingerprint:'a'.repeat(64),sourceRevision:'b'.repeat(64),eligibility:'eligible',reviewSequence:0,reviews:[],history:[],original:{
        ...part,sourceClientUuid:row.clientUuid,jobId:row.jobId,systemKey:row.systemKey,
        sourceJob:{id:row.jobId,reference:row.jobReference,title:row.jobTitle},formInstanceId:row.serverFormInstanceId,
        instanceKey:row.instanceKey,locationId:row.locationId,zoneId:row.zoneId,template:snapshot.template,configuration:snapshot.configuration,
        contractSha256:source.contractSha256,customer:snapshot.customer,site:null,system:(snapshot.system as R).displayName??row.systemKey,
        instance:snapshot.instance??null,beforePhoto,beforePhotoMissing:!beforePhoto,
        beforePhotoLabel:beforePhoto?'Original Before photo':'Historical finding: no original Before photo'
      }};
    });
    return {jobId:row.jobId,systemKey:row.systemKey,findings,workOrders:[]};
  });
  const counts=await page.evaluate(services=>services.map(s=>(window as any).b3.contract.parseRepairService(s,s.jobId,s.systemKey).findings.length),services);
  expect(counts).toHaveLength(20);expect(counts.every(n=>n>0)).toBe(true);
});

test('B3 remediation: history must match local immutable authority and refresh rolls back atomically',async({page})=>{
  await ready(page);await login(page);const s=fixture();await download(page,s);const u=await draft(page,s);await fill(page,u);
  const results=await page.evaluate(async({s,u})=>{
    const {repo,db}= (window as any).b3;await db.localDatabase.repairRecords.update(u,{syncStatus:'Synced',reviewState:'rejected'});
    const local=await db.localDatabase.repairRecords.get(u),finding=await db.localDatabase.repairFindings.get(local.findingId),order=await db.localDatabase.repairWorkOrders.get(local.workOrderId);
    const service=structuredClone(s) as any;
    service.workOrders[0].revision=2;
    service.findings[0].history=[{client_uuid:u,cycle_sequence:local.cycleSequence,predecessor_uuid:local.predecessorUuid,remark:local.remark,performed_at:local.performedAt,submitted_by_user_id:String(local.actorId),review_state:'approved'}];
    const mutations:[string,(s:any)=>void][]=[
      ['foreign finding',s=>{s.findings[1].history=s.findings[0].history;s.findings[0].history=[];}],
      ['foreign service',s=>{s.jobId=crypto.randomUUID();for(const f of s.findings){f.original.jobId=s.jobId;f.original.sourceJob.id=s.jobId;}for(const w of s.workOrders)w.jobId=s.jobId;}],
      ['foreign actor',s=>s.findings[0].history[0].submitted_by_user_id=72],
      ['changed remark',s=>s.findings[0].history[0].remark='Different content'],
      ['changed timestamp',s=>s.findings[0].history[0].performed_at='2026-10-13T01:02:03.124Z'],
      ['changed cycle',s=>{const h=s.findings[0].history[0];s.findings[0].history=[{...h,client_uuid:crypto.randomUUID()}, {...h,cycle_sequence:2,predecessor_uuid:null}];s.findings[0].history[1].predecessor_uuid=s.findings[0].history[0].client_uuid;}]
    ];
    const nativeFetch=window.fetch,out=[];
    try{for(const [name,mutate] of mutations){const bad=structuredClone(service);mutate(bad);window.fetch=async()=>new Response(JSON.stringify(bad),{headers:{'Content-Type':'application/json'}});
      let error='accepted';try{await repo.downloadRepairService(bad.jobId,bad.systemKey,false);}catch(e){error=e.message;}
      const after=await db.localDatabase.repairFindings.get(local.findingId);
      out.push({name,error,recordPreserved:JSON.stringify(await db.localDatabase.repairRecords.get(u))===JSON.stringify(local),findingPreserved:JSON.stringify({...after,refreshError:undefined})===JSON.stringify(finding),orderPreserved:JSON.stringify(await db.localDatabase.repairWorkOrders.get(order.workOrderId))===JSON.stringify(order)});
    }
    window.fetch=async()=>new Response(JSON.stringify(service),{headers:{'Content-Type':'application/json'}});await repo.downloadRepairService(service.jobId,service.systemKey,false);
    out.push({name:'healthy',state:(await db.localDatabase.repairRecords.get(u)).reviewState});
    }finally{window.fetch=nativeFetch;}return out;
  },{s,u});
  for(const result of results.filter(r=>r.name!=='healthy'))expect(result,errorLabel(result)).toMatchObject({error:'REPAIR_HISTORY_MISMATCH',recordPreserved:true,findingPreserved:true,orderPreserved:true});
  expect(results.at(-1)).toMatchObject({name:'healthy',state:'approved'});
});

test('B3 remediation: corrupted Before identity metadata fails closed without losing original bytes',async({page})=>{
  await ready(page);await login(page);const s=fixture();await download(page,s);
  const proof=await page.evaluate(async s=>{
    const {db,repo,contract}= (window as any).b3;const f=s.findings[0],canvas=document.createElement('canvas');canvas.width=24;canvas.height=18;canvas.getContext('2d')!.fillRect(0,0,24,18);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!),'image/jpeg')),digest=await contract.sha256(await blob.arrayBuffer());
    const p={photoUuid:crypto.randomUUID(),fieldPath:f.original.fieldPath,sourceSha256:'c'.repeat(64),storedSha256:digest,sizeBytes:blob.size,width:24,height:18};
    await db.localDatabase.repairFindings.update(f.findingId,{original:{...f.original,beforePhoto:p,beforePhotoMissing:false}});
    const cached={...p,findingId:f.findingId,sourceFingerprint:f.sourceFingerprint,blob,fetchedAt:'2026-10-13T01:02:03.123Z'};
    const mutations={photoUuid:crypto.randomUUID(),fieldPath:'unrelated.path',sourceSha256:'d'.repeat(64),storedSha256:'e'.repeat(64),sizeBytes:blob.size+1,width:25,height:19,unexpected:true,fetchedAt:'bad'};
    const results=[];for(const [key,value] of Object.entries(mutations)){
      await db.localDatabase.repairBeforePhotos.put({...cached,[key]:value});let error='accepted';try{await repo.repairBeforePhotoState(f.findingId);}catch(e){error=e.message;}
      results.push({key,error,retained:await contract.sha256(await (await db.localDatabase.repairBeforePhotos.get(f.findingId)).blob.arrayBuffer())===digest});
    }
    await db.localDatabase.repairBeforePhotos.put(cached);const healthy=await repo.repairBeforePhotoState(f.findingId);
    return {results,healthy:healthy.state,exact:await contract.sha256(await healthy.photo.blob.arrayBuffer())===digest};
  },s);
  for(const result of proof.results)expect(result,errorLabel(result)).toMatchObject({error:'REPAIR_PHOTO_INTEGRITY',retained:true});
  expect(proof).toMatchObject({healthy:'cached',exact:true});
});

test('I-69: authority refresh hashes before its write transaction, so a stalled hash cannot lock repairRecords for another page',async({page,context})=>{
  await ready(page);await login(page);const s=fixture();await download(page,s);const u=await draft(page,s);await fill(page,u);
  await page.evaluate(async u=>(window as any).b3.db.localDatabase.repairRecords.update(u,{syncStatus:'Synced',reviewState:'awaiting_approval'}),u);
  const local=await row(page,u);
  s.findings[0].history.push({client_uuid:u,cycle_sequence:1,predecessor_uuid:null,remark:local.remark,performed_at:local.performedAt,submitted_by_user_id:71,review_state:'awaiting_approval'} as never);
  await download(page,s); // matching history: the refresh now has a local frozen row to verify
  // Hold the first SHA-256 of the next refresh, as a hidden or throttled page can on a phone.
  await page.evaluate(()=>{
    const original=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
    const w=window as any;w.releaseHash=release;w.hashHeld=false;
    crypto.subtle.digest=async(...args:any[])=>{w.hashHeld=true;await gate;return (original as any)(...args);};
  });
  await page.evaluate(s=>{(window as any).refresh=(window as any).b3.repo.downloadRepairService(s.jobId,s.systemKey,false).then(()=> 'ok',(e:Error)=>e.message);},s);
  await expect.poll(()=>page.evaluate(()=>(window as any).hashHeld)).toBe(true);
  // A second page of the same workspace must still get a read-write transaction on repairRecords.
  const other=await context.newPage();
  try {
    await other.goto('/tests/repair-b3.html');await other.waitForFunction(()=>(window as any).b3Ready);await login(other);
    const outcome=await other.evaluate(async()=>{
      const db=(window as any).b3.db.localDatabase,start=performance.now();
      const write=db.transaction('rw',db.repairRecords,()=>db.repairRecords.count()).then(()=>Math.round(performance.now()-start));
      return Promise.race([write,new Promise(r=>setTimeout(()=>r('BLOCKED by another page'),2500))]);
    });
    expect(typeof outcome).toBe('number');
  } finally {
    await page.evaluate(()=>(window as any).releaseHash());
    expect(await page.evaluate(()=>(window as any).refresh)).toBe('ok');
    await other.close();
  }
  // The held hash is still verified: the local frozen row is untouched and the refresh accepted it.
  expect(await row(page,u)).toMatchObject({clientUuid:u,syncStatus:'Synced',reviewState:'awaiting_approval'});
});

test('I-69: sync never hashes or decodes photo bytes inside a repair write transaction',async({page})=>{
  await ready(page);await login(page);const s=fixture();await download(page,s);const u=await draft(page,s);await fill(page,u);
  await page.route('**/api/repairs/evidence/stage',async route=>{
    const raw=route.request().postDataBuffer()!.toString();const input=JSON.parse(raw.match(/name="metadata"\r\n\r\n([^\r]+)/)![1]);
    await route.fulfill({json:{photoUuid:input.photoUuid,repairUuid:input.repairUuid,requestFingerprint:serverFingerprint({actorId:71,...input}),sourceSha256:input.sourceSha256,storedSha256:'f'.repeat(64),findingId:input.findingId,workOrderId:input.workOrderId,jobId:input.jobId,systemKey:input.systemKey}});
  });
  await page.route('**/api/repairs/submissions',async route=>{const body=route.request().postDataJSON(),p=body.parts[0];
    await route.fulfill({json:{jobId:body.jobId,systemKey:body.systemKey,results:[{clientUuid:p.clientUuid,outcome:'submitted',receipt:{clientUuid:p.clientUuid,requestFingerprint:serverFingerprint({actorId:71,...p}),findingId:p.findingId,workOrderId:p.workOrderId,jobId:p.jobId,systemKey:p.systemKey,cycleSequence:p.cycleSequence,predecessorUuid:p.predecessorUuid,sourceRevision:p.expectedSourceRevision}}]}});
  });
  await page.evaluate(()=>{
    // Record whether each slow non-IndexedDB step runs while a Dexie transaction is open on this page.
    const w=window as any,Dexie=w.b3.db.localDatabase.constructor as any;w.slowSteps=[] as Array<{kind:string;inTx:boolean}>;
    const note=(kind:string)=>w.slowSteps.push({kind,inTx:!!Dexie.currentTransaction});
    const digest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=((...a:any[])=>{note('digest');return (digest as any)(...a);}) as any;
    const buffer=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(this:Blob){note('arrayBuffer');return buffer.call(this);};
    const bitmap=window.createImageBitmap.bind(window);window.createImageBitmap=((...a:any[])=>{note('decode');return (bitmap as any)(...a);}) as any;
  });
  await sync(page);
  expect((await row(page,u)).syncStatus).toBe('Synced');
  const steps=await page.evaluate(()=>(window as any).slowSteps as Array<{kind:string;inTx:boolean}>);
  expect(steps.length).toBeGreaterThan(6); // hooks really observed fingerprints, byte reads and a decode
  expect(new Set(steps.map(x=>x.kind))).toEqual(new Set(['digest','arrayBuffer','decode']));
  expect(steps.filter(x=>x.inTx)).toEqual([]);
});

async function syncWithMidRunAuthChange(page: Page, change: Record<string, unknown>) {
  await ready(page); await login(page); const s = fixture(); await download(page, s); const u = await draft(page, s); await fill(page, u);
  let changed = false;
  await page.route('**/api/repairs/evidence/stage', async route => {
    // Another tab changes the shared sign-in record while this tab's sync is in flight.
    if (!changed) { changed = true; await page.evaluate(async c => { await (window as any).b3.db.deviceDatabase.authState.update('device-auth', c); }, change); }
    const raw = route.request().postDataBuffer()!.toString(), input = JSON.parse(raw.match(/name="metadata"\r\n\r\n([^\r]+)/)![1]);
    await route.fulfill({ json: { photoUuid: input.photoUuid, repairUuid: input.repairUuid, requestFingerprint: serverFingerprint({ actorId: 71, ...input }), sourceSha256: input.sourceSha256, storedSha256: 'f'.repeat(64), findingId: input.findingId, workOrderId: input.workOrderId, jobId: input.jobId, systemKey: input.systemKey } });
  });
  await page.route('**/api/repairs/submissions', async route => {
    const body = route.request().postDataJSON(), p = body.parts[0];
    await route.fulfill({ json: { jobId: body.jobId, systemKey: body.systemKey, results: [{ clientUuid: p.clientUuid, outcome: 'submitted', receipt: { clientUuid: p.clientUuid, requestFingerprint: serverFingerprint({ actorId: 71, ...p }), findingId: p.findingId, workOrderId: p.workOrderId, jobId: p.jobId, systemKey: p.systemKey, cycleSequence: p.cycleSequence, predecessorUuid: p.predecessorUuid, sourceRevision: p.expectedSourceRevision } }] } });
  });
  await sync(page);
  return u;
}

test('I-71: a verification-timestamp refresh by another tab during sync does not fail the record', async ({ page }) => {
  const u = await syncWithMidRunAuthChange(page, { lastVerifiedAt: '2026-10-18T10:05:00.000Z', cachedAt: '2026-10-18T10:05:00.000Z' });
  const r = await row(page, u);
  expect(r.syncStatus).toBe('Synced'); expect(r.lastSyncError).toBeUndefined();
});

for (const [label, change] of [['username', { username: 'renamed-account' }], ['role', { role: 'admin' }], ['pending logout', { serverLogoutPending: true }], ['explicit logout', { explicitLogout: true }]] as const) {
  test(`I-71: a real identity change (${label}) during sync still stops it and retains the record`, async ({ page }) => {
    const u = await syncWithMidRunAuthChange(page, change as Record<string, unknown>);
    const r = await row(page, u);
    expect(r.syncStatus).not.toBe('Synced');
    expect(['Pending', 'Failed']).toContain(r.syncStatus);
    expect(r.frozen).toBeDefined(); // the immutable submission is retained for a later retry
    const err = await page.evaluate(async uu => { const db = (window as any).b3.db.localDatabase; const rec = await db.repairRecords.get(uu); const a = await db.repairAttachments.get(rec.photoUuid); return `${rec.lastSyncError ?? ''}|${a.lastSyncError ?? ''}`; }, u);
    expect(err).toContain('REPAIR_IDENTITY_CHANGED');
  });
}
