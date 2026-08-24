import assert from "node:assert/strict";
import test from "node:test";
import {
  formatClientDate,
  formatClientDateTime,
  inspectionActionLabel,
  inspectionSyncMessage,
  isRoutineJobCountMessage
} from "../src/uiPresentation.js";

test("client dates use one human-facing format without changing source values", () => {
  assert.equal(formatClientDate("2026-08-19"), "19 Aug 2026");
  assert.match(formatClientDateTime("2026-08-19T05:04:00.000Z"), /^19 Aug 2026, \d{1,2}:\d{2} (AM|PM)$/);
  assert.equal(formatClientDate("not-a-date"), "Date unavailable");
});

test("local inspection lifecycle wording describes the existing persisted states", () => {
  assert.equal(inspectionSyncMessage("Draft"), "Saved on this device.");
  assert.equal(inspectionSyncMessage("Pending"), "Submitted on this device — waiting to sync.");
  assert.equal(inspectionSyncMessage("Syncing"), "Sending changes…");
  assert.equal(inspectionSyncMessage("Synced"), "Inspection complete and synced.");
  assert.equal(inspectionSyncMessage("Conflict"), "Needs attention — your saved work is still on this device.");
});

test("system actions match technician-facing lifecycle states", () => {
  assert.equal(inspectionActionLabel("Not Started"), "Start inspection");
  assert.equal(inspectionActionLabel("Draft"), "Continue inspection");
  assert.equal(inspectionActionLabel("Pending Sync"), "View inspection");
  assert.equal(inspectionActionLabel("Completed"), "View inspection");
  assert.equal(inspectionActionLabel("Conflict"), "Review inspection");
});

test("routine job-count refresh messages do not duplicate the page subtitle", () => {
  assert.equal(isRoutineJobCountMessage("6 jobs available on this device", 6), true);
  assert.equal(isRoutineJobCountMessage("1 job available on this device", 1), true);
  assert.equal(isRoutineJobCountMessage("Sync failed", 6), false);
});
