import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.goto('/tests/repair-phone-save.html');
  await page.waitForFunction(() => (window as any).phoneSaveReady);
  return page.evaluate(async () => {
    const {db,repo}=(window as any).phoneSave;
    await db.deviceDatabase.authState.put({key:'device-auth',userId:71,role:'inspector',username:'fixture',cachedAt:'2026-10-14T00:00:00.000Z'});
    await db.activateUserWorkspace(71);
    const clientUuid=crypto.randomUUID(),findingId=crypto.randomUUID(),workOrderId=crypto.randomUUID(),jobId=crypto.randomUUID(),at=new Date().toISOString();
    await db.localDatabase.repairFindings.put({findingId,sourceFingerprint:'a'.repeat(64),sourceRevision:'b'.repeat(64),history:[],original:{jobId,systemKey:'fire_intercom',fieldPath:'checks.part',beforePhotoMissing:true,beforePhoto:null}});
    await db.localDatabase.repairWorkOrders.put({workOrderId,jobId,systemKey:'fire_intercom',revision:1,assignedToUserId:71});
    await db.localDatabase.repairRecords.put({clientUuid,findingId,workOrderId,jobId,systemKey:'fire_intercom',actorId:71,cycleSequence:1,predecessorUuid:null,remark:'',performedAt:at,localCreatedAt:at,localUpdatedAt:at,syncStatus:'Draft',reviewState:'unsubmitted'});
    (window as any).phoneSave.uuid=clientUuid;
    (window as any).phoneSave.mount(clientUuid);
    return clientUuid;
  });
}
async function holdAssertion(page: Page) {
  await page.evaluate(() => {
    const h=(window as any).phoneSave, original=h.db.deviceDatabase.authState.get.bind(h.db.deviceDatabase.authState);
    let release!:()=>void; const gate=new Promise<void>(r=>{release=r;});
    h.release=release;h.assertions=0;h.writes=[];h.spins=0;
    h.db.deviceDatabase.authState.get=function(...args:any[]) {
      const tx=h.Dexie.currentTransaction;
      if(tx?.db===h.db.localDatabase) {
        h.assertions++;
        return h.Dexie.ignoreTransaction(()=>h.Dexie.Promise.resolve(h.assertions===1?gate:new Promise(r=>setTimeout(r,80))).then(()=>{
          h.spins+=tx._spinCount;return original(...args);
        }));
      }
      return original(...args);
    };
    const update=h.db.localDatabase.repairRecords.update.bind(h.db.localDatabase.repairRecords);
    h.db.localDatabase.repairRecords.update=(key:any,changes:any)=>{if('remark' in changes)h.writes.push(changes.remark);return update(key,changes);};
  });
}
async function burst(page: Page, value='CR09-HDR01-offline-cycle4') {
  await page.getByLabel('Repair Remark (Required)').fill(value.slice(0,1));
  await page.waitForFunction(()=>(window as any).phoneSave.assertions===1);
  await page.getByLabel('Repair Remark (Required)').evaluate((el,value) => {
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;
    for(let i=2;i<=value.length;i++){setter.call(el,value.slice(0,i));el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value[i-1]}));}
  },value);
}
const row=(page:Page)=>page.evaluate(()=>{const h=(window as any).phoneSave;return h.db.localDatabase.repairRecords.get(h.uuid);});

test('held auth assertion expires, releases repair lock and cannot overwrite a newer retry on late release',async({page})=>{
  await setup(page);await holdAssertion(page);await burst(page);
  await expect(page.getByRole('status')).toHaveText('Draft save failed; keep this form open and retry Save Draft.',{timeout:7000});
  expect((await row(page)).remark).toBe('');
  await page.getByLabel('Repair Remark (Required)').fill('Newer successful retry');
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');
  await page.evaluate(()=>(window as any).phoneSave.release());
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect((await row(page)).remark).toBe('Newer successful retry');
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(false);
});

async function chooseReplacement(page: Page, color: string) {
  const jpeg=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=96;c.height=72;const ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,96,72);return c.toDataURL('image/jpeg').split(',')[1];},color);
  await page.getByLabel("Choose this part's After photo").setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg,'base64')});
}
async function holdPhotoCompletion(page: Page) {
  await page.evaluate(()=>{
    const h=(window as any).phoneSave,db=h.db.localDatabase,original=db.transaction.bind(db);let first=true;
    db.transaction=(...args:any[])=>{const work=args.pop();return original(...args,async(tx:any)=>{
      if(first && tx.mode==='readwrite') {first=false;const native=tx.idbtrans,complete=native.oncomplete,abort=native.abort.bind(native);
        native.abort=()=>{try{return abort();}catch(e){h.photoAbortThrew=true;throw e;}};
        native.oncomplete=(ev:any)=>{h.photoNativeCommitted=true;h.releasePhotoCompletion=()=>{complete.call(native,ev);h.photoCompletionReleased=true;};};
      }return work(tx);
    });};h.restorePhotoCompletion=()=>{db.transaction=original;};
  });
}
const photoRows=(page:Page)=>page.evaluate(async()=>{const h=(window as any).phoneSave;return (await h.db.localDatabase.repairAttachments.toArray()).map((p:any)=>({...p,blob:{size:p.blob.size,type:p.blob.type}}));});

