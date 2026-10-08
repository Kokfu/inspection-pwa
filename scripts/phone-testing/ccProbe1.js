// I-21 spot-check, step 1: on a job (window.__job) open the system whose card starts with window.__sys, add a row if the form has one, mark the
// first result Poor / Not Good, fill the remark and attach a generated JPEG, wait for the autosave. Leaves the form open; call ccProbe2.js next.
(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const setIn = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const btn = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.innerText.trim()));
  location.hash = '#/job/' + window.__job; await w(2200);
  const open = btn(new RegExp('^' + window.__sys));
  if (!open) return 'no card ' + window.__sys;
  open.click(); await w(3000);
  if (window.__loc) { const l = btn(new RegExp('^' + window.__loc)); if (l) { l.click(); await w(3000); } }
  const add = btn(/^Add (primary )?row$/i); if (add) { add.click(); await w(800); }
  const bad = [...document.querySelectorAll('button')].find((b) => /^(Poor|Not Good)$/.test(b.innerText.trim()));
  const sel = !bad && [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => /^(Poor|Not Good)$/.test(o.text.trim())));
  if (sel) { const o = [...sel.options].find((x) => /^(Poor|Not Good)$/.test(x.text.trim())); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, o.value); sel.dispatchEvent(new Event('change', { bubbles: true })); await w(1000); }
  if (!bad && !sel) return 'no Poor/Not Good button; buttons=' + [...new Set([...document.querySelectorAll('main button')].map((b) => b.innerText.trim()))].slice(0, 25).join('|');
  if (bad) { bad.click(); await w(1000); }
  const ta = [...document.querySelectorAll('textarea')].filter((t) => !t.value);
  if (ta[0]) setIn(ta[0], 'Probe finding'); await w(400);
  const fi = document.querySelector('input[type=file]');
  if (!fi) return 'no file input after Poor; buttons=' + [...new Set([...document.querySelectorAll('main button')].map((b) => b.innerText.trim()))].slice(0, 25).join('|');
  const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
  g.fillStyle = 'hsl(' + Math.floor(Math.random() * 360) + ',60%,50%)'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText(window.__sys + ' ' + Date.now(), 20, 240);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'probe.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
  fi.files = dt.files; fi.dispatchEvent(new Event('change', { bubbles: true }));
  await w(4000);
  const msg = document.body.innerText.split('\n').filter((l) => /photo (saved|attached)|already attached|Photo attached/i.test(l)).slice(-1)[0] || '(no photo message)';
  await w(2500); // autosave
  return JSON.stringify({ hash: location.hash, msg, autosave: document.querySelector('.autosave-status')?.innerText.trim() || '(none)' });
})()
