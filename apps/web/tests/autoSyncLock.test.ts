import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_SYNC_LOCK, runAsSingleSender, type SingleSenderLocks } from "../src/sync/autoSyncLock.js";

// A faithful single-process model of Web Locks with ifAvailable: one holder per name, others get null at once.
function fakeLocks() {
  const held = new Set<string>();
  const locks: SingleSenderLocks = {
    async request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    }
  };
  return { locks, held };
}

test("only one tab runs the automatic sync; the others skip and the lock is released afterwards", async () => {
  const { locks, held } = fakeLocks();
  let runs = 0, release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = runAsSingleSender(locks, async () => { runs++; await gate; });
  assert.equal(held.has(AUTO_SYNC_LOCK), true);
  assert.equal(await runAsSingleSender(locks, async () => { runs++; }), "skipped");
  assert.equal(await runAsSingleSender(locks, async () => { runs++; }), "skipped");
  assert.equal(runs, 1);
  release();
  assert.equal(await first, "ran");
  assert.equal(held.size, 0);
  assert.equal(await runAsSingleSender(locks, async () => { runs++; }), "ran");
  assert.equal(runs, 2);
});

test("a failed sync propagates and still frees the lock", async () => {
  const { locks, held } = fakeLocks();
  await assert.rejects(() => runAsSingleSender(locks, async () => { throw new Error("sync failed"); }), /sync failed/);
  assert.equal(held.size, 0);
  assert.equal(await runAsSingleSender(locks, async () => undefined), "ran");
});

test("without Web Locks, or when the lock request itself fails, the sync still runs", async () => {
  let runs = 0;
  assert.equal(await runAsSingleSender(undefined, async () => { runs++; }), "ran");
  const broken: SingleSenderLocks = { request: async () => { throw new Error("NotSupportedError"); } };
  assert.equal(await runAsSingleSender(broken, async () => { runs++; }), "ran");
  assert.equal(runs, 2);
});
