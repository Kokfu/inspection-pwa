import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { resolveHoseReelControls } from "../inspections/templates/definitionControls.js";
import type { FinalReportSection, FinalServiceReport } from "./finalServiceReport.js";
import { buildServiceSummary } from "./reportServiceSummary.js";
import { buildSystemPages } from "./reportViewModel.js";
import { createFinalReportHandler } from "../routes/inspectionJobs.js";

const v7 = (key: string) => JSON.parse(JSON.stringify(masterServiceReportV7.systems.find((system) => system.key === key)!)) as Record<string, unknown>;
const uuid = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hoseControls = resolveHoseReelControls(v7("hose_reel"), "MFE-FSSR", 7);
const hoseRow = (n: number, location: string, change: Record<string, unknown> = {}) => ({
  rowUuid: uuid(100 + n), source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: location,
  assetReference: null, sortOrder: n, drumType: "swing", drumResult: "good", hoseResult: "good", nozzleResult: "good", valveResult: "good", nozzleBoxResult: "good",
  remarks: "", fieldRemarks: {}, ...change
});

function hoseReelSection(overrides: { allGood?: boolean } = {}): FinalReportSection {
  const checklist = Object.fromEntries([...hoseControls.checklist.waterTank, ...hoseControls.checklist.pumpHouse, ...hoseControls.checklist.testRunFirePump]
    .map((item) => [item.key, { result: "good", remarks: "" }]));
  if (!overrides.allGood) checklist.battery_serviceable = { result: "complete_repair", remarks: "Battery replaced on site" };
  checklist.trfp_standby_pump = { result: "na", remarks: "" };
  const response = {
    schemaVersion: 3, checklist,
    measurements: { jockey_pump_pressure: { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "good", remarks: "" }, standby_pump_cut_in: { values: { value: 70 }, unit: "PSI", result: "good", remarks: "" } },
    drumCount: 2,
    rows: [
      hoseRow(1, "G/F Main Entrance"),
      hoseRow(2, "1/F Office Corridor", overrides.allGood ? {} : { hoseResult: "not_good", fieldRemarks: { hoseResult: "Hose leaking at coupling" } })
    ],
    comments: "Pump room clean on departure."
  };
  const section: FinalReportSection = { systemKey: "hose_reel", label: "Hose Reel System", fields: [], evidence: [] };
  // As in loadFinalServiceReport: the accepted authority rides on a non-enumerable property.
  Object.defineProperty(section, "source", { enumerable: false, value: {
      snapshot: { schemaVersion: 2, template: { id: masterServiceReportV7.id, code: "MFE-FSSR", version: 7 }, system: { key: "hose_reel", systemKey: "hose_reel", definition: v7("hose_reel") } },
      response, frozenSystem: { systemKey: "hose_reel" }
  } });
  return section;
}

const reportOf = (sections: FinalReportSection[]) => ({
  customer: "C", site: "S", serviceDate: "2026-09-18", jobReference: "JOB-1", completedAt: "2026-09-18T08:40:00.000Z", completedBy: "tech",
  systems: [], sections
}) as unknown as FinalServiceReport;

test("a V7 service summary lists findings first with their own remark and collapses everything that passed", () => {
  const [page] = buildSystemPages(reportOf([hoseReelSection()]));
  const summary = buildServiceSummary(page!)!;
  assert.equal(summary.condition, "FAILED");
  assert.deepEqual(summary.findings.map((item) => [item.where, item.label, item.result, item.remark]), [
    ["Pump House", "Battery In Good Serviceable / Function", "COMPLETE REPAIR", "Battery replaced on site"],
    ["Hose Reel Drum — No. 2 (1/F Office Corridor)", "Hose", "NOT GOOD", "Hose leaking at coupling"]
  ]);
  assert.equal(summary.counts.findings, 2);
  assert.equal(summary.counts.checked, summary.findings.length + summary.checked.length);
  assert.equal(summary.counts.good + summary.counts.notRelevant, summary.checked.length);
  assert.ok(summary.counts.notRelevant >= 1, "the N/A standby pump is counted as not relevant, not good");
  assert.ok(summary.checked.every((item) => item.tone === "good" || item.tone === "na"));
  assert.equal(summary.comments, "Pump room clean on departure.");
  assert.ok(summary.readings.some((reading) => reading.value.includes("80")), "measurement readings are kept as readings, not counted as checks");
});

test("a service with no findings reports GOOD CONDITIONS and an empty findings list", () => {
  const [page] = buildSystemPages(reportOf([hoseReelSection({ allGood: true })]));
  const summary = buildServiceSummary(page!)!;
  assert.equal(summary.condition, "GOOD CONDITIONS");
  assert.deepEqual(summary.findings, []);
  assert.equal(summary.counts.findings, 0);
  assert.ok(summary.counts.good > 0);
});

test("internal row keys never reach the summary", () => {
  const [page] = buildSystemPages(reportOf([hoseReelSection()]));
  const text = JSON.stringify(buildServiceSummary(page!));
  assert.doesNotMatch(text, /rowUuid|sortOrder|zoneSnapshot|locationSnapshot|configuredLocationId|70000000-0000-4000/i);
});

test("a legacy (non-V7) page has no summary, so the screen keeps its field list", () => {
  const legacy: FinalReportSection = { systemKey: "hydrant", label: "Hydrant System", fields: [{ label: "Canvas Hose", value: "Good", depth: 0 }], evidence: [] };
  const [page] = buildSystemPages(reportOf([legacy]));
  assert.equal(page!.structure, "legacy");
  assert.equal(buildServiceSummary(page!), undefined);
});

test("the final-report route adds the summary to V7 sections only and never leaks the source authority", async () => {
  const legacy: FinalReportSection = { systemKey: "hydrant", label: "Hydrant System", fields: [{ label: "Canvas Hose", value: "Good", depth: 0 }], evidence: [] };
  const report = reportOf([hoseReelSection(), legacy]);
  let body: unknown;
  const response = { setHeader: () => undefined, json: (value: unknown) => { body = value; } };
  const handler = createFinalReportHandler({ database: { query: async () => ({ rows: [], rowCount: 0 }) } as never, loadReport: async () => report });
  await handler({ params: { jobId: "11111111-1111-4111-8111-111111111111" }, currentUser: { role: "technician" } } as never, response as never, (error: unknown) => { throw error; });
  const sections = (body as { report: { sections: Array<{ summary?: { condition: string; counts: { findings: number } } }> } }).report.sections;
  assert.equal(sections[0]!.summary?.condition, "FAILED");
  assert.equal(sections[0]!.summary?.counts.findings, 2);
  assert.equal(sections[1]!.summary, undefined);
  assert.doesNotMatch(JSON.stringify(body), /\"source\"|rowUuid/);
});
