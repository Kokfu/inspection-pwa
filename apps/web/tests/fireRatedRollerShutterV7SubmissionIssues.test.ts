import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { submitIssues } from "../src/fireRatedRollerShutter/fireRatedRollerShutterRepository";
import type { FireRatedRollerShutterInspectionRecord, FireRatedRollerShutterResponses } from "../src/fireRatedRollerShutter/fireRatedRollerShutterTypes";
import { v7RequiredFireRatedRollerShutterFieldPaths } from "../src/fireRatedRollerShutter/fireRatedRollerShutterV7Evidence";

const rowUuid = "00000000-0000-4000-8000-000000000b01";
const definition = masterServiceReportV7.systems.find((system) => system.key === "fire_rated_roller_shutter")!;
const inspection = { inspectionSnapshot: { system: { definition, locations: [] } } } as unknown as FireRatedRollerShutterInspectionRecord;
const response = (): FireRatedRollerShutterResponses => ({ schemaVersion: 1, dateTested: "2026-09-28", zone: "Zone 1", inspectedBy: "Inspector A", rows: [{
  rowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null,
  locationSnapshot: null, assetReference: "", locationText: "CNC Drill", autoAlarmModeResult: "good", manualModeResult: "good",
  remarks: "", fieldRemarks: {}, sortOrder: 1
}], comments: "" });
const photo = (fieldPath: string, sha256: string) => ({ systemKey: "fire_rated_roller_shutter", protocolVersion: 7, fieldPath, sha256 }) as Parameters<typeof submitIssues>[2][number];

test("roller shutter clean row passes local submission", () => {
  assert.deepEqual(submitIssues(inspection, response(), []), []);
});

test("roller shutter requires both result boxes and a location", () => {
  const draft = response(); draft.rows[0]!.manualModeResult = null; draft.rows[0]!.locationText = "";
  const issues = submitIssues(inspection, draft, []);
  assert.ok(issues.some((issue) => issue.includes("Shutter row is invalid")));
  assert.ok(issues.some((issue) => issue.includes("Manual Mode result is required")));
});

test("each roller shutter finding needs its own remark and distinct photo", () => {
  const draft = response(); draft.rows[0]!.autoAlarmModeResult = "not_good"; draft.rows[0]!.manualModeResult = "complete_repair";
  const paths = v7RequiredFireRatedRollerShutterFieldPaths(draft);
  assert.equal(paths.length, 2);
  assert.ok(submitIssues(inspection, draft, []).some((issue) => issue.includes("requires its own Remark")));
  draft.rows[0]!.fieldRemarks = { autoAlarmModeResult: "Motor failed", manualModeResult: "Manual release repaired" };
  assert.ok(submitIssues(inspection, draft, [photo(paths[0]!, "a".repeat(64))]).some((issue) => issue.includes("requires its own Photo")));
  assert.ok(submitIssues(inspection, draft, paths.map((path) => photo(path, "a".repeat(64)))).some((issue) => issue.includes("same photo")));
  assert.deepEqual(submitIssues(inspection, draft, [photo(paths[0]!, "a".repeat(64)), photo(paths[1]!, "b".repeat(64))]), []);
});
