import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentUser } from "../src/auth/authApi.js";
import { decideAuthRestoration } from "../src/auth/authRestoration.js";

/** I-13: a gateway 502/504 from the reverse proxy means the API did not answer; it must behave like offline. */

const cached = { id: 41, username: "cached-inspector", role: "inspector" as const, lastVerifiedAt: "2026-08-13T00:00:00.000Z" };

async function probe(status: number, body = "") {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = globalThis;
  globalThis.fetch = (async () => new Response(body, { status })) as never;
  try { return await getCurrentUser(50); } finally { globalThis.fetch = originalFetch; (globalThis as { window?: unknown }).window = originalWindow; }
}

test("I-13: 502 and 504 from the proxy are transport-unavailable, so a cached identity restores offline-unverified", async () => {
  for (const status of [502, 504]) {
    const result = await probe(status);
    assert.equal(result.status, "transport-unavailable", `${status}`);
    assert.equal(decideAuthRestoration(cached, result).kind, "offline-unverified", `${status} keeps the cached workspace usable`);
  }
});

test("I-13: a deliberate server answer still fails closed", async () => {
  assert.equal((await probe(500)).status, "unavailable");
  assert.equal((await probe(503)).status, "unavailable");
  assert.equal((await probe(401)).status, "unauthenticated");
  assert.equal((await probe(403)).status, "unauthenticated");
  assert.equal((await probe(200, "not json")).status, "unavailable");
  assert.equal((await probe(200, JSON.stringify({ user: { id: 1, username: "a", role: "admin" } }))).status, "authenticated");
});

test("I-13: no cached identity and an unreachable server is still online-unavailable (nothing to restore)", async () => {
  assert.equal(decideAuthRestoration(undefined, await probe(502)).kind, "online-unavailable");
});
