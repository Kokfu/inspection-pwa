import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV1 } from "../../api/src/inspections/templates/masterServiceReportV1";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../../api/src/inspections/evidence/v7EvidenceContracts";
import { resolvePublishedHoseReelControls } from "../src/inspectionControls/definitionResolver";
import { getHoseReelSubmitIssues, hoseReelTechnicianRowHasEnteredData, setHoseReelDrumCount } from "../src/hoseReel/hoseReelRepository";
import type { HoseReelInspectionSnapshot, HoseReelResponses, MasterSystemInspectionRecord } from "../src/hoseReel/hoseReelTypes";
import { v7HoseReelSubmissionIssues, v7RequiredHoseReelFieldPaths } from "../src/hoseReel/hoseReelV7Evidence";

const uuid = "00000000-0000-4000-8000-000000000099";
const hash = (value: string) => value.repeat(64);
const v7Definition = masterServiceReportV7.systems.find((system) => system.key === "hose_reel")!;
const historicalDefinition = masterServiceReportV1.systems.find((system) => system.key === "hose_reel")!;

function snapshot(definition: unknown, version: number): HoseReelInspectionSnapshot {
  return {
    template: { code: "MFE-FSSR", version },
    system: { definition }
  } as HoseReelInspectionSnapshot;
}

function record(version = 7): MasterSystemInspectionRecord {
  return {
    masterTemplate: { version },
    inspectionSnapshot: snapshot(version === 7 ? v7Definition : historicalDefinition, version)
  } as MasterSystemInspectionRecord;
}

function completeResponses(version = 7): HoseReelResponses {
  const controls = resolvePublishedHoseReelControls(
    version === 7 ? v7Definition : historicalDefinition,
    "MFE-FSSR",
    version
  );
  return {
    ...(version === 7 ? { schemaVersion: 3 } : {}),
    checklist: Object.fromEntries(
      [...controls.checklist.waterTank, ...controls.checklist.pumpHouse, ...(controls.checklist.testRunFirePump ?? [])]
        .map((item) => [item.key, { result: "good", remarks: "" }])
    ),
    measurements: {
      jockey_pump_pressure: { values: { cut_in: 1, cut_out: 2 }, unit: "PSI", result: "good", remarks: "" },
      standby_pump_cut_in: { values: { value: 1 }, unit: "PSI", result: "good", remarks: "" }
    },
    ...(version === 7 ? { drumCount: 1 } : { drumTypes: { swing: true, fixed: false } }),
    rows: [{
      rowUuid: uuid, source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null,
      locationText: "Pump room", assetReference: "HR-1", sortOrder: 1, drumResult: "good", hoseResult: "good",
      nozzleResult: "good", valveResult: "good", nozzleBoxResult: "good", remarks: "",
      ...(version === 7 ? { fieldRemarks: {}, drumType: "swing" as const } : {})
    }],
    comments: ""
  };
}

const checkPath = "hose_reel_checks.saj_main_water_supply" as const;
const rowPath = `hose_reel_drum.hose_reel_rows.rows.${uuid}.drum` as const;
function attachment(fieldPath: string, sha256: string) {
  return { photoUuid: crypto.randomUUID(), inspectionClientUuid: uuid, systemKey: "hose_reel", fieldPath, sha256, protocolVersion: 7 } as Parameters<typeof v7HoseReelSubmissionIssues>[2][number];
}

test("a complete Hose Reel V7 draft passes the submit gate", () => {
  assert.deepEqual(getHoseReelSubmitIssues(completeResponses(), record().inspectionSnapshot, record(), []), []);
});

test("V7 renders Duty and Standby test-run controls with the four-state result model", () => {
  const controls = resolvePublishedHoseReelControls(v7Definition, "MFE-FSSR", 7);
  assert.deepEqual(controls.checklist.testRunFirePump.map((item) => item.key), ["trfp_duty_pump", "trfp_standby_pump"]);
  assert.deepEqual(controls.checklist.testRunFirePump[0]!.result.options.map((option) => option.value), ["good", "not_good", "complete_repair", "na"]);
  const draft = completeResponses();
  draft.checklist.trfp_duty_pump = { result: "not_good", remarks: "" };
  assert.ok(v7HoseReelSubmissionIssues(record(), draft, []).some((issue) => issue.includes("trfp_duty_pump requires its own Remark")));
});

