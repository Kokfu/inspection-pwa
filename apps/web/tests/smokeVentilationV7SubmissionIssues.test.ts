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

// A customer that HAS been given structure: the client gate must enforce the
// same "configured rows are retained" invariant the server does, or the form
// queues a submission the server rejects non-retryably.
const configuredLocationId = "00000000-0000-4000-8000-0000000000aa";
const configuredRecord = {
  masterTemplate: { version: 7 },
  inspectionSnapshot: { system: { definition, locations: [{ id: configuredLocationId, presetRowCount: 2, displayName: "Roof Plant Room", rowPreset: { assetReference: "1" } }] } }
} as unknown as SmokeVentilationInspectionRecord;
const configuredRow = (ordinal: number, sortOrder: number) => ({
  rowUuid: `00000000-0000-4000-8000-000000000b0${ordinal}`, source: "configured" as const,
  configuredLocationId, configuredRowOrdinal: ordinal, zoneSnapshot: null,
  locationSnapshot: { id: configuredLocationId, displayName: "Roof Plant Room" },
  assetReference: "1", autoResult: "good" as const, manualResult: "good" as const,
  remarks: "", fieldRemarks: {}, sortOrder
});

test("a configured customer's Fan Schedule rows submit when all are retained", () => {
  assert.deepEqual(submitIssues(configuredRecord, responses({ rows: [configuredRow(1, 1), configuredRow(2, 2)] }), []), []);
});

test("dropping one of a configured customer's Fan Schedule rows is refused by the client gate", () => {
  const issues = submitIssues(configuredRecord, responses({ rows: [configuredRow(1, 1)] }), []);
  assert.ok(issues.some((issue) => /Configured Fan Schedule rows must be retained/.test(issue)), JSON.stringify(issues));
});

