// I-17 retest, part 1: opens Smoke Ventilation on the open job page, fills it completely (all Good), lets the autosave settle and focuses the
// Location field so the caller can type real keystrokes (adb) and then tap Submit inside the autosave window (see I-17 in the status file).
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
  await w(3500);
  const loc = [...document.querySelectorAll('input:not([type=file])')].find((i) => lab(i) === 'Location');
  loc.scrollIntoView({ block: 'center' });
  await w(500);
  const r = loc.getBoundingClientRect();
  return JSON.stringify({ goods: n, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), status: document.querySelector('.autosave-status')?.innerText.trim() || '(empty)' });
})()
