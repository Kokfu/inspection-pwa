import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredRowPresets, normalizeDetectorRows } from "../src/co2/detectorRowCount";
import type { Co2ConfiguredInstance, Co2Responses } from "../src/co2/co2Types";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

/**
 * The actual "next visit pre-fills automatically" payoff of the location-proposal redesign: a
 * customer location's `rowPreset.rows` (written by Approve, via `applyLocationProposalPatch`'s
 * `update-format` merge on the server) must pre-fill newly-created "configured" detector rows with the
 * saved alarmZone/location text -- not just the row count, which `configuredDetectorCount` already
 * handled before this change.
 */
const locationId = "11111111-1111-4111-8111-111111111111";
const enabledSystemId = "22222222-2222-4222-8222-222222222222";
const instance = { instanceKey: `location:${locationId}`, displaySequence: 1, zone: null,
  location: { id: locationId, key: "plant", displayName: "Plant Room", sortOrder: 1 } } satisfies Co2ConfiguredInstance;
function system(presetRowCount: number, rowPreset: unknown): JobSystemSnapshot {
  return { enabledSystemId, systemKey: "co2_fire_extinguisher", displayName: "CO2", sortOrder: 1,
    definitionStatus: "confirmed", zones: [], locations: [{ ...instance.location, enabledSystemId, zoneId: null, presetRowCount, rowPreset }] };
}
const empty: Co2Responses = { controlPanelLocation: "", detectorRows: [], chargerAndBatteries: {}, physicalOutlook: {}, mainFunctionKeys: {}, comments: "" };

test("configuredRowPresets reads {rows:[...]} saved by an approved update-format patch", () => {
  const rowPreset = { rows: [{ alarmZone: "Zone A", location: "Zone A Room" }, { alarmZone: "Zone B", location: "Zone B Room" }] };
  assert.deepEqual(configuredRowPresets(system(2, rowPreset), instance), rowPreset.rows);
});

test("a brand-new job's blank draft pre-fills configured rows with the saved format, not blank defaults", () => {
  const rowPreset = { rows: [{ alarmZone: "Zone A", location: "Zone A Room" }, { alarmZone: "Zone B", location: "Zone B Room" }] };
  const normalized = normalizeDetectorRows(empty, system(2, rowPreset), instance);
  assert.deepEqual(normalized.detectorRows.map((row) => ({ alarmZone: row.alarmZone, location: row.location, source: row.source })), [
    { alarmZone: "Zone A", location: "Zone A Room", source: "configured" },
    { alarmZone: "Zone B", location: "Zone B Room", source: "configured" }
  ]);
});

test("fails closed to blank defaults on a malformed or missing rowPreset -- never crashes", () => {
  for (const malformed of [undefined, null, {}, { rows: "not-an-array" }, { rows: [{ alarmZone: 1, location: 2 }] }, "garbage"]) {
    const normalized = normalizeDetectorRows(empty, system(1, malformed), instance);
    assert.equal(normalized.detectorRows.length, 1);
    assert.equal(normalized.detectorRows[0]?.alarmZone, ""); // falls back to instance.zone?.displayName ?? ""
    assert.equal(normalized.detectorRows[0]?.location, "Plant Room"); // falls back to instance.location.displayName
  }
});

test("fewer saved rows than presetRowCount: the extra configured rows fall back to blank defaults, never crash", () => {
  const rowPreset = { rows: [{ alarmZone: "Zone A", location: "Zone A Room" }] };
  const normalized = normalizeDetectorRows(empty, system(3, rowPreset), instance);
  assert.equal(normalized.detectorRows.length, 3);
  assert.deepEqual(normalized.detectorRows.map((row) => row.alarmZone), ["Zone A", "", ""]);
});

test("normalizeDetectorRows only fills the GAP at creation time -- it never overwrites an already-stored row's content on a later reload", () => {
  const rowPreset = { rows: [{ alarmZone: "Zone A", location: "Zone A Room" }] };
  const firstLoad = normalizeDetectorRows(empty, system(1, rowPreset), instance);
  const edited = { ...firstLoad, detectorRows: firstLoad.detectorRows.map((row) => ({ ...row, alarmZone: "Technician Edited" })) };
  const changedPreset = { rows: [{ alarmZone: "Zone Z (changed after the fact)", location: "Zone Z Room" }] };
  const secondLoad = normalizeDetectorRows(edited, system(1, changedPreset), instance);
  assert.equal(secondLoad.detectorRows[0]?.alarmZone, "Technician Edited", "an existing configured row's content is never retroactively rewritten");
});
