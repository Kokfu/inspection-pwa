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
  inspectionSnapshot: { system: { definition, locations: [{ id: configuredLocationId, presetRowCount: 2, displayName: "Grd Floor", rowPreset: { assetReference: "Grd Floor" }, sortOrder: 1 }] } }
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

// Sol P1 — the client gate was a strict subset of the server predicate, so the
// browser queued records `configuredFireIntercomRowsMatch` / `validResponses`
// refuse non-retryably. Each case below is one of the demonstrated escapes.
const twoLocationRecord = (locations: Array<{ id: string; displayName: string; presetRowCount: number; assetReference: string; sortOrder: number }>) => ({
  masterTemplate: { version: 7 },
  inspectionSnapshot: { system: { definition, locations: locations.map((l) => ({ id: l.id, displayName: l.displayName, presetRowCount: l.presetRowCount, rowPreset: { assetReference: l.assetReference }, sortOrder: l.sortOrder })) } }
} as unknown as FireIntercomInspectionRecord);
const locA = { id: "00000000-0000-4000-8000-0000000000a1", displayName: "Grd Floor", presetRowCount: 1, assetReference: "Grd Floor", sortOrder: 1 };
const locB = { id: "00000000-0000-4000-8000-0000000000b1", displayName: "Basement", presetRowCount: 1, assetReference: "Basement", sortOrder: 2 };
const rowFor = (loc: typeof locA, sortOrder: number, overrides: Record<string, unknown> = {}) => ({
  rowUuid: `00000000-0000-4000-8000-0000000000d${sortOrder}`, source: "configured" as const,
  configuredLocationId: loc.id, configuredRowOrdinal: 1, zoneSnapshot: null,
  locationSnapshot: { id: loc.id, displayName: loc.displayName },
  assetReference: loc.assetReference, conditionResult: "good" as const,
  remarks: "", fieldRemarks: {}, sortOrder, ...overrides
}) as unknown as FireIntercomResponses["rows"][number];

test("configured rows out of frozen sortOrder order are refused by the client gate", () => {
  // The frozen snapshot arrives with B before A in array order; the server
  // derives A(1) then B(2) from location.sortOrder. Submitting B first must fail.
  const record = twoLocationRecord([locB, locA]);
  const issues = submitIssues(record, responses({ rows: [rowFor(locB, 1), rowFor(locA, 2)] }), []);
  assert.ok(issues.some((issue) => /order does not match the frozen configuration/.test(issue)), JSON.stringify(issues));
  // …and the correctly-ordered payload passes.
  assert.deepEqual(submitIssues(record, responses({ rows: [rowFor(locA, 1), rowFor(locB, 2)] }), []), []);
});

test("a fresh Draft is built in frozen sortOrder order even when the snapshot array is not", () => {
  // Regression for the builder itself: configuredRows() sorted by array order
  // before this fix, so the Draft it produced could never be submitted.
  const record = twoLocationRecord([locB, locA]);
  const expected = record.inspectionSnapshot.system.locations;
  assert.deepEqual([...expected].sort((l, r) => l.sortOrder - r.sortOrder).map((l) => l.displayName), ["Grd Floor", "Basement"]);
  assert.deepEqual(submitIssues(record, responses({ rows: [rowFor(locA, 1), rowFor(locB, 2)] }), []), []);
});

test("a rewritten configured Station label or location snapshot is refused by the client gate", () => {
  const record = twoLocationRecord([locA]);
  const relabelled = submitIssues(record, responses({ rows: [rowFor(locA, 1, { assetReference: "Genset" })] }), []);
  assert.ok(relabelled.some((issue) => /Station label does not match the frozen configuration/.test(issue)), JSON.stringify(relabelled));
  const resnapshotted = submitIssues(record, responses({ rows: [rowFor(locA, 1, { locationSnapshot: { id: locA.id, displayName: "Somewhere Else" } })] }), []);
  assert.ok(resnapshotted.some((issue) => /location snapshot does not match the frozen configuration/.test(issue)), JSON.stringify(resnapshotted));
});

test("a configured row placed after a technician row is refused by the client gate", () => {
  const record = twoLocationRecord([locA]);
  const technician = { ...stationRow(rowB, 1), sortOrder: 1 };
  const issues = submitIssues(record, responses({ rows: [technician, rowFor(locA, 2)] }), []);
  assert.ok(issues.some((issue) => /must come before technician rows/.test(issue)), JSON.stringify(issues));
});

