import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addPlannedZoneRows, addRowToZone, addTechnicianShutterRows, addZone, decideLayoutProposal, layoutDiffersFrom, layoutIssue, layoutRowsFromResponses, maxShutterRows,
  newTechnicianShutterRow, parseShutterCount, parseZonePlan, defaultCollapsedKeys, describeShutterEvidencePath, renameTechnicianZone, rollerShutterSetupStep, shutterRowComplete, shutterRowLabels, zoneGroupKey, zoneGroups, zoneNameTaken, zoneProgress, type ZonePlan
} from "../src/fireRatedRollerShutter/fireRatedRollerShutterSetup";
import type { FireRatedRollerShutterResponses, FireRatedRollerShutterRow } from "../src/fireRatedRollerShutter/fireRatedRollerShutterTypes";

const configuredRow = (n: number, change: Partial<FireRatedRollerShutterRow> = {}): FireRatedRollerShutterRow => ({
  ...newTechnicianShutterRow(n), source: "configured", configuredLocationId: "11111111-1111-4111-8111-111111111111",
  configuredRowOrdinal: n, locationSnapshot: { id: "11111111-1111-4111-8111-111111111111", displayName: "General" },
  assetReference: `RS-0${n}`, locationText: `Place ${n}`, ...change
});
const responses = (rows: FireRatedRollerShutterRow[], change: Partial<FireRatedRollerShutterResponses> = {}): FireRatedRollerShutterResponses =>
  ({ schemaVersion: 2, dateTested: "", zone: "", inspectedBy: "", rows, comments: "", ...change });

test("a fresh Draft with no rows asks how many shutters; untouched configured rows ask for confirmation", () => {
  assert.equal(rollerShutterSetupStep(responses([])), "count");
  assert.equal(rollerShutterSetupStep(responses([configuredRow(1), configuredRow(2)])), "confirm");
});

test("any entered work skips the pre-form step", () => {
  assert.equal(rollerShutterSetupStep(responses([], { zone: "Zone 1" })), null);
  assert.equal(rollerShutterSetupStep(responses([], { comments: "x" })), null);
  assert.equal(rollerShutterSetupStep(responses([configuredRow(1)], { inspectedBy: "A" })), null);
  assert.equal(rollerShutterSetupStep(responses([configuredRow(1, { autoAlarmModeResult: "good" })])), null);
  assert.equal(rollerShutterSetupStep(responses([configuredRow(1, { remarks: "r" })])), null);
  assert.equal(rollerShutterSetupStep(responses([configuredRow(1, { fieldRemarks: { manualModeResult: "r" } })])), null);
  assert.equal(rollerShutterSetupStep(responses([configuredRow(1), newTechnicianShutterRow(2)])), null);
  assert.equal(rollerShutterSetupStep(responses([newTechnicianShutterRow(1)])), null);
});

test("shutter counts accept only whole numbers inside the bounds", () => {
  assert.equal(parseShutterCount("4", 1, 250), 4);
  assert.equal(parseShutterCount(" 250 ", 1, 250), 250);
  assert.equal(parseShutterCount("0", 0, 10), 0);
  for (const bad of ["", " ", "0", "251", "-1", "1.5", "1e2", "+3", "abc", "1000"]) assert.equal(parseShutterCount(bad, 1, 250), undefined, bad);
  assert.equal(parseShutterCount("11", 0, 10), undefined);
});

test("added technician rows are blank, unique, valid-shaped and keep sortOrder contiguous", () => {
  const start = responses([configuredRow(1)], { comments: "kept" });
  const next = addTechnicianShutterRows(start, 3);
  assert.equal(next.rows.length, 4);
  assert.deepEqual(next.rows.map((row) => row.sortOrder), [1, 2, 3, 4]);
  assert.equal(new Set(next.rows.map((row) => row.rowUuid)).size, 4);
  assert.equal(next.comments, "kept");
  assert.equal(start.rows.length, 1, "input is not mutated");
  for (const row of next.rows.slice(1)) {
    assert.equal(row.source, "technician");
    assert.equal(row.configuredLocationId, null);
    assert.equal(row.configuredRowOrdinal, null);
    assert.equal(row.zoneSnapshot, null);
    assert.equal(row.locationSnapshot, null);
    assert.equal(row.locationText, "");
    assert.equal(row.autoAlarmModeResult, null);
  }
  assert.equal(addTechnicianShutterRows(start, 0), start);
});

