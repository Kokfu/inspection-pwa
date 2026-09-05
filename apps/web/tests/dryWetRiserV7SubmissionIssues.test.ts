import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../../api/src/inspections/evidence/v7EvidenceContracts";
import { resolvePublishedDryWetRiserControls } from "../src/dryWetRiser/dryWetRiserDefinition";
import { submitIssues } from "../src/dryWetRiser/dryWetRiserRepository";
import type { DryWetRiserInspectionRecord, LegacyDryWetRiserResponses, V7DryWetRiserResponses } from "../src/dryWetRiser/dryWetRiserTypes";
import { v7DryWetRiserSubmissionIssues, v7RequiredDryWetRiserFieldPaths } from "../src/dryWetRiser/dryWetRiserV7Evidence";

const uuid = "00000000-0000-4000-8000-000000000099";
const hash = (value: string) => value.repeat(64);
const v7Definition = masterServiceReportV7.systems.find((system) => system.key === "dry_wet_riser")!;

function record(version = 7): DryWetRiserInspectionRecord {
  return {
    masterTemplate: { id: masterServiceReportV7.id, code: "MFE-FSSR", version },
    inspectionSnapshot: { system: { definition: v7Definition, locations: [], zones: [], systemConfiguration: { riserMode: "dry" } } }
  } as unknown as DryWetRiserInspectionRecord;
}

function completeResponses(): V7DryWetRiserResponses {
  const controls = resolvePublishedDryWetRiserControls(v7Definition, "MFE-FSSR", 7);
  return {
    schemaVersion: 2,
    mode: "dry",
    checklist: Object.fromEntries(
      [...controls.checklist.waterTank, ...controls.checklist.pumpHouse].map((item) => [item.key, { result: "good", remarks: "" }])
    ) as V7DryWetRiserResponses["checklist"],
    measurements: {
      jockey_psi: { values: { cut_in: 1, cut_out: 2 }, unit: "PSI", result: "good", remarks: "" },
      duty_psi: { values: { cut_in: 1 }, unit: "PSI", result: "good", remarks: "" },
      standby_psi: { values: { cut_in: 1 }, unit: "PSI", result: "good", remarks: "" }
    },
    riserOutlets: [{
      rowUuid: uuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null,
      assetReference: "DW-1", locationText: "Ground Floor", sortOrder: 1,
      canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good",
      remarks: "", fieldRemarks: {}
    }],
    comments: ""
  };
}

function legacyResponses(): LegacyDryWetRiserResponses {
  const water = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"];
  const pump = ["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];
  const rows = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, { result: "good" as const, remarks: "" }]));
  return {
    schemaVersion: 1,
    mode: "dry",
    waterTank: rows(water),
    pumpHouse: rows(pump),
    measurements: { jockeyCutIn: 1, jockeyCutOut: 2, dutyCutIn: 1, standbyCutIn: 1, unit: "PSI" },
    riserOutlets: [{
      rowUuid: uuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null,
      assetReference: "DW-1", locationText: "Ground Floor", sortOrder: 1,
      canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good",
      remarks: ""
    }],
    comments: ""
  };
}

const checkPath = "dry_wet_riser_checks.saj_main_water_supply" as const;
const measurementPath = "dry_wet_riser_measurements.jockey_psi" as const;
const rowPath = `riser_outlet.riser_outlet_rows.rows.${uuid}.canvasHoseAt2Result` as const;
function attachment(fieldPath: string, sha256: string) {
  return { photoUuid: crypto.randomUUID(), inspectionClientUuid: uuid, systemKey: "dry_wet_riser", fieldPath, sha256, protocolVersion: 7 } as Parameters<typeof v7DryWetRiserSubmissionIssues>[2][number];
}

test("a complete Dry/Wet Riser V7 draft passes the submit gate", () => {
  assert.deepEqual(submitIssues(record(), completeResponses(), []), []);
});

