import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { OFFLINE_START_MAX_AGE_MS, jobReadyForOffline, offlineStartAllowed } from "../src/jobs/offlineStartReadiness.js";

/** I-02 / A1 rule and wiring. The resolvers themselves are exercised against real IndexedDB in offline-start-readiness.spec.ts. */

const now = Date.parse("2026-10-08T12:00:00.000Z");
const at = (msAgo: number) => new Date(now - msAgo).toISOString();
const confirmation = (msAgo: number, accepted: string[] = []) => ({ jobId: "j", confirmedAt: at(msAgo), acceptedSystemKeys: accepted });

test("allowed only with a fresh confirmation that lists nothing accepted for the system", () => {
  assert.equal(offlineStartAllowed(undefined, "hydrant", now), false, "never confirmed");
  assert.equal(offlineStartAllowed(confirmation(1000), "hydrant", now), true);
  assert.equal(offlineStartAllowed(confirmation(1000, ["hydrant"]), "hydrant", now), false, "already accepted on the server");
  assert.equal(offlineStartAllowed(confirmation(1000, ["fire_alarm_detector"]), "hydrant", now), true, "another system does not block");
  assert.equal(offlineStartAllowed(confirmation(OFFLINE_START_MAX_AGE_MS), "hydrant", now), true, "exactly at the limit");
  assert.equal(offlineStartAllowed(confirmation(OFFLINE_START_MAX_AGE_MS + 1), "hydrant", now), false, "stale");
  assert.equal(offlineStartAllowed(confirmation(-60_000), "hydrant", now), false, "a confirmation from the future (clock change) fails closed");
});

test("job-card readiness follows the same freshness rule", () => {
  assert.equal(jobReadyForOffline(confirmation(1000), now), true);
  assert.equal(jobReadyForOffline(confirmation(OFFLINE_START_MAX_AGE_MS + 1), now), false);
  assert.equal(jobReadyForOffline(undefined, now), false);
});

test("wiring: every gated system consults the confirmation; confirmations are recorded when the server list loads", () => {
  const src = (p: string) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
  for (const [file, needle] of [
    ["hydrant/hydrantResolution.ts", "offlineStartConfirmed(job.id, system.systemKey)"],
    ["smokeVentilation/smokeVentilationResolution.ts", "offlineStartConfirmed(job.id, system.systemKey)"],
    ["fireIntercom/fireIntercomResolution.ts", "offlineStartConfirmed(job.id, system.systemKey)"],
    ["fireRatedRollerShutter/fireRatedRollerShutterResolution.ts", "offlineStartConfirmed(job.id, system.systemKey)"],
    ["dryWetRiser/dryWetRiserResolution.ts", "offlineStartConfirmed(job.id, system.systemKey)"],
    ["fireAlarm/fireAlarmResolution.ts", "offlineStartConfirmed(job.id, system.systemKey)"],
    ["portableFireExtinguisher/portableFireExtinguisher.ts", "isOfflineStartConfirmed(job.id,key)"]
  ] as const) assert.ok(src(file).includes(needle), file);
  const app = src("App.tsx");
  assert.match(app, /recordOfflineStartConfirmations\(cachedJobs, summaries\)/);
  assert.match(app, /offlineReadyJobIds=\{offlineReadyJobIds\}/);
});
