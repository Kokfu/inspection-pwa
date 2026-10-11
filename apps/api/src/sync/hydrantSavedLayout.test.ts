import assert from "node:assert/strict";
import test from "node:test";
import { configuredHydrantRowsMatch, expectedConfiguredHydrantRows } from "./hydrantInspectionSync.js";

/**
 * I-60: a Hydrant location's saved layout (`rowPreset.rows`, stored by an approved `update-format` proposal) is what the web
 * pre-fills as configured rows, but the acceptance validator only knew the location name, so every such visit was rejected
 * ('Hydrant configured row identity is invalid'). The validator now expects the saved text per row, with the same fail-closed
 * reader as the web: a missing or malformed list falls back to the original rule for that location.
 */

const E = "22222222-2222-4222-8222-222222222222";
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "33333333-3333-4333-8333-333333333333";
const saved = [{ assetReference: "H-1", locationText: "Lobby" }, { assetReference: "H-2", locationText: "Roof" }];
const location = (id: string, over: Record<string, unknown> = {}) => ({ id, enabledSystemId: E, zoneId: null, key: "general", displayName: "General", presetRowCount: 2, sortOrder: 1, rowPreset: { rows: saved }, ...over });
const system = (...locations: unknown[]) => ({ enabledSystemId: E, zones: [], locations }) as never;
const row = (locationId: string, ordinal: number, sortOrder: number, assetReference: string, locationText: string, displayName = "General") => ({
  source: "configured", configuredLocationId: locationId, configuredRowOrdinal: ordinal, sortOrder, assetReference, locationText, zoneSnapshot: null, locationSnapshot: { id: locationId, displayName }
});
const technician = (sortOrder: number) => ({ source: "technician", configuredLocationId: null, configuredRowOrdinal: null, sortOrder, assetReference: "", locationText: "Added", zoneSnapshot: null, locationSnapshot: null });
const accepts = (sys: unknown, rows: unknown[]) => { const expected = expectedConfiguredHydrantRows(sys as never); return !!expected && configuredHydrantRowsMatch({ rows }, expected); };

test("a saved layout is expected per row: the rows the web pre-fills are accepted", () => {
  const expected = expectedConfiguredHydrantRows(system(location(L1)))!;
  assert.deepEqual(expected.map((entry) => [entry.ordinal, entry.assetReference, entry.locationText]), [[1, "H-1", "Lobby"], [2, "H-2", "Roof"]]);
  assert.equal(accepts(system(location(L1)), [row(L1, 1, 1, "H-1", "Lobby"), row(L1, 2, 2, "H-2", "Roof")]), true);
  assert.equal(accepts(system(location(L1)), [row(L1, 1, 1, "H-1", "Lobby"), row(L1, 2, 2, "H-2", "Roof"), technician(3)]), true, "technician rows follow the configured ones");
});

test("with a valid saved layout the old location-name rows are no longer the expected text", () => {
  assert.equal(accepts(system(location(L1)), [row(L1, 1, 1, "", "General"), row(L1, 2, 2, "", "General")]), false);
});

test("a configured row edited away from the saved text is still rejected", () => {
  assert.equal(accepts(system(location(L1)), [row(L1, 1, 1, "H-1", "Lobby 2"), row(L1, 2, 2, "H-2", "Roof")]), false);
  assert.equal(accepts(system(location(L1)), [row(L1, 1, 1, "H-9", "Lobby"), row(L1, 2, 2, "H-2", "Roof")]), false);
  assert.equal(accepts(system(location(L1)), [row(L1, 1, 1, "H-2", "Roof"), row(L1, 2, 2, "H-1", "Lobby")]), false, "rows are index-aligned, not interchangeable");
});

test("without a saved layout every customer validates exactly as before", () => {
  const plain = location(L1, { presetRowCount: 2, rowPreset: {} });
  assert.deepEqual(expectedConfiguredHydrantRows(system(plain))!.map((entry) => [entry.assetReference, entry.locationText]), [["", "General"], ["", "General"]]);
  assert.equal(accepts(system(plain), [row(L1, 1, 1, "", "General"), row(L1, 2, 2, "", "General")]), true);
  const withAsset = location(L1, { presetRowCount: 1, rowPreset: { assetReference: "HYD-9" } });
  assert.equal(accepts(system(withAsset), [row(L1, 1, 1, "HYD-9", "General")]), true, "the old single reference still applies");
  assert.equal(accepts(system(plain), [row(L1, 1, 1, "H-1", "Lobby"), row(L1, 2, 2, "H-2", "Roof")]), false);
});

test("a malformed saved layout falls back to the original rule for that location, never to a partial layout", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["wrong length", { rows: [saved[0]] }],
    ["extra key", { rows: [{ ...saved[0], drumType: "swing" }, saved[1]] }],
    ["missing key", { rows: [{ assetReference: "H-1" }, saved[1]] }],
    ["blank location", { rows: [{ assetReference: "H-1", locationText: "  " }, saved[1]] }],
    ["location too long", { rows: [{ assetReference: "H-1", locationText: "x".repeat(301) }, saved[1]] }],
    ["reference too long", { rows: [{ assetReference: "a".repeat(201), locationText: "Lobby" }, saved[1]] }],
    ["not an array", { rows: "H-1,H-2" }],
    ["a non-object row", { rows: [saved[0], "Roof"] }]
  ];
  for (const [label, rowPreset] of cases) {
    const sys = system(location(L1, { rowPreset }));
    assert.deepEqual(expectedConfiguredHydrantRows(sys)!.map((entry) => entry.locationText), ["General", "General"], label);
  }
});

test("locations are independent: one with a saved layout, one without", () => {
  const sys = system(location(L1), location(L2, { key: "annex", displayName: "Annex", presetRowCount: 1, rowPreset: {}, sortOrder: 2 }));
  assert.equal(accepts(sys, [row(L1, 1, 1, "H-1", "Lobby"), row(L1, 2, 2, "H-2", "Roof"), row(L2, 1, 3, "", "Annex", "Annex")]), true);
  assert.equal(accepts(sys, [row(L1, 1, 1, "H-1", "Lobby"), row(L1, 2, 2, "H-2", "Roof"), row(L2, 1, 3, "H-3", "Gate", "Annex")]), false);
});

test("the row cap and the configured identity rules are unchanged", () => {
  assert.equal(accepts(system(location(L1)), [row(L1, 1, 1, "H-1", "Lobby")]), false, "a configured row may not be dropped");
  assert.equal(accepts(system(location(L1)), [row(L1, 1, 1, "H-1", "Lobby"), row(L1, 1, 2, "H-1", "Lobby")]), false, "a configured row may not repeat");
  const big = Array.from({ length: 250 }, (_, index) => ({ assetReference: "", locationText: `Hydrant ${index + 1}` }));
  assert.equal(expectedConfiguredHydrantRows(system(location(L1, { presetRowCount: 250, rowPreset: { rows: big } })))!.length, 250);
  assert.equal(expectedConfiguredHydrantRows(system(location(L1, { presetRowCount: 251, rowPreset: { rows: [] } }))), undefined);
});
