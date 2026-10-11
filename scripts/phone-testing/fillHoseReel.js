(async () => {
  // Fills the open Hose Reel (V7) form: every result Good, measurements, Swing for every drum, a location for every blank drum.
  // Single quotes only (the CDP wrapper loses double quotes). Scripted changes are NOT autosaved: finish with a real tap on Submit.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setValue = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let good = 0;
  for (const group of document.querySelectorAll('[role=group]')) {
    if (!/ result$/.test(group.getAttribute('aria-label') || '')) continue;
    const button = [...group.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith('Good') && !/Not Good/.test(b.textContent));
    if (button) { button.click(); good += 1; }
  }
  await sleep(300);
  const numbers = [...document.querySelectorAll('input')].filter((i) => (i.type === 'number' || i.inputMode === 'decimal') && !i.closest('#hose-reel-drum-count'));
  const values = ['10', '20', '5'];
  numbers.slice(0, 3).forEach((input, index) => setValue(input, values[index]));
  await sleep(300);
  let drums = 0;
  for (const card of document.querySelectorAll('#hose-reel-locations .hose-row-card')) {
    const swing = [...card.querySelectorAll('input[type=radio]')].find((r) => r.value === 'swing');
    if (swing && !swing.checked) swing.click();
    const location = [...card.querySelectorAll('input')].find((i) => i.type !== 'radio' && i.type !== 'file' && i.closest('label')?.textContent.trim().startsWith('Location'));
    if (location && !location.value) setValue(location, 'Boiler room ' + (drums + 1));
    drums += 1;
  }
  await sleep(500);
  return 'good=' + good + ' numbers=' + numbers.length + ' drums=' + drums;
})()