test("the proposed layout applies format corrections without touching the inspection rows", () => {
  const input = responses([configuredRow(1), newTechnicianShutterRow(2)]);
  input.rows[1]!.locationText = "Loading bay";
  const rows = layoutRowsFromResponses(input, { [input.rows[0]!.rowUuid]: { locationText: "New lobby" } });
  assert.deepEqual(rows, [{ assetReference: "RS-01", locationText: "New lobby" }, { assetReference: "", locationText: "Loading bay" }]);
  assert.equal(input.rows[0]!.locationText, "Place 1");
});

test("only a changed layout differs from the saved one", () => {
  const saved = [{ assetReference: "RS-01", locationText: "A" }, { assetReference: "RS-02", locationText: "B" }];
  assert.equal(layoutDiffersFrom(saved, saved.map((row) => ({ ...row }))), false);
  assert.equal(layoutDiffersFrom(saved, saved.slice(0, 1)), true);
  assert.equal(layoutDiffersFrom(saved, [...saved, { assetReference: "", locationText: "C" }]), true);
  assert.equal(layoutDiffersFrom(saved, [saved[0]!, { assetReference: "RS-02", locationText: "b" }]), true);
  assert.equal(layoutDiffersFrom([], [{ assetReference: "", locationText: "First" }]), true);
});

test("the submit-time layout save skips, notes, or sends exactly as designed", () => {
  const saved = [{ assetReference: "RS-01", locationText: "A" }];
  const changed = [...saved, { assetReference: "", locationText: "B" }];
  assert.deepEqual(decideLayoutProposal(saved, saved, undefined), { action: "skip" });
  assert.deepEqual(decideLayoutProposal(saved, changed, undefined), { action: "send" });
  assert.deepEqual(decideLayoutProposal(saved, changed, "Draft"), { action: "send" });
  for (const status of ["Pending", "Failed", "Synced"]) {
    const decision = decideLayoutProposal(saved, changed, status);
    assert.equal(decision.action, "note", status);
  }
  const blank = decideLayoutProposal(saved, [...saved, { assetReference: "", locationText: " " }], undefined);
  assert.equal(blank.action, "note");
  assert.match((blank as { note: string }).note, /not saved for next visit/);
  assert.equal(decideLayoutProposal(saved, saved, "Synced").action, "skip", "unchanged layout stays silent even with an existing proposal");
});

test("a layout is proposable only with 1..250 rows that each have a location", () => {
  const row = { assetReference: "", locationText: "Lobby" };
  assert.equal(layoutIssue([row]), undefined);
  assert.equal(layoutIssue(Array(maxShutterRows).fill(row)), undefined);
  assert.ok(layoutIssue([]));
  assert.ok(layoutIssue(Array(maxShutterRows + 1).fill(row)));
  assert.ok(layoutIssue([row, { assetReference: "RS-02", locationText: "   " }]));
});

// ---- Phase 2: zone headings (schema 2) -------------------------------------------------------------

const zonedRow = (n: number, zoneText: string, source: "configured" | "technician" = "technician", locationText = `Loc ${n}`): FireRatedRollerShutterRow =>
  source === "configured"
    ? { ...configuredRow(n), zoneText, locationText }
    : { ...newTechnicianShutterRow(n, zoneText), locationText };
const zonedResponses = (rows: FireRatedRollerShutterRow[]): FireRatedRollerShutterResponses => ({ ...responses(rows), schemaVersion: 2 });

test("schema-1 drafts never get a setup step", () => {
  assert.equal(rollerShutterSetupStep({ ...responses([]), schemaVersion: 1 }), null);
  assert.equal(rollerShutterSetupStep(zonedResponses([])), "count");
});

