import assert from "node:assert/strict";
import test from "node:test";
import { captureScrollHold, SCROLL_HOLD_MAX_AGE_MS, shouldRestoreScroll } from "../src/jobs/formScrollContinuity.js";

/** CR-06: the form comes back where the technician was after a re-verification hid it. */

const HASH = "#/hydrant-form/uuid-1";

test("a hold is captured only while a Draft form is open and scrolled", () => {
  assert.deepEqual(captureScrollHold(true, 1400, HASH, 1000, null), { y: 1400, hash: HASH, at: 1000 });
  assert.equal(captureScrollHold(false, 1400, HASH, 1000, null), null, "no form open: nothing to put back");
  assert.equal(captureScrollHold(true, 0, HASH, 1000, null), null, "already at the top: nothing to restore");
  assert.equal(captureScrollHold(true, Number.NaN, HASH, 1000, null), null, "unreadable scroll position");
});

test("while the form is on screen its position wins; once it is gone the earlier capture is kept", () => {
  const first = { y: 1400, hash: HASH, at: 1000 };
  assert.deepEqual(captureScrollHold(true, 900, HASH, 2000, first), { y: 900, hash: HASH, at: 2000 }, "technician scrolled, then another hand-over");
  // The second hand-over arrives while the placeholder is up: the page has collapsed, so scrollY (108) is not the truth.
  assert.equal(captureScrollHold(false, 108, HASH, 2000, first), first);
  assert.equal(captureScrollHold(false, 108, HASH, 1000 + SCROLL_HOLD_MAX_AGE_MS + 1, first), null, "an old hold is dropped");
});

test("restore only for the same route, and only while the hold is fresh", () => {
  const hold = { y: 1400, hash: HASH, at: 1000 };
  assert.equal(shouldRestoreScroll(hold, HASH, 1500), true);
  assert.equal(shouldRestoreScroll(hold, "#/sprinkler-form/uuid-2", 1500), false, "another form must start at its own top");
  assert.equal(shouldRestoreScroll(hold, HASH, 1000 + SCROLL_HOLD_MAX_AGE_MS + 1), false, "stale");
  assert.equal(shouldRestoreScroll(null, HASH, 1500), false);
});
