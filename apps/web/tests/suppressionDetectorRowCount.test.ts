import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredDetectorCount, normalizeDetectorRows, setDetectorRowCount, wireDetectorResponses } from "../src/co2/detectorRowCount";
import type { Co2ConfiguredInstance, Co2Responses } from "../src/co2/co2Types";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

const locationId = "11111111-1111-4111-8111-111111111111";
const instance = { instanceKey: `location:${locationId}`, displaySequence: 1, zone: null,
  location: { id: locationId, key: "plant", displayName: "Plant Room", sortOrder: 1 } } satisfies Co2ConfiguredInstance;
function system(presetRowCount: number): JobSystemSnapshot {
  return { enabledSystemId: "22222222-2222-4222-8222-222222222222", systemKey: "co2_fire_extinguisher", displayName: "CO2", sortOrder: 1,
    definitionStatus: "confirmed", zones: [], locations: [{ ...instance.location, enabledSystemId: "22222222-2222-4222-8222-222222222222", zoneId: null, presetRowCount, rowPreset: {} }] };
}
const empty: Co2Responses = { controlPanelLocation: "", detectorRows: [], chargerAndBatteries: {}, physicalOutlook: {}, mainFunctionKeys: {}, comments: "" };

test("CO2 and FM200 shared detector count preserves configured rows and entered technician rows", () => {
  const configured = normalizeDetectorRows(empty, system(3), instance);
  assert.equal(configuredDetectorCount(system(3), instance), 3);
  assert.deepEqual(configured.detectorRows.map((row) => [row.source, row.displaySequence]), [["configured", 1], ["configured", 2], ["configured", 3]]);
  const expanded = setDetectorRowCount(configured, system(3), instance, 5, 250);
  assert.deepEqual(expanded.detectorRows.map((row) => row.source), ["configured", "configured", "configured", "technician", "technician"]);
  const entered = { ...expanded, detectorRows: expanded.detectorRows.map((row, index) => index === 3 ? { ...row, remarks: "checked" } : row) };
  const reduced = setDetectorRowCount(entered, system(3), instance, 2, 250);
  assert.equal(reduced.detectorRows.length, 4);
  assert.equal(reduced.detectorRows[3]?.remarks, "checked");
  assert.deepEqual(reduced.detectorRows.map((row) => row.displaySequence), [1, 2, 3, 4]);
  assert.ok(reduced.detectorRows.every((row, index) => row.rowUuid === entered.detectorRows[index]?.rowUuid));
  assert.ok(wireDetectorResponses(reduced).detectorRows.every((row) => !Object.hasOwn(row, "source")));
});

test("zero presets starts one technician row and legacy rows keep their contents", () => {
  const zero = normalizeDetectorRows(empty, system(0), instance);
  assert.equal(zero.detectorRows.length, 1);
  assert.equal(zero.detectorRows[0]?.source, "technician");
  const legacy = { ...empty, detectorRows: [{ ...zero.detectorRows[0]!, source: undefined, remarks: "existing" }] };
  const normalized = normalizeDetectorRows(legacy, system(2), instance);
  assert.equal(normalized.detectorRows.length, 2);
  assert.equal(normalized.detectorRows[0]?.remarks, "existing");
  assert.deepEqual(normalized.detectorRows.map((row) => row.source), ["configured", "configured"]);
});
