import assert from "node:assert/strict";
import test from "node:test";
import { resolveHoseReelAuthority } from "../src/hoseReel/hoseReelAuthority.js";
import { resolveCo2Authority } from "../src/co2/co2Authority.js";
import { resolveFm200Authority } from "../src/fm200/fm200Authority.js";
import { resolveWetChemicalAuthority } from "../src/wetChemical/wetChemicalAuthority.js";
import { resolveFireIntercomRoute } from "../src/fireIntercom/fireIntercomResolution.js";
import { resolveHydrantRoute } from "../src/hydrant/hydrantResolution.js";
import { resolveSmokeVentilationRoute } from "../src/smokeVentilation/smokeVentilationResolution.js";

/**
 * A mid-session connectivity drop (status "verified", not "offline-unverified")
 * must fall back to the local draft instead of failing closed, matching the
 * offline-unverified branch these resolvers already handle correctly. A
 * genuine data-integrity mismatch (a plain Error thrown deliberately by the
 * resolver's own checks) must still fail closed. Found live during a Level 3
 * check: killing network mid-session while reopening a Hose Reel draft threw
 * "Failed to fetch" and blocked the technician from their own local data,
 * even though the data itself was never lost.
 */

const hoseReelLocal = { jobId: "job-1" } as never;

test("Hose Reel: a network TypeError falls back to the local draft when one exists", async () => {
  const result = await resolveHoseReelAuthority("verified", "requested", hoseReelLocal, {
    findSummary: async () => { throw new TypeError("Failed to fetch"); },
    loadDetail: async () => { throw new Error("should not be called"); }
  });
  assert.deepEqual(result, { kind: "local", record: hoseReelLocal });
});

test("Hose Reel: a deliberate integrity error still fails closed", async () => {
  const result = await resolveHoseReelAuthority("verified", "requested", hoseReelLocal, {
    findSummary: async () => ({ systemKey: "hose_reel", instanceKey: "primary", zoneId: null, locationId: null, displaySequence: 1 } as never),
    loadDetail: async () => { throw new Error("Accepted Hose Reel detail malformed"); }
  });
  assert.equal(result.kind, "server-unavailable");
});

test("Hose Reel: no local draft still reports server-unavailable on network failure", async () => {
  const result = await resolveHoseReelAuthority("verified", "requested", undefined, {
    findSummary: async () => { throw new TypeError("Failed to fetch"); },
    loadDetail: async () => { throw new TypeError("Failed to fetch"); }
  });
  assert.equal(result.kind, "server-unavailable");
});

const co2Local = { jobId: "job-1", instanceKey: "primary", configuredLocationId: "loc-1", configuredZoneId: null, displaySequence: 1 } as never;

test("CO2: a network TypeError falls back to the local draft when one exists", async () => {
  const result = await resolveCo2Authority("verified", "requested", co2Local, {
    findSummary: async () => { throw new TypeError("Failed to fetch"); },
    loadDetail: async () => { throw new Error("should not be called"); }
  });
  assert.deepEqual(result, { kind: "local", record: co2Local });
});

const fm200Local = { jobId: "job-1", instanceKey: "primary", configuredLocationId: "loc-1", configuredZoneId: null, displaySequence: 1 } as never;

test("FM200: a network TypeError falls back to the local draft when one exists", async () => {
  const result = await resolveFm200Authority("verified", "requested", fm200Local, {
    findSummary: async () => { throw new TypeError("Failed to fetch"); },
    loadDetail: async () => { throw new Error("should not be called"); }
  });
  assert.deepEqual(result, { kind: "local", record: fm200Local });
});

const wetChemicalLocal = { jobId: "job-1", instanceKey: "primary" } as never;

test("Wet Chemical: a network TypeError falls back to the local draft when one exists", async () => {
  const result = await resolveWetChemicalAuthority("verified", "requested", wetChemicalLocal, {
    findSummary: async () => { throw new TypeError("Failed to fetch"); },
    loadDetail: async () => { throw new Error("should not be called"); }
  });
  assert.deepEqual(result, { kind: "local", record: wetChemicalLocal });
});

/**
 * The `*Resolution.ts` route resolvers (as opposed to the `*Authority.ts` ones above) fetch their
 * local record through an injectable `getLocal`, so the same mid-session-TypeError fallback is
 * covered directly here for the three that share that shape (fireIntercom/hydrant/smokeVentilation
 * resolveXRoute). fireAlarmResolution.ts and portableFireExtinguisher.ts got the identical one-line
 * fix but their local lookup is not dependency-injected (hardcoded to the real IndexedDB-backed
 * repository), so they are not unit-tested here — see the merge report.
 */
const fireIntercomLocal = { jobId: "job-1", syncStatus: "Synced" } as never;

test("Fire Intercom: a network TypeError falls back to the local draft when one exists", async () => {
  const result = await resolveFireIntercomRoute(
    "requested-uuid", undefined, "verified",
    async () => fireIntercomLocal,
    async () => { throw new TypeError("Failed to fetch"); },
    async () => { throw new Error("should not be called"); }
  );
  assert.deepEqual(result, { kind: "local", record: fireIntercomLocal });
});

const hydrantLocal = { jobId: "job-1", syncStatus: "Synced" } as never;

test("Hydrant: a network TypeError falls back to the local draft when one exists", async () => {
  const result = await resolveHydrantRoute(
    "requested-uuid", undefined, "verified",
    async () => hydrantLocal,
    async () => { throw new TypeError("Failed to fetch"); },
    async () => { throw new Error("should not be called"); }
  );
  assert.deepEqual(result, { kind: "local", record: hydrantLocal });
});

const smokeVentilationLocal = { jobId: "job-1", syncStatus: "Synced" } as never;

test("Smoke Ventilation: a network TypeError falls back to the local draft when one exists", async () => {
  const result = await resolveSmokeVentilationRoute(
    "requested-uuid", undefined, "verified",
    async () => smokeVentilationLocal,
    async () => { throw new TypeError("Failed to fetch"); },
    async () => { throw new Error("should not be called"); }
  );
  assert.deepEqual(result, { kind: "local", record: smokeVentilationLocal });
});
