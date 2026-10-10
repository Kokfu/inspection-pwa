(async () => {
  // Fills the open Fire Rated Roller Shutter form: every result Good, date, inspector. Single quotes only (Invoke-Cdp loses double quotes).
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setValue = (input, value) => {
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const expand = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Expand all zones' && !b.disabled);
  if (expand) { expand.click(); await sleep(400); }
  const label = (text) => [...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(text));
  const date = label('Date Tested')?.querySelector('input');
  if (date) setValue(date, '2026-10-10');
  const by = label('Inspected By')?.querySelector('input');
  if (by) setValue(by, 'Inspector A');
  await sleep(200);
  let clicked = 0;
  for (const group of document.querySelectorAll('[role=group]')) {
    const name = group.getAttribute('aria-label') || '';
    if (!/(Auto Alarm Mode|Manual Mode) result/.test(name)) continue;
    const good = [...group.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Good');
    if (good) { good.click(); clicked += 1; }
  }
  await sleep(500);
  return 'clicked ' + clicked + ' result groups; rows=' + document.querySelectorAll('.hose-row-card').length;
})()
