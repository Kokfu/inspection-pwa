import assert from "node:assert/strict";
import test from "node:test";
import { autosaveStatusText, getAutosaveStatus, publishAutosaveStatus, setAutosaveActive } from "../src/inspectionControls/autosaveStatus.js";

/** I-18: the visible autosave state. */

test("every state that matters has words (not colour alone); an untouched form says nothing", () => {
  assert.equal(autosaveStatusText("idle"), null);
  assert.match(autosaveStatusText("pending")!, /Unsaved changes/);
  assert.match(autosaveStatusText("saving")!, /Saving on this device/);
  assert.match(autosaveStatusText("saved")!, /Autosaved on this device/);
  assert.match(autosaveStatusText("error")!, /Could not save on this device/);
  assert.equal(new Set(["pending", "saving", "saved", "error"].map((s) => autosaveStatusText(s as never))).size, 4, "all distinct");
});

test("'saved' stays visible when the autosaver reports idle after the record echo, until the next change", () => {
  setAutosaveActive(true);
  publishAutosaveStatus("pending");
  publishAutosaveStatus("saving");
  publishAutosaveStatus("saved");
  publishAutosaveStatus("idle");
  assert.equal(getAutosaveStatus().status, "saved");
  publishAutosaveStatus("pending");
  assert.equal(getAutosaveStatus().status, "pending");
  publishAutosaveStatus("error");
  publishAutosaveStatus("idle");
  assert.equal(getAutosaveStatus().status, "idle", "idle after an error clears it (retry succeeded or the form was reset)");
});

test("leaving the form (or a non-Draft record) hides the line and resets the state", () => {
  setAutosaveActive(true);
  publishAutosaveStatus("saved");
  setAutosaveActive(false);
  assert.deepEqual(getAutosaveStatus(), { active: false, status: "idle" });
  setAutosaveActive(true);
  assert.equal(getAutosaveStatus().status, "idle", "a newly opened form starts untouched");
  setAutosaveActive(false);
});
