import assert from "node:assert/strict";
import test from "node:test";
import { authIdentityToken, sameAuthIdentity } from "../src/repairs/repairContract";

// I-71: a repair operation is pinned to the sign-in identity, not to its verification timestamps.
const base = { key: "device-auth", schemaVersion: 1, userId: 436, username: "technician-demo", role: "inspector",
  lastVerifiedAt: "2026-10-18T10:00:00.000Z", cachedAt: "2026-10-18T10:00:00.000Z", explicitLogout: false, serverLogoutPending: false };

test("re-verifying the same session (only the timestamps change) is the same identity", () => {
  assert.equal(sameAuthIdentity(base, { ...base, lastVerifiedAt: "2026-10-18T10:05:00.000Z" }), true);
  assert.equal(sameAuthIdentity(base, { ...base, cachedAt: "2026-10-18T10:05:00.000Z" }), true);
  assert.equal(sameAuthIdentity(base, { ...base, lastVerifiedAt: "2026-10-18T10:06:00.000Z", cachedAt: "2026-10-18T10:06:00.000Z" }), true);
  const { lastVerifiedAt: _a, cachedAt: _b, ...withoutTimestamps } = base;
  assert.equal(sameAuthIdentity(base, withoutTimestamps), true, "an offline-cached record without timestamps is the same identity");
});

test("every real identity change still differs (fail closed)", () => {
  const changed: Array<[string, Record<string, unknown>]> = [
    ["user id", { ...base, userId: 437 }],
    ["username", { ...base, username: "someone-else" }],
    ["role", { ...base, role: "admin" }],
    ["explicit logout", { ...base, explicitLogout: true }],
    ["server logout pending", { ...base, serverLogoutPending: true }],
    ["schema version", { ...base, schemaVersion: 2 }],
    ["key", { ...base, key: "other" }],
    ["a new identity-bearing field added later", { ...base, sessionId: "s-2" }],
  ];
  for (const [label, next] of changed) assert.equal(sameAuthIdentity(base, next), false, label);
  const { username: _u, ...withoutUsername } = base;
  assert.equal(sameAuthIdentity(base, withoutUsername), false, "a removed identity field differs");
});

test("a missing, deleted or malformed record never matches, not even itself", () => {
  for (const bad of [undefined, null, "device-auth", 7, [], true]) {
    assert.equal(authIdentityToken(bad), undefined);
    assert.equal(sameAuthIdentity(base, bad), false);
    assert.equal(sameAuthIdentity(bad, base), false);
    assert.equal(sameAuthIdentity(bad, bad), false);
  }
});

test("the token ignores field order and undefined fields but not values", () => {
  const reordered = { serverLogoutPending: false, explicitLogout: false, role: "inspector", username: "technician-demo", userId: 436, schemaVersion: 1, key: "device-auth" };
  assert.equal(sameAuthIdentity(base, reordered), true);
  assert.equal(sameAuthIdentity(base, { ...base, extra: undefined }), true);
  assert.equal(sameAuthIdentity(base, { ...base, userId: "436" }), false, "a string id is not the number");
  assert.notEqual(authIdentityToken(base)!.includes("lastVerifiedAt"), true, "timestamps are not part of the token");
});
