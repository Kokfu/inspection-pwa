import assert from "node:assert/strict";
import test from "node:test";
import { beginAuthVerificationState, decideAuthRestoration } from "../src/auth/authRestoration.js";

const user = { id: 41, username: "cached-inspector", role: "inspector" as const };
const cached = { ...user, lastVerifiedAt: "2026-08-13T00:00:00.000Z" };

test("transport failure restores cached identity only as offline-unverified", () => {
  assert.equal(decideAuthRestoration(cached, { status: "transport-unavailable" }).kind, "offline-unverified");
  assert.equal(decideAuthRestoration(undefined, { status: "transport-unavailable" }).kind, "online-unavailable");
});

test("server authentication rejection clears cached authority", () => {
  assert.deepEqual(decideAuthRestoration(cached, { status: "unauthenticated" }), {
    kind: "logged-out",
    clearIdentity: true
  });
});

test("reconnect hides verified authority while the server session is checked", () => {
  assert.equal(beginAuthVerificationState({
    status: "offline-unverified",
    user,
    lastVerifiedAt: cached.lastVerifiedAt
  }).status, "verifying");
});
