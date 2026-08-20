import assert from "node:assert/strict";
import test from "node:test";
import { ManagerRequestGuard } from "../src/manager/managerRequestGuard.js";
import { ManagerApiError, loadManagerServiceVisits } from "../src/manager/managerApi.js";

test("logout/auth invalidation aborts and rejects a late Manager response", () => {
  const guard = new ManagerRequestGuard();
  const request = guard.begin(7);
  assert.equal(guard.isCurrent(request, 7, true), true);
  guard.invalidate(); // the same call App performs before clearing Manager state
  assert.equal(request.signal.aborted, true);
  assert.equal(guard.isCurrent(request, 7, true), false);
});

test("a newer Manager request and an auth-generation transition both invalidate older requests", () => {
  const guard = new ManagerRequestGuard();
  const first = guard.begin(4);
  const second = guard.begin(4);
  assert.equal(first.signal.aborted, true);
  assert.equal(guard.isCurrent(first, 4, true), false);
  assert.equal(guard.isCurrent(second, 5, true), false);
  assert.equal(guard.isCurrent(second, 4, false), false);
});

test("Manager API distinguishes authorization loss from an unavailable server", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403, headers: { "content-type": "application/json" } })) as typeof fetch;
    await assert.rejects(() => loadManagerServiceVisits(), (error: unknown) => error instanceof ManagerApiError && error.kind === "authorization");
    globalThis.fetch = (async () => { throw new TypeError("offline"); }) as typeof fetch;
    await assert.rejects(() => loadManagerServiceVisits(), (error: unknown) => error instanceof ManagerApiError && error.kind === "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
