import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../../api/src/inspections/evidence/v7EvidenceContracts";
import { submitIssues } from "../src/smokeVentilation/smokeVentilationRepository";
import type { SmokeVentilationInspectionRecord, SmokeVentilationResponses } from "../src/smokeVentilation/smokeVentilationTypes";
import { smokeVentilationChecklistFields } from "../src/smokeVentilation/smokeVentilationTypes";
import { resolveSmokeVentilationChecklistDefinitions, resolveSmokeVentilationRowResultDefinitions, v7RequiredSmokeVentilationFieldPaths, v7SmokeVentilationSubmissionIssues } from "../src/smokeVentilation/smokeVentilationV7Evidence";

const uuid = "00000000-0000-4000-8000-000000000099";
const hash = (char: string) => char.repeat(64);
const definition = masterServiceReportV7.systems.find((system) => system.key === "smoke_ventilation")!;
const record = { masterTemplate: { version: 7 }, inspectionSnapshot: { system: { definition, locations: [] } } } as unknown as SmokeVentilationInspectionRecord;

function responses(overrides: Partial<SmokeVentilationResponses> = {}): SmokeVentilationResponses {
  return {
    schemaVersion: 1, controlPanelNo: "1", location: "Roof", dateTested: "2026-09-05",
    checklist: Object.fromEntries(smokeVentilationChecklistFields.map(([key]) => [key, { result: "good", remarks: "" }])) as SmokeVentilationResponses["checklist"],
    rows: [{
      rowUuid: uuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null,
      assetReference: "1", autoResult: "good", manualResult: "good", remarks: "", fieldRemarks: {}, sortOrder: 1
    }],
    comments: "", ...overrides
  };
}

const rowPath = (wire: "auto" | "manual") => `fan_schedule.fan_schedule_rows.rows.${uuid}.${wire}`;
const checklistPath = (key: string) => `smoke_ventilation_checks.${key}`;
const attachment = (path: string, sha256: string) => ({ photoUuid: crypto.randomUUID(), inspectionClientUuid: uuid, systemKey: "smoke_ventilation", fieldPath: path, sha256, protocolVersion: 7 }) as unknown as Parameters<typeof v7SmokeVentilationSubmissionIssues>[2][number];

/** One finding in each of this system's two evidence scopes. */
function withFindings(): SmokeVentilationResponses {
  const draft = responses();
  draft.checklist.secondary_essential_supply_dc = { result: "not_good", remarks: "DC supply reading is low" };
  draft.rows[0]!.autoResult = "complete_repair";
  draft.rows[0]!.fieldRemarks = { autoResult: "Auto mode repaired on site" };
  return draft;
}
const bothPhotos = () => [attachment(checklistPath("secondary_essential_supply_dc"), hash("a")), attachment(rowPath("auto"), hash("b"))];

test("a complete V7 Smoke Ventilation draft raises no evidence issues", () => {
  assert.deepEqual(v7SmokeVentilationSubmissionIssues(record, responses(), []), []);
  assert.deepEqual(submitIssues(record, responses(), []), []);
});

test("a checklist finding without its own remark is refused", () => {
  const draft = withFindings();
  draft.checklist.secondary_essential_supply_dc = { result: "not_good", remarks: "" };
  const issues = v7SmokeVentilationSubmissionIssues(record, draft, bothPhotos());
  assert.ok(issues.some((issue) => /Secondary Essential Supply \(DC\) requires its own Remark/.test(issue)), JSON.stringify(issues));
});

test("a Fan Schedule row finding without its own remark is refused", () => {
  const draft = withFindings();
  draft.rows[0]!.fieldRemarks = {};
  const issues = v7SmokeVentilationSubmissionIssues(record, draft, bothPhotos());
  assert.ok(issues.some((issue) => /Fan Schedule row 1 Auto requires its own Remark/.test(issue)), JSON.stringify(issues));
});

