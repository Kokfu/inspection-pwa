import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedConfiguredSingleInstanceRows } from "./singleInstancePresetRows.js";

const enabledSystemId = "22222222-2222-4222-8222-222222222222";
const location = { id: "11111111-1111-4111-8111-111111111111", enabledSystemId, zoneId: null,
  displayName: "General", sortOrder: 1, presetRowCount: 2 };
for (const systemKey of ["smoke_ventilation", "fire_intercom"]) {
  test(`${systemKey} server authority reads complete row presets and fails closed on partial content`, () => {
    const system = (rowPreset: unknown) => ({ enabledSystemId, systemKey, locations: [{ ...location, rowPreset }] });
    assert.deepEqual(expectedConfiguredSingleInstanceRows(system({ rows: [{ assetReference: "A-01" }, { assetReference: "B-02" }] }))?.map((row) => row.assetReference), ["A-01", "B-02"]);
    assert.deepEqual(expectedConfiguredSingleInstanceRows(system({ assetReference: "fallback", rows: [{ assetReference: "A-01" }] }))?.map((row) => row.assetReference), ["fallback", "fallback"]);
    assert.deepEqual(expectedConfiguredSingleInstanceRows(system({ assetReference: "fallback", rows: [{ assetReference: "A-01" }, { assetReference: "B-02", extra: true }] }))?.map((row) => row.assetReference), ["fallback", "fallback"]);
  });
}
