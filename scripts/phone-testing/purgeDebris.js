// I-12 demo-data purge (LOCAL phone IndexedDB only; the server rows are not touched).
// Removes exactly the two stuck demo Fire Intercom records (SV-20261007-50 and SV-20261007-59),
// their photos, and their sync-queue items, in ONE transaction. Run from the PC with:
//   . .\scripts\phone-testing\phone-env.ps1; Invoke-Cdp "@C:\PWA_OfflineRecordWebApp\scripts\phone-testing\purgeDebris.js"
// It prints what it deleted. Set DRY = true to only list.
(async () => {
  const DRY = false;
  const P = ['0605ac07-8689-4c00-96d3-2dd24ae18b37', '84515083-237b-4846-91d4-f3ade6432639'];
  const db = await new Promise((r) => { const q = indexedDB.open('inspection-pwa:user:436'); q.onsuccess = () => r(q.result); });
  const all = (tx, s) => new Promise((r) => { const q = tx.objectStore(s).getAll(); q.onsuccess = () => r(q.result); });
  const tx = db.transaction(['masterSystemInspections', 'inspectionAttachments', 'syncOutbox'], 'readwrite');
  const records = (await all(tx, 'masterSystemInspections')).filter((x) => P.includes(x.clientUuid));
  const photos = (await all(tx, 'inspectionAttachments')).filter((a) => P.includes(a.inspectionClientUuid));
  const ids = new Set([...P, ...photos.map((a) => a.photoUuid)]);
  const outbox = (await all(tx, 'syncOutbox')).filter((o) => ids.has(o.entityId));
  const summary = { dry: DRY, records: records.map((r) => r.clientUuid.slice(0, 8) + ' ' + r.syncStatus), photos: photos.length, outbox: outbox.length };
  if (DRY || records.length !== 2) { tx.abort(); db.close(); return JSON.stringify({ ...summary, note: DRY ? 'dry run' : 'expected exactly 2 records; nothing deleted' }); }
  for (const p of P) tx.objectStore('masterSystemInspections').delete(p);
  for (const a of photos) tx.objectStore('inspectionAttachments').delete(a.photoUuid);
  for (const o of outbox) tx.objectStore('syncOutbox').delete(o.operationId);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  return JSON.stringify({ ...summary, deleted: true });
})()