test('P2 photo replacement with unconfirmed completion reports uncertainty; offline retry and late delivery preserve newer photo and dirty remark',async({page,context})=>{
  await setup(page);await retainedPhoto(page);const original=await row(page);
  // Leave a real failed remark save dirty while the photo operation recovers.
  await page.evaluate(()=>{const h=(window as any).phoneSave,t=h.db.localDatabase.repairRecords,update=t.update.bind(t);let first=true;t.update=(key:any,changes:any)=>{if(first && 'remark' in changes){first=false;throw new Error('controlled remark rollback');}return update(key,changes);};});
  await page.getByLabel('Repair Remark (Required)').fill('Latest visible dirty remark');
  await expect(page.getByRole('status')).toHaveText('Draft save failed; keep this form open and retry Save Draft.');
  await context.setOffline(true);await holdPhotoCompletion(page);await chooseReplacement(page,'red');
  await page.waitForFunction(()=>(window as any).phoneSave.photoNativeCommitted);
  await expect(page.getByRole('status')).toHaveText('Processing photo…');
  const committed=await row(page);expect(committed.photoUuid).not.toBe(original.photoUuid);
  const photos=await photoRows(page);expect(photos.map((p:any)=>p.photoUuid)).toEqual([committed.photoUuid]);
  expect(photos[0].captureSource).toBe('gallery');expect(photos[0].blob.size).toBeGreaterThan(0);
  await expect(page.getByRole('alert')).toContainText('REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN',{timeout:7000});
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect(await page.evaluate(()=>(window as any).phoneSave.photoAbortThrew)).toBe(true);
  console.log('P2 committed replacement proof',JSON.stringify({oldPhotoUuid:original.photoUuid,committedPhotoUuid:committed.photoUuid,oldPhotoExists:photos.some((p:any)=>p.photoUuid===original.photoUuid),replacementExists:true,abortThrew:true,status:await page.getByRole('status').textContent()}));
  await expect(page.getByRole('status')).toHaveText('After photo save outcome unconfirmed; the replacement may already be saved. Retry choosing or taking the photo. Internet is not required.');
  await expect(page.getByRole('status')).not.toContainText(/previous saved photo is retained|rollback|After photo saved on this device/);
  for(const name of ['Take After Photo','Replace After Photo','Save Draft','Submit Locally'])await expect(page.getByRole('button',{name,exact:true})).toBeEnabled();
  await expect(page.getByLabel('Repair Remark (Required)')).toHaveValue('Latest visible dirty remark');
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(true);
  for(const viewport of [{width:360,height:800},{width:768,height:1024},{width:1280,height:800}]){
    await page.setViewportSize(viewport);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const name of ['Take After Photo','Replace After Photo','Save Draft','Submit Locally']){const box=await page.getByRole('button',{name,exact:true}).boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);}
    await page.screenshot({path:`../../logs/cr09-phone-save04-retry-${viewport.width}.png`,fullPage:true});
  }
  await page.evaluate(()=>(window as any).phoneSave.restorePhotoCompletion());
  await chooseReplacement(page,'blue');await expect(page.getByRole('status')).toHaveText('After photo saved on this device.');
  const newer=await row(page),newerPhotos=await photoRows(page);expect(newer.photoUuid).not.toBe(committed.photoUuid);expect(newerPhotos.map((p:any)=>p.photoUuid)).toEqual([newer.photoUuid]);
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(true);
  const outcome=await page.getByRole('status').textContent();
  await page.evaluate(()=>(window as any).phoneSave.releasePhotoCompletion());
  await page.waitForFunction(()=>(window as any).phoneSave.photoCompletionReleased);await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect(await row(page)).toEqual(newer);expect(await photoRows(page)).toEqual(newerPhotos);
  await expect(page.getByRole('status')).toHaveText(outcome!);await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(true);
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();await expect(page.getByRole('status')).toContainText('Submitted on this device');
  const pending=await row(page);expect(pending.frozen.remark).toBe('Latest visible dirty remark');expect(pending.photoUuid).toBe(newer.photoUuid);
  await page.evaluate(async()=>{const h=(window as any).phoneSave,a=await h.db.localDatabase.repairAttachments.get((await h.db.localDatabase.repairRecords.get(h.uuid)).photoUuid);h.pendingReplaceError=await h.repo.captureRepairPhoto(h.uuid,a.blob,'gallery').then(()=>null,(e:any)=>h.repo.errorMessage(e));});
  expect(await page.evaluate(()=>(window as any).phoneSave.pendingReplaceError)).toBe('REPAIR_IMMUTABLE');expect(await row(page)).toEqual(pending);expect(await photoRows(page)).toHaveLength(1);
});

