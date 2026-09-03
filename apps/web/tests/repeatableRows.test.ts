import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConfiguredRows,
  repeatableRowIssues,
  type RepeatableRow,
} from "../src/inspectionControls/repeatableRows";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

type Results = { inspectionResult: "good" | "poor" | "not_relevant" | null };

const system: JobSystemSnapshot = {
  enabledSystemId: "00000000-0000-4000-8000-000000000001",
  systemKey: "fire_rated_roller_shutter",
  displayName: "Fire Rated Roller Shutter",
  sortOrder: 1,
  definitionStatus: "confirmed",
  zones: [
    { id: "00000000-0000-4000-8000-000000000011", enabledSystemId: "00000000-0000-4000-8000-000000000001", key: "zone-a", displayName: "Zone A", sortOrder: 1 },
    { id: "00000000-0000-4000-8000-000000000012", enabledSystemId: "00000000-0000-4000-8000-000000000001", key: "zone-b", displayName: "Zone B", sortOrder: 2 },
  ],
  locations: [
    { id: "00000000-0000-4000-8000-000000000021", enabledSystemId: "00000000-0000-4000-8000-000000000001", zoneId: "00000000-0000-4000-8000-000000000011", key: "shutter-a", displayName: "Shutter A", presetRowCount: 2, rowPreset: { assetReference: "FRRS-A" }, sortOrder: 1 },
    { id: "00000000-0000-4000-8000-000000000022", enabledSystemId: "00000000-0000-4000-8000-000000000001", zoneId: "00000000-0000-4000-8000-000000000012", key: "shutter-b", displayName: "Shutter B", presetRowCount: 0, rowPreset: { assetReference: "FRRS-B" }, sortOrder: 2 },
    { id: "00000000-0000-4000-8000-000000000023", enabledSystemId: "00000000-0000-4000-8000-000000000001", zoneId: null, key: "shutter-c", displayName: "Shutter C", presetRowCount: 1, rowPreset: {}, sortOrder: 3 },
  ],
};

const configuredRows = (): RepeatableRow<Results>[] => buildConfiguredRows(system, () => ({ inspectionResult: null }));
const issues = (rows: RepeatableRow<Results>[]) => repeatableRowIssues(rows, system, { maximum: 10 });

test("buildConfiguredRows creates the canonical configured-row shape", () => {
  const rows = configuredRows();

  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((row) => row.rowUuid)).size, 3);
  assert.ok(rows.every((row) => row.rowUuid.length > 0));
  assert.deepEqual(
    rows.map(({ rowUuid: _rowUuid, ...row }) => row),
    [
      { source: "configured", configuredLocationId: system.locations[0]!.id, configuredRowOrdinal: 1, zoneSnapshot: { id: system.zones[0]!.id, displayName: "Zone A" }, locationSnapshot: { id: system.locations[0]!.id, displayName: "Shutter A" }, assetReference: "FRRS-A", locationText: "Shutter A", inspectionResult: null, remarks: "", sortOrder: 1 },
      { source: "configured", configuredLocationId: system.locations[0]!.id, configuredRowOrdinal: 2, zoneSnapshot: { id: system.zones[0]!.id, displayName: "Zone A" }, locationSnapshot: { id: system.locations[0]!.id, displayName: "Shutter A" }, assetReference: "FRRS-A", locationText: "Shutter A", inspectionResult: null, remarks: "", sortOrder: 2 },
      { source: "configured", configuredLocationId: system.locations[2]!.id, configuredRowOrdinal: 1, zoneSnapshot: null, locationSnapshot: { id: system.locations[2]!.id, displayName: "Shutter C" }, assetReference: "", locationText: "Shutter C", inspectionResult: null, remarks: "", sortOrder: 3 },
    ],
  );
});

test("repeatableRowIssues rejects a missing configured location and ordinal pair", () => {
  const rows = configuredRows();
  rows.splice(1, 1);
  rows.forEach((row, index) => { row.sortOrder = index + 1; });

  assert.ok(issues(rows).includes("Configured rows must be retained exactly once"));
});

test("repeatableRowIssues rejects invalid configured and technician provenance", () => {
  const configured = configuredRows();
  configured[0]!.configuredLocationId = null;
  assert.ok(issues(configured).includes("Configured row provenance is invalid"));

  const technician = configuredRows();
  technician[0] = { ...technician[0]!, source: "technician", configuredLocationId: system.locations[0]!.id, configuredRowOrdinal: 1 };
  assert.ok(issues(technician).includes("Technician row provenance is invalid"));
});

test("repeatableRowIssues rejects a non-dense sort order", () => {
  const rows = configuredRows();
  rows[1]!.sortOrder = 3;

  assert.ok(issues(rows).includes("Row ordering must be dense and 1-based"));
});

test("repeatableRowIssues rejects duplicate row UUIDs", () => {
  const rows = configuredRows();
  rows[1]!.rowUuid = rows[0]!.rowUuid;

  assert.ok(issues(rows).includes("Row UUIDs must be unique"));
});
