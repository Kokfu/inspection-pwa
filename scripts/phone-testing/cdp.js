// usage: node cdp.js "<js expression>"  (runs in the first http://localhost:8081 page)
(async () => {
  const list = await (await fetch('http://127.0.0.1:9222/json')).json();
  const page = process.env.CDP_PAGE
    ? list.find((t) => t.id === process.env.CDP_PAGE)
    : list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:8081'));
  if (!page) { console.log('NO PAGE', list.map((t) => t.url)); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id === 1) {
      const r = d.result;
      console.log(r.exceptionDetails ? 'EXC ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails) : typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value));
      process.exit(0);
    }
  };
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: process.argv[2].startsWith('@') ? require('fs').readFileSync(process.argv[2].slice(1), 'utf8') : process.argv[2], awaitPromise: true, returnByValue: true, userGesture: true } }));
})();
