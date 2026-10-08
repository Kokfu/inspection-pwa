import assert from 'node:assert/strict';
import test from 'node:test';
import { runRejection, TARGET_ID, EXPECTED_PAYLOAD } from './reject-legacy-location-proposal.mjs';

function fixture(overrides = {}) {
  let proposal = { id: TARGET_ID, customerDisplayName: '28/9/2026 All Services', systemKey: 'fm200_fire_suppression', submittedBy: 'Technician1', submittedAt: '2026-09-28T18:10:05.637Z', status: 'pending', payload: structuredClone(EXPECTED_PAYLOAD), decision: null, ...overrides };
  const writes = [];
  const request = async (path, options = {}) => {
    if (path === '/auth/me') return { user: { id: 1, role: 'admin' } };
    assert.ok(path.startsWith(`/manager/location-proposals/${TARGET_ID}`));
    if (options.method === 'POST') {
      writes.push(options.body);
      proposal = { ...proposal, status: 'rejected', decision: { decision: 'rejected', decidedByRole: 'admin', note: options.body.note } };
    }
    return { proposal: structuredClone(proposal) };
  };
  return { request, writes };
}
test('default dry-run prints full unchanged before/after and writes nothing', async () => {
  const f = fixture(); const output = [];
  const report = await runRejection({ request: f.request, log: line => output.push(line) });
  assert.equal(f.writes.length, 0);
  assert.deepEqual(report.before.payload, EXPECTED_PAYLOAD);
  assert.deepEqual(report.after, report.before);
  assert.match(output.join('\n'), /presetRowCount/);
});
test('explicit --apply rejects exactly one immutable row and confirms authority', async () => {
  const f = fixture(); const report = await runRejection({ argv: ['--apply'], request: f.request, log: () => {} });
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].decision, 'rejected');
  assert.deepEqual(report.before.payload, report.after.payload);
  assert.equal(report.after.status, 'rejected');
});
test('refuses unknown flags, nonpending state, unexpected identity or changed payload', async () => {
  for (const overrides of [{ status: 'rejected' }, { id: 'different' }, { systemKey: 'hydrant' }, { payload: { zones: [], locations: [] } }]) {
    const f = fixture(overrides);
    await assert.rejects(runRejection({ argv: ['--apply'], request: f.request, log: () => {} }));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  await assert.rejects(runRejection({ argv: ['--proposal=other'], request: f.request }));
  assert.equal(f.writes.length, 0);
});
test('refuses supervisor authority and malformed success confirmation', async () => {
  const f = fixture();
  await assert.rejects(runRejection({ request: async (path, opts) => path === '/auth/me' ? { user: { role: 'supervisor' } } : f.request(path, opts) }));
  assert.equal(f.writes.length, 0);
  await assert.rejects(runRejection({ argv: ['--apply'], log: () => {}, request: async (path, opts) => {
    const data = await f.request(path, opts);
    return opts?.method === 'POST' ? { proposal: { ...data.proposal, id: 'wrong' } } : data;
  } }));
});
test('rechecks pending state immediately before write', async () => {
  const f = fixture(); let reads = 0;
  await assert.rejects(runRejection({ argv: ['--apply'], log: () => {}, request: async (path, opts) => {
    const data = await f.request(path, opts);
    if (path !== '/auth/me' && !opts?.method && ++reads === 2) data.proposal.status = 'approved';
    return data;
  } }));
  assert.equal(f.writes.length, 0);
});