test('P2 photo replacement native rollback retains previous committed photo and allows confirmed retry',async({page})=>{
  await setup(page);await retainedPhoto(page);const original=await row(page),photos=await photoRows(page);
  await page.evaluate(()=>{const h=(window as any).phoneSave,t=h.db.localDatabase.repairAttachments,add=t.add.bind(t);let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});h.releasePhotoWrite=release;
    t.add=async(...args:any[])=>{const tx=h.Dexie.currentTransaction;tx.idbtrans.addEventListener('abort',()=>{h.photoNativeAborted=true;});const result=await add(...args);h.photoWriteIssued=true;await h.Dexie.waitFor(gate);return result;};h.restorePhotoWrite=()=>{t.add=add;};
  });
  await chooseReplacement(page,'red');await page.waitForFunction(()=>(window as any).phoneSave.photoWriteIssued);
  await expect(page.getByRole('alert')).toContainText('REPAIR_LOCAL_STORAGE_TIMEOUT',{timeout:7000});await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect(await page.evaluate(()=>(window as any).phoneSave.photoNativeAborted)).toBe(true);
  expect(await row(page)).toEqual(original);expect(await photoRows(page)).toEqual(photos);
  await expect(page.getByRole('status')).toHaveText('After photo save failed; your previous saved photo is retained. Retry choosing or taking the photo.');
  await expect(page.getByRole('button',{name:'Replace After Photo'})).toBeEnabled();
  await page.evaluate(()=>(window as any).phoneSave.restorePhotoWrite());await chooseReplacement(page,'blue');await expect(page.getByRole('status')).toHaveText('After photo saved on this device.');
  const retry=await row(page);await page.evaluate(()=>(window as any).phoneSave.releasePhotoWrite());await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect(await row(page)).toEqual(retry);await expect(page.getByRole('status')).toHaveText('After photo saved on this device.');
});

for(const change of ['account','unmount']) test(`P2 expired photo completion cannot publish into ${change}`,async({page})=>{
  await setup(page);await retainedPhoto(page);await holdPhotoCompletion(page);await chooseReplacement(page,'red');await page.waitForFunction(()=>(window as any).phoneSave.photoNativeCommitted);
  await expect(page.getByRole('alert')).toContainText('REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN',{timeout:7000});await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  const committed=await row(page);
  await page.evaluate(async change=>{const h=(window as any).phoneSave;h.photoOldDb=h.db.localDatabase;h.restorePhotoCompletion();h.unmount();
    if(change==='account'){await h.db.deviceDatabase.authState.put({key:'device-auth',userId:72,role:'inspector',username:'other'});await h.db.activateUserWorkspace(72);await h.db.localDatabase.repairRecords.put({clientUuid:h.uuid,actorId:72,syncStatus:'Draft',remark:'Other workspace sentinel'});}
    h.releasePhotoCompletion();
  },change);
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect(await page.evaluate(()=>{const h=(window as any).phoneSave;return h.photoOldDb.repairRecords.get(h.uuid);})).toEqual(committed);
  if(change==='account')expect((await row(page)).remark).toBe('Other workspace sentinel');
  await expect(page.getByRole('status')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const target of ['authState','repairRecords']) test(`native queued ${target} transaction is aborted on deadline; later retry commits`,async({page})=>{
  await setup(page);
  // Mount reads must finish before deliberately locking their table.
  await expect(page.getByLabel('Repair Remark (Required)')).toBeVisible();
  await page.evaluate(target=>{
    const h=(window as any).phoneSave,db=target==='authState'?h.db.deviceDatabase:h.db.localDatabase;
    const blocker=db.backendDB().transaction([target],'readwrite');h.blocker=blocker;
    const spin=()=>{blocker.objectStore(target).get(target==='authState'?'device-auth':h.uuid).onsuccess=spin;};spin();
    const transact=db.transaction.bind(db);h.nativeAborted=false;h.nativeCompleted=false;
    db.transaction=(...args:any[])=>{const work=args.pop();return transact(...args,async(tx:any)=>{
      tx.idbtrans.addEventListener('abort',()=>{h.nativeAborted=true;});
      tx.idbtrans.addEventListener('complete',()=>{h.nativeCompleted=true;});
      return work(tx);
    });};h.restoreTransaction=()=>{db.transaction=transact;};
  },target);
  await page.getByLabel('Repair Remark (Required)').fill('Must never commit after timeout');
  await expect(page.getByRole('status')).toHaveText('Draft save failed; keep this form open and retry Save Draft.',{timeout:7000});
  await expect(page.getByRole('alert')).toContainText('REPAIR_LOCAL_STORAGE_TIMEOUT');
  await page.waitForFunction(()=>(window as any).phoneSave.nativeAborted);
  expect(await page.evaluate(()=>(window as any).phoneSave.nativeCompleted)).toBe(false);
  await page.evaluate(()=>{const h=(window as any).phoneSave;h.restoreTransaction();h.blocker.abort();});
  expect((await row(page)).remark).toBe('');
  await page.getByLabel('Repair Remark (Required)').fill('New text after native acquisition failure');
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');
  expect((await row(page)).remark).toBe('New text after native acquisition failure');
});

test('deadline rolls back an issued write, unblocks ordinary read and rejects late mutation after retry',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const h=(window as any).phoneSave;let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});h.releaseLate=release;
    h.rollback=h.repairStorageTransaction(h.db.localDatabase,'rw',[h.db.localDatabase.repairRecords],async()=>{
      const tx=h.Dexie.currentTransaction;tx.idbtrans.addEventListener('abort',()=>{h.rollbackAborted=true;});
      await h.db.localDatabase.repairRecords.update(h.uuid,{remark:'Uncommitted rollback sentinel'});h.writeIssued=true;
      // Hold the native transaction independently of Dexie.waitFor, so the late
      // callback really resumes even after abort stops Dexie's waiting queue.
      const spin=()=>{tx.idbtrans.objectStore('repairRecords').get(h.uuid).onsuccess=spin;};spin();
      await gate;
      try {await tx.table('repairRecords').update(h.uuid,{remark:'Forbidden late overwrite'});h.lateResult='committed';}
      catch(e:any){h.lateResult=e.name;throw e;}
    }).then(()=>{h.rollbackResult='success';},(e:any)=>{h.rollbackResult=e.message;});
  });
  await page.waitForFunction(()=>(window as any).phoneSave.writeIssued);
  // Begin an ordinary read while the transaction owns the lock; it must finish
  // after actual native abort, while the original callback is STILL held.
  await page.evaluate(()=>{const h=(window as any).phoneSave;h.read=h.db.localDatabase.repairRecords.get(h.uuid).then((r:any)=>{h.readRemark=r.remark;});});
  await page.waitForFunction(()=>(window as any).phoneSave.rollbackAborted,{},{timeout:7000});
  await page.evaluate(()=>(window as any).phoneSave.read);
  expect(await page.evaluate(()=>(window as any).phoneSave.readRemark)).toBe('');
  expect(await page.evaluate(()=>(window as any).phoneSave.rollbackResult)).toBe('REPAIR_LOCAL_STORAGE_TIMEOUT');
  await page.getByLabel('Repair Remark (Required)').fill('Successful newer commit');
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');
  await page.evaluate(()=>(window as any).phoneSave.releaseLate());
  await page.waitForFunction(()=>(window as any).phoneSave.lateResult);
  expect(await page.evaluate(()=>(window as any).phoneSave.lateResult)).not.toBe('committed');
  expect((await row(page)).remark).toBe('Successful newer commit');
});

