import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV1 } from "../../api/src/inspections/templates/masterServiceReportV1";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../../api/src/inspections/evidence/v7EvidenceContracts";
import { resolvePublishedHoseReelControls } from "../src/inspectionControls/definitionResolver";
import { getHoseReelSubmitIssues } from "../src/hoseReel/hoseReelRepository";
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

test("V1-V6 retain Good/Poor and submit without V7 evidence", () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const controls = resolvePublishedHoseReelControls(historicalDefinition, "MFE-FSSR", version);
    assert.deepEqual(controls.checklist.waterTank[0]!.result.options.map((option) => option.value), ["good", "poor"]);
    assert.deepEqual(getHoseReelSubmitIssues(completeResponses(version), record(version).inspectionSnapshot, record(version), []), []);
  }
});
