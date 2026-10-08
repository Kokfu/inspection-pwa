// Creates a visit for the 28/9 customer with every enabled system; returns the job id.
(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  location.hash = '#/new-service-visit'; await w(1500);
  const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const cs = document.querySelectorAll('select')[0];
  set(cs, [...cs.options].find((o) => o.text.includes('28/9/2026')).value); await w(1500);
  const ss = document.querySelectorAll('select')[1];
  set(ss, ss.options[1].value); await w(1500);
  for (const c of [...document.querySelectorAll('input[type=checkbox]')]) {
    const t = c.labels[0].innerText;
    const want = true;
    if (c.checked !== want) { c.click(); await w(250); }
  }
  await w(500);
  [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Create Service Visit').click(); await w(4500);
  return location.hash.replace('#/job/', '') + ' ' + (document.body.innerText.match(/SV-\d+-\d+/) || [''])[0];
})()