test('transaction created after the deadline aborts before its callback can write',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const h=(window as any).phoneSave,db=h.db.localDatabase,transact=db.transaction.bind(db);
    let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});h.releaseCreation=release;h.delayedWork=0;
    db.transaction=(...args:any[])=>h.Dexie.Promise.resolve(gate).then(()=>{
      const work=args.pop();return transact(...args,async(tx:any)=>{
        tx.idbtrans.addEventListener('abort',()=>{h.delayedAborted=true;});return work(tx);
      });
    });
    h.delayed=h.repairStorageTransaction(db,'rw',[db.repairRecords],async()=>{h.delayedWork++;await db.repairRecords.update(h.uuid,{remark:'Late transaction sentinel'});})
      .catch((e:any)=>{h.delayedError=e.message;});
    db.transaction=transact;
  });
  await page.waitForFunction(()=>(window as any).phoneSave.delayedError,{},{timeout:7000});
  expect(await page.evaluate(()=>(window as any).phoneSave.delayedError)).toBe('REPAIR_LOCAL_STORAGE_TIMEOUT');
  await page.getByLabel('Repair Remark (Required)').fill('Newer write before delayed acquisition');
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');
  await page.evaluate(()=>{const h=(window as any).phoneSave;h.releaseCreation();});
  await page.waitForFunction(()=>(window as any).phoneSave.delayedAborted);
  expect(await page.evaluate(()=>(window as any).phoneSave.delayedWork)).toBe(0);
  expect((await row(page)).remark).toBe('Newer write before delayed acquisition');
});

test('Submit timeout releases controls, retains photo and visible work; retry freezes latest text before old gate releases',async({page})=>{
  await setup(page);
  await page.evaluate(async()=>{const h=(window as any).phoneSave,c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d')!.fillRect(0,0,64,48);const blob=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/jpeg'));await h.repo.captureRepairPhoto(h.uuid,blob,'camera');h.photoUuid=(await h.db.localDatabase.repairRecords.get(h.uuid)).photoUuid;});
  await expect(page.getByRole('button',{name:'Replace After Photo'})).toBeVisible();
  await holdAssertion(page);await burst(page);
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Draft save failed; keep this form open and retry Save Draft.',{timeout:7000});
  await expect(page.getByRole('button',{name:'Submit Locally',exact:true})).toBeEnabled();
  await expect(page.getByLabel('Repair Remark (Required)')).not.toHaveAttribute('readonly','');
  await expect(page.getByLabel('Repair Remark (Required)')).toHaveValue('CR09-HDR01-offline-cycle4');
  expect((await row(page)).syncStatus).toBe('Draft');
  expect(await page.evaluate(()=>(window as any).phoneSave.db.localDatabase.syncOutbox.count())).toBe(0);
  await page.getByLabel('Repair Remark (Required)').fill('Latest text for successful retry');
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Submitted on this device');
  const pending=await row(page);expect(pending.frozen.remark).toBe('Latest text for successful retry');
  expect(pending.photoUuid).toBe(await page.evaluate(()=>(window as any).phoneSave.photoUuid));
  await page.evaluate(()=>(window as any).phoneSave.release());
  expect(await row(page)).toEqual(pending);
});

