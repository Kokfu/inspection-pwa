// I-21 spot-check, step 2 (after ccProbe1.js). TEST-DATA SHORTCUT: marks the newest Draft record of the job as Failed in IndexedDB (as if the
// server had rejected it), then uses the real UI: reopen the system, tap "Start corrected copy", confirm, and report what the copy looks like.
(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.innerText.trim()));
  location.hash = '#/job/' + window.__job; await w(2500); // leaving the form flushes the autosave
  const db = await new Promise((res, rej) => { const r = indexedDB.open('inspection-pwa:user:436'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = (s) => new Promise((r) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => r(q.result); });
  const store = window.__store || 'masterSystemInspections'; // FM200 / CO2 / Wet Chemical use 'masterSystemFormInstances'
  const records = (await all(store)).filter((x) => x.jobId === window.__job);
  const draft = records.filter((x) => (x.syncStatus === 'Draft' || x.syncStatus === 'Failed') && (!window.__key || x.systemKey === window.__key)).sort((a, b) => (b.localCreatedAt || '').localeCompare(a.localCreatedAt || ''))[0];
  if (!draft) { db.close(); return 'no Draft record for the job; have ' + JSON.stringify(records.map((x) => x.systemKey + ':' + x.syncStatus)); }
  const photosBefore = (await all('inspectionAttachments')).filter((a) => a.inspectionClientUuid === draft.clientUuid);
  await new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(draft.syncStatus === 'Failed' ? draft : { ...draft, syncStatus: 'Failed', lastError: 'spot-check: marked Failed locally' }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  const open = btn(new RegExp('^' + window.__sys)); if (!open) return 'no card after patch';
  open.click(); await w(3500);
  if (window.__loc) { const l = btn(new RegExp('^' + window.__loc)); if (l) { l.click(); await w(3500); } }
  const hasButton = !!btn(/^Start corrected copy$/);
  const editFailed = !!btn(/^Edit Failed Inspection$/);
  window.confirm = () => true;
  if (hasButton) { btn(/^Start corrected copy$/).click(); await w(4000); }
  const db2 = await new Promise((res) => { const r = indexedDB.open('inspection-pwa:user:436'); r.onsuccess = () => res(r.result); });
  const get2 = (s) => new Promise((r) => { const q = db2.transaction(s).objectStore(s).getAll(); q.onsuccess = () => r(q.result); });
  const after = (await get2(store)).filter((x) => x.jobId === window.__job && x.systemKey === draft.systemKey);
  const copy = after.find((x) => x.clientUuid !== draft.clientUuid && x.syncStatus === 'Draft');
  const photosCopy = copy ? (await get2('inspectionAttachments')).filter((a) => a.inspectionClientUuid === copy.clientUuid) : [];
  const drafts = await get2('drafts');
  const archive = drafts.filter((d) => String(d.id || d.key || JSON.stringify(d)).includes('superseded:' + draft.clientUuid));
  const out = {
    sys: draft.systemKey, old: draft.clientUuid.slice(0, 8), hasButton, editFailed,
    hash: location.hash, copy: copy ? copy.clientUuid.slice(0, 8) : null,
    oldPhotos: photosBefore.map((p) => p.syncStatus), copyPhotos: photosCopy.map((p) => p.syncStatus),
    photoUuidsReKeyed: photosCopy.length > 0 && photosCopy.every((p) => !photosBefore.some((o) => o.photoUuid === p.photoUuid)),
    copyHasBytes: photosCopy.every((p) => p.blob && p.blob.size > 0),
    archived: archive.length, copyFormOpen: /Start corrected copy/.test(document.body.innerText) === false && location.hash.includes(copy ? copy.clientUuid : 'x'),
    statuses: after.map((x) => x.clientUuid.slice(0, 8) + ':' + x.syncStatus)
  };
  db2.close();
  return JSON.stringify(out);
})()
