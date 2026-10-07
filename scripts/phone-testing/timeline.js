(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0) + 'ms';
  const log = [];
  const of = window.fetch;
  window.fetch = function (u, o) {
    const url = (typeof u === 'string' ? u : u.url).replace(/\?.*/, '?…').slice(0, 55);
    const s = performance.now();
    log.push(at() + ' >> ' + (o && o.method || 'GET') + ' ' + url);
    return of.apply(this, arguments).then(
      (r) => { log.push(at() + ' << ' + url + ' ' + r.status + ' (' + Math.round(performance.now() - s) + 'ms)'); return r; },
      (e) => { log.push(at() + ' << ' + url + ' FAIL ' + e.name + ' (' + Math.round(performance.now() - s) + 'ms)'); throw e; });
  };
  const state = () => {
    const t = document.body.innerText;
    const hdr = (t.match(/\n(Online|Offline|Reconnecting|Server unavailable)\n/) || [])[1];
    const body = /inspection unavailable/.test(t) ? 'UNAVAILABLE' : /Opening [A-Za-z\/ ]+ inspection/.test(t) ? 'OPENING' : /Verifying server session/.test(t) ? 'VERIFYING' : [...document.querySelectorAll('input:not([type=file])')].some((x) => x.value) ? 'FORM' : 'BLANK';
    return hdr + '/' + body;
  };
  let last = '';
  const obs = new MutationObserver(() => { const s = state(); if (s !== last) { log.push(at() + ' STATE ' + s); last = s; } });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true });
  location.hash = '#/jobs'; await w(1500);
  log.push('--- tap job');
  [...document.querySelectorAll('button')].find((b) => /SV-20261007-62/.test(b.innerText)).click(); await w(2200);
  log.push('--- tap Continue inspection @' + at());
  const tap = performance.now();
  [...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Smoke Ventilation System') && /Continue/i.test(b.innerText)).click();
  for (let i = 0; i < 24; i++) { await w(500); if (state().endsWith('/FORM')) { await w(1500); break; } }
  obs.disconnect(); window.fetch = of;
  return 'tap->form ' + Math.round(performance.now() - tap) + 'ms\n' + log.join('\n');
})()