test("V7 renders the four-state result model for checklist, measurement, and row findings", () => {
  const controls = resolvePublishedDryWetRiserControls(v7Definition, "MFE-FSSR", 7);
  assert.deepEqual(controls.checklist.waterTank[0]!.result.options.map((option) => option.value), ["good", "not_good", "complete_repair", "na"]);
  assert.deepEqual(controls.measurements.map((item) => item.key), ["jockey_psi", "duty_psi", "standby_psi"]);
  assert.deepEqual(controls.checklist.pumpHouse.map((item) => item.key).sort(), [
    "battery_charger_failure_alarm", "battery_charging_alternator", "battery_serviceable", "pump_house_clean",
    "pump_phase_failure_alarm", "pumps_auto_start", "manual_start_pumps", "standby_pump_service_items", "test_and_gate_valve_positions"
  ].sort());
});

test("a V7 checklist finding requires its own Remark and Photo", () => {
  const draft = completeResponses();
  draft.checklist.saj_main_water_supply = { result: "not_good", remarks: "" };
  const issues = v7DryWetRiserSubmissionIssues(record(), draft, []);
  assert.ok(issues.some((issue) => issue.includes("saj_main_water_supply requires its own Remark")));
  assert.ok(issues.some((issue) => issue.includes(`${checkPath} requires its own Photo`)));
});

test("a V7 measurement finding requires its own Remark and Photo", () => {
  const draft = completeResponses();
  draft.measurements.jockey_psi.result = "complete_repair";
  const issues = v7DryWetRiserSubmissionIssues(record(), draft, []);
  assert.ok(issues.some((issue) => issue.includes("jockey_psi requires its own Remark")));
  assert.ok(issues.some((issue) => issue.includes(`${measurementPath} requires its own Photo`)));
});

test("a V7 row finding requires its own Remark and Photo", () => {
  const draft = completeResponses();
  draft.riserOutlets[0]!.canvasHoseAt2Result = "complete_repair";
  const issues = v7DryWetRiserSubmissionIssues(record(), draft, []);
  assert.ok(issues.some((issue) => issue.includes("Canvas Hose ×2 requires its own Remark")));
  assert.ok(issues.some((issue) => issue.includes(`${rowPath} requires its own Photo`)));
});

test("one photo cannot satisfy two current V7 findings", () => {
  const draft = completeResponses();
  draft.checklist.saj_main_water_supply = { result: "not_good", remarks: "Supply issue" };
  draft.riserOutlets[0]!.canvasHoseAt2Result = "complete_repair";
  draft.riserOutlets[0]!.fieldRemarks = { canvasHoseAt2Result: "Hose replaced" };
  const issues = v7DryWetRiserSubmissionIssues(record(), draft, [attachment(checkPath, hash("a")), attachment(rowPath, hash("a"))]);
  assert.ok(issues.some((issue) => issue.includes("same photo")));
});

test("stale V7 evidence is excluded after its finding is corrected", () => {
  const draft = completeResponses();
  const issues = v7DryWetRiserSubmissionIssues(record(), draft, [attachment(checkPath, hash("a"))]);
  assert.deepEqual(issues, []);
  assert.deepEqual(v7RequiredDryWetRiserFieldPaths(draft), []);
});

test("web field paths match the Slice 1 server adapter for checklist, measurement, and row findings", () => {
  const adapter = resolveV7EvidenceContract({
    systemKey: "dry_wet_riser",
    templateId: masterServiceReportV7.id,
    templateVersion: 7,
    definition: v7Definition,
    contractSha256: v7EvidenceContractSha256(v7Definition)
  });
  assert.ok(adapter);
  const draft = completeResponses();
  draft.checklist.saj_main_water_supply = { result: "not_good", remarks: "Supply issue" };
  draft.measurements.jockey_psi.result = "complete_repair";
  draft.measurements.jockey_psi.remarks = "Pump issue";
  draft.riserOutlets[0]!.canvasHoseAt2Result = "complete_repair";
  draft.riserOutlets[0]!.fieldRemarks = { canvasHoseAt2Result: "Hose replaced" };
  const paths = v7RequiredDryWetRiserFieldPaths(draft);
  assert.deepEqual(paths, [checkPath, measurementPath, rowPath]);
  for (const path of paths) assert.ok(adapter.isCanonicalFieldPath(path));
});

test("a V1-V6 Dry/Wet Riser record remains 2-state and submits unaffected by V7 evidence", () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    assert.deepEqual(submitIssues(record(version), legacyResponses()), []);
  }
});
