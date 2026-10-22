import assert from "node:assert/strict";
import test from "node:test";
import { isLocalSaveSlow, SLOW_SAVE_AFTER_MS } from "../src/pwa/slowLocalSave";
import { beginWorkspaceActivity, oldestWorkspaceActivityStartedAt } from "../src/db/workspaceActivity";

test("I-79: a save is slow only after the threshold, from either signal", () => {
  const now = 1_000_000;
  assert.equal(isLocalSaveSlow({ now }), false);
  assert.equal(isLocalSaveSlow({ now, savingSince: now - (SLOW_SAVE_AFTER_MS - 1) }), false);
  assert.equal(isLocalSaveSlow({ now, savingSince: now - SLOW_SAVE_AFTER_MS }), true);
  assert.equal(isLocalSaveSlow({ now, oldestActivityAt: now - SLOW_SAVE_AFTER_MS - 5 }), true);
  assert.equal(isLocalSaveSlow({ now, savingSince: now - 1, oldestActivityAt: now - 1 }), false);
});

test("I-79: workspace activity reports its oldest in-flight start and forgets finished work", () => {
  assert.equal(oldestWorkspaceActivityStartedAt(), undefined);
  const finishFirst = beginWorkspaceActivity();
  const first = oldestWorkspaceActivityStartedAt();
  assert.ok(first !== undefined);
  const finishSecond = beginWorkspaceActivity();
  assert.equal(oldestWorkspaceActivityStartedAt(), first);
  finishFirst();
  assert.ok((oldestWorkspaceActivityStartedAt() ?? 0) >= (first ?? 0));
  finishSecond();
  assert.equal(oldestWorkspaceActivityStartedAt(), undefined);
});

test("FR-17: 1000 same-millisecond activities finishing in random order keep the first still running as oldest", () => {
  const realNow = Date.now;
  let tick = 5_000_000;
  Date.now = () => tick; // identical millisecond for the first batch exposes ordering by key
  try {
    const starts: number[] = [];
    const finishers = Array.from({ length: 1000 }, (_, i) => {
      if (i === 500) tick += 7;
      starts.push(tick);
      return beginWorkspaceActivity();
    });
    const order = finishers.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const running = new Set(order);
    for (const index of order) {
      finishers[index]();
      finishers[index](); // idempotent: a second call must not release another activity
      running.delete(index);
      const firstRunning = running.size ? Math.min(...running) : undefined;
      assert.equal(oldestWorkspaceActivityStartedAt(), firstRunning === undefined ? undefined : starts[firstRunning]);
    }
  } finally {
    Date.now = realNow;
  }
});