test("a V7 checklist finding requires its own Remark and Photo", () => {
  const draft = completeResponses();
  draft.checklist.saj_main_water_supply = { result: "not_good", remarks: "" };
  const issues = v7HoseReelSubmissionIssues(record(), draft, []);
  assert.ok(issues.some((issue) => issue.includes("saj_main_water_supply requires its own Remark")));
  assert.ok(issues.some((issue) => issue.includes(`${checkPath} requires its own Photo`)));
});

test("a V7 row finding requires its own Remark and Photo", () => {
  const draft = completeResponses();
  draft.rows[0]!.drumResult = "complete_repair";
  const issues = v7HoseReelSubmissionIssues(record(), draft, []);
  assert.ok(issues.some((issue) => issue.includes("Drum requires its own Remark")));
  assert.ok(issues.some((issue) => issue.includes(`${rowPath} requires its own Photo`)));
});

test("one photo cannot satisfy two current V7 findings", () => {
  const draft = completeResponses();
  draft.checklist.saj_main_water_supply = { result: "not_good", remarks: "Supply issue" };
  draft.rows[0]!.drumResult = "complete_repair";
  draft.rows[0]!.fieldRemarks = { drumResult: "Drum rebuilt" };
  const issues = v7HoseReelSubmissionIssues(record(), draft, [attachment(checkPath, hash("a")), attachment(rowPath, hash("a"))]);
  assert.ok(issues.some((issue) => issue.includes("same photo")));
});

test("stale V7 evidence is excluded after its finding is corrected", () => {
  const draft = completeResponses();
  const issues = v7HoseReelSubmissionIssues(record(), draft, [attachment(checkPath, hash("a"))]);
  assert.deepEqual(issues, []);
  assert.deepEqual(v7RequiredHoseReelFieldPaths(draft), []);
});

test("web field paths match the Slice 1 server adapter for checklist and row findings", () => {
  const adapter = resolveV7EvidenceContract({
    systemKey: "hose_reel",
    templateId: masterServiceReportV7.id,
    templateVersion: 7,
    definition: v7Definition,
    contractSha256: v7EvidenceContractSha256(v7Definition)
  });
  assert.ok(adapter);
  const draft = completeResponses();
  draft.checklist.saj_main_water_supply = { result: "not_good", remarks: "Supply issue" };
  draft.rows[0]!.drumResult = "complete_repair";
  draft.rows[0]!.fieldRemarks = { drumResult: "Drum rebuilt" };
  assert.deepEqual(v7RequiredHoseReelFieldPaths(draft), [checkPath, rowPath]);
  assert.ok(adapter.isCanonicalFieldPath(checkPath));
  assert.ok(adapter.isCanonicalFieldPath(rowPath));
});

// Sol P1-a (0.4b class) — `getHoseReelSubmitIssues()` did not mirror the
// exact-key discipline `validResponses()` in
// apps/api/src/sync/hoseReelV7Acceptance.ts enforces for schema 2 / schema 3:
// `exact()` over the response envelope and over every row (row keys include
// `drumType` for schema 3, exclude it for schema 2). Each shape below returned
// `getHoseReelSubmitIssues=[]` from the evidence sub-gate yet is rejected
// non-retryably by the server, stranding the queued Pending record offline.
// The fragments below are copied verbatim from `validResponses()` / `exact()`
// so a server drift breaks this file rather than the field.
const serverExact = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((name) => name in value);
const SERVER_ENVELOPE_KEYS_V3 = ["schemaVersion", "checklist", "measurements", "drumCount", "rows", "comments"];
const SERVER_ENVELOPE_KEYS_V2 = ["schemaVersion", "checklist", "measurements", "drumTypes", "rows", "comments"];
const SERVER_ROW_FIELDS = ["drumResult", "hoseResult", "nozzleResult", "valveResult", "nozzleBoxResult"];
const SERVER_ROW_KEYS_V3 = ["rowUuid", "source", "configuredLocationId", "zoneSnapshot", "locationSnapshot", "locationText", "assetReference", "sortOrder", ...SERVER_ROW_FIELDS, "remarks", "fieldRemarks", "drumType"];
const SERVER_ROW_KEYS_V2 = ["rowUuid", "source", "configuredLocationId", "zoneSnapshot", "locationSnapshot", "locationText", "assetReference", "sortOrder", ...SERVER_ROW_FIELDS, "remarks", "fieldRemarks"];
type Loose = Record<string, unknown>;

