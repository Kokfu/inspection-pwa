import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "./templates/masterServiceReportV7.js";
import { v7EvidenceContractSha256 } from "./evidence/v7EvidenceContracts.js";
import { validateAcceptedAutomaticSprinklerV7Detail } from "./acceptedMasterSystemDetail.js";
import { validateAutomaticSprinklerHistoricalPayload } from "../sync/automaticSprinklerInspectionSync.js";

const templateId = masterServiceReportV7.id;
const definition = masterServiceReportV7.systems.find((system) => system.key === "automatic_sprinkler")!;
const contractSha256 = v7EvidenceContractSha256(definition);
const jobId = "11111111-1111-4111-8111-111111111111";
const clientUuid = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const customerId = "44444444-4444-4444-8444-444444444444";
const formInstanceId = "55555555-5555-4555-8555-555555555555";
const photo = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const sha = (c: string) => c.repeat(64);
const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions", "breaching_inlet", "alarm_gong", "flow_meter_valve_positions", "trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"];

function responses() {
  const checklist = Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }]));
  checklist.saj_main_water_supply = { result: "not_good", remarks: "Supply valve seized" };
  checklist.trfp_jockey_pump = { result: "complete_repair", remarks: "Jockey pump serviced on the 30 minute run" };
  const psi = (values: Record<string, number | null>, result = "good", remarks = "") => ({ values, unit: "PSI", result, remarks });
  return {
    schemaVersion: 2, checklist,
    measurements: {
      jockey_pump_pressure: psi({ cut_in: 80, cut_out: 100 }, "not_good", "Cut-in pressure out of range"),
      duty_pump_cut_in: psi({ value: 70 }),
      standby_pump_cut_in: psi({ value: null }, "na"),
      water_supply_gauge: psi({ value: 90 }),
      installation_gauge: psi({ value: 95 })
    },
    comments: "Accepted V7 sprinkler"
  };
}

function snapshot() {
  return {
    schemaVersion: 2, acceptedAt: "2026-09-04T00:00:00.000Z",
    job: { id: jobId, reference: "SV-20260904-1", title: "Primary Service Site" },
    customer: { id: customerId, code: "ASP", displayName: "Sprinkler Customer" },
    configuration: { revisionId, revisionNumber: 1 },
    template: { id: templateId, code: "MFE-FSSR", version: 7 },
    system: { enabledSystemId: "e", key: "automatic_sprinkler", systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [], definition, repetitionMode: "single" },
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null },
    contractSha256,
    evidenceManifest: [
      { photoUuid: photo(1), fieldPath: "automatic_sprinkler_checks.saj_main_water_supply", sourceSha256: sha("a") },
      { photoUuid: photo(2), fieldPath: "automatic_sprinkler_checks.trfp_jockey_pump", sourceSha256: sha("b") },
      { photoUuid: photo(3), fieldPath: "automatic_sprinkler_measurements.jockey_pump_pressure", sourceSha256: sha("c") }
    ]
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    clientUuid, serverFormInstanceId: formInstanceId, jobId, jobReference: "SV-20260904-1", jobTitle: "Primary Service Site",
    customerName: "Sprinkler Customer", systemKey: "automatic_sprinkler", instanceKey: "primary", zoneId: null, locationId: null,
    displaySequence: 1, status: "submitted", performedAt: "2026-09-04T00:00:00.000000Z", receivedAt: "2026-09-04T00:00:00.000000Z",
    templateId, configurationRevisionId: revisionId, inspectionSnapshot: snapshot(), responses: responses(),
    deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "browser-tech",
    ...overrides
  };
}

test("validateAcceptedAutomaticSprinklerV7Detail accepts a schema-2 record with checklist, test-run, and measurement findings", () => {
  const result = validateAcceptedAutomaticSprinklerV7Detail(row());
  assert.ok(result, "the V7 reader accepts the stored authority");
  assert.equal(result!.adapter.systemKey, "automatic_sprinkler");
  assert.deepEqual(result!.adapter.derivePoorFieldPaths(row().responses), [
    "automatic_sprinkler_checks.saj_main_water_supply",
    "automatic_sprinkler_checks.trfp_jockey_pump",
    "automatic_sprinkler_measurements.jockey_pump_pressure"
  ]);
});

test("validateAcceptedAutomaticSprinklerV7Detail rejects a manifest that omits a current finding", () => {
  const snap = snapshot();
  snap.evidenceManifest = snap.evidenceManifest.slice(0, 2);
  assert.equal(validateAcceptedAutomaticSprinklerV7Detail(row({ inspectionSnapshot: snap })), undefined);
});

test("validateAcceptedAutomaticSprinklerV7Detail rejects a schema-1 (legacy) response", () => {
  assert.equal(validateAcceptedAutomaticSprinklerV7Detail(row({
    responses: { schemaVersion: 1, waterTank: {}, pumpHouse: {}, measurements: {}, mainAlarmValve: {}, comments: "" }
  })), undefined);
});

test("the V1-V6 historical validator still rejects the V7 schema-2 shape (not loosened)", () => {
  assert.equal(validateAutomaticSprinklerHistoricalPayload(responses(), snapshot()), false);
});
