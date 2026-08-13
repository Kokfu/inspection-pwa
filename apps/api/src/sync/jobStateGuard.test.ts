import assert from "node:assert/strict";
import test from "node:test";
import { guardCompletedJobSyncItems } from "./jobStateGuard.js";

const jobId = "20000000-0000-4000-8000-000000000001";
const acceptedId = "20000000-0000-4000-8000-000000000002";
const staleId = "20000000-0000-4000-8000-000000000003";

test("closed-job guard preserves exact retries and rejects stale local work deterministically", async () => {
  let query = 0;
  const fake = {
    async query() {
      query += 1;
      return query === 1 ? { rows: [{ id: jobId }] } : { rows: [{ job_id: jobId, id: acceptedId }] };
    }
  };
  const items = [acceptedId, staleId].map((entityId) => ({
    entityType: "masterSystemInspection",
    entityId,
    payload: { jobId }
  }));
  const guarded = await guardCompletedJobSyncItems(items, fake);
  assert.deepEqual(guarded.dispatchable, [items[0]]);
  assert.deepEqual(guarded.duplicateIds, []);
  assert.deepEqual(guarded.failed, [{
    id: staleId,
    code: "JOB_CLOSED",
    message: "This job is completed; the local record was retained and needs review"
  }]);
});
