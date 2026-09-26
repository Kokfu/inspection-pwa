import assert from "node:assert/strict";
import test from "node:test";
import { buildReportViewModel } from "./reportViewModel.js";
import { renderReportHtml } from "./template/renderReportHtml.js";
import type { FinalServiceReport } from "./finalServiceReport.js";

const report: FinalServiceReport = {
  customer: "Customer", site: "Site", serviceDate: "2026-09-18", jobReference: "SV-REVIEW",
  completedAt: "2026-09-18T10:00:00.000Z", completedBy: "Technician One",
  systems: [{ systemKey: "wet_chemical", label: "Wet Chemical", status: "Accepted", condition: "GOOD CONDITIONS", conditionDetail: "", locations: [] }],
  sections: [{ systemKey: "wet_chemical", label: "Wet Chemical", fields: [{ label: "Main Supply", value: "Good", depth: 0 }], evidence: [],
    review: { status: "pending", submittedBy: "technician-one", reviewedBy: null, reviewedAt: null } }]
};

test("V7 report pages print the technician and current supervisor review state", () => {
  const pending = renderReportHtml(buildReportViewModel(report));
  assert.match(pending, /Submitted by Technician:<\/b> technician-one/);
  assert.match(pending, /Pending Review/);
  const reviewed: FinalServiceReport = { ...report, sections: [{ ...report.sections[0]!, review: {
    status: "reviewed", submittedBy: "technician-one", reviewedBy: "review-lead", reviewedAt: "2026-09-20T03:00:00.000Z"
  } }] };
  const approved = renderReportHtml(buildReportViewModel(reviewed));
  assert.match(approved, /Reviewed by Supervisor:<\/b> review-lead/);
  assert.doesNotMatch(approved, /Pending Review/);
  const historical = renderReportHtml(buildReportViewModel({ ...report, sections: [{ ...report.sections[0]!, review: undefined }] }));
  assert.doesNotMatch(historical, /Submitted by Technician|Pending Review|Reviewed by Supervisor/);
});
