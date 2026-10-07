(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('inspection-pwa:user:436'); r.onsuccess = () => res(r.result); });
  const get = (s) => new Promise((r) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => r(q.result); });
  const at = await get('inspectionAttachments');
  const mi = await get('masterSystemInspections');
  const fi = await get('masterSystemFormInstances');
  db.close();
  const parents = new Map([...mi, ...fi].map((x) => [x.clientUuid, x.syncStatus]));
  const rows = at.map((a) => ({ status: a.syncStatus, parent: parents.get(a.inspectionClientUuid) || 'none', bytes: a.blob ? a.blob.size : 0 }));
  const by = {};
  rows.forEach((r) => { const k = r.status + ' / parent ' + r.parent; by[k] = (by[k] || { n: 0, bytes: 0 }); by[k].n++; by[k].bytes += r.bytes; });
  return JSON.stringify(by, null, 1);
})()
