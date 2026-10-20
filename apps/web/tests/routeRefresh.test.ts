import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isRouteRefresh, mergeResolvedRecord, routeRefreshKey } from "../src/jobs/routeRefresh.js";

/** I-23: the open form must stay mounted when the route effect only refreshes the same record. */

const record = (localUpdatedAt: string, syncStatus = "Draft", clientUuid = "uuid-1") => ({ clientUuid, localUpdatedAt, syncStatus, marker: Math.random() });
const key = (over: Partial<Parameters<typeof routeRefreshKey>[0]> = {}) => routeRefreshKey({ authStatus: "verified", authorityGeneration: 3, verifiedAt: "2026-10-08T08:00:00.000Z", clientUuid: "uuid-1", ...over });

test("same record, same authority: a refresh keeps the form mounted", () => {
  assert.equal(isRouteRefresh(record("2026-10-08T08:00:00.000Z"), "uuid-1", key(), key()), true);
});

test("anything that changes authority or route is not a refresh and resets as before", () => {
  const shown = record("2026-10-08T08:00:00.000Z");
  assert.equal(isRouteRefresh(undefined, "uuid-1", key(), key()), false, "nothing shown yet");
  assert.equal(isRouteRefresh(shown, "uuid-2", key(), key()), false, "shown record is not this route's");
  assert.equal(isRouteRefresh(shown, "uuid-1", undefined, key()), false, "no resolution recorded yet");
  assert.equal(isRouteRefresh(shown, "uuid-1", key(), key({ authStatus: "offline-unverified" })), false, "auth status changed");
  assert.equal(isRouteRefresh(shown, "uuid-1", key(), key({ authorityGeneration: 4 })), false, "authority generation changed");
  assert.equal(isRouteRefresh(shown, "uuid-1", key(), key({ verifiedAt: "2026-10-08T09:00:00.000Z" })), false, "re-verified");
  assert.equal(isRouteRefresh(shown, "uuid-1", key(), key({ clientUuid: "uuid-2" })), false, "another inspection");
});

test("a late, older resolution never overwrites a newer save", () => {
  const newer = record("2026-10-08T08:00:02.000Z");
  const older = record("2026-10-08T08:00:01.000Z");
  assert.equal(mergeResolvedRecord(newer, older), newer);
});

test("an identical resolution keeps the object already shown (no re-render churn, no form reset)", () => {
  const shown = record("2026-10-08T08:00:00.000Z", "Draft");
  const same = record("2026-10-08T08:00:00.000Z", "Draft");
  assert.equal(mergeResolvedRecord(shown, same), shown);
});

test("a newer version, a status change, another record or an unreadable time takes the resolution", () => {
  const shown = record("2026-10-08T08:00:00.000Z", "Pending");
  const newer = record("2026-10-08T08:00:05.000Z", "Pending");
  assert.equal(mergeResolvedRecord(shown, newer), newer);
  const synced = record("2026-10-08T08:00:00.000Z", "Synced");
  assert.equal(mergeResolvedRecord(shown, synced), synced, "same timestamp but Synced: the status change must show");
  const other = record("2026-10-08T07:00:00.000Z", "Draft", "uuid-9");
  assert.equal(mergeResolvedRecord(shown, other), other);
  const broken = record("not-a-date");
  assert.equal(mergeResolvedRecord(shown, broken), broken, "fail closed to the freshly resolved record");
  assert.equal(mergeResolvedRecord(undefined, newer), newer);
});

test("all nine route effects use the refresh guard (wiring)", () => {
  const app = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
  assert.equal((app.match(/isRouteRefresh\(/g) ?? []).length, 9, "Hydrant, Smoke, Intercom, Roller, Portable, Riser, Sprinkler, Fire Alarm, FM200");
  assert.equal((app.match(/mergeResolvedRecord\(/g) ?? []).length, 11, "nine route resolutions plus FM200 list refresh and post-save refresh");
});
