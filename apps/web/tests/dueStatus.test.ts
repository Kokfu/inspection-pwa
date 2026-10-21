import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDue,
  compareByUrgency,
  daysUntilDue,
  dueLabel,
  formatDueDate,
  localToday,
  technicianGroup
} from "../src/schedule/dueStatus";

const TODAY = "2026-09-30";
const offset = (days: number) => new Date(Date.UTC(2026, 8, 30 + days)).toISOString().slice(0, 10);

test("boundaries classify as specified", () => {
  for (const [days, status, group] of [
    [-1, "overdue", "overdue"],
    [0, "due_soon", "this_week"],
    [1, "due_soon", "this_week"],
    [7, "due_soon", "this_week"],
    [8, "due_soon", "later"],
    [30, "due_soon", "later"],
    [31, "later", "later"]
  ] as const) {
    assert.deepEqual(classifyDue(offset(days), TODAY), { status, days }, `status ${days}`);
    assert.equal(technicianGroup(offset(days), TODAY), group, `group ${days}`);
  }
});

test("null is not_scheduled", () => {
  assert.deepEqual(classifyDue(null, TODAY), { status: "not_scheduled", days: null });
  assert.equal(technicianGroup(null, TODAY), "not_scheduled");
  assert.equal(daysUntilDue(null, TODAY), null);
  assert.equal(dueLabel(null, TODAY), "Not scheduled");
});

test("month, year and leap-day rollover", () => {
  assert.equal(daysUntilDue("2026-10-01", "2026-09-30"), 1);
  assert.equal(daysUntilDue("2027-01-01", "2026-12-31"), 1);
  assert.equal(daysUntilDue("2026-12-31", "2027-01-01"), -1);
  assert.equal(daysUntilDue("2028-03-01", "2028-02-28"), 2);
  assert.equal(daysUntilDue("2028-02-29", "2028-02-28"), 1);
  assert.equal(daysUntilDue("2027-03-01", "2027-02-28"), 1);
  assert.equal(daysUntilDue("2027-09-30", "2026-09-30"), 365);
});

test("malformed dates throw for dueDate and today", () => {
  for (const bad of ["2026-02-30", "2026-9-30", "", "30/09/2026", "2026-13-01", "2026-00-10", "2026-09-31", "2027-02-29", " 2026-09-30", "2026-09-30T00:00:00Z"]) {
    assert.throws(() => daysUntilDue(bad, TODAY), /Invalid dueDate/, bad);
    assert.throws(() => classifyDue(bad, TODAY), /Invalid dueDate/, bad);
    assert.throws(() => technicianGroup(bad, TODAY), /Invalid dueDate/, bad);
    assert.throws(() => dueLabel(bad, TODAY), /Invalid dueDate/, bad);
    assert.throws(() => formatDueDate(bad), /Invalid dueDate/, bad);
    assert.throws(() => daysUntilDue(TODAY, bad), /Invalid today/, bad);
    assert.throws(() => daysUntilDue(null, bad), /Invalid today/, bad);
  }
  assert.doesNotThrow(() => daysUntilDue("2028-02-29", TODAY));
});

test("labels are singular and plural", () => {
  assert.equal(dueLabel(offset(-21), TODAY), "21 days overdue");
  assert.equal(dueLabel(offset(-1), TODAY), "1 day overdue");
  assert.equal(dueLabel(offset(0), TODAY), "Due today");
  assert.equal(dueLabel(offset(1), TODAY), "In 1 day");
  assert.equal(dueLabel(offset(7), TODAY), "In 7 days");
});

test("formatDueDate uses fixed English month names", () => {
  assert.equal(formatDueDate("2026-09-30"), "30 Sep 2026");
  assert.equal(formatDueDate("2026-01-05"), "5 Jan 2026");
  assert.equal(formatDueDate("2028-02-29"), "29 Feb 2028");
  assert.equal(formatDueDate("2026-12-01"), "1 Dec 2026");
});

test("localToday formats device-local date", () => {
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59, 59)), "2026-01-05");
  assert.equal(localToday(new Date(2026, 11, 31, 0, 0, 0)), "2026-12-31");
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test("compareByUrgency orders overdue-most-late, soonest, unscheduled last, then name", () => {
  const rows = [
    { dueDate: null, name: "Zeta" },
    { dueDate: "2026-10-05", name: "Bravo" },
    { dueDate: "2026-09-01", name: "Late" },
    { dueDate: null, name: "Alpha" },
    { dueDate: "2026-10-05", name: "Alpha" },
    { dueDate: "2026-09-20", name: "Less late" },
    { dueDate: "2027-01-01", name: "Far" }
  ];
  assert.deepEqual(
    [...rows].sort(compareByUrgency).map((r) => `${r.dueDate}|${r.name}`),
    ["2026-09-01|Late", "2026-09-20|Less late", "2026-10-05|Alpha", "2026-10-05|Bravo", "2027-01-01|Far", "null|Alpha", "null|Zeta"]
  );
  assert.throws(() => compareByUrgency({ dueDate: "bad", name: "a" }, { dueDate: null, name: "b" }), /Invalid dueDate/);
});

test("results are identical under different process time zones", () => {
  const original = process.env.TZ;
  const results: string[] = [];
  try {
    for (const [tz, expectedOffset] of [["Asia/Kuala_Lumpur", -480], ["America/Los_Angeles", 420]] as const) {
      process.env.TZ = tz;
      const probe = new Date(Date.UTC(2026, 9, 1, 12)).getTimezoneOffset();
      assert.equal(probe, expectedOffset, `TZ ${tz} took effect`);
      results.push(JSON.stringify([
        ["2026-03-08", "2026-11-01", "2026-10-25", "2028-02-29", "2026-09-29", "2026-09-30", "2026-10-31"].map((d) => [
          daysUntilDue(d, TODAY), classifyDue(d, TODAY), technicianGroup(d, TODAY), dueLabel(d, TODAY), formatDueDate(d)
        ]),
        daysUntilDue("2026-11-02", "2026-11-01"),
        daysUntilDue("2026-03-09", "2026-03-08")
      ]));
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
  assert.equal(results[0], results[1]);
});
