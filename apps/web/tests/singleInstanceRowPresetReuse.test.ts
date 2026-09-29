import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredRows as smokeRows } from "../src/smokeVentilation/smokeVentilationRepository";
import { configuredRows as intercomRows } from "../src/fireIntercom/fireIntercomRepository";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

const locationId = "11111111-1111-4111-8111-111111111111";
const enabledSystemId = "22222222-2222-4222-8222-222222222222";
function system(systemKey: string, rowPreset: unknown, count = 2): JobSystemSnapshot {
  return { enabledSystemId, systemKey, displayName: systemKey, sortOrder: 1, definitionStatus: "confirmed", zones: [],
    locations: [{ id: locationId, enabledSystemId, zoneId: null, key: "general", displayName: "General", sortOrder: 1, presetRowCount: count, rowPreset }] };
}

for (const [key, configuredRows] of [["smoke_ventilation", smokeRows], ["fire_intercom", intercomRows]] as const) {
  test(`${key} reuses each saved row label on a new visit without changing result fields`, () => {
    const rows = configuredRows(system(key, { rows: [{ assetReference: "A-01" }, { assetReference: "B-02" }] }));
    assert.deepEqual(rows.map((row) => row.assetReference), ["A-01", "B-02"]);
    assert.deepEqual(rows.map((row) => [row.source, row.configuredLocationId, row.configuredRowOrdinal, row.zoneSnapshot]),
      [["configured", locationId, 1, null], ["configured", locationId, 2, null]]);
  });
  test(`${key} rejects the entire malformed preset and uses the flat fallback`, () => {
    for (const invalid of [[{ assetReference: "A-01" }], [{ assetReference: "A-01" }, { assetReference: 3 }],
      [{ assetReference: "A-01" }, { assetReference: "B-02", extra: "x" }]]) {
      assert.deepEqual(configuredRows(system(key, { assetReference: "fallback", rows: invalid })).map((row) => row.assetReference),
        ["fallback", "fallback"]);
    }
  });
}