test("a technician row forging configured provenance is refused by the client gate", () => {
  const forged = { ...configuredRow(1, 2), rowUuid: "00000000-0000-4000-8000-000000000c01", configuredRowOrdinal: 9 };
  const issues = submitIssues(configuredRecord, responses({ rows: [configuredRow(1, 1), forged] }), []);
  assert.ok(issues.some((issue) => /Configured Fan Schedule row identity is invalid/.test(issue)), JSON.stringify(issues));
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

// Sol P1 (0.4b class), parallel to the Fire Intercom fix in
// apps/web/src/fireIntercom/fireIntercomRepository.ts — `submitIssues()` did not
// mirror the exact-envelope parity `validResponses()` in
// apps/api/src/sync/smokeVentilationV7Acceptance.ts enforces. Each shape below
// returned `submitIssues=[]` on the client yet is rejected non-retryably by the
// server, stranding a Pending record in the outbox offline. The fragments below
// are copied verbatim from `validResponses()` / `exact()` so a server drift
// breaks this file rather than the field.
const serverExact = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((name) => name in value);
const SERVER_ENVELOPE_KEYS = ["schemaVersion", "controlPanelNo", "location", "dateTested", "checklist", "rows", "comments"];
const SERVER_CHECKLIST_KEYS = ["main_power_supply_ac", "secondary_essential_supply_dc", "cb_battery", "cb_charger", "mfk_main_alarm_reset", "mfk_lamp_test", "mfk_evacuate", "mfk_signal_alarm_to_mfap"];
const SERVER_CHECKLIST_ENTRY_KEYS = ["result", "remarks"];
const SERVER_ROW_KEYS = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "autoResult", "manualResult", "remarks", "fieldRemarks", "sortOrder"];
const SERVER_ROW_REMARK_KEYS = ["autoResult", "manualResult"];
type Loose = Record<string, unknown>;

test("Sol P1: an extra own property on the response envelope is refused, matching exact(responses, ...)", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  (draft as unknown as Loose).unexpected = "x";
  assert.deepEqual(v7SmokeVentilationSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.equal(serverExact(draft as object, SERVER_ENVELOPE_KEYS), false, "server: exact(responses, [schemaVersion, ...]) rejects it");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Smoke Ventilation response envelope shape is invalid/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: an extra key on the checklist envelope is refused, matching exact(responses.checklist, ...)", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  (draft.checklist as unknown as Loose).invented = { result: "good", remarks: "" };
  assert.deepEqual(v7SmokeVentilationSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.equal(serverExact(draft.checklist as object, SERVER_CHECKLIST_KEYS), false, "server: exact(responses.checklist, checklistColumns) rejects it");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Smoke Ventilation checklist shape is invalid/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: an extra key on a checklist entry is refused, matching exact(entry, [result, remarks])", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  (draft.checklist as unknown as Loose).cb_battery = { result: "good", remarks: "", extra: 1 };
  assert.deepEqual(v7SmokeVentilationSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.equal(serverExact(draft.checklist.cb_battery as object, SERVER_CHECKLIST_ENTRY_KEYS), false, "server: exact(entry, [result, remarks]) rejects it");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Smoke Ventilation checklist entry shape is invalid/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: an extra own property on a row object is refused, matching exact(row, rowKeys)", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  (draft.rows[0]! as unknown as Loose).unexpected = "x";
  assert.deepEqual(v7SmokeVentilationSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.equal(serverExact(draft.rows[0]! as object, SERVER_ROW_KEYS), false, "server: exact(row, rowKeys) rejects the extra key");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Fan Schedule row shape is invalid/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: a row whose zoneSnapshot is not null is refused, matching validResponses()", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  (draft.rows[0]! as unknown as Loose).zoneSnapshot = {};
  assert.deepEqual(v7SmokeVentilationSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.notEqual((draft.rows[0]! as unknown as Loose).zoneSnapshot, null, "server: validResponses() requires zoneSnapshot === null");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Fan Schedule row zone snapshot must be null/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: a fieldRemarks key other than a row result column is refused, matching the server whitelist", () => {
  assert.deepEqual(submitIssues(record, responses(), []), [], "control: the un-mutated draft passes");

  const draft = responses();
  draft.rows[0]!.fieldRemarks = { invented: "x" } as unknown as SmokeVentilationResponses["rows"][number]["fieldRemarks"];
  assert.deepEqual(v7SmokeVentilationSubmissionIssues(record, draft, []), [], "the V7 evidence gate is blind to this shape");
  assert.ok((Object.keys(draft.rows[0]!.fieldRemarks) as string[]).some((k) => !SERVER_ROW_REMARK_KEYS.includes(k)), "server: fieldRemarks whitelist rejects it");
  const issues = submitIssues(record, draft, []);
  assert.ok(issues.some((issue) => /Fan Schedule row field remarks are invalid/.test(issue)), JSON.stringify(issues));
});

test("Sol P1: client submit gate now rejects every shape the server's validResponses() rejects", () => {
  // Direct client/server parity table for the demonstrated escapes.
  const envelopeExtra = responses();
  (envelopeExtra as unknown as Loose).extra = 1;
  const checklistExtra = responses();
  (checklistExtra.checklist as unknown as Loose).extra = { result: "good", remarks: "" };
  const checklistEntryExtra = responses();
  (checklistEntryExtra.checklist as unknown as Loose).cb_charger = { result: "good", remarks: "", extra: 1 };
  const rowExtra = responses();
  (rowExtra.rows[0]! as unknown as Loose).extra = 1;
  const badZone = responses();
  (badZone.rows[0]! as unknown as Loose).zoneSnapshot = { id: "z" };
  const badRemarkKey = responses();
  badRemarkKey.rows[0]!.fieldRemarks = { nope: "y" } as unknown as SmokeVentilationResponses["rows"][number]["fieldRemarks"];

  for (const draft of [envelopeExtra, checklistExtra, checklistEntryExtra, rowExtra, badZone, badRemarkKey]) {
    const serverRejects = !serverExact(draft as object, SERVER_ENVELOPE_KEYS)
      || !serverExact(draft.checklist as object, SERVER_CHECKLIST_KEYS)
      || SERVER_CHECKLIST_KEYS.some((k) => !serverExact((draft.checklist as Loose)[k] as object, SERVER_CHECKLIST_ENTRY_KEYS))
      || draft.rows.some((row) => !serverExact(row as object, SERVER_ROW_KEYS)
        || (row as unknown as Loose).zoneSnapshot !== null
        || Object.keys((row as unknown as Loose).fieldRemarks as object).some((k) => !SERVER_ROW_REMARK_KEYS.includes(k)));
    assert.equal(serverRejects, true, `server must reject ${JSON.stringify(draft)}`);
    assert.ok(submitIssues(record, draft, []).length > 0, `client must reject ${JSON.stringify(draft)}`);
  }
});
