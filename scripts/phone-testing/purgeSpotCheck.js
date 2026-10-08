// Removes the local debris left by ccProbe1/ccProbe2 (records marked Failed by the probe: lastError starts with "spot-check", plus their photos and
// open outbox items). Pass window.__dry = true to only list. Technician-demo's per-user IndexedDB (inspection-pwa:user:436).
(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('inspection-pwa:user:436'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = (s) => new Promise((r) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => r(q.result); });
  const found = [];
  for (const store of ['masterSystemInspections', 'masterSystemFormInstances']) {
    for (const rec of await all(store)) if (rec.syncStatus === 'Failed' && String(rec.lastError || '').startsWith('spot-check')) found.push({ store, rec });
  }
  const photos = await all('inspectionAttachments');
  const outbox = await all('syncOutbox');
  const ids = new Set(found.map((f) => f.rec.clientUuid));
  const mine = photos.filter((p) => ids.has(p.inspectionClientUuid));
  const ob = outbox.filter((o) => ids.has(o.entityId));
  const summary = { records: found.map((f) => f.store.slice(-9) + ':' + f.rec.systemKey + ':' + f.rec.clientUuid.slice(0, 8)), photos: mine.length, outbox: ob.length };
  if (window.__dry) { db.close(); return JSON.stringify({ dry: true, ...summary }); }
  await new Promise((res, rej) => {
    const tx = db.transaction(['masterSystemInspections', 'masterSystemFormInstances', 'inspectionAttachments', 'syncOutbox'], 'readwrite');
    for (const f of found) tx.objectStore(f.store).delete(f.rec.clientUuid);
    for (const p of mine) tx.objectStore('inspectionAttachments').delete(p.photoUuid);
    for (const o of ob) tx.objectStore('syncOutbox').delete(o.operationId);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
  return JSON.stringify({ purged: true, ...summary });
})()
