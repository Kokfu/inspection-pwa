import assert from "node:assert/strict";
import test from "node:test";
import { resolveHoseReelAuthority } from "../src/hoseReel/hoseReelAuthority.js";
import { resolveCo2Authority } from "../src/co2/co2Authority.js";
import { resolveFm200Authority } from "../src/fm200/fm200Authority.js";
import { resolveWetChemicalAuthority } from "../src/wetChemical/wetChemicalAuthority.js";
import { resolveFireIntercomRoute } from "../src/fireIntercom/fireIntercomResolution.js";
import { resolveHydrantRoute } from "../src/hydrant/hydrantResolution.js";
import { resolveSmokeVentilationRoute } from "../src/smokeVentilation/smokeVentilationResolution.js";
import { resolveFireAlarmRoute } from "../src/fireAlarm/fireAlarmResolution.js";
import { resolvePortableRoute } from "../src/portableFireExtinguisher/portableFireExtinguisher.js";
import { resolveSmokeVentilationOpenTarget } from "../src/smokeVentilation/smokeVentilationResolution.js";
import { resolveFireIntercomOpenTarget } from "../src/fireIntercom/fireIntercomResolution.js";
import { resolveHydrantOpenTarget } from "../src/hydrant/hydrantResolution.js";
import { resolveFireRatedRollerShutterOpenTarget } from "../src/fireRatedRollerShutter/fireRatedRollerShutterResolution.js";
import { loadAllPages } from "../src/hoseReel/serverMasterSystemInspectionApi.js";
import { isServerUnreachable, ServerUnreachableError } from "../src/jobs/serverReachability.js";

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
 * covered directly here without opening IndexedDB.
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

const fireAlarmLocal = { jobId: "job-1", syncStatus: "Synced" } as never;

test("Fire Alarm: a network TypeError falls back to the local record", async () => {
  const result = await resolveFireAlarmRoute("requested-uuid", "job-1", "verified",
    async () => { throw new TypeError("Failed to fetch"); },
    async () => fireAlarmLocal);
  assert.deepEqual(result, { kind: "local", record: fireAlarmLocal });
});

test("Fire Alarm: a non-network error does not fall back", async () => {
  const result = await resolveFireAlarmRoute("requested-uuid", "job-1", "verified",
    async () => { throw new Error("Malformed accepted detail"); },
    async () => fireAlarmLocal);
  assert.equal(result.kind, "server-unavailable");
});

const portableLocal = { jobId: "job-1", syncStatus: "Synced" } as never;

test("Portable Fire Extinguisher: a network TypeError falls back to the local record", async () => {
  const result = await resolvePortableRoute("requested-uuid", "requested-uuid", "verified",
    async () => portableLocal,
    async () => { throw new Error("should not be called"); },
    async () => { throw new TypeError("Failed to fetch"); });
  assert.deepEqual(result, { kind: "local", record: portableLocal });
});

test("Portable Fire Extinguisher: a non-network error does not fall back", async () => {
  const result = await resolvePortableRoute("requested-uuid", "requested-uuid", "verified",
    async () => portableLocal,
    async () => { throw new Error("should not be called"); },
    async () => { throw new Error("Malformed accepted detail"); });
  assert.equal(result.kind, "server-unavailable");
});

/**
 * Opening a system from the job page ("Continue inspection") goes through the *OpenTarget* resolvers,
 * which run before the route resolvers above. They used to ask the server first and return
 * server-unavailable ("Failed to fetch") on ANY failure, so a technician whose phone still reported a
 * connection, but whose server was unreachable (weak signal, the on-premise server restarting), was locked
 * out of their own saved draft. Found on a physical phone: Wi-Fi up, server down, header still "Online".
 * Rule: an unreachable server (network TypeError, or a 502/504 gateway answer) behaves like offline;
 * a deliberate server answer or integrity failure still fails closed.
 */
type OpenResult = { kind: string; record?: unknown; message?: string };
const openJob = { id: "job-1", status: "open" } as never;
const openCases: Array<[string, string, (...args: never[]) => Promise<OpenResult>]> = [
  ["Smoke Ventilation", "smoke_ventilation", resolveSmokeVentilationOpenTarget as never],
  ["Fire Intercom", "fire_intercom", resolveFireIntercomOpenTarget as never],
  ["Hydrant", "hydrant", resolveHydrantOpenTarget as never],
  ["Fire Rated Roller Shutter", "fire_rated_roller_shutter", resolveFireRatedRollerShutterOpenTarget as never]
];
const gateway = () => new ServerUnreachableError("Server inspection listing failed: 502", 502);

