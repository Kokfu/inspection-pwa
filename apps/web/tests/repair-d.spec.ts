import { expect, test, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { fingerprint } from "../../api/src/repairs/acceptedSource";
const id = () => randomUUID(), at = "2026-10-13T04:00:00.123Z";
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
test.afterEach(async ({ page }) => { await page.evaluate(() => { window.fetch = async () => { throw new Error("C2 fixture ended"); }; }); await page.unrouteAll({ behavior: "wait" }); });
function fixture() {
  const jobId = id(), customerId = id(), systemKey = "co2_fire_extinguisher", orderId = id();
  const findings = [0, 1].map(i => ({ findingId: id(), sourceFingerprint: String(i + 1).repeat(64), sourceRevision: "a".repeat(64), eligibility: "eligible", reviewSequence: 0, reviews: [] as any[], history: [] as any[],
    original: { jobId, systemKey, fieldPath: `checks.part${i}`, responsePath: `checks.part${i}.result`, result: "poor", remark: `ORIGINAL immutable remark ${i}`, template: { id: id(), code: "MFE-FSSR", version: 1 }, contractSha256: "b".repeat(64),
      beforePhotoMissing: true, beforePhoto: null as any, beforePhotoLabel: "Historical finding: no original Before photo", formInstanceId: id(), sourceClientUuid: id(), rowUuid: null,
      caption: `Failed part ${i}`, sectionLabel: "Cylinder Checks", fieldLabel: `Failed Part ${i}`, unit: { label: "Unit A" }, sourceJob: { id: jobId, reference: "SV-C2-ORIGINAL", title: "Original accepted visit" },
      instanceKey: "primary", locationId: null, zoneId: null, configuration: { revisionId: id(), revisionNumber: 1 }, customer: { id: customerId, code: "C2", displayName: "C2 Customer" }, site: null, system: "CO2", instance: null } }));
  return { jobId, systemKey, findings, workOrders: [{ workOrderId: orderId, jobId, systemKey, assignedToUserId: 71, revision: 1, status: "active" }] };
}
type Service = ReturnType<typeof fixture>;
async function jpeg(page: Page, color: string) {
  return Buffer.from(await page.evaluate(color => { const c = document.createElement("canvas"); c.width = 80; c.height = 60; const x = c.getContext("2d")!; x.fillStyle = color; x.fillRect(0, 0, 80, 60); return c.toDataURL("image/jpeg").split(",")[1]; }, color), "base64");
}
async function boot(page: Page, role = "admin", deep = true, s = fixture()) {
  const photo = await jpeg(page, "#157944"), beforePhoto = await jpeg(page, "#995511");
  const details = new Map<string, any>();
  for (const [i, f] of s.findings.entries()) {
    // One approved old cycle plus a submitted repeat; the other part is independent.
    const count = i === 0 ? 2 : 1;
    for (let sequence = 1; sequence <= count; sequence++) {
      const clientUuid = id(), previous = f.history.at(-1)?.client_uuid ?? null, state = sequence < count ? "approved" : "awaiting_approval";
      const h = { client_uuid: clientUuid, cycle_sequence: sequence, predecessor_uuid: previous, remark: `Immutable After remark ${i} cycle ${sequence}`, performed_at: at, submitted_by_user_id: 71, review_state: state };
      f.history.push(h);
      const photoUuid = id(), receipt = { clientUuid, findingId: f.findingId, workOrderId: s.workOrders[0].workOrderId, jobId: s.jobId, systemKey: s.systemKey, cycleSequence: sequence, predecessorUuid: previous, requestFingerprint: "d".repeat(64), sourceRevision: f.sourceRevision };
      const decisions = state === "approved" ? [{ clientUuid, decisionId: id(), requestId: id(), requestFingerprint: "e".repeat(64), sequence: 1, decision: "approved", reason: null, decidedAt: at, decidedByUserId: 81, decidedByRole: "supervisor" }] : [];
      details.set(clientUuid, { receipt, remark: h.remark, performedAt: h.performed_at, submittedAt: at, submittedByUserId: 71, manifest: [{ photoUuid, fieldPath: f.original.fieldPath, sourceSha256: digest(photo) }],
        evidence: { photoUuid, repairUuid: clientUuid, findingId: f.findingId, workOrderId: receipt.workOrderId, jobId: s.jobId, systemKey: s.systemKey, requestFingerprint: "f".repeat(64), sourceSha256: digest(photo), storedSha256: digest(photo) }, reviewState: state, decisions });
    }
  }
  const calls: Array<{ path: string; body: any }> = [], receipts = new Map<string, any>();
  let responseLoss = "", failure = "", actor = 81, actorRole = role;
  const controls = { lose: (kind: string) => { responseLoss = kind; }, fail: (code: string) => { failure = code; }, actor: (n: number, r = role) => { actor = n; actorRole = r; } };
  await page.route("**/api/**", async r => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/auth/me") return r.fulfill({ json: { user: { id: actor, username: `c2-${actor}`, role: actorRole } } });
    if (path === "/api/health") return r.fulfill({ json: { status: "ok" } });
    if (path === "/api/repairs/services") return r.fulfill({ json: { services: [{ jobId: s.jobId, systemKey: s.systemKey, sourceJob: s.findings[0].original.sourceJob, customer: s.findings[0].original.customer, site: null, systemLabel: "CO2" }] } });
    if (path === `/api/repairs/services/${s.jobId}/${s.systemKey}`) return failure ? r.fulfill({ status: 503, json: { error: failure } }) : r.fulfill({ json: s });
    if (path === "/api/manager/technicians") return r.fulfill({ json: { technicians: [71, 72, 73, 74].map(n => ({ id: n, username: `tech-${n}`, displayName: `Technician ${n}`, role: n === 74 ? "supervisor" : "inspector", isActive: n !== 73, createdAt: at, supervisorIds: [] })) } });
    if (r.request().method() === "POST" && path.startsWith("/api/repairs/")) {
      const body = r.request().postDataJSON(); calls.push({ path, body });
      // Every mutation must already exist in IndexedDB before it reaches fetch.
      const persisted = await page.evaluate(requestId => (window as any).c2.db.localDatabase.referenceData.toArray().then((v: any[]) => v.some(x => x.payload?.body?.requestId === requestId)), body.requestId);
      expect(persisted).toBe(true); expect(r.request().headers()["x-expected-user-id"]).toBe(String(actor));
      const kind = path.endsWith("/decisions") ? "decision" : path.endsWith("/source-review") ? "source" : "assignment", target = path.split("/").at(-2)!;
      const requestFingerprint = fingerprint(kind === "decision" ? { actorId: actor, repairUuid: target, ...body } : kind === "source" ? { actorId: actor, findingId: target, ...body } : { actorId: actor, mode: "manager", ...body });
      const prior = receipts.get(body.requestId);
      if (prior) return prior.requestFingerprint !== requestFingerprint ? r.fulfill({ status: 409, json: { error: "IDEMPOTENCY_CONFLICT" } }) : r.fulfill({ json: prior });
      let receipt: any;
      if (kind === "decision") {
        const d = details.get(target), f = s.findings.find(f => f.history.some(h => h.client_uuid === target))!;
        if (d.decisions.length !== body.expectedSequence || d.reviewState !== "awaiting_approval") return r.fulfill({ status: 409, json: { error: "STALE_REPAIR_DECISION" } });
        if (f.sourceRevision !== body.expectedSourceRevision) return r.fulfill({ status: 409, json: { error: "STALE_SOURCE_REVIEW" } });
        receipt = { requestId: body.requestId, requestFingerprint, decisionId: id(), clientUuid: target, sequence: body.expectedSequence + 1, decision: body.decision };
        d.decisions.push({ ...receipt, reason: body.reason, decidedAt: at, decidedByUserId: actor, decidedByRole: actorRole }); d.reviewState = body.decision;
        f.history.find(h => h.client_uuid === target)!.review_state = body.decision;
      } else if (kind === "source") {
        const f = s.findings.find(f => f.findingId === target)!;
        if (f.sourceRevision !== body.expectedSourceRevision || f.reviewSequence !== body.expectedReviewSequence) return r.fulfill({ status: 409, json: { error: "STALE_SOURCE_REVIEW" } });
        receipt = { requestId: body.requestId, requestFingerprint, reviewId: id(), findingId: target, sequence: body.expectedReviewSequence + 1, sourceRevision: body.expectedSourceRevision, decision: body.decision };
        f.reviews.push({ id: receipt.reviewId, sequence: receipt.sequence, source_revision: f.sourceRevision, decision: body.decision, reason: body.reason, decided_at: at, decided_by_user_id: actor }); f.reviewSequence++; f.eligibility = body.decision;
      } else {
        const w = s.workOrders.find(w => w.workOrderId === body.workOrderId);
        if ((w?.revision ?? 0) !== body.expectedRevision) return r.fulfill({ status: 409, json: { error: "STALE_WORK_ORDER" } });
        receipt = { requestId: body.requestId, requestFingerprint, workOrderId: body.workOrderId, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: body.assignedToUserId, revision: body.expectedRevision + 1, status: body.status };
        const next = { workOrderId: receipt.workOrderId, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: receipt.assignedToUserId, revision: receipt.revision, status: receipt.status };
        if (w) Object.assign(w, next); else s.workOrders.push(next);
      }
      receipts.set(body.requestId, receipt);
      if (responseLoss === kind) { responseLoss = ""; return r.abort("failed"); }
      return r.fulfill({ json: receipt });
    }
    const recordMatch = path.match(/\/repairs\/records\/([^/]+)(\/after\/content)?$/);
    if (recordMatch && details.has(recordMatch[1])) return recordMatch[2] ? r.fulfill({ body: photo, contentType: "image/jpeg" }) : r.fulfill({ json: details.get(recordMatch[1]) });
    if (/\/before\/content$/.test(path)) return r.fulfill({ body: beforePhoto, contentType: "image/jpeg" });
    return r.fulfill({ status: 503, json: { error: "C2_FIXTURE_UNAVAILABLE" } });
  });
  await page.goto(`/tests/repair-c2.html${deep ? `#/manager-repairs/${s.jobId}/${s.systemKey}` : ""}`);
  await page.waitForFunction(() => (window as any).c2Ready);
  await page.getByRole("button", { name: new RegExp(`^${role === "admin" ? "Manager" : role === "supervisor" ? "Admin" : "Technician"}`) }).click();
  if (role !== "inspector" && deep) await expect(page.getByRole("heading", { name: "C2 Customer", exact: true })).toBeVisible();
  return { s, details, calls, receipts, photo, beforePhoto, controls };
}
async function exportBoot(page: Page) {
  const f=await boot(page,'supervisor');
  const repeat=f.s.findings[0].history[1],detail=f.details.get(repeat.client_uuid);repeat.review_state='approved';detail.reviewState='approved';
  detail.decisions=[{clientUuid:repeat.client_uuid,decisionId:id(),requestId:id(),requestFingerprint:'e'.repeat(64),sequence:1,decision:'approved',reason:null,decidedAt:at,decidedByUserId:81,decidedByRole:'supervisor'}];
  const issued:any[]=[],bodies:any[]=[];let lose=false,malformed=false,fail='',refusal='',late:Promise<void>|undefined;
  const control={lose:()=>{lose=true;},malformed:()=>{malformed=true;},fail:(v:string)=>{fail=v;},refuse:(v:string)=>{refusal=v;},late:(p:Promise<void>)=>{late=p;}};
  await page.route(`**/api/repairs/services/${f.s.jobId}/${f.s.systemKey}/exports`,r=>r.fulfill({json:fail?{wrong:true}:{jobId:f.s.jobId,systemKey:f.s.systemKey,exports:issued}}));
  await page.route('**/api/repairs/exports**',async r=>{
    const path=new URL(r.request().url()).pathname;
    if(path.endsWith('/pdf')) return r.fulfill({contentType:'application/pdf',body:'%PDF-fixture'});
    const b=r.request().postDataJSON();
    if(path.endsWith('/preview')) return fail?r.fulfill({status:409,json:{error:fail}}):r.fulfill({json:{jobId:b.jobId,systemKey:b.systemKey,selection:b.selection,html:`<!doctype html><h1>PREVIEW - NOT ISSUED</h1>${b.selection.map((s:any)=>`<p>${s.clientUuid}</p>`).join('')}`}});
    bodies.push(b);
    expect(await page.evaluate(requestId=>(window as any).c2.db.localDatabase.referenceData.toArray().then((v:any[])=>v.some(x=>x.key==='repair-export-request:'+requestId && x.payload.body.requestId===requestId)),b.requestId)).toBe(true);
    if(refusal) return r.fulfill({status:409,json:{error:refusal}});
    if(late) await late;
    const requestFingerprint=fingerprint({actorId:81,...b}),existing=issued.find(v=>v.requestId===b.requestId);
    if(existing) return existing.requestFingerprint!==requestFingerprint?r.fulfill({status:409,json:{error:'IDEMPOTENCY_CONFLICT'}}):r.fulfill({json:(({validity,...receipt})=>receipt)(existing)});
    const receipt={exportId:id(),requestId:b.requestId,requestFingerprint,jobId:b.jobId,systemKey:b.systemKey,number:`MFE/RR/${String(issued.length+1).padStart(6,'0')}`,issuedAt:at,
      selection:b.selection.map((s:any)=>({...s,findingId:f.s.findings[0].findingId,cycle:f.s.findings[0].history.find(h=>h.client_uuid===s.clientUuid)!.cycle_sequence,approvalId:id()}))};
    issued.push({...receipt,validity:b.selection.map((s:any)=>({clientUuid:s.clientUuid,state:'current'}))});
    if(lose){lose=false;return r.abort('failed');}
    return r.fulfill({json:malformed?{...receipt,selection:[{...receipt.selection[0],clientUuid:id()}]}:receipt});
  });
  await page.getByRole('button',{name:'Refresh Review Authority'}).click();await expect(page.getByRole('button',{name:'Open Repair Export'})).toBeEnabled();
  await page.getByRole('button',{name:'Open Repair Export'}).click();await expect(page.getByRole('group',{name:'Approved Cycles'})).toBeVisible();
  return {...f,issued,bodies,control};
}
const panel=(page:Page)=>page.getByRole('region',{name:'Repair Report / PDF',exact:true});
async function selectAndPreview(page:Page,count=1){const p=panel(page);for(let i=0;i<count;i++)await p.getByRole('checkbox').nth(i).check();await p.getByRole('button',{name:'Preview Selected Repair Report'}).click();await expect(p.getByTitle('Selected Repair Report Preview')).toBeVisible();}
test('D explicit repeat-cycle selection, subset issuance/download, accessible errors and three viewport proofs',async({page})=>{
  const f=await exportBoot(page),p=panel(page);await expect(p.getByRole('checkbox')).toHaveCount(2);
  await p.getByRole('button',{name:'Preview Selected Repair Report'}).click();await expect(p.getByRole('checkbox').first()).toBeFocused();await expect(p.getByRole('alert')).toContainText('Select at least one');
  for(const size of [{width:360,height:800},{width:768,height:1024},{width:1280,height:800}]){
    await page.setViewportSize(size);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const targets=await p.locator('button,label').evaluateAll(els=>els.filter(e=>(e as HTMLElement).offsetParent!==null).map(e=>e.getBoundingClientRect().toJSON()));expect(targets.every(t=>t.width>=44 && t.height>=44)).toBe(true);
    await page.screenshot({path:`../../logs/cr09-d-${size.width}.png`,fullPage:true});
  }
  await selectAndPreview(page,2);
  for(const size of [{width:360,height:800},{width:768,height:1024},{width:1280,height:800}]){await page.setViewportSize(size);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.scrollIntoViewIfNeeded();await page.screenshot({path:`../../logs/cr09-d-preview-${size.width}.png`});}
  await p.getByRole('button',{name:'Issue Selected Repair PDF'}).click();await expect(p.getByRole('button',{name:'Download MFE/RR/000001'})).toBeEnabled();
  expect(f.bodies[0].selection).toHaveLength(2);expect(f.issued[0].selection.map((s:any)=>s.cycle).sort()).toEqual([1,2]);
  const download=page.waitForEvent('download');await p.getByRole('button',{name:'Download MFE/RR/000001'}).click();expect((await download).suggestedFilename()).toBe('MFE-RR-000001.pdf');
  f.issued[0].validity[0].state='approval_withdrawn';await p.getByRole('button',{name:'Refresh Export Authority'}).click();await expect(p.getByText(/Approval withdrawn after issuance/)).toBeVisible();await expect(p.getByRole('button',{name:'Download MFE/RR/000001'})).toBeEnabled();
});
test('D lost response durable exact UUID replay; changed content under UUID conflicts',async({page})=>{
  const f=await exportBoot(page),p=panel(page);await selectAndPreview(page);f.control.lose();await p.getByRole('button',{name:'Issue Selected Repair PDF'}).click();await expect(p.getByRole('alert')).toBeVisible();
  await page.reload();await page.waitForFunction(()=>(window as any).c2Ready);await page.getByRole('button',{name:'Open Repair Export'}).click();
  await expect(p.getByRole('button',{name:'Replay Exact Export Request'})).toBeEnabled();await p.getByRole('button',{name:'Replay Exact Export Request'}).click();await expect(p.getByText(/Exact issued receipt confirmed/)).toBeVisible();
  expect(f.bodies).toHaveLength(2);expect(f.bodies[1]).toEqual(f.bodies[0]);expect(f.issued).toHaveLength(1);
  // A forged changed request cannot pass the local fingerprint/content guard.
  const result=await page.evaluate(async({jobId,systemKey})=>{const m=await import('/src/repairs/repairExportRepository.ts' as any),r=(window as any).c2.review,ctx=await r.reviewContext({id:81,username:'c2-81',role:'supervisor'},()=>true),op=(await m.savedExports(ctx,jobId,systemKey))[0];op.body.selection[0].approvalSequence=2;try{await m.replayExport(ctx,op);return 'WRONGLY_ACCEPTED';}catch(e){return (e as Error).message;}},{jobId:f.s.jobId,systemKey:f.s.systemKey});expect(result).toBe('REPAIR_EXPORT_REQUEST_CHANGED');
});
test('D malformed exact receipt and failed authority refresh leave request unconfirmed and fail closed',async({page})=>{
  const f=await exportBoot(page),p=panel(page);await selectAndPreview(page);f.control.malformed();await p.getByRole('button',{name:'Issue Selected Repair PDF'}).click();await expect(p.getByRole('alert')).toContainText('INVALID_REPAIR_EXPORT_RECEIPT');
  const saved=await page.evaluate(()=>(window as any).c2.db.localDatabase.referenceData.where('key').startsWith('repair-export-request:').toArray());expect(saved).toHaveLength(1);expect(saved[0].payload.receipt).toBeUndefined();
  f.control.fail('MALFORMED');await p.getByRole('button',{name:'Refresh Export Authority'}).click();await expect(p.getByRole('alert')).toContainText('INVALID_REPAIR_EXPORT_HISTORY');await expect(p.getByRole('checkbox')).toHaveCount(0);
});
test('D source/approval change after selection blocks preview and preserves technician data',async({page})=>{
  const f=await exportBoot(page),p=panel(page);f.control.fail('STALE_SOURCE_REVIEW');await p.getByRole('checkbox').first().check();await p.getByRole('button',{name:'Preview Selected Repair Report'}).click();await expect(p.getByRole('alert')).toContainText('STALE_SOURCE_REVIEW');expect(f.bodies).toHaveLength(0);await expect(p.getByTitle('Selected Repair Report Preview')).toHaveCount(0);
});
test('D offline invalidates preview, actor switch discards late issuance receipt',async({page,context})=>{
  const f=await exportBoot(page),p=panel(page);await selectAndPreview(page);await context.setOffline(true);await expect(page.getByTitle('Selected Repair Report Preview')).toHaveCount(0);await expect(page.getByRole('button',{name:'Issue Selected Repair PDF'})).toHaveCount(0);await context.setOffline(false);
  await page.reload();await page.getByRole('button',{name:'Open Repair Export'}).click();await expect(p.getByRole('checkbox')).toHaveCount(2);await selectAndPreview(page);
  let release!:()=>void;f.control.late(new Promise<void>(r=>{release=r;}));await p.getByRole('button',{name:'Issue Selected Repair PDF'}).click();await expect.poll(()=>f.bodies.length).toBe(1);
  await page.evaluate(async()=>{const db=(window as any).c2.db;const auth=await db.deviceDatabase.authState.get('device-auth');await db.deviceDatabase.authState.put({...auth,userId:99});});release();
  await expect(page.getByRole('button',{name:'Issue Selected Repair PDF'})).toHaveCount(0);
  const saved=await page.evaluate(()=>(window as any).c2.db.localDatabase.referenceData.where('key').startsWith('repair-export-request:').toArray());expect(saved[0].payload.receipt).toBeUndefined();
});
test('D Technician receives no export control',async({page})=>{await boot(page,'inspector');await expect(page.getByRole('button',{name:'Open Repair Export'})).toHaveCount(0);});
test('D confirmed stale issuance refusal retained; fresh preview can issue a new UUID while unknown outcomes stay blocked',async({page})=>{
  const f=await exportBoot(page),p=panel(page);await selectAndPreview(page);f.control.refuse('STALE_SOURCE_REVIEW');await p.getByRole('button',{name:'Issue Selected Repair PDF'}).click();await expect(p.getByRole('alert')).toContainText('STALE_SOURCE_REVIEW');
  const saved=await page.evaluate(()=>(window as any).c2.db.localDatabase.referenceData.where('key').startsWith('repair-export-request:').toArray());expect(saved[0].payload.refusal).toBe('STALE_SOURCE_REVIEW');expect(saved[0].payload.receipt).toBeUndefined();
  f.control.refuse('');await p.getByRole('button',{name:'Refresh Export Authority'}).click();await expect(p.getByText(/Not issued — server refused/)).toBeVisible();await selectAndPreview(page);await expect(p.getByRole('button',{name:'Issue Selected Repair PDF'})).toBeEnabled();
  await p.getByRole('button',{name:'Issue Selected Repair PDF'}).click();await expect(p.getByRole('button',{name:'Download MFE/RR/000001'})).toBeEnabled();expect(f.bodies).toHaveLength(2);expect(f.bodies[0].requestId).not.toBe(f.bodies[1].requestId);expect(f.issued).toHaveLength(1);
});
test('D workspace switch and stale caller cannot send saved export request; technician stores unchanged',async({page})=>{
  const f=await exportBoot(page);
  const result=await page.evaluate(async({jobId,systemKey,clientUuid})=>{
    const api=await import('/src/repairs/repairExportRepository.ts' as string),db=(window as any).c2.db,r=(window as any).c2.review;
    const counts=async()=>Promise.all([db.localDatabase.repairRecords.count(),db.localDatabase.repairAttachments.count(),db.localDatabase.repairBeforePhotos.count()]);const before=await counts();
    let current=true;const ctx=await r.reviewContext({id:81,username:'c2-81',role:'supervisor'},()=>current);
    const op=await api.saveExportRequest(ctx,{requestId:crypto.randomUUID(),jobId,systemKey,selection:[{clientUuid,approvalSequence:1,sourceRevision:'a'.repeat(64),reviewSequence:0}]});
    current=false;let stale='';try{await api.replayExport(ctx,op);}catch(e){stale=(e as Error).message;}
    current=true;await db.activateUserWorkspace(99);let workspace='';try{await api.replayExport(ctx,op);}catch(e){workspace=(e as Error).message;}
    await db.activateUserWorkspace(81);const after=await counts();return {stale,workspace,before,after};
  },{jobId:f.s.jobId,systemKey:f.s.systemKey,clientUuid:f.s.findings[0].history[0].client_uuid});
  expect(result.stale).toBe('REPAIR_REVIEW_AUTHORITY_CHANGED');expect(result.workspace).toBe('REPAIR_REVIEW_AUTHORITY_CHANGED');expect(result.after).toEqual(result.before);expect(f.bodies).toHaveLength(0);
});

