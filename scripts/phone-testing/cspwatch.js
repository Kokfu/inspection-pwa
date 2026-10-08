// usage: node cspwatch.js <seconds> <outfile>
// Attaches to the phone's localhost:8081 tab over CDP and records CSP violations
// (console "security" log entries + securitypolicyviolation events), console errors and
// uncaught exceptions for <seconds>. Reload/navigate freely while it runs: the hook is
// re-installed on every new document.
const fs = require('fs');
(async () => {
  const seconds = Number(process.argv[2] || 120);
  const out = process.argv[3] || 'cspwatch.log';
  const list = await (await fetch('http://127.0.0.1:9222/json')).json();
  const page = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:8081'));
  if (!page) { console.log('NO PAGE'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
  const log = (kind, text) => fs.appendFileSync(out, `${new Date().toISOString()} ${kind} ${text}\n`);
  fs.writeFileSync(out, '');
  send('Log.enable'); send('Runtime.enable'); send('Page.enable');
  const hook = `document.addEventListener('securitypolicyviolation', e => console.error('CSPV ' + JSON.stringify({d:e.violatedDirective,b:e.blockedURI,s:e.sourceFile,l:e.lineNumber,disp:e.disposition,sample:(e.sample||'').slice(0,80)})), true);`;
  send('Page.addScriptToEvaluateOnNewDocument', { source: hook });
  send('Runtime.evaluate', { expression: hook });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Log.entryAdded') { const e = d.params.entry; log(`log:${e.source}:${e.level}`, `${e.text} ${e.url || ''}`); }
    else if (d.method === 'Runtime.consoleAPICalled') { const t = d.params.type; if (t === 'error' || t === 'warning') log(`console:${t}`, d.params.args.map((a) => a.value ?? a.description).join(' ')); }
    else if (d.method === 'Runtime.exceptionThrown') log('exception', JSON.stringify(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')));
  };
  setTimeout(() => { log('done', 'watch ended'); process.exit(0); }, seconds * 1000);
})();
