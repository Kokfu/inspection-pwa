import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  AUTO_SYNC_FAILED_BACKOFF_MS,
  AutoSyncCoordinator,
  REPAIR_FAILED_BACKOFF_MS,
  failedBackoffFor,
  outboxHasAutoSyncWork,
  type AutoSyncReason
} from "../src/sync/autoSync.js";

/**
 * I-03: the app only synced when the technician pressed Sync Now. The sync-engine skill requires a retry on
 * launch, on the browser online event, on user action and on a safe interval while the app is open.
 */

const now = Date.parse("2026-10-08T10:00:00.000Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("work detection: Pending always counts; Completed/Conflict never do", () => {
  for (const reason of ["launch", "online", "visible", "interval"] as AutoSyncReason[]) {
    assert.equal(outboxHasAutoSyncWork([{ status: "Pending" }], reason, now), true, reason);
    assert.equal(outboxHasAutoSyncWork([{ status: "Completed" }, { status: "Conflict" }], reason, now), false, reason);
    assert.equal(outboxHasAutoSyncWork([], reason, now), false, reason);
  }
});

test("work detection: the timer backs off Failed items, launch/reconnect retry them at once", () => {
  const justFailed = [{ status: "Failed", lastAttemptAt: ago(10_000) }];
  assert.equal(outboxHasAutoSyncWork(justFailed, "interval", now), false, "timer does not hammer a rejected record");
  assert.equal(outboxHasAutoSyncWork(justFailed, "launch", now), true);
  assert.equal(outboxHasAutoSyncWork(justFailed, "online", now), true);
  assert.equal(outboxHasAutoSyncWork(justFailed, "visible", now), true);
  const old = [{ status: "Failed", lastAttemptAt: ago(AUTO_SYNC_FAILED_BACKOFF_MS) }];
  assert.equal(outboxHasAutoSyncWork(old, "interval", now), true, "retried once the backoff has passed");
  assert.equal(outboxHasAutoSyncWork([{ status: "Failed" }], "interval", now), true, "never attempted counts");
  assert.equal(outboxHasAutoSyncWork([{ status: "Failed", lastAttemptAt: "garbage" }], "interval", now), true, "malformed time fails open to retry");
});

test("work detection: a Syncing item is a crashed run only at launch", () => {
  assert.equal(outboxHasAutoSyncWork([{ status: "Syncing" }], "launch", now), true);
  assert.equal(outboxHasAutoSyncWork([{ status: "Syncing" }], "interval", now), false, "live tab: the running sync owns it");
});

function harness(options: { eligible?: () => boolean; work?: () => boolean; run?: () => Promise<void> } = {}) {
  const calls: AutoSyncReason[] = [];
  let runs = 0;
  const coordinator = new AutoSyncCoordinator({
    isEligible: options.eligible ?? (() => true),
    hasWork: async (reason) => { calls.push(reason); return (options.work ?? (() => true))(); },
    run: options.run ?? (async () => { runs += 1; })
  });
  return { coordinator, calls, runs: () => runs };
}

test("coordinator runs the sync when eligible and there is work", async () => {
  const h = harness();
  assert.equal(await h.coordinator.trigger("launch"), "ran");
  assert.equal(h.runs(), 1);
});

test("coordinator does not touch the network when ineligible (signed out, unverified, offline) or idle", async () => {
  const offline = harness({ eligible: () => false });
  assert.equal(await offline.coordinator.trigger("online"), "skipped");
  assert.equal(offline.calls.length, 0, "does not even read the outbox");
  assert.equal(offline.runs(), 0);
  const idle = harness({ work: () => false });
  assert.equal(await idle.coordinator.trigger("interval"), "skipped");
  assert.equal(idle.runs(), 0);
});

test("coordinator is single-flight and replays a reconnect that arrived mid-run, but not a timer tick", async () => {
  let release: () => void = () => undefined;
  let runs = 0;
  const h = harness({ run: async () => { runs += 1; if (runs === 1) await new Promise<void>((resolve) => { release = resolve; }); } });
  const first = h.coordinator.trigger("interval");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await h.coordinator.trigger("interval"), "skipped");
  assert.equal(await h.coordinator.trigger("online"), "skipped");
  assert.equal(runs, 1, "no concurrent second run");
  release();
  assert.equal(await first, "ran");
  assert.equal(runs, 2, "the online trigger is replayed once after the first run finished");

  const t = harness({ run: async () => { await new Promise((resolve) => setTimeout(resolve, 5)); } });
  const slow = t.coordinator.trigger("launch");
  await t.coordinator.trigger("interval");
  await slow;
  assert.equal(t.calls.filter((reason) => reason === "interval").length, 0, "a timer tick during a run is dropped");
});

