import assert from "node:assert/strict";
import test from "node:test";
import { formatCalendarDate, formatDateOrTimestamp, formatMalaysiaDate, formatMalaysiaDateTime, formatMalaysiaIsoDate, formatMalaysiaTime } from "./malaysiaTime.js";
import { buildReportViewModel } from "./reportViewModel.js";
import type { FinalServiceReport } from "./finalServiceReport.js";

test("timestamps are shown in Malaysia time (UTC+8)", () => {
  assert.equal(formatMalaysiaIsoDate("2026-10-21T19:13:00Z"), "2026-10-22");
  assert.equal(formatMalaysiaDate("2026-10-21T19:13:00Z"), "22 Oct 2026");
  assert.equal(formatMalaysiaTime("2026-10-21T19:13:00Z"), "03:13");
  assert.equal(formatMalaysiaDateTime("2026-10-21T19:13:00Z"), "22 Oct 2026 03:13");
  assert.equal(formatMalaysiaDate("2026-10-22T15:59:00Z"), "22 Oct 2026");
  assert.equal(formatMalaysiaIsoDate("2026-10-22T15:59:00Z"), "2026-10-22");
  assert.equal(formatMalaysiaDate("2026-10-22T16:00:00Z"), "23 Oct 2026");
  assert.equal(formatMalaysiaIsoDate("2026-10-22T16:00:00Z"), "2026-10-23");
  assert.throws(() => formatMalaysiaDate("not-a-date"));
});

test("calendar DATE values never shift", () => {
  assert.equal(formatCalendarDate("2026-10-22"), "22 Oct 2026");
  assert.equal(formatDateOrTimestamp("2026-10-22"), "22 Oct 2026");
  assert.equal(formatDateOrTimestamp("2026-12-31"), "31 Dec 2026");
  assert.throws(() => formatCalendarDate("2026-02-31"));
});

test("service report cover Issued uses the Malaysia date; service date is untouched", () => {
  const report = { customer: "C", site: "S", serviceDate: "2026-10-22", jobReference: "J", completedAt: "2026-10-21T19:13:00.000Z", completedBy: "T", systems: [], sections: [] } as unknown as FinalServiceReport;
  const cover = buildReportViewModel(report).cover;
  assert.equal(cover.issuedAt, "2026-10-22");
  assert.equal(cover.serviceDate, "2026-10-22");
  const late = buildReportViewModel({ ...report, completedAt: "2026-10-22T16:00:00.000Z" } as FinalServiceReport).cover;
  assert.equal(late.issuedAt, "2026-10-23");
  assert.equal(buildReportViewModel({ ...report, completedAt: "2026-10-22T15:59:00.000Z" } as FinalServiceReport).cover.issuedAt, "2026-10-22");
});
