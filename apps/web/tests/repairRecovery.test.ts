import assert from "node:assert/strict";
import { test } from "node:test";
import { repairRecovery } from "../src/repairs/repairUiRepository";

// I-69: after an in-place update, Submit Locally timed out twice on the phone until Chrome was restarted.
// The guidance must tell the technician what cleared it and must not name only Save Draft.
test("storage timeout guidance covers Submit and tells the technician to close other tabs or restart", () => {
  const text = repairRecovery("REPAIR_LOCAL_STORAGE_TIMEOUT");
  assert.match(text, /another open Inspection tab/i);
  assert.match(text, /close the other tabs or restart the browser/i);
  assert.match(text, /retry\./);
  assert.doesNotMatch(text, /retry Save Draft/);
  assert.match(text, /Internet is not required/);
  assert.match(text, /not confirmed saved/);
});

test("other storage outcomes keep their own guidance", () => {
  assert.match(repairRecovery("REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN"), /may already be saved/);
  assert.match(repairRecovery("REPAIR_PHOTO_VERIFICATION_TIMEOUT"), /Retry Submit Locally/);
});