test("coordinator never throws and keeps working after a failed run", async () => {
  let fail = true;
  const h = harness({ run: async () => { if (fail) throw new Error("network down"); } });
  assert.equal(await h.coordinator.trigger("online"), "skipped");
  fail = false;
  assert.equal(await h.coordinator.trigger("interval"), "ran");
  const broken = new AutoSyncCoordinator({ isEligible: () => true, hasWork: async () => { throw new Error("idb"); }, run: async () => undefined });
  assert.equal(await broken.trigger("launch"), "skipped");
});

test("App wires the coordinator to launch/reconnect, visibility and the interval, and keeps manual Sync Now", () => {
  const app = readFileSync(join(import.meta.dirname, "../src/App.tsx"), "utf8");
  assert.match(app, /new AutoSyncCoordinator\(/);
  assert.match(app, /trigger\("launch"\)/);
  assert.match(app, /trigger\("interval"\)/);
  assert.match(app, /trigger\("visible"\)/);
  assert.match(app, /setInterval\(tick, AUTO_SYNC_INTERVAL_MS\)/);
  assert.match(app, /function handleSync\(\) \{ return runSync\(false\); \}/, "Sync Now stays a plain manual call");
  const engine = readFileSync(join(import.meta.dirname, "../src/sync/syncEngine.ts"), "utf8");
  assert.match(engine, /if \(syncInProgress\) \{/, "engine single-flight guard is untouched");
});

// I-67: repair visit operations retry sooner than the generic 5 minutes; every other form is unchanged.
test("repair visit operations back off 1 min, 2 min, then 5 min by attempt; other items keep 5 min", () => {
  assert.deepEqual([...REPAIR_FAILED_BACKOFF_MS], [60_000, 120_000, AUTO_SYNC_FAILED_BACKOFF_MS]);
  const failed = (entityType: string, attempts: number, agoMs: number) => [{ status: "Failed", entityType, attempts, lastAttemptAt: ago(agoMs) }];
  for (const entityType of ["rvPhoto", "rvVisit"]) {
    assert.equal(outboxHasAutoSyncWork(failed(entityType, 1, 30_000), "interval", now), false, "30 s after the first failure: still waiting");
    assert.equal(outboxHasAutoSyncWork(failed(entityType, 1, 60_000), "interval", now), true, "1 min after the first failure: retried");
    assert.equal(outboxHasAutoSyncWork(failed(entityType, 2, 90_000), "interval", now), false);
    assert.equal(outboxHasAutoSyncWork(failed(entityType, 2, 120_000), "interval", now), true, "2 min after the second");
    assert.equal(outboxHasAutoSyncWork(failed(entityType, 3, 4 * 60_000), "interval", now), false);
    assert.equal(outboxHasAutoSyncWork(failed(entityType, 3, 5 * 60_000), "interval", now), true, "the cap is the usual 5 min");
    assert.equal(outboxHasAutoSyncWork(failed(entityType, 40, 4 * 60_000), "interval", now), false, "never faster than the cap after many attempts");
    assert.equal(outboxHasAutoSyncWork(failed(entityType, 1, 1_000), "online", now), true, "reconnect still retries at once");
  }
  // Inspection forms are unchanged.
  assert.equal(outboxHasAutoSyncWork(failed("masterSystemFormInstance", 1, 2 * 60_000), "interval", now), false);
  assert.equal(outboxHasAutoSyncWork(failed("masterSystemFormInstance", 1, 5 * 60_000), "interval", now), true);
});

test("failedBackoffFor tolerates a missing or odd attempts count", () => {
  assert.equal(failedBackoffFor({ status: "Failed", entityType: "rvVisit" }, 300_000), 60_000);
  assert.equal(failedBackoffFor({ status: "Failed", entityType: "rvVisit", attempts: Number.NaN }, 300_000), 60_000);
  assert.equal(failedBackoffFor({ status: "Failed", entityType: "rvVisit", attempts: 0 }, 300_000), 60_000);
  assert.equal(failedBackoffFor({ status: "Failed", entityType: "rvVisit", attempts: 2.9 }, 300_000), 120_000);
  assert.equal(failedBackoffFor({ status: "Failed" }, 300_000), 300_000);
  assert.equal(failedBackoffFor({ status: "Failed", entityType: "rvVisit", attempts: 3 }, 30_000), 30_000, "a smaller caller fallback is respected");
});
