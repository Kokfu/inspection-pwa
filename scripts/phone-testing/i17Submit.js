// I-17 retest: fills Smoke Ventilation (all Good) on the open job page, waits for the autosave to settle, then types in a field and taps
// Submit Inspection immediately (inside the autosave window). Reports whether the "changed elsewhere" race appears and the final status.
// Run while on the job page of a job whose Smoke Ventilation has not been started.
(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const setIn = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const lab = (el) => (el.labels && el.labels[0] && el.labels[0].innerText.trim()) || '';
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
  await w(3000); // let the autosave settle
  const el = () => document.querySelector('.autosave-status');
  const status = () => el() ? (el().innerText.trim() || '(empty)') : '(no status element)';
  const before = status();
  const loc = [...document.querySelectorAll('input:not([type=file])')].find((i) => lab(i) === 'Location');
  setIn(loc, 'Roof level 2'); // starts the debounce
  await w(250);
  const during = status();
  const trace = [during]; // status line sampled while Submit is tapped inside the autosave window
  [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Submit Inspection').click();
  for (let i = 0; i < 12; i += 1) { await w(100); const s = status(); if (trace[trace.length - 1] !== s) trace.push(s); }
  await w(3000);
  const t = document.body.innerText;
  return JSON.stringify({
    goods: n, statusBefore: before, statusTrace: trace,
    changedElsewhere: /changed elsewhere/i.test(t),
    errors: t.split('\n').filter((l) => /required|must|invalid|Cannot submit|Reload before/i.test(l)).slice(0, 4),
    final: (t.match(/(Submitted on this device|Waiting to Sync|Pending|Synced|Draft saved)[^\n]*/i) || [''])[0]
  });
})()
