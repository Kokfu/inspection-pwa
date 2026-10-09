// Non-destructive access assessment. No credentials, valid sessions, or business payloads.
// Requires apps/api/node_modules. The target hostname is never written into evidence.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('../../apps/api/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const uuid = '00000000-0000-4000-8000-000000000000';
const routes = [];
for (const file of fs.readdirSync(path.join(root, 'apps/api/src/routes')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, 'apps/api/src/routes', file), 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text.toUpperCase();
      const owner = node.expression.expression.getText(source);
      const first = node.arguments[0];
      if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(method) && /router$/i.test(owner) && first && ts.isStringLiteral(first) && first.text.startsWith('/')) {
        const guard = node.arguments[1]?.getText(source) ?? '';
        const publicRoute = (method === 'POST' && first.text === '/auth/login') || (method === 'GET' && first.text === '/health');
        routes.push({ method, pattern: first.text, source: `apps/api/src/routes/${file}`, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          guarded: /^(requireRole\(|requireManagerRole\(|requireAuthenticated$|authRequired$|admin$|requireManager$)/.test(guard), publicRoute });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const evidence = { assessedAt: new Date().toISOString(), routes, live: [] };
const gaps = routes.filter(r => !r.publicRoute && !r.guarded);
console.log(`Static route inventory: ${routes.length}; missing recognized first authentication guard: ${gaps.length}`);
if (gaps.length) console.log(JSON.stringify(gaps));
if (!args.includes('--url')) {
  console.log('Static inspection only; live checks not run.');
  process.exitCode = gaps.length ? 1 : 0;
} else {
  const base = new URL(option('--url'));
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Supply a credential-free HTTPS origin');
  function request(label, pathname, { method = 'GET', headers = [], body, protocol = 'https:' } = {}) {
    const url = new URL(pathname, base); url.protocol = protocol;
    const command = ['--max-time', '12', '--silent', '--show-error', '--include', '--request', method, '--header', 'Accept: application/json', '--header', 'Accept-Encoding: identity'];
    for (const h of headers) command.push('--header', h);
    if (body !== undefined) command.push('--header', 'Content-Type: application/json', '--data-binary', body);
    command.push(url.href);
    const start = Date.now();
    try {
      const raw = execFileSync('curl.exe', command, { encoding: 'utf8', maxBuffer: 6 * 1024 * 1024, windowsHide: true });
      const split = raw.search(/\r?\n\r?\n/);
      const head = raw.slice(0, split);
      const content = raw.slice(split).trim();
      const status = Number(/^HTTP\/\S+ (\d+)/.exec(head)?.[1]);
      const responseHeaders = Object.fromEntries(head.split(/\r?\n/).slice(1).map(h => { const colon = h.indexOf(':'); return [h.slice(0, colon).toLowerCase(), h.slice(colon + 1).trim()]; }));
      let parsed; try { parsed = JSON.parse(content); } catch { /* shell, image, redirect */ }
      const row = { label, method, path: pathname, status, contentType: responseHeaders['content-type'], bytes: Buffer.byteLength(content), elapsedMs: Date.now() - start,
        errorCode: typeof parsed?.error === 'string' ? parsed.error : undefined,
        responseKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [],
        headers: Object.fromEntries(Object.entries(responseHeaders).filter(([k]) => /^(cache-control|cf-cache-status|content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|access-control-allow-origin|access-control-allow-credentials|server|retry-after)$/.test(k))),
        setsCookie: 'set-cookie' in responseHeaders,
        redirectToHttps: /^https:\/\//.test(responseHeaders.location ?? ''), isAppShell: /<html|<!doctype html/i.test(content) };
      evidence.live.push(row);
      return { row, content };
    } catch { const row = { label, method, path: pathname, networkError: true }; evidence.live.push(row); return { row, content: '' }; }
  }
  const delay = () => new Promise(resolve => setTimeout(resolve, 200));
  (async () => {
    const shell = request('public shell', '/');
    request('HTTP transport', '/', { protocol: 'http:' });
    request('HTTP login transport', '/api/auth/login', { protocol: 'http:', method: 'POST', body: '{}' });
    request('minimal health', '/api/health');
    const protectedReads = routes.filter(r => !r.publicRoute && r.method === 'GET');
    for (const [index, route] of protectedReads.entries()) {
      await delay();
      const concrete = route.pattern.replace(/:([A-Za-z]+)/g, (_, key) => key === 'systemKey' ? 'fire_alarm_detector' : /staffId|technicianId/i.test(key) ? '999999999' : uuid);
      request('protected read', `/api${concrete}`);
      if ((index + 1) % 20 === 0) console.log(`Live protected reads: ${index + 1}/${protectedReads.length}`);
    }
    const writes = [['POST', '/api/sync'], ['POST', '/api/auth/logout'], ['POST', '/api/v7-evidence/stage'], ['POST', '/api/v6-evidence/stage'], ['POST', '/api/inspection-attachments'], ['POST', '/api/manager/technicians'], ['PUT', `/api/manager/customers/${uuid}/contact-details`], ['POST', `/api/manager/technicians/999999999/password`]];
    for (const [method, pathname] of writes) { await delay(); request('empty unauthenticated write', pathname, { method, body: '{}' }); }
    for (const [label, headers] of [
      ['forged session', ['Cookie: inspection_session=invalid-audit-token']],
      ['forged identity headers', ['X-User-Id: 1', 'X-User-Role: admin', 'X-Forwarded-User: admin', 'Authorization: Bearer invalid-audit-token']],
      ['cross-origin read', ['Origin: https://example.invalid']],
      ['malformed cookie', ['Cookie: inspection_session=%ZZ']]
    ]) { await delay(); request(label, '/api/manager/customers', { headers }); }
    request('CORS preflight', '/api/manager/customers', { method: 'OPTIONS', headers: ['Origin: https://example.invalid', 'Access-Control-Request-Method: GET'] });
    for (const body of ['{}', 'null', JSON.stringify({ username: `audit-nonexistent-${Date.now()}`, password: 'invalid-audit-password' }), JSON.stringify({ username: "' OR '1'='1", password: 'invalid-audit-password' })]) {
      await delay(); request('invalid login', '/api/auth/login', { method: 'POST', body });
    }
    for (const pathname of ['/.env', '/.git/config', '/docker-compose.yml', '/uploads/', '/api/uploads/', '/api/not-a-real-route', '/sw.js']) { await delay(); request('public exposure', pathname); }
    const asset = /(?:src|href)="(\/assets\/[^" ]+\.js)"/.exec(shell.content)?.[1];
    if (asset) {
      request('public build JS', asset);
      request('JS source map', `${asset}.map`);
    }
    const rejects = evidence.live.filter(r => ['protected read', 'empty unauthenticated write', 'forged session', 'forged identity headers', 'cross-origin read'].includes(r.label));
    evidence.summary = { routeCount: routes.length, staticGuardGaps: gaps.length, protectedChecks: rejects.length, authRequiredCount: rejects.filter(r => r.status === 401 && r.errorCode === 'AUTH_REQUIRED').length, unexpected: rejects.filter(r => r.status !== 401 || r.errorCode !== 'AUTH_REQUIRED'), totalRequests: evidence.live.length };
    const output = option('--out');
    if (!args.includes('--out') || !output) throw new Error('Supply --out evidence.json');
    const destination = path.resolve(root, output);
    if (!destination.startsWith(root + path.sep)) throw new Error('Evidence must stay in workspace');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence.summary, null, 2));
    process.exitCode = gaps.length || evidence.summary.unexpected.length ? 1 : 0;
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
