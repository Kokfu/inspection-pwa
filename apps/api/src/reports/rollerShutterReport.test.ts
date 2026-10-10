import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSystemCondition, fieldsForAcceptedReportInstance, rollerShutterEvidenceCaption, rollerShutterEvidenceInDisplayOrder, sectionRemarkLines,
  type FinalReportEvidence, type FinalReportSection
} from "./finalServiceReport.js";
import { rollerShutterRowLocation, rollerShutterRowsInDisplayOrder, rollerShutterZones } from "./rollerShutterDisplay.js";

/**
 * I-45: the on-screen Final Report printed every stored key of every Roller Shutter row ('ROWS 1 - ROW UUID', sort order,
 * source, snapshots). I-46: a shutter added during a visit is stored after the configured rows and was listed after them.
 * The fields now read like the PDF and follow the zone-grouped display order. The stored response is never changed.
 */

const uuid = (n: number) => `85000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, locationText: string, zoneText: string, source: "configured" | "technician", extra: Record<string, unknown> = {}) => ({
  rowUuid: uuid(n), source, configuredLocationId: source === "configured" ? uuid(900 + n) : null, configuredRowOrdinal: source === "configured" ? n : null,
  zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText, zoneText,
  autoAlarmModeResult: "good", manualModeResult: "good", remarks: "", fieldRemarks: {}, sortOrder: n, ...extra
});
const response = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ schemaVersion: 2, dateTested: "2026-10-10", zone: "", inspectedBy: "Inspector A", rows, comments: "", ...extra });
const fieldsOf = (value: unknown) => fieldsForAcceptedReportInstance("fire_rated_roller_shutter", { schemaVersion: 2 }, value, undefined).fields;
const labels = (value: unknown) => fieldsOf(value).map((field) => field.label);

const stored = [
  row(1, "Lobby", "Zone 1", "configured"),
  row(2, "Dock", "Zone 2", "configured", { assetReference: "RS-02" }),
  row(3, "Roof", "Zone 1", "technician", { manualModeResult: "not_good", fieldRemarks: { manualModeResult: "Sticks half way" }, remarks: "Added on site" }),
  row(4, "Yard", "Zone 3", "technician")
];

test("I-45: no internal key reaches the on-screen report", () => {
  const text = labels(response(stored)).join("\n");
  for (const hidden of [/row uuid/i, /sort order/i, /\bsource\b/i, /snapshot/i, /ordinal/i, /rows \d/i, /location text/i, /zone text/i]) assert.doesNotMatch(text, hidden);
  for (const value of fieldsOf(response(stored)).map((field) => field.value)) assert.doesNotMatch(value, /^[0-9a-f]{8}-[0-9a-f]{4}-/i, "no UUID is printed as a value");
});

test("I-45 / I-46: each shutter reads 'No. N (Zone — Location)' in zone-grouped order, with its results, remark and row remark", () => {
  assert.deepEqual(labels(response(stored)), [
    "Date Tested", "Zone", "Inspected By",
    "No. 1 (Zone 1 — Lobby) - Auto Alarm Mode", "No. 1 (Zone 1 — Lobby) - Manual Mode",
    "No. 2 (Zone 1 — Roof) - Auto Alarm Mode", "No. 2 (Zone 1 — Roof) - Manual Mode", "No. 2 (Zone 1 — Roof) - Manual Mode Remark", "No. 2 (Zone 1 — Roof) - Remarks",
    "No. 3 (Zone 2 — Dock) - Asset Reference", "No. 3 (Zone 2 — Dock) - Auto Alarm Mode", "No. 3 (Zone 2 — Dock) - Manual Mode",
    "No. 4 (Zone 3 — Yard) - Auto Alarm Mode", "No. 4 (Zone 3 — Yard) - Manual Mode"
  ]);
  const byLabel = new Map(fieldsOf(response(stored)).map((field) => [field.label, field.value] as const));
  assert.equal(byLabel.get("Zone"), "Zone 1, Zone 2, Zone 3", "the header Zone lists the row zones when it was left blank");
  assert.equal(byLabel.get("No. 2 (Zone 1 — Roof) - Manual Mode"), "Not Good");
  assert.equal(byLabel.get("No. 2 (Zone 1 — Roof) - Manual Mode Remark"), "Sticks half way");
  assert.equal(byLabel.get("No. 2 (Zone 1 — Roof) - Remarks"), "Added on site");
  assert.equal(byLabel.get("Date Tested"), "2026-10-10");
});

test("I-45 / I-46: the stored response is not modified, and an explicit header zone wins", () => {
  const input = response(stored);
  const before = JSON.stringify(input);
  fieldsOf(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual((input.rows as Array<{ sortOrder: number }>).map((entry) => entry.sortOrder), [1, 2, 3, 4]);
  assert.equal(fieldsOf(response(stored, { zone: "North wing" })).find((field) => field.label === "Zone")?.value, "North wing");
});

test("I-45: the condition, the dashboard result flag and the PDF remark lines still work from the new fields", () => {
  const fields = fieldsOf(response(stored));
  assert.deepEqual(fields.filter((field) => (field as { conditionResult?: boolean }).conditionResult).map((field) => field.value), ["Good", "Good", "Good", "Not Good", "Good", "Good", "Good", "Good"]);
  const section = { systemKey: "fire_rated_roller_shutter", label: "Fire Rated Roller Shutter", fields, evidence: [] } as unknown as FinalReportSection;
  assert.equal(deriveSystemCondition([section]).condition, "FAILED");
  assert.equal(deriveSystemCondition([section]).conditionDetail, "No. 2 (Zone 1 — Roof) - Manual Mode: Not Good");
  assert.deepEqual(sectionRemarkLines(section), ["1. No. 2 (Zone 1 — Roof) - Manual Mode: Not Good — Sticks half way"]);
});

test("I-45: malformed row data fails closed instead of being dropped", () => {
  assert.throws(() => fieldsOf(response([row(1, "Lobby", "Zone 1", "configured"), "not a row"])), /malformed/i);
  assert.throws(() => fieldsOf(response([row(1, "Lobby", "Zone 1", "configured", { autoAlarmModeResult: { nested: true } })])), /malformed/i);
});

test("I-45: schema 1 and other systems keep the generic flattening", () => {
  const generic = fieldsForAcceptedReportInstance("fire_rated_roller_shutter", { schemaVersion: 2 }, { ...response([row(1, "Lobby", "Zone 1", "configured")]), schemaVersion: 1 }, undefined).fields.map((field) => field.label);
  assert.ok(generic.includes("Rows 1 - Row Uuid"), "schema 1 is unchanged");
  const other = fieldsForAcceptedReportInstance("smoke_ventilation", { schemaVersion: 2 }, response([row(1, "Lobby", "Zone 1", "configured")]), undefined).fields.map((field) => field.label);
  assert.ok(other.includes("Rows 1 - Row Uuid"), "another system is unchanged");
});

test("I-46: display order groups by zone in first-appearance order and keeps each zone's stored order", () => {
  assert.deepEqual(rollerShutterRowsInDisplayOrder(stored).map((entry) => entry.locationText), ["Lobby", "Roof", "Dock", "Yard"]);
  assert.deepEqual(rollerShutterZones(stored), ["Zone 1", "Zone 2", "Zone 3"]);
  const unzoned = [row(1, "A", "", "configured"), row(2, "B", "", "configured")];
  assert.deepEqual(rollerShutterRowsInDisplayOrder(unzoned).map((entry) => entry.locationText), ["A", "B"], "no zones: unchanged");
  assert.equal(rollerShutterRowLocation(stored[2]), "Zone 1 — Roof");
  assert.equal(rollerShutterRowLocation(unzoned[0]), "A");
});

test("I-45: a Roller Shutter photo caption names its shutter; other systems and unknown rows keep the plain caption", () => {
  const path = (n: number, column: string) => `roller_shutter_schedule.roller_shutter_schedule_rows.rows.${uuid(n)}.${column}`;
  const caption = "Roller Shutter Schedule - Manual Mode";
  assert.equal(rollerShutterEvidenceCaption("fire_rated_roller_shutter", response(stored), path(3, "manual_mode"), caption), `${caption} (Zone 1 — Roof)`);
  assert.equal(rollerShutterEvidenceCaption("fire_rated_roller_shutter", response(stored), path(99, "manual_mode"), caption), caption);
  assert.equal(rollerShutterEvidenceCaption("smoke_ventilation", response(stored), path(3, "manual_mode"), caption), caption);
  assert.equal(rollerShutterEvidenceCaption("fire_rated_roller_shutter", { schemaVersion: 1, rows: stored }, path(3, "manual_mode"), caption), caption);
});

test("I-46: photos follow the display order of the shutters, Auto Alarm Mode before Manual Mode", () => {
  const photo = (n: number, column: string): FinalReportEvidence => ({ field: `roller_shutter_schedule.roller_shutter_schedule_rows.rows.${uuid(n)}.${column}`, content: Buffer.alloc(0), width: 1, height: 1 });
  // as the database returns them: ordered by field path (row UUID), which is the stored order here
  const fromDatabase = [photo(1, "auto_alarm_mode"), photo(2, "manual_mode"), photo(3, "auto_alarm_mode"), photo(3, "manual_mode"), photo(4, "auto_alarm_mode")];
  const ordered = rollerShutterEvidenceInDisplayOrder("fire_rated_roller_shutter", response(stored), fromDatabase).map((item) => item.field.split(".").slice(-2).join("."));
  assert.deepEqual(ordered, [`${uuid(1)}.auto_alarm_mode`, `${uuid(3)}.auto_alarm_mode`, `${uuid(3)}.manual_mode`, `${uuid(2)}.manual_mode`, `${uuid(4)}.auto_alarm_mode`]);
  assert.deepEqual(rollerShutterEvidenceInDisplayOrder("smoke_ventilation", response(stored), fromDatabase), fromDatabase, "another system keeps its order");
});
