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
  assert.ok(issues.includes("Shutter row 1 needs a Location"));
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

// ---- Phase 2: schema-2 zone headings must match the server's validResponses / configured-row match -------------

const locationId = "00000000-0000-4000-8000-000000000c01";
const zonedInspection = { inspectionSnapshot: { system: { enabledSystemId: "00000000-0000-4000-8000-000000000c02", definition, locations: [{
  id: locationId, enabledSystemId: "00000000-0000-4000-8000-000000000c02", zoneId: null, key: "general", displayName: "General", presetRowCount: 1,
  rowPreset: { rows: [{ assetReference: "RS-01", locationText: "Lobby", zoneText: "Zone 1" }] }, sortOrder: 1
}] } } } as unknown as FireRatedRollerShutterInspectionRecord;
const zonedResponse = (): FireRatedRollerShutterResponses => ({ schemaVersion: 2, dateTested: "2026-10-09", zone: "", inspectedBy: "Inspector A", rows: [{
  rowUuid, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1, zoneSnapshot: null,
  locationSnapshot: { id: locationId, displayName: "General" }, assetReference: "RS-01", locationText: "Lobby", zoneText: "Zone 1",
  autoAlarmModeResult: "good", manualModeResult: "good", remarks: "", fieldRemarks: {}, sortOrder: 1
}, {
  rowUuid: "00000000-0000-4000-8000-000000000b02", source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null,
  locationSnapshot: null, assetReference: "", locationText: "Roof", zoneText: "Zone 3", autoAlarmModeResult: "good", manualModeResult: "na",
  remarks: "", fieldRemarks: {}, sortOrder: 2
}], comments: "" });

test("schema-2 roller shutter rows with a frozen zone heading pass local submission", () => {
  assert.deepEqual(submitIssues(zonedInspection, zonedResponse(), []), []);
});

test("schema 2 requires zoneText on every row and keeps it bounded", () => {
  const missing = zonedResponse(); delete (missing.rows[1] as { zoneText?: string }).zoneText;
  assert.ok(submitIssues(zonedInspection, missing, []).some((issue) => issue.includes("Shutter row shape is invalid")));
  const long = zonedResponse(); long.rows[1]!.zoneText = "z".repeat(201);
  assert.ok(submitIssues(zonedInspection, long, []).some((issue) => issue.includes("zone heading is invalid")));
});

test("a configured row's zone heading must equal the frozen configuration", () => {
  const tampered = zonedResponse(); tampered.rows[0]!.zoneText = "Zone 9";
  assert.ok(submitIssues(zonedInspection, tampered, []).some((issue) => issue.includes("zone does not match the frozen configuration")));
});

test("a schema-1 draft against a zoned preset is judged by the legacy reading, not stranded by the new labels", () => {
  const legacy = (): FireRatedRollerShutterResponses => ({ schemaVersion: 1, dateTested: "2026-10-09", zone: "", inspectedBy: "A", rows: [{
    rowUuid, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1, zoneSnapshot: null,
    locationSnapshot: { id: locationId, displayName: "General" }, assetReference: "", locationText: "General",
    autoAlarmModeResult: "good", manualModeResult: "good", remarks: "", fieldRemarks: {}, sortOrder: 1
  }], comments: "" });
  assert.deepEqual(submitIssues(zonedInspection, legacy(), []), []);
  const named = legacy(); named.rows[0]!.locationText = "Lobby"; named.rows[0]!.assetReference = "RS-01";
  assert.ok(submitIssues(zonedInspection, named, []).some((issue) => issue.includes("does not match the frozen configuration")));
});

test("the web and API zone heading limits are the same number", async () => {
  const { maxZoneTextLength: apiLimit } = await import("../../api/src/inspections/locationConfiguration");
  const { maxZoneTextLength: webLimit } = await import("../src/fireRatedRollerShutter/fireRatedRollerShutterSetup");
  assert.equal(webLimit, apiLimit);
});

test("schema 1 keeps its exact row key set and never carries zoneText", () => {
  const legacy = response(); (legacy.rows[0] as { zoneText?: string }).zoneText = "Zone 1";
  assert.ok(submitIssues(inspection, legacy, []).some((issue) => issue.includes("Shutter row shape is invalid")));
  const future = response() as unknown as { schemaVersion: number }; future.schemaVersion = 3;
  assert.ok(submitIssues(inspection, future as unknown as FireRatedRollerShutterResponses, []).some((issue) => issue.includes("envelope shape is invalid")));
});

// ---- I-38: messages name a shutter the way the form shows it -------------------------------------------

test("a blank location is reported by name, with the shutter named as the form shows it", () => {
  const draft = response(); draft.rows[0]!.locationText = "";
  assert.ok(submitIssues(inspection, draft, []).includes("Shutter row 1 needs a Location"));
  assert.ok(!submitIssues(inspection, draft, []).some((issue) => issue === "Shutter row is invalid"), "no nameless 'row is invalid' message remains");
});

test("with zone headings, every Submit message names the zone and the in-zone shutter number", () => {
  const draft = zonedResponse();
  draft.rows[0]!.zoneText = "Zone 1"; draft.rows[1]!.zoneText = "Zone 2";
  draft.rows[1]!.locationText = ""; draft.rows[1]!.autoAlarmModeResult = null; draft.rows[1]!.manualModeResult = "not_good";
  const issues = submitIssues(zonedInspection, draft, []);
  assert.ok(issues.includes("Zone 2, Shutter 1 needs a Location"), issues.join(" | "));
  assert.ok(issues.includes("Zone 2, Shutter 1 Auto Alarm Mode result is required"));
  assert.ok(issues.includes("Zone 2, Shutter 1 Manual Mode requires its own Remark"));
  assert.ok(issues.includes("Zone 2, Shutter 1 Manual Mode requires its own Photo"), "the photo message is readable, not a raw field path");
  assert.ok(!issues.some((issue) => /roller_shutter_schedule\./.test(issue)), "no raw field path is shown to the technician");
  assert.ok(!issues.some((issue) => /^Shutter row \d/.test(issue)), "flat 'Shutter row N' wording is not used when zones are shown");
});
