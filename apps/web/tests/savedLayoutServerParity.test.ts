import assert from "node:assert/strict";
import test from "node:test";
import { rowPresets as hydrantRowPresets, configuredHydrantRows } from "../src/hydrant/hydrantRepository.js";
import { rowPresets as riserRowPresets } from "../src/dryWetRiser/dryWetRiserRepository.js";
import { savedLayoutRows } from "../../api/src/inspections/savedLayoutRows.js";
import { expectedConfiguredHydrantRows } from "../../api/src/sync/hydrantInspectionSync.js";

/**
 * I-60: the web builds a location's configured rows from its saved layout (`rowPreset.rows`); the server decides what those rows
 * must read. If the two ever disagree about whether a saved layout is valid, a visit the web built is rejected at sync. This test
 * runs the same inputs through both and requires the same answer, including every malformed case that falls back.
 */

const E = "22222222-2222-4222-8222-222222222222", L = "11111111-1111-4111-8111-111111111111";
const good = [{ assetReference: "H-1", locationText: "Lobby" }, { assetReference: "", locationText: "Roof" }];
const cases: Array<[string, { presetRowCount: number; rowPreset: unknown }]> = [
  ["a valid saved layout", { presetRowCount: 2, rowPreset: { rows: good } }],
  ["no preset", { presetRowCount: 1, rowPreset: {} }],
  ["only the old single reference", { presetRowCount: 2, rowPreset: { assetReference: "HYD-9" } }],
  ["the count does not match", { presetRowCount: 3, rowPreset: { rows: good } }],
  ["an extra key on a row", { presetRowCount: 2, rowPreset: { rows: [{ ...good[0], drumType: "swing" }, good[1]] } }],
  ["a missing key on a row", { presetRowCount: 2, rowPreset: { rows: [{ assetReference: "H-1" }, good[1]] } }],
  ["a blank location", { presetRowCount: 2, rowPreset: { rows: [{ assetReference: "H-1", locationText: "   " }, good[1]] } }],
  ["a location of exactly 300", { presetRowCount: 1, rowPreset: { rows: [{ assetReference: "", locationText: "x".repeat(300) }] } }],
  ["a location of 301", { presetRowCount: 1, rowPreset: { rows: [{ assetReference: "", locationText: "x".repeat(301) }] } }],
  ["a reference of exactly 200", { presetRowCount: 1, rowPreset: { rows: [{ assetReference: "a".repeat(200), locationText: "Lobby" }] } }],
  ["a reference of 201", { presetRowCount: 1, rowPreset: { rows: [{ assetReference: "a".repeat(201), locationText: "Lobby" }] } }],
  ["rows that are not an array", { presetRowCount: 2, rowPreset: { rows: "a,b" } }],
  ["a non-object row", { presetRowCount: 2, rowPreset: { rows: [good[0], "Roof"] } }],
  ["an array preset", { presetRowCount: 2, rowPreset: [good[0], good[1]] }],
  ["a null preset", { presetRowCount: 2, rowPreset: null }],
  ["non-string fields", { presetRowCount: 1, rowPreset: { rows: [{ assetReference: 5, locationText: "Lobby" }] } }]
];

for (const [label, input] of cases) {
  test(`web and server agree on the saved layout: ${label}`, () => {
    const location = { id: L, enabledSystemId: E, zoneId: null, key: "general", displayName: "General", sortOrder: 1, ...input };
    const server = savedLayoutRows(location as never);
    assert.deepEqual(hydrantRowPresets(location as never), server, "Hydrant reader");
    assert.deepEqual(riserRowPresets(location as never), server, "Dry/Wet Riser reader");
    // and the rows the web pre-fills are exactly the rows the server expects, for the whole location
    const system = { enabledSystemId: E, systemKey: "hydrant", displayName: "Hydrant", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [location] } as never;
    const web = configuredHydrantRows(system, true).map((row) => [row.configuredRowOrdinal, row.assetReference, row.locationText]);
    const expected = expectedConfiguredHydrantRows(system as never);
    assert.ok(expected, "the server can build its expectation");
    assert.deepEqual(expected!.map((row) => [row.ordinal, row.assetReference, row.locationText]), web);
  });
}