test('native input burst and repeated Save keep only latest pending write behind a held assertion',async({page,context})=>{
  await setup(page);await context.setOffline(true);await holdAssertion(page);await burst(page);
  await page.getByRole('button',{name:'Save Draft',exact:true}).click({clickCount:3});
  await expect(page.getByRole('status')).toHaveText('Saving on this device…');
  // The real repository holds a write lock and spins while the cross-database assertion is delayed.
  const blocked=await page.evaluate(async()=>{const h=(window as any).phoneSave;return Promise.race([h.db.localDatabase.repairRecords.get(h.uuid).then(()=>false),new Promise(r=>setTimeout(()=>r(true),100))]);});
  expect(blocked).toBe(true);
  await page.evaluate(()=>(window as any).phoneSave.release());
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');
  expect((await row(page)).remark).toBe('CR09-HDR01-offline-cycle4');
  const proof=await page.evaluate(()=>{const h=(window as any).phoneSave;return {writes:h.writes,assertions:h.assertions,spins:h.spins,dirty:h.dirty};});
  console.log('PHONE-SAVE burst proof',JSON.stringify(proof));
  expect(proof.writes).toEqual(['C','CR09-HDR01-offline-cycle4']);
  expect(proof.dirty).toBe(false);expect(proof.spins).toBeGreaterThan(0);
});

test('camera write overlapping burst and immediate Submit freezes latest committed text and own Blob',async({page})=>{
  await setup(page);
  await page.evaluate(async()=>{const h=(window as any).phoneSave,c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d')!.fillRect(0,0,64,48);const blob=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/jpeg'));await h.repo.captureRepairPhoto(h.uuid,blob,'camera');});
  await expect(page.getByRole('button',{name:'Replace After Photo'})).toBeVisible();
  await holdAssertion(page);await burst(page);
  await page.evaluate(()=>{const h=(window as any).phoneSave;h.camera=h.db.localDatabase.repairRecords.get(h.uuid).then(async(r:any)=>{const a=await h.db.localDatabase.repairAttachments.get(r.photoUuid);await h.repo.captureRepairPhoto(h.uuid,a.blob,'camera');});});
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();
  await expect(page.getByRole('button',{name:'Saving…',exact:true})).toBeVisible();
  await expect(page.getByLabel('Repair Remark (Required)')).toHaveAttribute('readonly','');
  await page.evaluate(()=>(window as any).phoneSave.release());
  await expect(page.getByRole('status')).toContainText('Submitted on this device');
  const saved=await row(page);expect(saved.syncStatus).toBe('Pending');expect(saved.frozen.remark).toBe('CR09-HDR01-offline-cycle4');
  const proof=await page.evaluate(async()=>{const h=(window as any).phoneSave;await h.camera;const r=await h.db.localDatabase.repairRecords.get(h.uuid),a=await h.db.localDatabase.repairAttachments.get(r.photoUuid);return {photo:r.frozen.manifest[0].photoUuid,uuid:a.photoUuid,size:a.blob.size,ops:await h.db.localDatabase.syncOutbox.count(),writes:h.writes};});
  expect(proof.photo).toBe(proof.uuid);expect(proof.size).toBeGreaterThan(0);expect(proof.ops).toBe(2);expect(proof.writes).toHaveLength(2);
});

test('transaction abort retains visible latest text and committed photo; explicit retry saves before Submit',async({page})=>{
  await setup(page);
  await page.evaluate(async()=>{const h=(window as any).phoneSave,c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d')!.fillRect(0,0,64,48);const blob=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/jpeg'));await h.repo.captureRepairPhoto(h.uuid,blob,'camera');h.photo=(await h.db.localDatabase.repairRecords.get(h.uuid)).photoUuid;});
  await expect(page.getByRole('button',{name:'Replace After Photo'})).toBeVisible();
  await page.evaluate(()=>{const h=(window as any).phoneSave,table=h.db.localDatabase.repairRecords,update=table.update.bind(table);h.restore=()=>{table.update=update;};table.update=async(key:any,changes:any)=>{const result=await update(key,changes);if('remark' in changes)throw new Error('SAVE01_INJECTED_ABORT');return result;};});
  await page.getByLabel('Repair Remark (Required)').fill('Latest recoverable native text');
  await expect(page.getByRole('status')).toHaveText('Draft save failed; keep this form open and retry Save Draft.');
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('SAVE01_INJECTED_ABORT');
  await expect(page.getByRole('button',{name:'Submit Locally',exact:true})).toBeEnabled();
  const retained=await row(page);expect(retained.remark).toBe('');expect(retained.syncStatus).toBe('Draft');expect(retained.frozen).toBeUndefined();
  expect(await page.evaluate(()=>{const h=(window as any).phoneSave;return h.dirty;})).toBe(true);
  await expect(page.getByLabel('Repair Remark (Required)')).toHaveValue('Latest recoverable native text');
  await page.evaluate(()=>(window as any).phoneSave.restore());
  await page.getByRole('button',{name:'Save Draft',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved on this device.');
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();await expect(page.getByRole('status')).toContainText('Submitted on this device');
  const saved=await row(page);expect(saved.frozen.remark).toBe('Latest recoverable native text');expect(saved.photoUuid).toBe(retained.photoUuid);
});