test("Sol P1-a: an extra own property on the schema-3 response envelope is refused, matching exact(responses, ...)", () => {
  assert.deepEqual(getHoseReelSubmitIssues(completeResponses(), record().inspectionSnapshot, record(), []), [], "control: the un-mutated draft passes");

  // A leftover schema-2 `drumTypes` alongside the schema-3 `drumCount` is the
  // realistic escape: the pre-fix gate validated `drumCount` and ignored the
  // extra key.
  for (const extra of [{ drumTypes: { swing: true, fixed: false } }, { unexpected: 1 }]) {
    const draft = { ...completeResponses(), ...extra } as unknown as HoseReelResponses;
    assert.deepEqual(v7HoseReelSubmissionIssues(record(), draft, []), [], "the V7 evidence sub-gate is blind to this shape");
    assert.equal(serverExact(draft as object, SERVER_ENVELOPE_KEYS_V3), false, "server: exact(responses, schema-3 keys) rejects it");
    const issues = getHoseReelSubmitIssues(draft, record().inspectionSnapshot, record(), []);
    assert.ok(issues.some((issue) => /Hose Reel response envelope shape is invalid/.test(issue.message)), JSON.stringify(issues));
  }
});

test("Sol P1-a: an extra own property on a schema-3 row is refused, matching exact(row, rowKeys)", () => {
  assert.deepEqual(getHoseReelSubmitIssues(completeResponses(), record().inspectionSnapshot, record(), []), [], "control: the un-mutated draft passes");

  const draft = completeResponses();
  (draft.rows[0]! as unknown as Loose).unexpected = "x";
  assert.deepEqual(v7HoseReelSubmissionIssues(record(), draft, []), [], "the V7 evidence sub-gate is blind to this shape");
  assert.equal(serverExact(draft.rows[0]! as object, SERVER_ROW_KEYS_V3), false, "server: exact(row, schema-3 rowKeys) rejects the extra key");
  const issues = getHoseReelSubmitIssues(draft, record().inspectionSnapshot, record(), []);
  assert.ok(issues.some((issue) => /Drum 1: row shape is invalid/.test(issue.message)), JSON.stringify(issues));
});

test("Sol P1-a: a schema-3 row missing its drumType key is refused by the shape gate, matching exact(row, rowKeys)", () => {
  const draft = completeResponses();
  delete (draft.rows[0]! as unknown as Loose).drumType;
  assert.deepEqual(v7HoseReelSubmissionIssues(record(), draft, []), [], "the V7 evidence sub-gate never inspects drumType");
  assert.equal(serverExact(draft.rows[0]! as object, SERVER_ROW_KEYS_V3), false, "server: exact(row, schema-3 rowKeys) requires drumType present");
  const issues = getHoseReelSubmitIssues(draft, record().inspectionSnapshot, record(), []);
  assert.ok(issues.some((issue) => /Drum 1: row shape is invalid/.test(issue.message)), JSON.stringify(issues));
});

test("Sol P1-a: schema 2 keeps its own exact envelope/row shape (no drumType, drumTypes required)", () => {
  const base = completeResponses();
  const schema2 = {
    schemaVersion: 2 as const,
    checklist: base.checklist,
    measurements: base.measurements,
    drumTypes: { swing: true, fixed: false },
    rows: base.rows.map((row) => {
      const clone = { ...(row as unknown as Loose) };
      delete clone.drumType;
      return clone;
    }),
    comments: ""
  } as unknown as HoseReelResponses;
  // A well-formed schema-2 envelope raises no shape issue…
  assert.deepEqual(
    getHoseReelSubmitIssues(schema2, record().inspectionSnapshot, record(), []).filter((issue) => /shape is invalid/.test(issue.message)),
    []
  );
  assert.equal(serverExact(schema2 as object, SERVER_ENVELOPE_KEYS_V2), true);
  assert.equal(serverExact(schema2.rows[0]! as object, SERVER_ROW_KEYS_V2), true);
  // …but a schema-2 row carrying a schema-3-only `drumType` is refused.
  const withDrumType = { ...schema2, rows: [{ ...(schema2.rows[0]! as object), drumType: "swing" }] } as unknown as HoseReelResponses;
  assert.equal(serverExact(withDrumType.rows[0]! as object, SERVER_ROW_KEYS_V2), false);
  const issues = getHoseReelSubmitIssues(withDrumType, record().inspectionSnapshot, record(), []);
  assert.ok(issues.some((issue) => /Location 1: row shape is invalid/.test(issue.message)), JSON.stringify(issues));
});