test("a zones x locations plan validates its bounds and the 250-row total", () => {
  assert.deepEqual(parseZonePlan("5", "4"), { plan: [0, 1, 2, 3, 4].map((index) => ({ name: `Zone ${index + 1}`, count: 4 })) });
  assert.deepEqual(parseZonePlan("1", "3"), { plan: [{ name: "", count: 3 }] }, "a single zone is unnamed");
  assert.deepEqual(parseZonePlan("3", "2", { 1: "5" }), { plan: [{ name: "Zone 1", count: 2 }, { name: "Zone 2", count: 5 }, { name: "Zone 3", count: 2 }] });
  assert.deepEqual(parseZonePlan("2", "2", { 0: "  " }), { plan: [{ name: "Zone 1", count: 2 }, { name: "Zone 2", count: 2 }] }, "a blank override uses the default");
  for (const [zones, per] of [["0", "1"], ["51", "1"], ["x", "1"], ["2", "0"], ["2", ""], ["2", "251"]]) assert.ok("error" in parseZonePlan(zones!, per!), `${zones}x${per}`);
  assert.ok("error" in parseZonePlan("2", "2", { 1: "0" }));
  assert.match((parseZonePlan("2", "200") as { error: string }).error, /400 shutters/);
  assert.ok("plan" in parseZonePlan("1", "250"));
  assert.ok("plan" in parseZonePlan("50", "5"));
});

test("planned zone rows are blank technician rows grouped by zone with contiguous sortOrder", () => {
  const parsed = parseZonePlan("2", "2", { 1: "3" }) as { plan: ZonePlan[] };
  const next = addPlannedZoneRows(zonedResponses([]), parsed.plan);
  assert.deepEqual(next.rows.map((row) => [row.zoneText, row.sortOrder, row.source, row.locationText]), [
    ["Zone 1", 1, "technician", ""], ["Zone 1", 2, "technician", ""], ["Zone 2", 3, "technician", ""], ["Zone 2", 4, "technician", ""], ["Zone 2", 5, "technician", ""]
  ]);
});

test("zone groups keep first-appearance order and flag groups that hold a configured row", () => {
  const groups = zoneGroups([zonedRow(1, "A", "configured"), zonedRow(2, "B"), zonedRow(3, "A"), zonedRow(4, "")]);
  assert.deepEqual(groups.map((group) => [group.zoneText, group.rows.length, group.hasConfigured]), [["A", 2, true], ["B", 1, false], ["", 1, false]]);
});

test("a shutter added to a zone sits after that zone's last technician row and never ahead of configured rows", () => {
  const start = zonedResponses([zonedRow(1, "A", "configured"), zonedRow(2, "B", "configured"), zonedRow(3, "A"), zonedRow(4, "B")]);
  const addedToA = addRowToZone(start, "A");
  assert.deepEqual(addedToA.rows.map((row) => [row.source, row.zoneText]), [["configured", "A"], ["configured", "B"], ["technician", "A"], ["technician", "A"], ["technician", "B"]]);
  assert.deepEqual(addedToA.rows.map((row) => row.sortOrder), [1, 2, 3, 4, 5]);
  const toConfiguredOnly = addRowToZone(zonedResponses([zonedRow(1, "A", "configured"), zonedRow(2, "B", "configured")]), "B");
  assert.deepEqual(toConfiguredOnly.rows.map((row) => [row.source, row.zoneText]), [["configured", "A"], ["configured", "B"], ["technician", "B"]]);
  assert.equal(addedToA.rows[3]!.locationText, "");
  assert.equal(addedToA.rows[3]!.zoneText, "A");
  assert.equal(start.rows.length, 4, "input is not mutated");
});

test("adding a zone names the lone unnamed zone Zone 1 and picks the next free name", () => {
  const first = addZone(zonedResponses([zonedRow(1, "")]));
  assert.deepEqual(first.rows.map((row) => row.zoneText), ["Zone 1", "Zone 2"]);
  const third = addZone(first);
  assert.deepEqual(third.rows.map((row) => row.zoneText), ["Zone 1", "Zone 2", "Zone 3"]);
  const skipping = addZone(zonedResponses([zonedRow(1, "Zone 2"), zonedRow(2, "North")]));
  assert.deepEqual(skipping.rows.map((row) => row.zoneText), ["Zone 2", "North", "Zone 3"]);
  const configuredUnnamed = addZone(zonedResponses([zonedRow(1, "", "configured")]));
  assert.deepEqual(configuredUnnamed.rows.map((row) => row.zoneText), ["", "Zone 2"], "a frozen zone is never renamed");
});