test('switched account and unmounted editor reject old queued callbacks even with matching UUID',async({page})=>{
  const uuid=await setup(page);await holdAssertion(page);await burst(page);
  await page.evaluate(async()=>{const h=(window as any).phoneSave;h.oldDb=h.db.localDatabase;h.unmount();await h.db.deviceDatabase.authState.put({key:'device-auth',userId:72,role:'inspector',username:'other',cachedAt:'2026-10-14T00:00:00.000Z'});await h.db.activateUserWorkspace(72);await h.db.localDatabase.repairRecords.put({clientUuid:h.uuid,actorId:72,syncStatus:'Draft',remark:'Other account sentinel'});h.release();});
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect((await row(page)).remark).toBe('Other account sentinel');
  expect(await page.evaluate(uuid=>(window as any).phoneSave.oldDb.repairRecords.get(uuid).then((r:any)=>r.remark),uuid)).toBe('');
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(true);
});

test('queued editor save cannot retarget after a workspace switch',async({page})=>{
  await setup(page);
  await page.evaluate(async()=>{const h=(window as any).phoneSave;await h.db.deviceDatabase.authState.put({key:'device-auth',userId:72,role:'inspector',username:'other'});await h.db.activateUserWorkspace(72);await h.db.localDatabase.repairRecords.put({clientUuid:h.uuid,actorId:72,syncStatus:'Draft',remark:'Other account sentinel'});});
  await page.getByLabel('Repair Remark (Required)').fill('Old editor input');
  await expect(page.getByRole('alert')).toContainText('REPAIR_IDENTITY_CHANGED');
  expect((await row(page)).remark).toBe('Other account sentinel');
  await expect(page.getByLabel('Repair Remark (Required)')).toHaveValue('Old editor input');
});

test('same-actor auth token change during assertion still aborts rather than weakening identity checks',async({page})=>{
  await setup(page);await holdAssertion(page);await burst(page);
  await page.evaluate(async()=>{const h=(window as any).phoneSave;await h.db.deviceDatabase.authState.update('device-auth',{explicitLogout:true});h.release();});
  await expect(page.getByRole('alert')).toContainText('REPAIR_IDENTITY_CHANGED');
  expect((await row(page)).remark).toBe('');
  await expect(page.getByLabel('Repair Remark (Required)')).toHaveValue('CR09-HDR01-offline-cycle4');
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(true);
});

test('24 open subscribed pages share the workspace without amplifying this editor burst',async({page,context})=>{
  const uuid=await setup(page);
  const peers=[];
  try {
    for(let i=0;i<23;i++) {
      const peer=await context.newPage();peers.push(peer);
      await peer.goto('/tests/repair-phone-save.html');await peer.waitForFunction(()=>(window as any).phoneSaveReady);
      await peer.evaluate(async uuid=>{const h=(window as any).phoneSave;await h.db.activateUserWorkspace(71);h.mount(uuid);},uuid);
      await expect(peer.getByLabel('Repair Remark (Required)')).toBeVisible();
    }
    expect(context.pages()).toHaveLength(24);
    await context.setOffline(true);await holdAssertion(page);await burst(page);
    await page.getByRole('button',{name:'Save Draft',exact:true}).click();
    await page.evaluate(()=>(window as any).phoneSave.release());
    await expect(page.getByRole('status')).toHaveText('Saved on this device.');
    expect((await row(page)).remark).toBe('CR09-HDR01-offline-cycle4');
    expect(await page.evaluate(()=>(window as any).phoneSave.writes)).toEqual(['C','CR09-HDR01-offline-cycle4']);
    // Close the active editor after a confirmed commit; recover from the same shared IndexedDB.
    await page.close();
    const recovered=await peers[0].evaluate(uuid=>(window as any).phoneSave.db.localDatabase.repairRecords.get(uuid),uuid);
    expect(recovered.remark).toBe('CR09-HDR01-offline-cycle4');
  } finally { await Promise.all(peers.map(peer=>peer.close())); }
});

