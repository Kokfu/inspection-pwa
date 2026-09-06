import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../../api/src/inspections/evidence/v7EvidenceContracts";
import { submitIssues } from "../src/fireIntercom/fireIntercomRepository";
import type { FireIntercomInspectionRecord, FireIntercomResponses } from "../src/fireIntercom/fireIntercomTypes";
import { resolveFireIntercomRowResultDefinitions, v7FireIntercomSubmissionIssues, v7RequiredFireIntercomFieldPaths } from "../src/fireIntercom/fireIntercomV7Evidence";

const rowA = "00000000-0000-4000-8000-000000000099";
const rowB = "00000000-0000-4000-8000-00000000009a";
const hash = (char: string) => char.repeat(64);
const definition = masterServiceReportV7.systems.find((system) => system.key === "fire_intercom")!;
const record = { masterTemplate: { version: 7 }, inspectionSnapshot: { system: { definition, locations: [] } } } as unknown as FireIntercomInspectionRecord;

const rowPath = (rowUuid: string) => `station_schedule.station_schedule_rows.rows.${rowUuid}.condition`;
const attachment = (path: string, sha256: string) => ({ photoUuid: crypto.randomUUID(), inspectionClientUuid: rowA, systemKey: "fire_intercom", fieldPath: path, sha256, protocolVersion: 7 }) as unknown as Parameters<typeof v7FireIntercomSubmissionIssues>[2][number];

function stationRow(rowUuid: string, sortOrder: number, overrides: Partial<FireIntercomResponses["rows"][number]> = {}): FireIntercomResponses["rows"][number] {
  return {
    rowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null,
    assetReference: "Grd Floor", conditionResult: "good", remarks: "", fieldRemarks: {}, sortOrder, ...overrides
  };
}

function responses(overrides: Partial<FireIntercomResponses> = {}): FireIntercomResponses {
  return { schemaVersion: 1, rows: [stationRow(rowA, 1), stationRow(rowB, 2)], comments: "", ...overrides };
}

/** Two findings on two distinct station rows - Fire Intercom's only evidence scope. */
function withFindings(): FireIntercomResponses {
  const draft = responses();
  draft.rows[0]!.conditionResult = "not_good";
  draft.rows[0]!.fieldRemarks = { conditionResult: "Grd Floor station is silent" };
  draft.rows[1]!.conditionResult = "complete_repair";
  draft.rows[1]!.fieldRemarks = { conditionResult: "Basement handset replaced on site" };
  return draft;
}
const bothPhotos = () => [attachment(rowPath(rowA), hash("a")), attachment(rowPath(rowB), hash("b"))];

test("a complete V7 Fire Intercom draft raises no evidence issues", () => {
  assert.deepEqual(v7FireIntercomSubmissionIssues(record, responses(), []), []);
  assert.deepEqual(submitIssues(record, responses(), []), []);
});

test("a station row finding without its own remark is refused", () => {
  const draft = withFindings();
  draft.rows[0]!.fieldRemarks = {};
  const issues = v7FireIntercomSubmissionIssues(record, draft, bothPhotos());
  assert.ok(issues.some((issue) => /Station row 1 Condition requires its own Remark/.test(issue)), JSON.stringify(issues));
});

test("a V7 finding without its own photo is refused", () => {
  const issues = v7FireIntercomSubmissionIssues(record, withFindings(), [attachment(rowPath(rowA), hash("a"))]);
  assert.ok(issues.some((issue) => new RegExp(`${rowPath(rowB)} requires its own Photo`).test(issue)), JSON.stringify(issues));
});

// The server rejects source-hash reuse inside a job+system non-retryably. This
// gate must catch it before a local Pending record can be stranded behind an
// impossible acceptance.
test("one photo reused across two station-row findings is refused before it can be queued", () => {
  const issues = v7FireIntercomSubmissionIssues(record, withFindings(), [
    attachment(rowPath(rowA), hash("a")), attachment(rowPath(rowB), hash("a"))
  ]);
  assert.ok(issues.some((issue) => /use the same photo; each finding needs its own photo/.test(issue)), `expected duplicate-photo issue, got ${JSON.stringify(issues)}`);
  assert.ok(issues.some((issue) => issue.includes(rowPath(rowA)) && issue.includes(rowPath(rowB))), `the issue must name both findings: ${JSON.stringify(issues)}`);
});

