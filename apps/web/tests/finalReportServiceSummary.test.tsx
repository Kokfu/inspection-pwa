import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinalReportApiError, loadFinalReport, type FinalReportPreview } from "../src/jobs/finalReportApi.js";
import { FinalReportPresentation } from "../src/jobs/FinalReportPresentation.js";

const detailedFinalReport: FinalReportPreview = {
  customer: "Report Customer", site: "Report Site", serviceDate: "2026-08-21", jobReference: "SV-REPORT-1", completedAt: "2026-08-21T10:00:00.000Z", completedBy: "technician-one",
  systems: [{ systemKey: "hydrant", label: "Hydrant System", status: "Accepted", condition: "GOOD CONDITIONS", conditionDetail: "", locations: ["Zone North", "Gate A"] }],
  sections: [{ systemKey: "hydrant", label: "Hydrant System", location: { locationId: "location-1", locationLabel: "Gate A", zoneId: "zone-1", zoneLabel: "Zone North", instanceKey: "primary" }, fields: [{ label: "Canvas Hose", value: "Good", depth: 2 }], evidence: [{ field: "hosePhoto", available: true, captureSource: "camera", capturedAt: null }] }]
};
void React;

const summarisedFinalReport: FinalReportPreview = {
  ...detailedFinalReport,
  systems: [{ systemKey: "hydrant", label: "Hydrant System", status: "Accepted", condition: "FAILED", conditionDetail: "Canvas Hose: Not Good", locations: ["Lobby"] }],
  sections: [{
    ...detailedFinalReport.sections[0]!, location: undefined, fields: [{ label: "Rows 1 - Row Uuid", value: "6b471a07-fd4e-4397-b994-0ca7ca9e5a41", depth: 0 }],
    summary: {
      condition: "FAILED", counts: { checked: 3, good: 1, notRelevant: 1, findings: 1 },
      findings: [{ where: "No. 2 (Lobby)", label: "Canvas Hose", result: "NOT GOOD", tone: "bad", remark: "Hose leaking at coupling" }],
      checked: [{ where: "No. 1 (Gate A)", label: "Landing Valve", result: "GOOD", tone: "good", remark: null }, { where: "No. 1 (Gate A)", label: "Hose Cabinet", result: "N/A", tone: "na", remark: null }],
      readings: [{ label: "Cut In (PSI)", value: "80" }], comments: "Valve greased."
    }
  }]
};

test("per-service summary shows findings first, folds what passed, and hides internal row keys", () => {
  const html = renderToStaticMarkup(<FinalReportPresentation report={summarisedFinalReport} />);
  assert.match(html, /Needs attention \(1\)/);
  assert.match(html, /Hose leaking at coupling/);
  assert.match(html, /3 checked · 1 good · 1 N\/A · 1 need attention/);
  assert.match(html, /Issues found/);
  assert.match(html, /1 good · 1 N\/A — show checked items/);
  assert.match(html, /Readings and counts \(1\)/);
  assert.match(html, /Valve greased\./);
  assert.match(html, /<details class="service-card service-card--failed">/);
  assert.match(html, /Expand all/);
  // The raw flattened field list is not rendered for a summarised service.
  assert.doesNotMatch(html, /Row Uuid|6b471a07|report-field/);
  // Result is always text, never colour alone.
  assert.match(html, /result-pill--bad">Not good</);
});

test("every service starts collapsed; a clean report says no issues were found", () => {
  const clean: FinalReportPreview = { ...summarisedFinalReport, sections: [{ ...summarisedFinalReport.sections[0]!, summary: { condition: "GOOD CONDITIONS", counts: { checked: 1, good: 1, notRelevant: 0, findings: 0 }, findings: [], checked: [{ where: null, label: "Landing Valve", result: "GOOD", tone: "good", remark: null }], readings: [], comments: null } }] };
  const html = renderToStaticMarkup(<FinalReportPresentation report={clean} />);
  assert.match(html, /<details class="service-card service-card--good">/);
  assert.match(html, /No issues found\./);
  assert.match(html, /Nothing needs attention for this service\./);
  assert.doesNotMatch(html, /Needs attention \(/);
});

test("a section without a summary (legacy record) keeps the existing field list", () => {
  const html = renderToStaticMarkup(<FinalReportPresentation report={detailedFinalReport} />);
  assert.match(html, /report-field--depth-2/);
  assert.doesNotMatch(html, /class="service-card |Expand all|No issues found/);
});

test("final report loading rejects a malformed per-service summary", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const bad = { report: { ...summarisedFinalReport, sections: [{ ...summarisedFinalReport.sections[0]!, summary: { condition: "FAILED", counts: null, findings: "x" } }] } };
    globalThis.fetch = (async () => new Response(JSON.stringify(bad), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    await assert.rejects(() => loadFinalReport("job-1"), (error: unknown) => error instanceof FinalReportApiError && error.kind === "unavailable");
  } finally { globalThis.fetch = originalFetch; }
});
