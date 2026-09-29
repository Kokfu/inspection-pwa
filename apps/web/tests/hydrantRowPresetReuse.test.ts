import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredHydrantRows } from "../src/hydrant/hydrantRepository";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

/**
 * The Phase 1 location-proposal payoff ("Save as format for next visit"), extended to Hydrant: a
 * customer location's `rowPreset.rows` (written by Approve via `applyLocationProposalPatch`'s
 * update-format merge) must pre-fill newly-created "configured" Hydrant rows with the saved
 * assetReference/locationText -- additive only; `HydrantRow`'s serialized shape is unchanged.
 */
const locationId = "11111111-1111-4111-8111-111111111111";
const enabledSystemId = "22222222-2222-4222-8222-222222222222";
function system(presetRowCount: number, rowPreset: unknown): JobSystemSnapshot {
  return { enabledSystemId, systemKey: "hydrant", displayName: "Hydrant", sortOrder: 1,
    definitionStatus: "confirmed", zones: [], locations: [{ id: locationId, enabledSystemId,
      zoneId: null, key: "plant", displayName: "Plant Room", sortOrder: 1, presetRowCount, rowPreset }] };
}

test("a new Hydrant inspection reads both identity fields from each approved preset row", () => {
  const rows = configuredHydrantRows(system(2, { rows: [
    { assetReference: "HY-01", locationText: "North wall" },
    { assetReference: "HY-02", locationText: "South wall" }
  ] }), false);
  assert.deepEqual(rows.map(({ assetReference, locationText, source, configuredLocationId, configuredRowOrdinal }) =>
    ({ assetReference, locationText, source, configuredLocationId, configuredRowOrdinal })), [
    { assetReference: "HY-01", locationText: "North wall", source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1 },
    { assetReference: "HY-02", locationText: "South wall", source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 2 }
  ]);
});

test("malformed or missing Hydrant row presets fail closed to legacy defaults, never crash", () => {
  for (const preset of [undefined, null, {}, { rows: "wrong" }, { rows: [{ assetReference: "HY-01" }] },
    { rows: [{ assetReference: "HY-01", locationText: "" }] }, { rows: [{ assetReference: "HY-01", locationText: "Lobby", extra: "bad" }] }]) {
    const rows = configuredHydrantRows(system(1, preset), false);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.assetReference, "");
    assert.equal(rows[0]?.locationText, "Plant Room");
  }
});

test("a partial Hydrant preset (fewer saved rows than presetRowCount) does not produce a mixed configured layout", () => {
  const rows = configuredHydrantRows(system(2, { rows: [{ assetReference: "HY-01", locationText: "Lobby" }] }), false);
  assert.deepEqual(rows.map(({ assetReference, locationText }) => ({ assetReference, locationText })), [
    { assetReference: "", locationText: "Plant Room" }, { assetReference: "", locationText: "Plant Room" }
  ]);
});

test("the pre-existing flat rowPreset.assetReference fallback still applies when no per-row preset is saved", () => {
  const rows = configuredHydrantRows(system(1, { assetReference: "LEGACY-REF" }), false);
  assert.equal(rows[0]?.assetReference, "LEGACY-REF");
  assert.equal(rows[0]?.locationText, "Plant Room");
});

test("V7 configured rows also carry an empty fieldRemarks object; V1-V6 rows do not", () => {
  const preset = { rows: [{ assetReference: "HY-01", locationText: "Lobby" }] };
  assert.deepEqual(configuredHydrantRows(system(1, preset), true)[0]?.fieldRemarks, {});
  assert.equal(configuredHydrantRows(system(1, preset), false)[0]?.fieldRemarks, undefined);
});
