import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addTechnicianShutterRows, layoutDiffersFrom, layoutIssue, layoutRowsFromResponses, maxShutterRows,
  newTechnicianShutterRow, parseShutterCount, rollerShutterSetupStep
} from "../src/fireRatedRollerShutter/fireRatedRollerShutterSetup";
import type { FireRatedRollerShutterResponses, FireRatedRollerShutterRow } from "../src/fireRatedRollerShutter/fireRatedRollerShutterTypes";

const configuredRow = (n: number, change: Partial<FireRatedRollerShutterRow> = {}): FireRatedRollerShutterRow => ({
  ...newTechnicianShutterRow(n), source: "configured", configuredLocationId: "11111111-1111-4111-8111-111111111111",
  configuredRowOrdinal: n, locationSnapshot: { id: "11111111-1111-4111-8111-111111111111", displayName: "General" },
  assetReference: `RS-0${n}`, locationText: `Place ${n}`, ...change
});
const responses = (rows: FireRatedRollerShutterRow[], change: Partial<FireRatedRollerShutterResponses> = {}): FireRatedRollerShutterResponses =>
  ({ schemaVersion: 1, dateTested: "", zone: "", inspectedBy: "", rows, comments: "", ...change });

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

test("a layout is proposable only with 1..250 rows that each have a location", () => {
  const row = { assetReference: "", locationText: "Lobby" };
  assert.equal(layoutIssue([row]), undefined);
  assert.equal(layoutIssue(Array(maxShutterRows).fill(row)), undefined);
  assert.ok(layoutIssue([]));
  assert.ok(layoutIssue(Array(maxShutterRows + 1).fill(row)));
  assert.ok(layoutIssue([row, { assetReference: "RS-02", locationText: "   " }]));
});