test("the 251st Station row is refused by the client gate, matching the server cap", () => {
  const rows = Array.from({ length: 251 }, (_, index) => ({
    ...stationRow(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, index + 1)
  }));
  const issues = submitIssues(record, responses({ rows }), []);
  assert.ok(issues.some((issue) => /cannot have more than 250 Station rows/.test(issue)), JSON.stringify(issues));
  // 250 is still fine.
  assert.deepEqual(submitIssues(record, responses({ rows: rows.slice(0, 250) }), []), []);
});

test("a duplicate rowUuid is refused by the client gate", () => {
  const issues = submitIssues(record, responses({ rows: [stationRow(rowA, 1), stationRow(rowA, 2)] }), []);
  assert.ok(issues.some((issue) => /Station row identity is invalid/.test(issue)), JSON.stringify(issues));
});

// Sol P1 (0.4b class) — `submitIssues()` did not mirror the exact-envelope
// parity `validResponses()` in apps/api/src/sync/fireIntercomV7Acceptance.ts
// enforces. Each shape below returned `submitIssues=[]` on the client yet is
// rejected non-retryably by the server, stranding a Pending record in the
// outbox. The fragments below are copied verbatim from `validResponses()` /
// `exact()` so a server drift breaks this file rather than the field.
const serverExact = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((name) => name in value);
const SERVER_ENVELOPE_KEYS = ["schemaVersion", "rows", "comments"];
const SERVER_ROW_KEYS = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "conditionResult", "remarks", "fieldRemarks", "sortOrder"];
type Loose = Record<string, unknown>;

test("Sol P1: a fieldRemarks key other than conditionResult is refused, matching the server whitelist", () => {
  const clean = responses();
  assert.deepEqual(submitIssues(record, clean, []), [], "control: the un-mutated draft passes");

  const draft = responses();
  draft.rows[0]!.fieldRemarks = { invented: "x" } as unknown as FireIntercomResponses["rows"][number]["fieldRemarks"];
  // Pre-fix escape route: the evidence gate never inspects fieldRemarks keys…
  assert.deepEqual(v7FireIntercomSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  // …and the server's `validResponses()` row-key fragment rejects it.
  assert.ok((Object.keys(draft.rows[0]!.fieldRemarks) as string[]).some((k) => !["conditionResult"].includes(k)), "server: fieldRemarks whitelist rejects it");
  // Fixed: the structural gate now returns a non-empty issue list.
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Station row field remarks are invalid/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: a row whose zoneSnapshot is not null is refused, matching validResponses()", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  (draft.rows[0]! as unknown as Loose).zoneSnapshot = {};
  assert.deepEqual(v7FireIntercomSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.notEqual((draft.rows[0]! as unknown as Loose).zoneSnapshot, null, "server: validResponses() requires zoneSnapshot === null");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Station row zone snapshot must be null/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: an extra own property on a row object is refused, matching exact(row, rowKeys)", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  (draft.rows[0]! as unknown as Loose).unexpected = "x";
  assert.deepEqual(v7FireIntercomSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.equal(serverExact(draft.rows[0]! as object, SERVER_ROW_KEYS), false, "server: exact(row, rowKeys) rejects the extra key");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Station row shape is invalid/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: an extra own property on the response envelope is refused, matching exact(responses, ...)", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  (draft as unknown as Loose).unexpected = "x";
  assert.deepEqual(v7FireIntercomSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.equal(serverExact(draft as object, SERVER_ENVELOPE_KEYS), false, "server: exact(responses, [schemaVersion, rows, comments]) rejects it");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Fire Intercom response envelope shape is invalid/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: client submit gate now rejects every shape the server's validResponses() rejects", () => {
  // Direct client/server parity table for the four demonstrated escapes.
  const envelopeExtra = responses();
  (envelopeExtra as unknown as Loose).extra = 1;
  const rowExtra = responses();
  (rowExtra.rows[0]! as unknown as Loose).extra = 1;
  const badZone = responses();
  (badZone.rows[0]! as unknown as Loose).zoneSnapshot = { id: "z" };
  const badRemarkKey = responses();
  badRemarkKey.rows[0]!.fieldRemarks = { nope: "y" } as unknown as FireIntercomResponses["rows"][number]["fieldRemarks"];

  for (const draft of [envelopeExtra, rowExtra, badZone, badRemarkKey]) {
    const serverRejects = !serverExact(draft as object, SERVER_ENVELOPE_KEYS)
      || draft.rows.some((row) => !serverExact(row as object, SERVER_ROW_KEYS)
        || (row as unknown as Loose).zoneSnapshot !== null
        || Object.keys((row as unknown as Loose).fieldRemarks as object).some((k) => k !== "conditionResult"));
    assert.equal(serverRejects, true, `server must reject ${JSON.stringify(draft)}`);
    assert.ok(submitIssues(record, draft, []).length > 0, `client must reject ${JSON.stringify(draft)}`);
  }
});
