import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredHoseReelRows, setHoseReelDrumCount } from "../src/hoseReel/hoseReelRepository";
import type { HoseReelResponses } from "../src/hoseReel/hoseReelTypes";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

const locationId = "11111111-1111-4111-8111-111111111111";
const enabledSystemId = "22222222-2222-4222-8222-222222222222";
function system(presetRowCount: number, rowPreset: unknown): JobSystemSnapshot {
  return { enabledSystemId, systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1,
    definitionStatus: "confirmed", zones: [], locations: [{ id: locationId, enabledSystemId,
      zoneId: null, key: "general", displayName: "General", sortOrder: 1, presetRowCount, rowPreset }] };
}
const format = { rows: [
  { assetReference: "HR-01", locationText: "North lobby", drumType: "swing" },
  { assetReference: "HR-02", locationText: "Loading bay", drumType: "fixed" }
] };

test("a new schema-3 visit pre-fills drum count, types and identity from approved format", () => {
  const rows = configuredHoseReelRows(system(2, format), true);
  assert.deepEqual(rows.map((row) => ({ source: row.source, locationText: row.locationText,
    assetReference: row.assetReference, drumType: row.drumType })), [
    { source: "configured", locationText: "North lobby", assetReference: "HR-01", drumType: "swing" },
    { source: "configured", locationText: "Loading bay", assetReference: "HR-02", drumType: "fixed" }
  ]);
  const response = { schemaVersion: 3, drumCount: rows.length, rows } as HoseReelResponses;
  assert.equal(setHoseReelDrumCount(response, 3).drumCount, 3);
  assert.deepEqual(setHoseReelDrumCount(response, 3).rows.slice(0, 2), rows);
});

test("malformed or incomplete preset fails closed as a whole", () => {
  for (const malformed of [undefined, null, {}, { rows: "bad" }, { rows: [format.rows[0]] },
    { rows: [format.rows[0], { ...format.rows[1], drumType: "other" }] },
    { rows: [format.rows[0], { ...format.rows[1], extra: true }] }]) {
    const rows = configuredHoseReelRows(system(2, malformed), true);
    assert.deepEqual(rows.map((row) => [row.locationText, row.assetReference, row.drumType]),
      [["General", null, null], ["General", null, null]]);
  }
});

test("reconciling drum count preserves already edited configured and technician rows", () => {
  const configured = configuredHoseReelRows(system(2, format), true);
  const started = { ...configured[0]!, locationText: "Technician edit", drumType: "fixed" as const };
  const response = { schemaVersion: 3, drumCount: 2, rows: [started, configured[1]!] } as HoseReelResponses;
  const expanded = setHoseReelDrumCount(response, 3);
  assert.deepEqual(expanded.rows[0], started);
  const technician = { ...expanded.rows[2]!, locationText: "Extra reel", drumType: "swing" as const };
  const edited = { ...expanded, rows: [...expanded.rows.slice(0, 2), technician] };
  assert.deepEqual(setHoseReelDrumCount(edited, 2).rows[2], technician);
});

test("historical row creation does not read the new format", () => {
  const rows = configuredHoseReelRows(system(2, format), false);
  assert.equal(rows[0]?.locationText, "General");
  assert.equal(rows[0]?.assetReference, null);
  assert.equal("drumType" in rows[0]!, false);
});
