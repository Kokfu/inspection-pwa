import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isVisitDate } from '../src/repairs/repairContract';
import { reviewServices, type ReviewContext } from '../src/repairs/repairReviewRepository';

test('isVisitDate accepts real calendar dates only', () => {
  assert.equal(isVisitDate('2026-10-11'), true);
  assert.equal(isVisitDate('2024-02-29'), true);
  for (const bad of [null, undefined, '', '2026-1-1', '2026-13-01', '2026-02-30', '2025-02-29', '2026-10-11T00:00:00Z', 20261011]) {
    assert.equal(isVisitDate(bad), false, String(bad));
  }
});

const UUID = '11111111-1111-4111-8111-111111111111';
const service = (extra: Record<string, unknown>) => ({
  jobId: UUID, systemKey: 'fire_alarm', systemLabel: 'Fire Alarm',
  sourceJob: { id: UUID, reference: 'SV-1', title: 'Visit' },
  customer: { id: UUID, code: 'C1', displayName: 'Customer' }, site: null, ...extra,
});
const ctx = { assert: async () => {}, user: { id: 1 } } as unknown as ReviewContext;

async function review(services: unknown[]) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ services }), { status: 200 })) as typeof fetch;
  try { return await reviewServices(ctx); } finally { globalThis.fetch = realFetch; }
}

test('reviewServices passes a real visitDate and null/absent', async () => {
  assert.equal((await review([service({ visitDate: '2026-10-11' })])).length, 1);
  assert.equal((await review([service({ visitDate: null })])).length, 1);
  assert.equal((await review([service({})])).length, 1);
});

test('reviewServices fails closed on malformed visitDate', async () => {
  for (const visitDate of ['2026-1-1', '2026-02-30', '2026-10-11T00:00:00Z', 20261011, '']) {
    await assert.rejects(review([service({ visitDate })]), /INVALID_REPAIR_AUTHORITY/, String(visitDate));
  }
});
