import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadManagerServiceVisits, ManagerApiError } from "../src/manager/managerApi.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const visit = (id: number, status = "open") => ({ id: String(id), status });
const page = (serviceVisits: unknown[], nextCursor: string | null = null, totalCount = serviceVisits.length) =>
  new Response(JSON.stringify({ serviceVisits, nextCursor, totalCount }), { headers: { "content-type": "application/json" } });
const unavailable = (error: unknown) => error instanceof ManagerApiError && error.kind === "unavailable";

test("loads every page with encoded cursors and preserves request authority options", async () => {
  const requests: string[] = [];
  const controller = new AbortController();
  globalThis.fetch = (async (url, options) => {
    requests.push(String(url));
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.signal, controller.signal);
    return requests.length === 1
      ? page(Array.from({ length: 50 }, (_, index) => visit(index)), "older+/=", 51)
      : page([visit(50, "closed")], null, 51);
  }) as typeof fetch;
  const result = await loadManagerServiceVisits(controller.signal);
  assert.equal(result.length, 51);
  assert.equal(result[50].id, "50");
  assert.deepEqual(requests, ["/api/manager/service-visits", "/api/manager/service-visits?cursor=older%2B%2F%3D"]);
});

for (const status of [401, 403, 503]) {
  test(`later-page HTTP ${status} rejects the whole list`, async () => {
    let reads = 0;
    globalThis.fetch = (async () => ++reads === 1 ? page([visit(1)], "next", 2) : new Response("{}", { status })) as typeof fetch;
    await assert.rejects(loadManagerServiceVisits(), error => error instanceof ManagerApiError
      && error.kind === (status === 503 ? "unavailable" : "authorization"));
    assert.equal(reads, 2);
  });
}

test("unknown status on a later page rejects the whole list", async () => {
  let reads = 0;
  globalThis.fetch = (async () => ++reads === 1 ? page([visit(1)], "next", 2) : page([visit(2, "unknown")], null, 2)) as typeof fetch;
  await assert.rejects(loadManagerServiceVisits(), unavailable);
});

for (const [name, responses] of Object.entries({
  "missing pagination metadata": [new Response(JSON.stringify({ serviceVisits: [] }))],
  "negative total": [page([], null, -1)],
  "incomplete terminal page": [page([visit(1)], null, 2)],
  "empty cursor": [page([visit(1)], "", 2)],
  "empty advancing page": [page([], "next", 2)],
  "cursor beyond declared total": [page([visit(1)], "next", 1)],
  "repeated cursor": [page([visit(1)], "next", 3), page([visit(2)], "next", 3)],
  "duplicate visit": [page([visit(1)], "next", 2), page([visit(1)], null, 2)],
})) {
  test(`${name} fails closed`, async () => {
    let reads = 0;
    globalThis.fetch = (async () => {
      assert.ok(reads < responses.length, "must stop requesting malformed pagination");
      return responses[reads++];
    }) as typeof fetch;
    await assert.rejects(loadManagerServiceVisits(), unavailable);
  });
}

test("abort between pages prevents publication or another request", async () => {
  const controller = new AbortController();
  let reads = 0;
  globalThis.fetch = (async () => {
    reads++;
    controller.abort();
    return page([visit(1)], "next", 2);
  }) as typeof fetch;
  await assert.rejects(loadManagerServiceVisits(controller.signal), { name: "AbortError" });
  assert.equal(reads, 1);
});
