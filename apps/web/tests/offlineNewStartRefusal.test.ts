import assert from "node:assert/strict";
import test from "node:test";
import { OFFLINE_START_MAX_AGE_MS, OFFLINE_START_REFUSAL_MESSAGE, offlineNewStartRefusal, offlineStartAllowed } from "../src/jobs/offlineStartReadiness.js";

/** OA-3: every system uses the same offline-start rule. */
const SYSTEMS = ["automatic_sprinkler", "hose_reel", "co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression", "dry_wet_riser", "fire_alarm_detector", "hydrant", "portable_fire_extinguisher", "smoke_ventilation", "fire_intercom", "fire_rated_roller_shutter"];
const now = Date.parse("2026-10-20T12:00:00.000Z");
const at = (ms: number) => new Date(now - ms).toISOString();

test("the pure rule is identical for all 12 systems: fresh passes; stale, future, accepted and missing are refused", () => {
  for (const key of SYSTEMS) {
    const fresh = { jobId: "j", confirmedAt: at(1000), acceptedSystemKeys: [] as string[] };
    assert.equal(offlineStartAllowed(fresh, key, now), true, `${key} fresh`);
    assert.equal(offlineStartAllowed({ ...fresh, confirmedAt: at(OFFLINE_START_MAX_AGE_MS + 1) }, key, now), false, `${key} stale`);
    assert.equal(offlineStartAllowed({ ...fresh, confirmedAt: at(-60_000) }, key, now), false, `${key} future`);
    assert.equal(offlineStartAllowed({ ...fresh, acceptedSystemKeys: [key] }, key, now), false, `${key} already accepted`);
    assert.equal(offlineStartAllowed(undefined, key, now), false, `${key} missing`);
  }
});

test("the gate refuses only a never-opened system with the server unreachable and no recent confirmation", async () => {
  for (const key of SYSTEMS) {
    const deny = async () => false; const allow = async () => true;
    const base = { jobId: "j", systemKey: key };
    assert.equal(await offlineNewStartRefusal({ ...base, hasLocalWork: false, serverAskable: false }, deny), OFFLINE_START_REFUSAL_MESSAGE, `${key} refused`);
    assert.equal(await offlineNewStartRefusal({ ...base, hasLocalWork: false, serverAskable: false }, allow), undefined, `${key} prepared`);
    assert.equal(await offlineNewStartRefusal({ ...base, hasLocalWork: true, serverAskable: false }, deny), undefined, `${key} existing work still opens`);
    assert.equal(await offlineNewStartRefusal({ ...base, hasLocalWork: false, serverAskable: true }, deny), undefined, `${key} online keeps its normal check`);
  }
});

test("the confirmation callback receives the exact job and system", async () => {
  const calls: string[] = [];
  await offlineNewStartRefusal({ jobId: "job-9", systemKey: "hose_reel", hasLocalWork: false, serverAskable: false }, async (j, s) => { calls.push(`${j}|${s}`); return true; });
  assert.deepEqual(calls, ["job-9|hose_reel"]);
});

test("the server counts as askable only when verified, the browser is online and no recent failure was seen", async () => {
  const { isServerAskable } = await import("../src/jobs/offlineStartReadiness.js");
  const ok = { verified: true, browserOnline: true, healthUnreachable: false, recentlyUnreachable: false };
  assert.equal(isServerAskable(ok), true);
  assert.equal(isServerAskable({ ...ok, verified: false }), false);
  assert.equal(isServerAskable({ ...ok, browserOnline: false }), false, "verified but the browser says offline (mid-session drop)");
  assert.equal(isServerAskable({ ...ok, healthUnreachable: true }), false, "Wi-Fi up, API down");
  assert.equal(isServerAskable({ ...ok, recentlyUnreachable: true }), false);
});
