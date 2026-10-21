import assert from "node:assert/strict";
import test from "node:test";
import { addDays, daysInMonth, groupByDate, mondayIndex, monthGrid, monthOf, monthTitle, shiftMonth, shortDate, weekdayDate } from "../src/schedule/calendarMonth";

test("October 2026 starts on Thursday with three leading out-of-month cells", () => {
  const grid = monthGrid(2026, 10);
  assert.equal(grid.length, 5);
  assert.ok(grid.every((week) => week.length === 7));
  assert.deepEqual(grid[0].map((cell) => cell.date), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.deepEqual(grid[0].map((cell) => cell.inMonth), [false, false, false, true, true, true, true]);
  assert.equal(grid.flat().filter((cell) => cell.inMonth).length, 31);
  assert.equal(grid[4][6].date, "2026-11-01");
  assert.equal(grid[4][6].inMonth, false);
});

test("February 2028 is a leap month", () => {
  const cells = monthGrid(2028, 2).flat();
  assert.equal(cells.filter((cell) => cell.inMonth).length, 29);
  assert.ok(cells.some((cell) => cell.date === "2028-02-29" && cell.inMonth));
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2027, 2), 28);
});

test("December rolls into January and back", () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2027, 1, -1), { year: 2026, month: 12 });
  assert.deepEqual(shiftMonth(2026, 10, 14), { year: 2027, month: 12 });
  assert.deepEqual(shiftMonth(2026, 1, -13), { year: 2024, month: 12 });
  assert.deepEqual(shiftMonth(2026, 5, 0), { year: 2026, month: 5 });
});

test("a 28-day month starting on Monday needs exactly four rows", () => {
  const grid = monthGrid(2027, 2);
  assert.equal(grid.length, 4);
  assert.ok(grid.flat().every((cell) => cell.inMonth));
});

test("a 6-row month", () => {
  const grid = monthGrid(2026, 8); // 1 Aug 2026 is a Saturday, 31 days
  assert.equal(grid.length, 6);
  assert.deepEqual(grid[0].map((cell) => cell.inMonth), [false, false, false, false, false, true, true]);
  assert.equal(grid[5][0].date, "2026-08-31");
  assert.equal(grid[5][1].inMonth, false);
});

test("invalid year or month throws", () => {
  for (const [year, month] of [[2026, 0], [2026, 13], [2026, 1.5], [0, 1], [10000, 1], [Number.NaN, 5], [2026, Number.NaN]] as const) {
    assert.throws(() => monthGrid(year, month), `grid ${year}-${month}`);
    assert.throws(() => monthTitle(year, month), `title ${year}-${month}`);
    assert.throws(() => shiftMonth(year, month, 1), `shift ${year}-${month}`);
  }
  assert.throws(() => shiftMonth(2026, 1, 0.5));
  assert.throws(() => shiftMonth(9999, 12, 1));
  assert.throws(() => shiftMonth(1, 1, -1));
});

test("monthTitle uses fixed English names", () => {
  assert.equal(monthTitle(2026, 10), "October 2026");
  assert.equal(monthTitle(2027, 1), "January 2027");
});

test("date helpers are date-only and strict", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(mondayIndex("2026-10-19"), 0);
  assert.equal(mondayIndex("2026-10-25"), 6);
  assert.deepEqual(monthOf("2026-10-21"), { year: 2026, month: 10 });
  assert.equal(shortDate("2026-10-28"), "28 Oct 2026");
  assert.equal(weekdayDate("2026-10-28"), "Wed 28 Oct 2026");
  for (const bad of ["2026-02-30", "2026-13-01", "2026-1-01", "26-10-01", "", "2026-10-01T00:00:00Z"]) {
    assert.throws(() => addDays(bad, 1), bad);
    assert.throws(() => shortDate(bad), bad);
  }
});

test("groupByDate groups, orders by name within a day, skips null dates and throws on malformed ones", () => {
  const items = [
    { id: "a", name: "Zeta", due: "2026-10-28" },
    { id: "b", name: "Alpha", due: "2026-10-28" },
    { id: "c", name: "Mid", due: "2026-10-05" },
    { id: "d", name: "Nobody", due: null }
  ];
  const grouped = groupByDate(items, (item) => item.due);
  assert.deepEqual([...grouped.keys()].sort(), ["2026-10-05", "2026-10-28"]);
  assert.deepEqual(grouped.get("2026-10-28")?.map((item) => item.id), ["b", "a"]);
  assert.equal(grouped.get("2026-10-05")?.length, 1);
  assert.equal(groupByDate([], () => null).size, 0);
  assert.throws(() => groupByDate([{ name: "Bad", due: "2026-02-30" }], (item) => item.due));
  assert.throws(() => groupByDate([{ name: "Bad", due: "soon" }], (item) => item.due));
});
