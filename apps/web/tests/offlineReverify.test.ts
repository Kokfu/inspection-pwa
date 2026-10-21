import assert from "node:assert/strict";
import test from "node:test";
import { OFFLINE_REVERIFY_INTERVAL_MS, shouldReverifyAfterProbe } from "../src/auth/offlineReverify";

test("I-78: only a definite server answer triggers the full re-verification", () => {
  assert.equal(shouldReverifyAfterProbe({ status: "authenticated", user: { id: 1, username: "a", role: "inspector" } }), true);
  assert.equal(shouldReverifyAfterProbe({ status: "unauthenticated" }), true);
  assert.equal(shouldReverifyAfterProbe({ status: "transport-unavailable" }), false);
  assert.equal(shouldReverifyAfterProbe({ status: "unavailable" }), false);
  assert.equal(shouldReverifyAfterProbe(undefined), false);
});

test("I-78: the quiet probe interval is bounded", () => {
  assert.ok(OFFLINE_REVERIFY_INTERVAL_MS >= 10_000 && OFFLINE_REVERIFY_INTERVAL_MS <= 60_000);
});
