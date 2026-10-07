// Fire Intercom: N rows, each Not Good with a remark and a photo. PHOTOS is an array of base64 JPEGs (one per row).
// TAMPER_ROW2_WITH_ROW1 = true rewrites row 2's stored attachment to row 1's bytes+sha (simulating a tampered client).
(async () => {
  const PHOTOS = __PHOTOS__;
  const TAMPER = __TAMPER__;
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const setIn = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const lab = (el) => (el.labels && el.labels[0] && el.labels[0].innerText.trim()) || '';
  location.hash = '#/job/' + window.__job; await w(1800);
  const open = [...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Fire Intercom System') && /Continue|Start|inspection/i.test(b.innerText));
  open.click(); await w(2500);
  for (let i = 0; i < PHOTOS.length; i++) { [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Add Row').click(); await w(600); }
  [...document.querySelectorAll('input:not([type=file])')].filter((i) => lab(i) === 'Station').forEach((s, i) => setIn(s, 'Evid-' + (i + 1))); await w(400);
  [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Not Good').forEach((b) => b.click()); await w(900);
  [...document.querySelectorAll('textarea')].filter((t) => /Condition Remark/.test(lab(t))).forEach((t, i) => setIn(t, 'Finding ' + (i + 1))); await w(500);
  const files = [...document.querySelectorAll('input[type=file]')];
  const msgs = [];
  for (let i = 0; i < PHOTOS.length; i++) {
    const bin = atob(PHOTOS[i]); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    const f = new File([u], 'IMG_' + i + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
    const dt = new DataTransfer(); dt.items.add(f); files[i].files = dt.files; files[i].dispatchEvent(new Event('change', { bubbles: true })); await w(3500);
    msgs.push(document.body.innerText.split('\n').filter((l) => /photo saved|already attached|Photo attached/i.test(l)).slice(-1)[0] || '');
  }
  if (TAMPER) {
    const db = await new Promise((res) => { const r = indexedDB.open('inspection-pwa:user:436'); r.onsuccess = () => res(r.result); });
    const all = await new Promise((r) => { const q = db.transaction('inspectionAttachments').objectStore('inspectionAttachments').getAll(); q.onsuccess = () => r(q.result); });
    const mine = all.filter((a) => a.systemKey === 'fire_intercom' && a.syncStatus === 'Draft').sort((a, b) => a.localCreatedAt.localeCompare(b.localCreatedAt)).slice(-2);
    const [a1, a2] = mine;
    const patched = { ...a2, blob: a1.blob, sha256: a1.sha256, sizeBytes: a1.sizeBytes, width: a1.width, height: a1.height };
    await new Promise((res, rej) => { const tx = db.transaction('inspectionAttachments', 'readwrite'); tx.objectStore('inspectionAttachments').put(patched); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
    msgs.push('TAMPERED row2 -> row1 bytes sha=' + a1.sha256.slice(0, 8));
  }
  [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Submit Inspection').click(); await w(3500);
  const t = document.body.innerText;
  return msgs.join(' | ') + ' || errs: ' + t.split('\n').filter((l) => /required|must|invalid|Cannot submit|already/i.test(l)).slice(0, 4).join(' // ') + ' || ' + (t.match(/(Submitted on this device|Waiting to Sync)[^\n]*/) || [''])[0];
})()