// Sol P1-b — a drum-count decrease must not silently discard technician drum
// sections the technician has already started. `setHoseReelDrumCount` now trims
// only trailing EMPTY technician rows on a bare decrease; the form passes
// `allowDroppingEnteredRows` after its own window.confirm, and the per-row
// "Remove Drum" control keeps its explicit confirm.
function drumResponses(technicianRows: Array<Partial<HoseReelResponses["rows"][number]>>): HoseReelResponses {
  const base = completeResponses();
  const rows = technicianRows.map((overrides, index) => ({
    ...base.rows[0]!,
    rowUuid: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
    source: "technician" as const,
    configuredLocationId: null,
    sortOrder: index + 1,
    locationText: "",
    drumResult: null, hoseResult: null, nozzleResult: null, valveResult: null, nozzleBoxResult: null,
    remarks: "", fieldRemarks: {}, drumType: null,
    ...overrides
  }));
  return { ...base, rows, drumCount: rows.length };
}

test("Sol P1-b: a bare drum-count decrease past a non-empty technician drum keeps that drum", () => {
  const draft = drumResponses([{ drumType: "swing" }, { drumResult: "good" }, {}]);
  const next = setHoseReelDrumCount(draft, 1);
  assert.equal(next.rows.length, 2, "the started drum 2 is retained; only the trailing empty drum 3 is trimmed");
  assert.equal(next.drumCount, 2);
  assert.equal(next.rows[1]!.drumResult, "good");
});

test("Sol P1-b: a bare drum-count decrease past only-empty technician drums still trims silently", () => {
  const draft = drumResponses([{ drumType: "swing" }, {}, {}]);
  const next = setHoseReelDrumCount(draft, 1);
  assert.equal(next.rows.length, 1);
  assert.equal(next.drumCount, 1);
});

test("Sol P1-b: the form's confirmed path (allowDroppingEnteredRows) still trims a started drum", () => {
  const draft = drumResponses([{ drumType: "swing" }, { drumResult: "good" }, {}]);
  const next = setHoseReelDrumCount(draft, 1, { allowDroppingEnteredRows: true });
  assert.equal(next.rows.length, 1);
  assert.equal(next.drumCount, 1);
});

test("Sol P1-b: hoseReelTechnicianRowHasEnteredData flags only started technician rows", () => {
  const [swing, withResult, blank] = drumResponses([{ drumType: "swing" }, { drumResult: "good" }, {}]).rows;
  assert.equal(hoseReelTechnicianRowHasEnteredData(blank!), false);
  assert.equal(hoseReelTechnicianRowHasEnteredData(swing!), true);
  assert.equal(hoseReelTechnicianRowHasEnteredData(withResult!), true);
  assert.equal(hoseReelTechnicianRowHasEnteredData({ ...blank!, remarks: "note" }), true);
  assert.equal(hoseReelTechnicianRowHasEnteredData({ ...blank!, fieldRemarks: { drumResult: "x" } }), true);
  // A configured row is never subject to this predicate.
  assert.equal(hoseReelTechnicianRowHasEnteredData({ ...blank!, source: "configured", drumResult: "good" }), false);
});

test("V1-V6 retain Good/Poor and submit without V7 evidence", () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const controls = resolvePublishedHoseReelControls(historicalDefinition, "MFE-FSSR", version);
    assert.deepEqual(controls.checklist.waterTank[0]!.result.options.map((option) => option.value), ["good", "poor"]);
    assert.deepEqual(getHoseReelSubmitIssues(completeResponses(version), record(version).inspectionSnapshot, record(version), []), []);
  }
});
