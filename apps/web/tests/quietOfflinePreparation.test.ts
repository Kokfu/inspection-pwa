import assert from "node:assert/strict";
import test from "node:test";
import { createQuietPreparer } from "../src/jobs/quietOfflinePreparation.js";

const jobs = [{ id: "a" }, { id: "b" }];
function harness(overrides: Partial<Parameters<typeof createQuietPreparer<{ id: string }, { jobId: string; systemKey: string }>>[0]> = {}) {
  let clock = 1_000_000; const loads: string[][] = []; const recorded: string[][] = [];
  const trigger = createQuietPreparer({
    isEligible: () => true, getJobs: () => jobs, now: () => clock, minGapMs: 600_000,
    load: async (ids) => { loads.push(ids); return [{ jobId: "a", systemKey: "hose_reel" }]; },
    record: async (list, summaries) => { recorded.push(list.map((job) => job.id), summaries.map((item) => item.systemKey)); },
    ...overrides
  });
  return { trigger, loads, recorded, advance: (ms: number) => { clock += ms; } };
}

test("reads the accepted summaries for every cached job and records the confirmations", async () => {
  const h = harness();
  assert.equal(await h.trigger(), "ran");
  assert.deepEqual(h.loads, [["a", "b"]]);
  assert.deepEqual(h.recorded, [["a", "b"], ["hose_reel"]]);
});

test("is throttled inside the minimum gap and runs again after it", async () => {
  const h = harness();
  assert.equal(await h.trigger(), "ran");
  h.advance(60_000);
  assert.equal(await h.trigger(), "throttled");
  h.advance(600_000);
  assert.equal(await h.trigger(), "ran");
  assert.equal(h.loads.length, 2);
});

test("does nothing when ineligible (offline / not verified) or when there are no jobs", async () => {
  const off = harness({ isEligible: () => false }); assert.equal(await off.trigger(), "skipped"); assert.equal(off.loads.length, 0);
  const empty = harness({ getJobs: () => [] }); assert.equal(await empty.trigger(), "skipped");
});

test("a failed read records nothing (no stale confirmation is extended) and the next trigger retries at once", async () => {
  let fail = true; const recorded: number[] = [];
  const h = harness({ load: async () => { if (fail) throw new TypeError("Failed to fetch"); return []; }, record: async () => { recorded.push(1); } });
  assert.equal(await h.trigger(), "failed"); assert.equal(recorded.length, 0);
  fail = false;
  assert.equal(await h.trigger(), "ran"); assert.equal(recorded.length, 1);
});

test("overlapping triggers do not start a second read", async () => {
  let release: () => void = () => undefined; const gate = new Promise<void>((resolve) => { release = resolve; });
  const h = harness({ load: async () => { await gate; return []; } });
  const first = h.trigger(); assert.equal(await h.trigger(), "throttled"); release(); assert.equal(await first, "ran");
});