async function retainedPhoto(page: Page) {
  await page.evaluate(async()=>{const h=(window as any).phoneSave,c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d')!.fillRect(0,0,64,48);const b=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/jpeg'));await h.repo.captureRepairPhoto(h.uuid,b,'camera');});
  await expect(page.getByRole('button',{name:'Replace After Photo'})).toBeVisible();
}
async function holdStoredRead(page: Page, phase = 'bytes') {
  await page.evaluate(phase=>{
    const h=(window as any).phoneSave;let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});h.releaseVerification=release;
    const hashing=phase==='hash'||phase==='fingerprint';
    const original:any=phase==='bytes'?Blob.prototype.arrayBuffer:hashing?crypto.subtle.digest.bind(crypto.subtle):window.createImageBitmap;
    let first=true;
    const table=h.db.localDatabase.repairAttachments,get=table.get.bind(table);
    table.get=async(...args:any[])=>{const tx=h.Dexie.currentTransaction,r=await get(...args);if(tx?.storeNames.includes('repairWorkOrders'))h.verificationBlob=r.blob;return r;};
    const hold=async()=>{if(first){first=false;h.verificationHeld=true;await gate;h.verificationReleased=true;}};
    const read=Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer=async function(){if(this===h.verificationBlob && phase==='bytes')await hold();const bytes=await read.call(this);if(this===h.verificationBlob)h.verificationBytes=bytes;return bytes;};
    if(hashing)crypto.subtle.digest=async(...args:any[])=>{if(phase==='hash'?args[1]===h.verificationBytes:new TextDecoder().decode(args[1]).includes('"photoUuid"'))await hold();return original(...args);};
    if(phase==='decode')window.createImageBitmap=async(...args:any[])=>{const held=args[0]===h.verificationBlob;if(held)await hold();const bitmap=await original(...args);if(held){const close=bitmap.close.bind(bitmap);bitmap.close=()=>{h.lateBitmapClosed=true;close();};}return bitmap;};
    h.restoreVerification=()=>{table.get=get;Blob.prototype.arrayBuffer=read;if(hashing)crypto.subtle.digest=original;if(phase==='decode')window.createImageBitmap=original;};
  },phase);
}

test('P1 completion delivery after native commit settles honestly even when abort throws; retry and late callback stay isolated',async({page})=>{
  await setup(page);await expect(page.getByLabel('Repair Remark (Required)')).toBeVisible();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{
    const h=(window as any).phoneSave,db=h.db.localDatabase,original=db.transaction.bind(db);let first=true;
    db.transaction=(...args:any[])=>{const work=args.pop();return original(...args,async(tx:any)=>{
      if(first && tx.mode==='readwrite') {first=false;const native=tx.idbtrans,complete=native.oncomplete,abort=native.abort.bind(native);
        native.abort=()=>{try{return abort();}catch(e){h.finishedAbortThrew=true;throw e;}};
        native.oncomplete=(ev:any)=>{h.nativeCommitted=true;h.releaseCompletion=()=>complete.call(native,ev);};
      }return work(tx);
    });};h.restoreCompletion=()=>{db.transaction=original;};
  });
  await page.getByLabel('Repair Remark (Required)').fill('Committed before delayed delivery');
  await page.waitForFunction(()=>(window as any).phoneSave.nativeCommitted);
  expect((await row(page)).remark).toBe('Committed before delayed delivery');
  await expect(page.getByRole('alert')).toContainText('REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN',{timeout:7000});
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect(await page.evaluate(()=>(window as any).phoneSave.finishedAbortThrew)).toBe(true);
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(true);
  await expect(page.getByRole('status')).not.toHaveText('Saved on this device.');
  await expect(page.getByRole('alert')).toContainText('may already be saved');
  await page.evaluate(()=>(window as any).phoneSave.restoreCompletion());
  await page.getByLabel('Repair Remark (Required)').fill('Newer confirmed retry');
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');
  await page.evaluate(()=>(window as any).phoneSave.releaseCompletion());
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  expect((await row(page)).remark).toBe('Newer confirmed retry');
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(false);expect(errors).toEqual([]);
});

for(const phase of ['bytes','hash','decode','fingerprint']) test(`P1 held stored photo ${phase} verification releases Submit; late result cannot freeze over newer retry`,async({page,context})=>{
  await setup(page);await retainedPhoto(page);await page.getByLabel('Repair Remark (Required)').fill('Committed remark before verification');
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');
  await holdStoredRead(page,phase);await context.setOffline(true);
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();
  await page.waitForFunction(()=>(window as any).phoneSave.verificationHeld);
  await expect(page.getByRole('alert')).toContainText('REPAIR_PHOTO_VERIFICATION_TIMEOUT',{timeout:7000});
  await expect(page.getByRole('button',{name:'Submit Locally',exact:true})).toBeEnabled();
  await expect(page.getByLabel('Repair Remark (Required)')).not.toHaveAttribute('readonly','');
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  const draft=await row(page);expect(draft.syncStatus).toBe('Draft');expect(draft.frozen).toBeUndefined();
  expect(await page.evaluate(()=>(window as any).phoneSave.db.localDatabase.syncOutbox.count())).toBe(0);
  if(phase==='bytes')for(const viewport of [{width:360,height:800},{width:768,height:1024},{width:1280,height:800}]){
    await page.setViewportSize(viewport);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const name of ['Save Draft','Submit Locally']){const box=await page.getByRole('button',{name,exact:true}).boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);}
    await page.screenshot({path:`../../logs/cr09-phone-save03-retry-${viewport.width}.png`,fullPage:true});
  }
  await page.evaluate(()=>(window as any).phoneSave.restoreVerification());
  await page.getByLabel('Repair Remark (Required)').fill('Newer remark with retained photo');
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Submitted on this device');
  const pending=await row(page);expect(pending.frozen.remark).toBe('Newer remark with retained photo');expect(pending.photoUuid).toBe(draft.photoUuid);
  await page.evaluate(()=>(window as any).phoneSave.releaseVerification());
  await page.waitForFunction(()=>(window as any).phoneSave.verificationReleased);
  if(phase==='decode')await page.waitForFunction(()=>(window as any).phoneSave.lateBitmapClosed);
  expect(await row(page)).toEqual(pending);expect(await page.evaluate(()=>(window as any).phoneSave.db.localDatabase.syncOutbox.count())).toBe(2);
  expect(await page.evaluate(()=>(window as any).phoneSave.dirty)).toBe(false);
  await expect(page.getByRole('status')).toContainText('Submitted on this device');
});

