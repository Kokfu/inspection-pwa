import assert from "node:assert/strict";
import { test } from "node:test";
import { blankResponses } from "../src/co2/co2Repository";
import { normalizeDetectorRows, setDetectorRowCount } from "../src/co2/detectorRowCount";
import type { Co2ConfiguredInstance } from "../src/co2/co2Types";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";
import type { ResolvedCo2Controls } from "../src/inspectionControls/definitionTypes";

const locationId = "11111111-1111-4111-8111-111111111111";
const enabledSystemId = "22222222-2222-4222-8222-222222222222";
const instance = { instanceKey: `location:${locationId}`, displaySequence: 1, zone: null,
  location: { id: locationId, key: "kitchen", displayName: "Kitchen", sortOrder: 1 } } satisfies Co2ConfiguredInstance;
const controls = { chargerAndBatteries: [], physicalOutlook: [], mainFunctionKeys: [] } as unknown as ResolvedCo2Controls;
function system(presetRowCount: number, rowPreset: unknown): JobSystemSnapshot {
  return { enabledSystemId, systemKey: "wet_chemical", displayName: "Wet Chemical", sortOrder: 1,
    definitionStatus: "confirmed", zones: [], locations: [{ ...instance.location, enabledSystemId, zoneId: null, presetRowCount, rowPreset }] };
}

test("Wet Chemical blank inspection reuses approved row count and row text", () => {
  const configured = system(2, { rows: [
    { alarmZone: "Kitchen Zone A", location: "Hood A" },
    { alarmZone: "Kitchen Zone B", location: "Hood B" }
  ] });
  const responses = blankResponses(instance, configured, controls);
  assert.deepEqual(responses.detectorRows.map(({ alarmZone, location, source, displaySequence }) =>
    ({ alarmZone, location, source, displaySequence })), [
    { alarmZone: "Kitchen Zone A", location: "Hood A", source: "configured", displaySequence: 1 },
    { alarmZone: "Kitchen Zone B", location: "Hood B", source: "configured", displaySequence: 2 }
  ]);
  const expanded = setDetectorRowCount(responses, configured, instance, 3, 250);
  assert.deepEqual(expanded.detectorRows.map((row) => row.source), ["configured", "configured", "technician"]);
});

test("Wet Chemical older draft rows retain entered text when normalized for the count control", () => {
  const legacy = blankResponses(instance, system(0, {}), controls);
  const edited = { ...legacy, detectorRows: legacy.detectorRows.map(({ source: _source, ...row }) =>
    ({ ...row, alarmZone: "Technician zone", location: "Technician location" })) };
  const normalized = normalizeDetectorRows(edited, system(0, {}), instance);
  assert.equal(normalized.detectorRows.length, 1);
  assert.equal(normalized.detectorRows[0]?.alarmZone, "Technician zone");
  assert.equal(normalized.detectorRows[0]?.location, "Technician location");
});
