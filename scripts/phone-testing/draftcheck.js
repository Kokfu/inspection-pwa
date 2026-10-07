(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const tech = [...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Technician'));
  if (tech) { tech.click(); await w(2500); }
  const db = await new Promise((res) => { const r = indexedDB.open('inspection-pwa:user:436'); r.onsuccess = () => res(r.result); });
  const get = (s) => new Promise((r) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => r(q.result); });
  const mi = await get('masterSystemInspections');
  const at = await get('inspectionAttachments');
  db.close();
  const d = mi.find((x) => x.syncStatus === 'Draft' && x.systemKey === 'fire_intercom');
  location.hash = '#/fire-intercom-form/' + d.clientUuid;
  await w(3000);
  const vals = [...document.querySelectorAll('input:not([type=file]),textarea')]
    .map((e) => ((e.labels && e.labels[0] && e.labels[0].innerText.trim()) || e.tagName) + '=' + JSON.stringify(e.value))
    .filter((x) => !x.endsWith('=""'));
  const photoLines = document.body.innerText.split('\n').filter((l) => /photo attached|Draft/i.test(l)).slice(0, 4);
  const att = at.filter((a) => a.inspectionClientUuid === d.clientUuid).map((a) => a.syncStatus + ':' + a.blob.size);
  return JSON.stringify({ vals, photoLines, att });
})()
