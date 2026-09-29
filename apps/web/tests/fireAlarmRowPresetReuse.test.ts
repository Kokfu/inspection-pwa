import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredRows } from "../src/fireAlarm/fireAlarmRepository";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

/**
 * The location-proposal patch model, extended to Fire Alarm: `general-primary` /
 * `general-secondary` are the two zone-free pseudo-locations `applyLocationProposalPatch` bootstraps
 * (locationConfiguration.ts), each carrying `rowPreset.fireAlarmTable` (routing, required) plus an
 * optional per-row `rows[]` (the saved "format for next visit"). `configuredRows()` must pre-fill
 * newly-created configured rows in the RIGHT table from that preset -- additive only;
 * `FireAlarmPrimaryDeviceRow` / `FireAlarmSecondaryAlarmDeviceRow`'s serialized shapes are unchanged.
 */
const primaryLocationId = "11111111-1111-4111-8111-111111111111";
const secondaryLocationId = "22222222-2222-4222-8222-222222222222";
const enabledSystemId = "33333333-3333-4333-8333-333333333333";

function system(locations: Array<{ id: string; presetRowCount: number; rowPreset: unknown; displayName?: string }>): JobSystemSnapshot {
  return {
    enabledSystemId, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System", sortOrder: 1,
    definitionStatus: "confirmed", zones: [],
    locations: locations.map((location, index) => ({
      id: location.id, enabledSystemId, zoneId: null, key: `loc-${index}`,
      displayName: location.displayName ?? "Primary Devices",
      sortOrder: index + 1, presetRowCount: location.presetRowCount, rowPreset: location.rowPreset
    }))
  };
}

test("a new Fire Alarm inspection reads primary rows from their own table's preset", () => {
  const { primary, secondary } = configuredRows(system([{ id: primaryLocationId, presetRowCount: 2, rowPreset: {
    fireAlarmTable: "primary", rows: [
      { assetReference: "FA-01", alarmZone: "Zone A", location: "Level 1 Lobby" },
      { assetReference: "FA-02", alarmZone: "Zone B", location: "Level 2 Corridor" }
    ]
  } }]));
  assert.equal(secondary.length, 0);
  assert.deepEqual(primary.map(({ assetReference, alarmZone, location, source, configuredLocationId, configuredRowOrdinal }) =>
    ({ assetReference, alarmZone, location, source, configuredLocationId, configuredRowOrdinal })), [
    { assetReference: "FA-01", alarmZone: "Zone A", location: "Level 1 Lobby", source: "configured", configuredLocationId: primaryLocationId, configuredRowOrdinal: 1 },
    { assetReference: "FA-02", alarmZone: "Zone B", location: "Level 2 Corridor", source: "configured", configuredLocationId: primaryLocationId, configuredRowOrdinal: 2 }
  ]);
});

test("a new Fire Alarm inspection reads secondary rows from their own table's preset, never the primary table", () => {
  const { primary, secondary } = configuredRows(system([{ id: secondaryLocationId, displayName: "Secondary Alarm Devices", presetRowCount: 1, rowPreset: {
    fireAlarmTable: "secondary", rows: [{ assetReference: "FA-10", location: "Guard House Panel" }]
  } }]));
  assert.equal(primary.length, 0);
  assert.deepEqual(secondary.map(({ assetReference, location, source }) => ({ assetReference, location, source })), [
    { assetReference: "FA-10", location: "Guard House Panel", source: "configured" }
  ]);
});

test("both tables can be configured at once, each routed by its own location's fireAlarmTable", () => {
  const { primary, secondary } = configuredRows(system([
    { id: primaryLocationId, presetRowCount: 1, rowPreset: { fireAlarmTable: "primary", rows: [{ assetReference: "FA-01", alarmZone: "Zone A", location: "Lobby" }] } },
    { id: secondaryLocationId, displayName: "Secondary Alarm Devices", presetRowCount: 1, rowPreset: { fireAlarmTable: "secondary", rows: [{ assetReference: "FA-10", location: "Guard House" }] } }
  ]));
  assert.equal(primary.length, 1); assert.equal(secondary.length, 1);
  assert.equal(primary[0]?.configuredLocationId, primaryLocationId);
  assert.equal(secondary[0]?.configuredLocationId, secondaryLocationId);
});

test("missing row routing (no fireAlarmTable) throws rather than silently defaulting", () => {
  assert.throws(() => configuredRows(system([{ id: primaryLocationId, presetRowCount: 1, rowPreset: {} }])));
  assert.throws(() => configuredRows(system([{ id: primaryLocationId, presetRowCount: 1, rowPreset: undefined }])));
});

test("malformed or missing Fire Alarm row presets fail closed to defaults, never crash", () => {
  for (const rowPreset of [
    { fireAlarmTable: "primary" },
    { fireAlarmTable: "primary", rows: "wrong" },
    { fireAlarmTable: "primary", rows: [{ assetReference: "FA-01", alarmZone: "Zone A" }] },
    { fireAlarmTable: "primary", rows: [{ assetReference: "FA-01", alarmZone: "Zone A", location: "Lobby", extra: "bad" }] }
  ]) {
    const { primary } = configuredRows(system([{ id: primaryLocationId, presetRowCount: 1, rowPreset }]));
    assert.equal(primary.length, 1);
    assert.equal(primary[0]?.assetReference, "");
    assert.equal(primary[0]?.alarmZone, "");
    assert.equal(primary[0]?.location, "Primary Devices");
  }
});

test("a partial Fire Alarm preset (fewer saved rows than presetRowCount) does not produce a mixed configured layout", () => {
  const { primary } = configuredRows(system([{ id: primaryLocationId, presetRowCount: 2, rowPreset: {
    fireAlarmTable: "primary", rows: [{ assetReference: "FA-01", alarmZone: "Zone A", location: "Lobby" }]
  } }]));
  assert.deepEqual(primary.map(({ assetReference, alarmZone, location }) => ({ assetReference, alarmZone, location })), [
    { assetReference: "", alarmZone: "", location: "Primary Devices" },
    { assetReference: "", alarmZone: "", location: "Primary Devices" }
  ]);
});

test("the pre-existing flat rowPreset.assetReference fallback still applies when no per-row preset is saved", () => {
  const { secondary } = configuredRows(system([{ id: secondaryLocationId, displayName: "Secondary Alarm Devices", presetRowCount: 1, rowPreset: { fireAlarmTable: "secondary", assetReference: "LEGACY-REF" } }]));
  assert.equal(secondary[0]?.assetReference, "LEGACY-REF");
  assert.equal(secondary[0]?.location, "Secondary Alarm Devices");
});

test("a secondary-shaped row saved against a primary location is refused by the preset parser (whole rows array dropped)", () => {
  const { primary } = configuredRows(system([{ id: primaryLocationId, presetRowCount: 1, rowPreset: {
    fireAlarmTable: "primary", rows: [{ assetReference: "FA-01", location: "Lobby" }]
  } }]));
  assert.equal(primary[0]?.assetReference, "", "malformed rows (missing alarmZone) fall back rather than partially applying");
  assert.equal(primary[0]?.location, "Primary Devices");
});
