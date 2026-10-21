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
