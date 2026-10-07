(async()=>{
const db=await new Promise((res)=>{const r=indexedDB.open('inspection-pwa:user:436');r.onsuccess=()=>res(r.result)});
const get=s=>new Promise(r=>{const q=db.transaction(s).objectStore(s).getAll();q.onsuccess=()=>r(q.result)});
const mi=await get('masterSystemInspections');const at=await get('inspectionAttachments');const ob=await get('syncOutbox');
const rec=mi.find(x=>x.jobId.startsWith('9224')&&x.systemKey==='fire_intercom');
const atts=at.filter(a=>a.inspectionClientUuid===rec.clientUuid).sort((a,b)=>a.fieldPath.localeCompare(b.fieldPath));
const [a1,a2]=atts;
const parent=ob.find(o=>o.entityType==='masterSystemInspection'&&o.entityId===rec.clientUuid);
const before=JSON.stringify(parent.payload.evidenceManifest.map(m=>m.photoUuid.slice(0,6)+':'+m.sourceSha256.slice(0,8)));
parent.payload.evidenceManifest=parent.payload.evidenceManifest.map(m=>m.photoUuid===a2.photoUuid?{...m,sourceSha256:a1.sha256}:m);
const patched={...a2,blob:a1.blob,sha256:a1.sha256,sizeBytes:a1.sizeBytes,width:a1.width,height:a1.height};
await new Promise((res,rej)=>{const tx=db.transaction(['inspectionAttachments','syncOutbox'],'readwrite');tx.objectStore('inspectionAttachments').put(patched);tx.objectStore('syncOutbox').put(parent);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
db.close();
return 'atts='+atts.length+' manifest before='+before+' after sha both='+a1.sha256.slice(0,8)+' | row1='+a1.photoUuid.slice(0,6)+' row2='+a2.photoUuid.slice(0,6);
})()
