import assert from "node:assert/strict";
import test from "node:test";
import { SERVICE_VISIT_NOT_AUTHORISED_MESSAGE } from "../src/visits/customerTimelineServiceJob";
import {
  SERVICE_VISIT_NOT_FOUND_MESSAGE, SERVICE_VISIT_NOT_ON_DEVICE_MESSAGE, SERVICE_VISIT_RETRY_MESSAGE, resolveMissingServiceVisit
} from "../src/visits/serviceVisitAccess";

const jobId = "5aac930f-5118-4a2a-92e9-0a3ba6494cfd";

function run(opts: { local?: boolean; online?: boolean; response?: Response; throws?: boolean }) {
  let calls = 0, url = "";
  const fetchFn = (async (input: RequestInfo | URL) => {
    calls += 1; url = String(input);
    if (opts.throws) throw new TypeError("network");
    return opts.response!;
  }) as typeof fetch;
  const result = resolveMissingServiceVisit({ jobId, userId: 7, online: opts.online ?? true, isLocal: async () => opts.local ?? false, fetchFn });
  return { result, calls: () => calls, url: () => url };
}

test("FR-18: a not-local job answered 403 is not authorised, with the shared wording", async () => {
  const r = run({ response: new Response(JSON.stringify({ message: SERVICE_VISIT_NOT_AUTHORISED_MESSAGE }), { status: 403 }) });
  assert.deepEqual(await r.result, { kind: "not-authorised", message: SERVICE_VISIT_NOT_AUTHORISED_MESSAGE });
  assert.equal(r.url(), `/api/inspection-jobs/${jobId}`);
});

test("FR-18: a 403 with an unreadable body still uses the standard wording", async () => {
  const r = run({ response: new Response("nope", { status: 403 }) });
  assert.deepEqual(await r.result, { kind: "not-authorised", message: SERVICE_VISIT_NOT_AUTHORISED_MESSAGE });
});

test("FR-18: 404 is calm 'not found'", async () => {
  assert.deepEqual(await run({ response: new Response("{}", { status: 404 }) }).result, { kind: "not-found", message: SERVICE_VISIT_NOT_FOUND_MESSAGE });
});

test("FR-18: 503 and network failure show the retry message", async () => {
  assert.deepEqual(await run({ response: new Response("{}", { status: 503 }) }).result, { kind: "retry", message: SERVICE_VISIT_RETRY_MESSAGE });
  assert.deepEqual(await run({ throws: true }).result, { kind: "retry", message: SERVICE_VISIT_RETRY_MESSAGE });
});

test("FR-18: offline and not local shows the reconnect message without calling the server", async () => {
  const r = run({ online: false });
  assert.deepEqual(await r.result, { kind: "offline", message: SERVICE_VISIT_NOT_ON_DEVICE_MESSAGE });
  assert.equal(r.calls(), 0);
});

test("FR-18: a local job never calls fetch, online or offline", async () => {
  for (const online of [true, false]) {
    const r = run({ local: true, online });
    assert.deepEqual(await r.result, { kind: "local" });
    assert.equal(r.calls(), 0);
  }
});