test("a stale Fire Intercom finding reverted to good or na is excluded from the gate", () => {
  for (const value of ["good", "na"] as const) {
    const draft = withFindings();
    draft.rows[0]!.conditionResult = value;
    draft.rows[0]!.fieldRemarks = {};
    draft.rows[1]!.conditionResult = value;
    draft.rows[1]!.fieldRemarks = {};
    // Both photos linger in IndexedDB but neither row is a finding any more.
    assert.deepEqual(v7FireIntercomSubmissionIssues(record, draft, bothPhotos()), [], `${value} must exclude stale evidence`);
  }
});

test("an unanswered station Condition result is refused", () => {
  const draft = responses();
  draft.rows[1]!.conditionResult = null;
  assert.ok(v7FireIntercomSubmissionIssues(record, draft, []).some((issue) => /Station row 2 Condition result is required/.test(issue)));
});

test("an empty Station Schedule is refused by the structural gate", () => {
  assert.ok(submitIssues(record, responses({ rows: [] }), []).some((issue) => /At least one Station row is required/.test(issue)));
});

// A customer that HAS been given preset station rows: the client gate must
// enforce the same "configured rows are retained" invariant the server does, or
// the form queues a submission the server rejects non-retryably.
const configuredLocationId = "00000000-0000-4000-8000-0000000000aa";
const configuredRecord = {
  masterTemplate: { version: 7 },
  inspectionSnapshot: { system: { definition, locations: [{ id: configuredLocationId, presetRowCount: 2, displayName: "Grd Floor", rowPreset: { assetReference: "Grd Floor" } }] } }
} as unknown as FireIntercomInspectionRecord;
const configuredRow = (ordinal: number, sortOrder: number) => ({
  rowUuid: `00000000-0000-4000-8000-000000000b0${ordinal}`, source: "configured" as const,
  configuredLocationId, configuredRowOrdinal: ordinal, zoneSnapshot: null,
  locationSnapshot: { id: configuredLocationId, displayName: "Grd Floor" },
  assetReference: "Grd Floor", conditionResult: "good" as const,
  remarks: "", fieldRemarks: {}, sortOrder
});

test("a configured customer's Station rows submit when all are retained", () => {
  assert.deepEqual(submitIssues(configuredRecord, responses({ rows: [configuredRow(1, 1), configuredRow(2, 2)] }), []), []);
});

test("dropping one of a configured customer's Station rows is refused by the client gate", () => {
  const issues = submitIssues(configuredRecord, responses({ rows: [configuredRow(1, 1)] }), []);
  assert.ok(issues.some((issue) => /Configured Station rows must be retained/.test(issue)), JSON.stringify(issues));
});

test("a technician write-in row forging configured provenance is refused by the client gate", () => {
  const forged = { ...configuredRow(1, 2), rowUuid: "00000000-0000-4000-8000-000000000c01", configuredRowOrdinal: 9 };
  const issues = submitIssues(configuredRecord, responses({ rows: [configuredRow(1, 1), forged] }), []);
  assert.ok(issues.some((issue) => /Configured Station row identity is invalid/.test(issue)), JSON.stringify(issues));
});

// This is the 0.4b guard: a client gate that drifts from the server adapter
// queues work the server rejects non-retryably, which offline is unrecoverable
// field data loss.
test("web Fire Intercom field paths exactly equal the server adapter's canonical paths", () => {
  const adapter = resolveV7EvidenceContract({ systemKey: "fire_intercom", templateId: masterServiceReportV7.id, templateVersion: 7, definition, contractSha256: v7EvidenceContractSha256(definition) });
  assert.ok(adapter, "Fire Intercom V7 server adapter must resolve");
  const draft = withFindings();
  assert.deepEqual(v7RequiredFireIntercomFieldPaths(draft), adapter.derivePoorFieldPaths(draft));
  for (const path of v7RequiredFireIntercomFieldPaths(draft)) assert.equal(adapter.isCanonicalFieldPath(path), true, path);
  // Fire Intercom has no checklist and no header fields, so nothing but the row
  // Condition column may ever be canonical.
  assert.equal(adapter.isCanonicalFieldPath(`station_schedule.station_schedule_rows.rows.${rowA}.remarks`), false);
  assert.equal(adapter.isCanonicalFieldPath(`station_schedule.station_schedule_rows.rows.${rowA}.asset_reference`), false);
  assert.equal(adapter.isCanonicalFieldPath("fire_intercom_checks.condition"), false);
});

test("the Fire Intercom result control is four-state, under the Hokuden legend", () => {
  const rows = resolveFireIntercomRowResultDefinitions(definition)!;
  assert.ok(rows);
  assert.deepEqual(rows.conditionResult.options.map((option) => option.value), ["good", "not_good", "complete_repair", "na"]);
});