for (const [name, systemKey, resolve] of openCases) {
  const system = { systemKey } as never;
  const savedDraft = { clientUuid: "draft-1", jobId: "job-1", syncStatus: "Draft" } as never;
  const run = async (findServer: () => Promise<unknown>, local: unknown) => {
    const calls = { catalog: 0, created: 0 };
    const value = await resolve(openJob, system, undefined as never, "verified" as never,
      (async () => { calls.catalog += 1; return {} as never; }) as never,
      findServer as never,
      (async () => local) as never,
      (async () => { calls.created += 1; return { created: true }; }) as never);
    return { value, calls };
  };

  test(name + " open target: a network TypeError opens the saved local draft", async () => {
    const { value, calls } = await run(async () => { throw new TypeError("Failed to fetch"); }, savedDraft);
    assert.deepEqual(value, { kind: "local", record: savedDraft });
    assert.equal(calls.created, 0);
  });

  test(name + " open target: a gateway failure (502) opens the saved local draft", async () => {
    const { value } = await run(async () => { throw gateway(); }, savedDraft);
    assert.deepEqual(value, { kind: "local", record: savedDraft });
  });

  test(name + " open target: unreachable server with no local record is not-cached and creates no draft", async () => {
    const { value, calls } = await run(async () => { throw new TypeError("Failed to fetch"); }, undefined);
    assert.deepEqual(value, { kind: "not-cached" });
    assert.equal(calls.created, 0, "a draft must not be created blindly: it may already be accepted elsewhere");
    assert.equal(calls.catalog, 0);
  });

  test(name + " open target: a deliberate server error still fails closed, even with a local draft", async () => {
    const { value, calls } = await run(async () => { throw new Error("Server inspection listing failed: 500"); }, savedDraft);
    assert.equal(value.kind, "server-unavailable");
    assert.equal(value.message, "Server inspection listing failed: 500");
    assert.equal(calls.created, 0);
  });

  test(name + " open target: a reachable server that reports no record still creates the local draft", async () => {
    const { value, calls } = await run(async () => undefined, undefined);
    assert.deepEqual(value, { kind: "local", record: { created: true } });
    assert.equal(calls.created, 1);
  });
}

test("isServerUnreachable: network failures and gateway answers only", () => {
  assert.equal(isServerUnreachable(new TypeError("Failed to fetch")), true);
  assert.equal(isServerUnreachable(gateway()), true);
  assert.equal(isServerUnreachable(new Error("Server inspection listing failed: 500")), false);
  assert.equal(isServerUnreachable(new Error("Sign in required to check server inspections")), false);
  assert.equal(isServerUnreachable("Failed to fetch"), false);
  assert.equal(isServerUnreachable(undefined), false);
});

const reply = (status: number) => (async () => ({ status, ok: status >= 200 && status < 300, json: async () => ({}) })) as never;

test("server inspection listing: 502 and 504 are reported as an unreachable server", async () => {
  for (const status of [502, 504]) {
    await assert.rejects(loadAllPages(new URLSearchParams(), "check server inspections", reply(status)), (error: unknown) =>
      error instanceof ServerUnreachableError && error.status === status && error.message === "Server inspection listing failed: " + status);
  }
});

test("server inspection listing: other HTTP failures, including a deliberate 503, are NOT treated as unreachable", async () => {
  for (const status of [400, 404, 500, 503]) {
    await assert.rejects(loadAllPages(new URLSearchParams(), "check server inspections", reply(status)), (error: unknown) =>
      error instanceof Error && !isServerUnreachable(error) && error.message === "Server inspection listing failed: " + status);
  }
  for (const status of [401, 403]) {
    await assert.rejects(loadAllPages(new URLSearchParams(), "check server inspections", reply(status)), (error: unknown) =>
      error instanceof Error && !isServerUnreachable(error) && error.message === "Sign in required to check server inspections");
  }
});

test("server inspection listing: a rejected fetch stays a TypeError (unreachable)", async () => {
  await assert.rejects(loadAllPages(new URLSearchParams(), "check server inspections", (async () => { throw new TypeError("Failed to fetch"); }) as never),
    (error: unknown) => error instanceof TypeError && isServerUnreachable(error));
});

test("Hose Reel / CO2 / FM200 / Wet Chemical authority: a gateway failure also falls back to the local draft", async () => {
  const down = async () => { throw gateway(); };
  assert.deepEqual(await resolveHoseReelAuthority("verified", "requested", hoseReelLocal, { findSummary: down, loadDetail: down as never }), { kind: "local", record: hoseReelLocal });
  assert.deepEqual(await resolveCo2Authority("verified", "requested", co2Local, { findSummary: down, loadDetail: down as never }), { kind: "local", record: co2Local });
  assert.deepEqual(await resolveFm200Authority("verified", "requested", fm200Local, { findSummary: down, loadDetail: down as never }), { kind: "local", record: fm200Local });
  assert.deepEqual(await resolveWetChemicalAuthority("verified", "requested", wetChemicalLocal, { findSummary: down, loadDetail: down as never }), { kind: "local", record: wetChemicalLocal });
});
