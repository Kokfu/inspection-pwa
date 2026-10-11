import assert from "node:assert/strict";
import test from "node:test";
import { decideRowLayout, nextSortOrders, parseRowCount, rowLayoutDiffers, rowLayoutIssue, rowLayoutNote, rowSetupStep, type LayoutLimits } from "../src/inspectionControls/rowLayout.js";
import { proposalAlreadyPendingMessage } from "../src/referenceData/proposalMessages.js";

/** Phase 3: the pure rules behind 'how many / same as last time / saved automatically' for the row-based systems. */

const limits: LayoutLimits = { rows: 500, location: 300, assetReference: 200 };
const row = (locationText: string, assetReference = "", drumType?: string) => ({ assetReference, locationText, ...(drumType === undefined ? {} : { drumType }) });

test("the setup step: nothing entered asks (count without a saved layout, confirm with one); real work skips it", () => {
  assert.equal(rowSetupStep({ untouched: true, hasSavedLayout: false }), "count");
  assert.equal(rowSetupStep({ untouched: true, hasSavedLayout: true }), "confirm");
  assert.equal(rowSetupStep({ untouched: false, hasSavedLayout: false }), null);
  assert.equal(rowSetupStep({ untouched: false, hasSavedLayout: true }), null);
});

test("parseRowCount accepts whole numbers in range and rejects everything else", () => {
  assert.equal(parseRowCount("3", 1, 500), 3);
  assert.equal(parseRowCount(" 12 ", 1, 500), 12);
  assert.equal(parseRowCount("500", 1, 500), 500);
  assert.equal(parseRowCount("0", 0, 5), 0);
  for (const bad of ["", "0", "501", "-1", "2.5", "1e2", "+3", "abc", "1 2", "1000"]) assert.equal(parseRowCount(bad, 1, 500), undefined, JSON.stringify(bad));
  assert.equal(parseRowCount("6", 0, 5), undefined);
});

test("the layout limits mirror the server's: 1..rows, a location on every row, text lengths", () => {
  assert.equal(rowLayoutIssue([row("Gate")], limits, "hydrant"), undefined);
  assert.match(rowLayoutIssue([], limits, "hydrant")!, /at least one hydrant/);
  assert.match(rowLayoutIssue(Array.from({ length: 501 }, () => row("x")), limits, "hydrant")!, /at least one hydrant/);
  assert.match(rowLayoutIssue([row("Gate"), row("  ")], limits, "hydrant")!, /location/);
  assert.match(rowLayoutIssue([row("x".repeat(301))], limits, "hydrant")!, /too long/);
  assert.match(rowLayoutIssue([row("Gate", "a".repeat(201))], limits, "hydrant")!, /too long/);
  assert.equal(rowLayoutIssue([row("x".repeat(300), "a".repeat(200))], limits, "hydrant"), undefined);
});

test("a layout differs by count, order, reference, location or drum type", () => {
  const saved = [row("Lobby", "H-1"), row("Roof", "H-2")];
  assert.equal(rowLayoutDiffers(saved, [row("Lobby", "H-1"), row("Roof", "H-2")]), false);
  assert.equal(rowLayoutDiffers(saved, [row("Lobby", "H-1")]), true);
  assert.equal(rowLayoutDiffers(saved, [...saved, row("Yard")]), true);
  assert.equal(rowLayoutDiffers(saved, [row("Roof", "H-2"), row("Lobby", "H-1")]), true);
  assert.equal(rowLayoutDiffers(saved, [row("Lobby", "H-9"), row("Roof", "H-2")]), true);
  assert.equal(rowLayoutDiffers([row("Drum", "", "swing")], [row("Drum", "", "fixed")]), true);
  assert.equal(rowLayoutDiffers([row("Drum")], [row("Drum", "", "")]), false, "no drum type and an empty one are the same");
});

test("the submit-time decision: skip when unchanged, note when invalid or already sent, send otherwise", () => {
  const saved = [row("Lobby")], changed = [row("Lobby"), row("Roof")];
  assert.deepEqual(decideRowLayout(saved, saved, undefined, false, limits, "hydrant"), { action: "skip" });
  assert.deepEqual(decideRowLayout(saved, changed, undefined, false, limits, "hydrant"), { action: "send" });
  assert.deepEqual(decideRowLayout(saved, changed, "Draft", false, limits, "hydrant"), { action: "send" });
  const invalid = decideRowLayout(saved, [row("Lobby"), row("")], undefined, false, limits, "hydrant");
  assert.equal(invalid.action, "note");
  assert.match((invalid as { note: string }).note, /layout was not saved for next visit/);
  for (const status of ["Pending", "Synced", "Failed"]) {
    const decision = decideRowLayout(saved, changed, status, false, limits, "hydrant");
    assert.equal(decision.action, "note", status);
    assert.match((decision as { note: string }).note, /already sent for review/);
  }
  assert.deepEqual(decideRowLayout(saved, changed, "Failed", true, limits, "hydrant"), { action: "send" }, "a proposal held behind an earlier one was never sent");
  assert.deepEqual(decideRowLayout([], [row("Gate")], undefined, false, limits, "hydrant"), { action: "send" }, "a first layout is always proposed");
});

test("the layout note follows the stored proposal and uses the system's own word", () => {
  assert.equal(rowLayoutNote(undefined, false, "hydrant"), "");
  assert.equal(rowLayoutNote({ status: "Draft" }, false, "hydrant"), "");
  assert.match(rowLayoutNote({ status: "Pending" }, false, "hose reel"), /^Hose reel layout saved on this device\./);
  assert.match(rowLayoutNote({ status: "Synced" }, false, "hydrant"), /^Hydrant layout sent to an Admin for approval\./);
  assert.match(rowLayoutNote({ status: "Failed" }, false, "hydrant"), /needs attention/);
  const held = rowLayoutNote({ status: "Failed" }, true, "hydrant");
  assert.match(held, /already waiting for Admin review/);
  assert.doesNotMatch(held, /needs attention/);
  assert.ok(proposalAlreadyPendingMessage.includes("already waiting for Admin review"));
});

test("nextSortOrders numbers new rows after the existing ones", () => {
  assert.deepEqual(nextSortOrders(3, 2), [4, 5]);
  assert.deepEqual(nextSortOrders(0, 0), []);
  assert.deepEqual(nextSortOrders(2, -1), []);
});
