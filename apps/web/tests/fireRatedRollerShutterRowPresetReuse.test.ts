import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredFireRatedRollerShutterRows } from "../src/fireRatedRollerShutter/fireRatedRollerShutterRepository";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

const locationId = "11111111-1111-4111-8111-111111111111";
const enabledSystemId = "22222222-2222-4222-8222-222222222222";
function system(presetRowCount: number, rowPreset: unknown): JobSystemSnapshot {
  return { enabledSystemId, systemKey: "fire_rated_roller_shutter", displayName: "Fire Rated Roller Shutter",
    sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [{ id: locationId, enabledSystemId,
      zoneId: null, key: "general", displayName: "General", sortOrder: 1, presetRowCount, rowPreset }] };
}

test("a new Roller Shutter inspection reads both identity fields from each approved preset row", () => {
  const rows = configuredFireRatedRollerShutterRows(system(2, { rows: [
    { assetReference: "RS-01", locationText: "North lobby" },
    { assetReference: "RS-02", locationText: "Loading bay" }
  ] }));
  assert.deepEqual(rows.map(({ assetReference, locationText, source, configuredRowOrdinal }) =>
    ({ assetReference, locationText, source, configuredRowOrdinal })), [
    { assetReference: "RS-01", locationText: "North lobby", source: "configured", configuredRowOrdinal: 1 },
    { assetReference: "RS-02", locationText: "Loading bay", source: "configured", configuredRowOrdinal: 2 }
  ]);
});

test("malformed or missing Roller Shutter row presets use safe legacy defaults", () => {
  for (const preset of [undefined, null, {}, { rows: "wrong" }, { rows: [{ assetReference: "RS-01" }] },
    { rows: [{ assetReference: "RS-01", locationText: "" }] }, { rows: [{ assetReference: "RS-01", locationText: "Lobby", extra: "bad" }] }]) {
    const rows = configuredFireRatedRollerShutterRows(system(1, preset));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.assetReference, "");
    assert.equal(rows[0]?.locationText, "General");
  }
});

test("a partial Roller Shutter preset does not produce a mixed configured layout", () => {
  const rows = configuredFireRatedRollerShutterRows(system(2, { rows: [{ assetReference: "RS-01", locationText: "Lobby" }] }));
  assert.deepEqual(rows.map(({ assetReference, locationText }) => ({ assetReference, locationText })), [
    { assetReference: "", locationText: "General" }, { assetReference: "", locationText: "General" }
  ]);
});

test("a saved zoned layout pre-fills each row's zone heading for schema 2 and omits it for schema 1", () => {
  const zoned = system(3, { rows: [
    { assetReference: "RS-01", locationText: "Lobby", zoneText: "Zone 1" },
    { assetReference: "RS-02", locationText: "Dock", zoneText: "Zone 1" },
    { assetReference: "RS-03", locationText: "Roof", zoneText: "Zone 2" }
  ] });
  assert.deepEqual(configuredFireRatedRollerShutterRows(zoned).map((row) => [row.locationText, row.zoneText]), [["Lobby", "Zone 1"], ["Dock", "Zone 1"], ["Roof", "Zone 2"]]);
  assert.deepEqual(configuredFireRatedRollerShutterRows(zoned, 2).map((row) => row.zoneText), ["Zone 1", "Zone 1", "Zone 2"]);
  const legacyRows = configuredFireRatedRollerShutterRows(zoned, 1);
  assert.ok(legacyRows.every((row) => !("zoneText" in row)), "schema-1 rows carry no zoneText key");
  assert.deepEqual(legacyRows.map((row) => [row.assetReference, row.locationText]), [["", "General"], ["", "General"], ["", "General"]],
    "a schema-1 record reads a zoned preset the way a pre-zone client did: default labels");
});

test("a legacy two-field layout gives schema-2 rows a blank zone heading, and malformed zone data fails closed", () => {
  const legacy = system(1, { rows: [{ assetReference: "RS-01", locationText: "Lobby" }] });
  assert.equal(configuredFireRatedRollerShutterRows(legacy)[0]?.zoneText, "");
  for (const rows of [
    [{ assetReference: "RS-01", locationText: "Lobby", zoneText: 7 }],
    [{ assetReference: "RS-01", locationText: "Lobby", zoneText: "z".repeat(201) }],
    [{ assetReference: "RS-01", locationText: "Lobby", zoneText: "Zone 1", extra: "bad" }]
  ]) {
    const row = configuredFireRatedRollerShutterRows(system(1, { rows }))[0]!;
    assert.equal(row.locationText, "General", "malformed presets fall back to the safe default");
    assert.equal(row.zoneText, "");
  }
});
