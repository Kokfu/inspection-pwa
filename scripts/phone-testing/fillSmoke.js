// Fills Smoke Ventilation with all-Good results and submits. Run while on the job page (#/job/<id>) or pass window.__job.
(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const setIn = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const lab = (el) => (el.labels && el.labels[0] && el.labels[0].innerText.trim()) || '';
  if (window.__job) { location.hash = '#/job/' + window.__job; await w(1800); }
  const open = [...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Smoke Ventilation System') && /Continue|Start|inspection/i.test(b.innerText));
  if (open) { open.click(); await w(2500); }
  [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Add Row').click(); await w(800);
  const ins = [...document.querySelectorAll('input:not([type=file])')];
  setIn(ins.find((i) => /Control Panel/.test(lab(i))), 'CP-' + Math.floor(Math.random() * 90 + 10));
  setIn(ins.find((i) => lab(i) === 'Location'), 'Roof');
  setIn(ins.find((i) => /Date Tested/.test(lab(i))), '2026-10-07');
  setIn(ins.find((i) => lab(i) === 'No.'), 'F1'); await w(500);
  const goods = () => [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Good');
  let n = 0; while (goods().length && n < 30) { goods()[0].click(); n++; await w(200); }
  [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Submit Inspection').click(); await w(3000);
  const t = document.body.innerText;
  return 'goods=' + n + ' errs=' + t.split('\n').filter((l) => /required|must|invalid|Cannot submit/i.test(l)).slice(0, 4).join(' // ') + ' status=' + (t.match(/(Submitted on this device|Waiting to Sync|Synced|Accepted)[^\n]*/) || [''])[0];
})()

