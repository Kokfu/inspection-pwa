import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredDryWetRiserOutlets } from "../src/dryWetRiser/dryWetRiserRepository";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

/**
 * The Phase 1 location-proposal payoff ("Save as format for next visit"), extended to Dry/Wet Riser: a
 * customer location's `rowPreset.rows` must pre-fill newly-created "configured" Riser Outlet rows with
 * the saved assetReference/locationText -- additive only; `RiserOutlet`'s serialized shape (frozen,
 * V2 accepted production data) is unchanged.
 */
const locationId = "11111111-1111-4111-8111-111111111111";
const enabledSystemId = "22222222-2222-4222-8222-222222222222";
function system(presetRowCount: number, rowPreset: unknown): JobSystemSnapshot {
  return { enabledSystemId, systemKey: "dry_wet_riser", displayName: "Dry/Wet Riser", sortOrder: 1,
    definitionStatus: "confirmed", zones: [], locations: [{ id: locationId, enabledSystemId,
      zoneId: null, key: "riser-a", displayName: "Riser A", sortOrder: 1, presetRowCount, rowPreset }] };
}

test("a new Dry/Wet Riser inspection reads both identity fields from each approved preset row", () => {
  const rows = configuredDryWetRiserOutlets(system(2, { rows: [
    { assetReference: "RS-01", locationText: "Level 1" },
    { assetReference: "RS-02", locationText: "Level 2" }
  ] }), false);
  assert.deepEqual(rows.map(({ assetReference, locationText, source, configuredLocationId, configuredRowOrdinal }) =>
    ({ assetReference, locationText, source, configuredLocationId, configuredRowOrdinal })), [
    { assetReference: "RS-01", locationText: "Level 1", source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1 },
    { assetReference: "RS-02", locationText: "Level 2", source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 2 }
  ]);
});

test("malformed or missing Riser row presets fail closed to legacy defaults, never crash", () => {
  for (const preset of [undefined, null, {}, { rows: "wrong" }, { rows: [{ assetReference: "RS-01" }] },
    { rows: [{ assetReference: "RS-01", locationText: "" }] }, { rows: [{ assetReference: "RS-01", locationText: "Lvl", extra: "bad" }] }]) {
    const rows = configuredDryWetRiserOutlets(system(1, preset), false);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.assetReference, "");
    assert.equal(rows[0]?.locationText, "Riser A");
  }
});

test("a partial Riser preset (fewer saved rows than presetRowCount) does not produce a mixed configured layout", () => {
  const rows = configuredDryWetRiserOutlets(system(2, { rows: [{ assetReference: "RS-01", locationText: "Lvl 1" }] }), false);
  assert.deepEqual(rows.map(({ assetReference, locationText }) => ({ assetReference, locationText })), [
    { assetReference: "", locationText: "Riser A" }, { assetReference: "", locationText: "Riser A" }
  ]);
});

test("the pre-existing flat rowPreset.assetReference fallback still applies when no per-row preset is saved", () => {
  const rows = configuredDryWetRiserOutlets(system(1, { assetReference: "LEGACY-REF" }), false);
  assert.equal(rows[0]?.assetReference, "LEGACY-REF");
  assert.equal(rows[0]?.locationText, "Riser A");
});

test("V7 configured rows also carry an empty fieldRemarks object; V1-V6 rows do not", () => {
  const preset = { rows: [{ assetReference: "RS-01", locationText: "Lvl" }] };
  assert.deepEqual(configuredDryWetRiserOutlets(system(1, preset), true)[0]?.fieldRemarks, {});
  assert.equal(configuredDryWetRiserOutlets(system(1, preset), false)[0]?.fieldRemarks, undefined);
});
