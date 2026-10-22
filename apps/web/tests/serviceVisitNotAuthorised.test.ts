import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "../src/auth/authApi";
import { ServiceVisitNotAuthorisedError, loadTimelineServiceJob } from "../src/visits/customerTimelineServiceJob";

const actor = { id: 7, role: "inspector" } as unknown as AuthUser;
const jobId = "00000000-0000-4000-8000-000000000a01", customerId = "00000000-0000-4000-8000-000000000a02";
const wording = "You are not authorised to open this service visit. You can only open your own service visits.";

async function openWith(response: Response) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response;
  try { return await loadTimelineServiceJob(jobId, customerId, actor, new AbortController().signal).then(() => undefined, (error: unknown) => error); }
  finally { globalThis.fetch = original; }
}

test("FR-09: a 403 shows the server's not-authorised message, not a generic error", async () => {
  const error = await openWith(new Response(JSON.stringify({ error: "FORBIDDEN", message: wording }), { status: 403 }));
  assert(error instanceof ServiceVisitNotAuthorisedError);
  assert.equal(error.message, wording);
  assert.doesNotMatch(error.message, /unavailable|\(403\)|Reconnect/);
});

test("FR-09: a 403 without a readable body still says not authorised", async () => {
  const error = await openWith(new Response("<html>nope</html>", { status: 403 }));
  assert(error instanceof ServiceVisitNotAuthorisedError);
  assert.equal(error.message, wording);
});

test("FR-09: other failures keep the generic retry message", async () => {
  const error = await openWith(new Response("{}", { status: 503 }));
  assert(error instanceof Error && !(error instanceof ServiceVisitNotAuthorisedError));
  assert.match(error.message, /could not be opened \(503\)/);
});