test("only technician-only zones can be renamed", () => {
  const start = zonedResponses([zonedRow(1, "A", "configured"), zonedRow(2, "A"), zonedRow(3, "B"), zonedRow(4, "B")]);
  assert.equal(renameTechnicianZone(start, "A", "Z"), start, "a zone with a configured row keeps its frozen heading");
  const renamed = renameTechnicianZone(start, "B", "North");
  assert.deepEqual(renamed.rows.map((row) => row.zoneText), ["A", "A", "North", "North"]);
  assert.equal(renameTechnicianZone(start, "B", "B"), start);
});

test("a technician zone cannot be renamed onto another zone's name, which would silently merge them", () => {
  const start = zonedResponses([zonedRow(1, "A"), zonedRow(2, "B")]);
  assert.equal(zoneNameTaken(start, "A", "B"), true);
  assert.equal(zoneNameTaken(start, "A", "A"), false, "keeping the same name is not a clash");
  assert.equal(zoneNameTaken(start, "A", "C"), false);
  assert.equal(renameTechnicianZone(start, "A", "B"), start);
  const withUnnamed = zonedResponses([zonedRow(1, "A"), zonedRow(2, "")]);
  assert.equal(renameTechnicianZone(withUnnamed, "A", ""), withUnnamed, "clearing a name onto an existing unnamed zone is refused too");
});

test("a zoned layout lists rows grouped by zone, and an unzoned or schema-1 layout stays two-field", () => {
  const input = zonedResponses([zonedRow(1, "A", "configured", "L1"), zonedRow(2, "B", "configured", "L2"), zonedRow(3, "A", "technician", "L3")]);
  assert.deepEqual(layoutRowsFromResponses(input, {}), [
    { assetReference: "RS-01", locationText: "L1", zoneText: "A" }, { assetReference: "", locationText: "L3", zoneText: "A" }, { assetReference: "RS-02", locationText: "L2", zoneText: "B" }
  ]);
  const corrected = layoutRowsFromResponses(input, { [input.rows[1]!.rowUuid]: { zoneText: "Z" } });
  assert.deepEqual(corrected.map((row) => [row.locationText, row.zoneText]), [["L1", "A"], ["L3", "A"], ["L2", "Z"]]);
  const unzoned = zonedResponses([zonedRow(1, ""), zonedRow(2, "")]);
  assert.ok(layoutRowsFromResponses(unzoned, {}).every((row) => !("zoneText" in row)));
  const legacy = { ...responses([configuredRow(1)]), schemaVersion: 1 as const };
  assert.ok(layoutRowsFromResponses(legacy, {}).every((row) => !("zoneText" in row)));
});

test("a zone-only change makes the layout differ; a missing heading equals a blank one", () => {
  const saved = [{ assetReference: "A", locationText: "L", zoneText: "Zone 1" }];
  assert.equal(layoutDiffersFrom(saved, [{ assetReference: "A", locationText: "L", zoneText: "Zone 1" }]), false);
  assert.equal(layoutDiffersFrom(saved, [{ assetReference: "A", locationText: "L", zoneText: "Zone 2" }]), true);
  assert.equal(layoutDiffersFrom(saved, [{ assetReference: "A", locationText: "L" }]), true);
  assert.equal(layoutDiffersFrom([{ assetReference: "A", locationText: "L" }], [{ assetReference: "A", locationText: "L", zoneText: "" }]), false);
});

// ---- I-35: collapsible zone groups ------------------------------------------------------------------

const noPhoto = () => false;
const done = (row: FireRatedRollerShutterRow): FireRatedRollerShutterRow => ({ ...row, locationText: row.locationText || "Gate", autoAlarmModeResult: "good", manualModeResult: "na" });