test("a V7 finding without its own photo is refused", () => {
  const issues = v7SmokeVentilationSubmissionIssues(record, withFindings(), [attachment(checklistPath("secondary_essential_supply_dc"), hash("a"))]);
  assert.ok(issues.some((issue) => new RegExp(`${rowPath("auto")} requires its own Photo`).test(issue)), JSON.stringify(issues));
});

test("one photo reused across a checklist finding and a row finding is refused before it can be queued", () => {
  const issues = v7SmokeVentilationSubmissionIssues(record, withFindings(), [
    attachment(checklistPath("secondary_essential_supply_dc"), hash("a")), attachment(rowPath("auto"), hash("a"))
  ]);
  assert.ok(issues.some((issue) => /use the same photo; each finding needs its own photo/.test(issue)), `expected duplicate-photo issue, got ${JSON.stringify(issues)}`);
});

test("a stale Smoke Ventilation finding reverted to good or na is excluded from the gate", () => {
  for (const value of ["good", "na"] as const) {
    const draft = withFindings();
    draft.checklist.secondary_essential_supply_dc = { result: value, remarks: "" };
    draft.rows[0]!.autoResult = value;
    draft.rows[0]!.fieldRemarks = {};
    // Both photos linger in IndexedDB but neither field is a finding any more.
    assert.deepEqual(v7SmokeVentilationSubmissionIssues(record, draft, bothPhotos()), [], `${value} must exclude stale evidence`);
  }
});

test("an unanswered checklist or row result is refused", () => {
  const missingChecklist = responses();
  (missingChecklist.checklist as Record<string, unknown>).cb_charger = { result: null, remarks: "" };
  assert.ok(v7SmokeVentilationSubmissionIssues(record, missingChecklist, []).some((issue) => /Charger result is required/.test(issue)));
  const missingRow = responses();
  missingRow.rows[0]!.manualResult = null;
  assert.ok(v7SmokeVentilationSubmissionIssues(record, missingRow, []).some((issue) => /Fan Schedule row 1 Manual result is required/.test(issue)));
});

test("an empty Fan Schedule is refused by the structural gate", () => {
  assert.ok(submitIssues(record, responses({ rows: [] }), []).some((issue) => /At least one Fan Schedule row is required/.test(issue)));
});

// This is the 0.4b guard: a client gate that drifts from the server adapter
// queues work the server rejects non-retryably, which offline is unrecoverable
// field data loss.
test("web Smoke Ventilation field paths exactly equal the server adapter's canonical paths", () => {
  const adapter = resolveV7EvidenceContract({ systemKey: "smoke_ventilation", templateId: masterServiceReportV7.id, templateVersion: 7, definition, contractSha256: v7EvidenceContractSha256(definition) });
  assert.ok(adapter, "Smoke Ventilation V7 server adapter must resolve");
  const draft = withFindings();
  assert.deepEqual(v7RequiredSmokeVentilationFieldPaths(draft), adapter.derivePoorFieldPaths(draft));
  for (const path of v7RequiredSmokeVentilationFieldPaths(draft)) assert.equal(adapter.isCanonicalFieldPath(path), true, path);
  assert.equal(adapter.isCanonicalFieldPath(`fan_schedule.fan_schedule_rows.rows.${uuid}.remarks`), false);
  assert.equal(adapter.isCanonicalFieldPath(checklistPath("control_panel_no")), false);
});

test("every Smoke Ventilation result control is four-state, in both scopes", () => {
  const checklist = resolveSmokeVentilationChecklistDefinitions(definition)!;
  const rows = resolveSmokeVentilationRowResultDefinitions(definition)!;
  assert.ok(checklist && rows);
  for (const [key] of smokeVentilationChecklistFields) {
    assert.deepEqual(checklist[key].options.map((option) => option.value), ["good", "not_good", "complete_repair", "na"], key);
  }
  for (const key of ["autoResult", "manualResult"] as const) {
    assert.deepEqual(rows[key].options.map((option) => option.value), ["good", "not_good", "complete_repair", "na"], key);
  }
});