for(const change of ['late-only','account','logout','username','role','pending-logout','unmount']) test(`P1 stored verification cannot continue after ${change}`,async({page})=>{
  await setup(page);await retainedPhoto(page);await page.getByLabel('Repair Remark (Required)').fill('Retained committed remark');
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');await holdStoredRead(page);
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();await page.waitForFunction(()=>(window as any).phoneSave.verificationHeld);
  if(change==='late-only')await expect(page.getByRole('alert')).toContainText('REPAIR_PHOTO_VERIFICATION_TIMEOUT',{timeout:7000});
  await page.evaluate(async change=>{const h=(window as any).phoneSave;h.oldVerificationDb=h.db.localDatabase;
    if(change==='unmount')h.unmount();
    if(change==='logout')await h.db.deviceDatabase.authState.update('device-auth',{explicitLogout:true});
    if(change==='username')await h.db.deviceDatabase.authState.update('device-auth',{username:'renamed-account'});
    if(change==='role')await h.db.deviceDatabase.authState.update('device-auth',{role:'admin'});
    if(change==='pending-logout')await h.db.deviceDatabase.authState.update('device-auth',{serverLogoutPending:true});
    if(change==='account'){await h.db.deviceDatabase.authState.put({key:'device-auth',userId:72,role:'inspector',username:'other'});await h.db.activateUserWorkspace(72);await h.db.localDatabase.repairRecords.put({clientUuid:h.uuid,actorId:72,syncStatus:'Draft',remark:'Other workspace sentinel'});}
    h.restoreVerification();h.releaseVerification();
  },change);
  await page.waitForFunction(()=>(window as any).phoneSave.verificationReleased);
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  if(['logout','username','role','pending-logout','account'].includes(change))await expect(page.getByRole('alert')).toContainText('REPAIR_IDENTITY_CHANGED');
  const retained=await page.evaluate(async()=>{const h=(window as any).phoneSave;return {r:await h.oldVerificationDb.repairRecords.get(h.uuid),ops:await h.oldVerificationDb.syncOutbox.count()};});
  expect(retained.r.syncStatus).toBe('Draft');expect(retained.r.frozen).toBeUndefined();expect(retained.r.remark).toBe('Retained committed remark');expect(retained.ops).toBe(0);
  if(change==='account')expect((await row(page)).remark).toBe('Other workspace sentinel');
  if(change!=='unmount'){await expect(page.getByRole('status')).not.toContainText('Submitted on this device');await expect(page.getByRole('button',{name:'Submit Locally',exact:true})).toBeEnabled();}
});

// I-71: another tab re-verifying the same session only rewrites the verification timestamps. That is not an identity
// change, so an in-flight local submit must continue and freeze (it used to abort with REPAIR_IDENTITY_CHANGED).
test('I-71: a timestamp-only re-verification by another tab does not abort the local submit',async({page})=>{
  await setup(page);await retainedPhoto(page);await page.getByLabel('Repair Remark (Required)').fill('Retained committed remark');
  await expect(page.getByRole('status')).toHaveText('Saved on this device.');await holdStoredRead(page);
  await page.getByRole('button',{name:'Submit Locally',exact:true}).click();await page.waitForFunction(()=>(window as any).phoneSave.verificationHeld);
  await page.evaluate(async()=>{const h=(window as any).phoneSave;h.oldVerificationDb=h.db.localDatabase;
    await h.db.deviceDatabase.authState.update('device-auth',{lastVerifiedAt:'2026-10-14T01:00:00.000Z',cachedAt:'2026-10-14T01:00:00.000Z'});
    h.restoreVerification();h.releaseVerification();});
  await page.waitForFunction(()=>(window as any).phoneSave.verificationReleased);
  await page.evaluate(()=>(window as any).phoneSave.waitForWorkspaceIdle());
  await expect(page.getByRole('status')).toContainText('Submitted on this device');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const done=await page.evaluate(async()=>{const h=(window as any).phoneSave;return {r:await h.oldVerificationDb.repairRecords.get(h.uuid),ops:await h.oldVerificationDb.syncOutbox.count()};});
  expect(done.r.syncStatus).toBe('Pending');expect(done.r.frozen).toBeDefined();expect(done.ops).toBe(2);
});

