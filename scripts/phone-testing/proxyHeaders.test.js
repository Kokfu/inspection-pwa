// I-43: the API refuses a write whose Origin host differs from its Host header (apps/api requestSecurity). The phone
// dev proxy sends Host: localhost to Caddy, so it must send an Origin with the same host.  Run: node --test scripts/phone-testing
const test = require('node:test');
const assert = require('node:assert/strict');
const { forwardHeaders } = require('./proxyHeaders');

// Same rule as apps/api/src/middleware/requestSecurity.ts for the Origin header.
const originAccepted = (headers) => {
  if (!headers.origin) return true;
  const parsed = new URL(headers.origin);
  return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === headers.host && parsed.origin === headers.origin;
};

test('a write from the phone origin is forwarded with an Origin that matches the forwarded Host', () => {
  const out = forwardHeaders({ host: 'localhost:8081', origin: 'http://localhost:8081', 'content-type': 'application/json' });
  assert.equal(out.host, 'localhost');
  assert.ok(originAccepted(out), `Origin ${out.origin} must match Host ${out.host}`);
  assert.equal(out['content-type'], 'application/json');
});

test('requests without an Origin header are left without one', () => {
  const out = forwardHeaders({ host: 'localhost:8081' });
  assert.equal('origin' in out, false);
  assert.ok(originAccepted(out));
});

test('the incoming header object is not modified', () => {
  const incoming = { host: 'localhost:8081', origin: 'http://localhost:8081' };
  forwardHeaders(incoming);
  assert.deepEqual(incoming, { host: 'localhost:8081', origin: 'http://localhost:8081' });
});