test("a shutter is complete only with a location, both results, and each finding's own remark and photo", () => {
  const base = zonedRow(1, "A");
  assert.equal(shutterRowComplete(base, noPhoto), false, "no results yet");
  assert.equal(shutterRowComplete(done(base), noPhoto), true);
  assert.equal(shutterRowComplete({ ...done(base), locationText: "  " }, noPhoto), false, "blank location");
  assert.equal(shutterRowComplete({ ...done(base), manualModeResult: null }, noPhoto), false, "one result missing");
  const finding = { ...done(base), autoAlarmModeResult: "not_good" as const };
  assert.equal(shutterRowComplete(finding, () => true), false, "finding without a remark");
  const remarked = { ...finding, fieldRemarks: { autoAlarmModeResult: "Motor failed" } };
  assert.equal(shutterRowComplete(remarked, noPhoto), false, "finding without a photo");
  assert.equal(shutterRowComplete(remarked, (uuid, wire) => uuid === remarked.rowUuid && wire === "auto_alarm_mode"), true);
  assert.equal(shutterRowComplete(remarked, (_uuid, wire) => wire === "manual_mode"), false, "a photo for the other column does not count");
  assert.equal(shutterRowComplete({ ...remarked, autoAlarmModeResult: "complete_repair" }, () => true), true, "Complete Repair is a finding too");
  assert.equal(shutterRowComplete({ ...done(base), autoAlarmModeResult: "na" }, noPhoto), true, "N.A. needs no evidence");
});

test("zone progress counts complete shutters per group", () => {
  const groups = zoneGroups([done(zonedRow(1, "A")), zonedRow(2, "A"), done(zonedRow(3, "B"))]);
  assert.deepEqual(groups.map((group) => zoneProgress(group, noPhoto)), [{ total: 2, complete: 1 }, { total: 1, complete: 1 }]);
});

test("with two or more zones all but the first start collapsed; one zone has nothing to collapse", () => {
  const several = zoneGroups([zonedRow(1, "A"), zonedRow(2, "B"), zonedRow(3, "C")]);
  assert.deepEqual([...defaultCollapsedKeys(several)], [zoneGroupKey(several[1]!), zoneGroupKey(several[2]!)]);
  assert.equal(defaultCollapsedKeys(zoneGroups([zonedRow(1, "A")])).size, 0);
  assert.equal(defaultCollapsedKeys([]).size, 0);
  assert.equal(zoneGroupKey(several[0]!), several[0]!.rows[0]!.rowUuid, "a group is identified by its first row, so renaming keeps it");
});

// ---- I-38: shutter labels in messages ---------------------------------------------------------------

test("shutter labels follow the zone groups the form shows, restart per zone, and fall back to positions otherwise", () => {
  const zoned = zonedResponses([zonedRow(1, "A"), zonedRow(2, "B"), zonedRow(3, "A"), zonedRow(4, "")]);
  assert.deepEqual(shutterRowLabels(zoned), ["A, Shutter 1", "B, Shutter 1", "A, Shutter 2", "Unnamed zone, Shutter 1"]);
  assert.deepEqual(shutterRowLabels(zonedResponses([zonedRow(1, ""), zonedRow(2, "")])), ["Shutter row 1", "Shutter row 2"], "one unnamed zone shows no headings");
  assert.deepEqual(shutterRowLabels(zonedResponses([zonedRow(1, "North"), zonedRow(2, "North")])), ["North, Shutter 1", "North, Shutter 2"], "a single named zone is shown with its heading");
  assert.deepEqual(shutterRowLabels({ ...zonedResponses([zonedRow(1, "A"), zonedRow(2, "B")]), schemaVersion: 1 }), ["Shutter row 1", "Shutter row 2"], "schema 1 never shows zones");
  assert.deepEqual(shutterRowLabels(zonedResponses([])), []);
});

test("an evidence field path is described by shutter and column, and anything else is left as it is", () => {
  const input = zonedResponses([zonedRow(1, "A"), zonedRow(2, "B")]);
  const path = (uuid: string, wire: string) => `roller_shutter_schedule.roller_shutter_schedule_rows.rows.${uuid}.${wire}`;
  assert.equal(describeShutterEvidencePath(input, path(input.rows[1]!.rowUuid, "auto_alarm_mode")), "B, Shutter 1 Auto Alarm Mode");
  assert.equal(describeShutterEvidencePath(input, path(input.rows[0]!.rowUuid, "manual_mode")), "A, Shutter 1 Manual Mode");
  const unknown = path("11111111-1111-4111-8111-111111111111", "auto_alarm_mode");
  assert.equal(describeShutterEvidencePath(input, unknown), unknown, "a path for a row that is not on the form is not guessed");
  assert.equal(describeShutterEvidencePath(input, "something.else"), "something.else");
});
