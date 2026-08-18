import assert from "node:assert/strict";
import test from "node:test";
import { acceptCanonicalNewServiceVisit } from "../src/jobs/newServiceVisitSuccess.js";
import type { InspectionJob } from "../src/jobs/jobTypes";

const job = {
  id: "50000000-0000-4000-8000-000000000001", reference: "SV-20260818-1", title: "Site A",
  status: "open", createdAt: "2026-08-18T00:00:00.000Z", serviceDate: "2026-08-18",
  site: { id: "50000000-0000-4000-8000-000000000002", displayName: "Site A" },
  configurationSnapshot: { schemaVersion: 1 as const,
    customer: { id: "50000000-0000-4000-8000-000000000003", code: "C", displayName: "Customer" },
    configuration: { revisionId: "50000000-0000-4000-8000-000000000004", revisionNumber: 1 },
    template: { id: "50000000-0000-4000-8000-000000000005", code: "MFE-FSSR", name: "Master", version: 1 },
    enabledSystems: [] },
  completion: { jobId: "50000000-0000-4000-8000-000000000001", jobStatus: "open" as const,
    eligible: false, checkedAt: "2026-08-18T00:00:00.000Z", requiredUnitCount: 0,
    acceptedUnitCount: 0, completedAt: null, completedBy: null, systems: [] }
} satisfies InspectionJob;

test("canonical create response is cached and routed before successful reconciliation", async () => {
  let jobs: InspectionJob[] = [];
  let navigated: string | undefined;
  let reconciled = 0;
  await acceptCanonicalNewServiceVisit(job, {
    cacheCanonicalJob: async (value) => { assert.equal(value, job); },
    setJobs: (update) => { jobs = update(jobs); },
    navigateToJob: (id) => { navigated = id; },
    reconcileWorkspace: async () => { reconciled += 1; }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(jobs, [job]);
  assert.equal(navigated, job.id);
  assert.equal(reconciled, 1);
});

test("refresh failure cannot prevent canonical job routing", async () => {
  let jobs: InspectionJob[] = [];
  let navigated: string | undefined;
  await acceptCanonicalNewServiceVisit(job, {
    cacheCanonicalJob: async () => undefined,
    setJobs: (update) => { jobs = update(jobs); },
    navigateToJob: (id) => { navigated = id; },
    reconcileWorkspace: async () => { throw new Error("refresh unavailable"); }
  });
  assert.deepEqual(jobs, [job]);
  assert.equal(navigated, job.id);
});

test("cache failure surfaces before navigation and does not issue reconciliation", async () => {
  let navigated = false;
  let reconciled = false;
  await assert.rejects(() => acceptCanonicalNewServiceVisit(job, {
    cacheCanonicalJob: async () => { throw new Error("IndexedDB unavailable"); },
    setJobs: () => { throw new Error("must not update state"); },
    navigateToJob: () => { navigated = true; },
    reconcileWorkspace: async () => { reconciled = true; }
  }), /IndexedDB unavailable/);
  assert.equal(navigated, false);
  assert.equal(reconciled, false);
});
