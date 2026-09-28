import assert from "node:assert/strict";
import test from "node:test";
import { matchesRecurrence, nextRecurringDate } from "./serviceRecurrence.js";

test("weekly recurrence advances from override and skips past visit date", () => {
  const rule = { kind: "weekly" as const, interval: 2, day: 2 };
  assert.equal(matchesRecurrence("2026-09-29", rule), true);
  assert.equal(matchesRecurrence("2026-09-30", rule), false);
  assert.equal(nextRecurringDate("2026-09-29", "2026-10-01", rule), "2026-10-13");
  assert.equal(nextRecurringDate("2026-09-29", "2026-11-01", rule), "2026-11-10");
});

test("monthly recurrence skips months without the selected day", () => {
  const rule = { kind: "monthly" as const, interval: 1 as const, day: 31 };
  assert.equal(nextRecurringDate("2026-01-31", "2026-01-31", rule), "2026-03-31");
  assert.equal(nextRecurringDate("2026-01-31", "2026-04-01", rule), "2026-05-31");
  assert.equal(matchesRecurrence("2026-02-28", rule), false);
});
