import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAfterSource, compareBadge, isPartOpen, latestCycleState } from '../src/repairs/repairPartState';
import type { RepairHistory, RepairRecord } from '../src/repairs/repairTypes';

const hist = (uuid: string, cycle: number, state: RepairHistory['review_state'], remark = 'server'): RepairHistory => ({
  client_uuid: uuid, cycle_sequence: cycle, predecessor_uuid: null, remark, performed_at: '2026-10-01T00:00:00.000Z', submitted_by_user_id: 9, review_state: state
});
const rec = (uuid: string, cycle: number, syncStatus: RepairRecord['syncStatus'], reviewState: RepairRecord['reviewState'] = 'unsubmitted', remark = 'local'): RepairRecord => ({
  clientUuid: uuid, findingId: 'f', workOrderId: 'w', jobId: 'j', systemKey: 's', actorId: 1, cycleSequence: cycle, predecessorUuid: null,
  remark, performedAt: '2026-10-02T00:00:00.000Z', localCreatedAt: '', localUpdatedAt: '', syncStatus, reviewState
});
const finding = (...history: RepairHistory[]) => ({ history });

for (const serverState of ['awaiting_approval', 'approved'] as const) {
  for (const status of ['Draft', 'Pending', 'Syncing', 'Failed', 'Conflict'] as const) {
    test(`server ${serverState} tied with local ${status} (other uuid) is Open`, () => {
      const f = finding(hist('srv', 1, serverState)), r = [rec('loc', 1, status)];
      assert.equal(latestCycleState(f, r), 'unsubmitted');
      assert.equal(isPartOpen(f, r), true);
      assert.equal(compareBadge(f, r), 'Local draft (not synced)');
    });
  }
}

test('server approved with the same-uuid Synced local record stays approved', () => {
  const f = finding(hist('a', 1, 'approved')), r = [rec('a', 1, 'Synced')];
  assert.equal(latestCycleState(f, r), 'approved');
  assert.equal(isPartOpen(f, r), false);
  assert.equal(compareBadge(f, r), 'Approved');
});

test('tie with a Synced local record of another uuid keeps the server entry', () => {
  const f = finding(hist('srv', 1, 'approved'));
  assert.equal(latestCycleState(f, [rec('loc', 1, 'Synced')]), 'approved');
});

test('higher server cycle beats a lower unsynced local cycle; higher local cycle beats the server', () => {
  assert.equal(latestCycleState(finding(hist('srv', 2, 'awaiting_approval')), [rec('loc', 1, 'Pending')]), 'awaiting_approval');
  assert.equal(latestCycleState(finding(hist('srv', 1, 'approved')), [rec('loc', 2, 'Draft')]), 'unsubmitted');
});

test('mixed local and server cycles pick the highest', () => {
  const f = finding(hist('s1', 1, 'rejected'), hist('s2', 2, 'awaiting_approval'));
  assert.equal(latestCycleState(f, [rec('l1', 1, 'Synced', 'rejected'), rec('l3', 3, 'Synced')]), 'awaiting_approval');
  assert.equal(latestCycleState(f, [rec('l3', 3, 'Draft')]), 'unsubmitted');
});

test('rejected then local draft is Open; rejected alone is Open; withdrawn is Open; none is Open', () => {
  assert.equal(latestCycleState(finding(hist('s', 1, 'rejected')), [rec('l', 2, 'Draft')]), 'unsubmitted');
  assert.equal(isPartOpen(finding(hist('s', 1, 'rejected')), []), true);
  assert.equal(latestCycleState(finding(hist('s', 1, 'withdrawn')), []), 'withdrawn');
  assert.equal(isPartOpen(finding(hist('s', 1, 'withdrawn')), []), true);
  assert.equal(latestCycleState(finding(), []), 'none');
});

test('local Synced record not yet in history awaits approval', () => {
  assert.equal(latestCycleState(finding(), [rec('l', 1, 'Synced')]), 'awaiting_approval');
});

test('compareAfterSource: local newer', () => {
  const r = rec('l', 2, 'Synced');
  assert.deepEqual(compareAfterSource(finding(hist('s', 1, 'approved')), [r]), { kind: 'local', record: r });
});
test('compareAfterSource: server newer', () => {
  const h = hist('s', 3, 'approved');
  assert.deepEqual(compareAfterSource(finding(h), [rec('l', 2, 'Synced')]), { kind: 'server', history: h });
});
test('compareAfterSource: equal cycle, different uuid chooses local', () => {
  const r = rec('l', 2, 'Draft');
  assert.deepEqual(compareAfterSource(finding(hist('s', 2, 'approved')), [r]), { kind: 'local', record: r });
});
test('compareAfterSource: no history chooses newest local', () => {
  const a = rec('a', 1, 'Synced'), b = rec('b', 2, 'Draft');
  assert.deepEqual(compareAfterSource(finding(), [a, b]), { kind: 'local', record: b });
});
test('compareAfterSource: history only is server; nothing is none', () => {
  const h = hist('s', 1, 'approved');
  assert.deepEqual(compareAfterSource(finding(h), []), { kind: 'server', history: h });
  assert.deepEqual(compareAfterSource(finding(), []), { kind: 'none' });
});
