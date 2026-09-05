import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "./templates/masterServiceReportV7.js";
import { v7EvidenceContractSha256 } from "./evidence/v7EvidenceContracts.js";
import { validateAcceptedDryWetRiserV7Detail } from "./acceptedMasterSystemDetail.js";
import { validStoredDryWetRiser } from "./dryWetRiserAccepted.js";

const templateId = masterServiceReportV7.id;
const definition = masterServiceReportV7.systems.find((system) => system.key === "dry_wet_riser")!;
const contractSha256 = v7EvidenceContractSha256(definition);
const jobId = "11111111-1111-4111-8111-111111111121";
const clientUuid = "22222222-2222-4222-8222-222222222221";
const revisionId = "33333333-3333-4333-8333-333333333321";
const customerId = "44444444-4444-4444-8444-444444444421";
const formInstanceId = "55555555-5555-4555-8555-555555555521";
const locationId = "66666666-6666-4666-8666-666666666621";
const rowUuid = "77777777-7777-4777-8777-777777777721";
const photo = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const sha = (c: string) => c.repeat(64);
const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];

function responses() {
  const checklist = Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }]));
  checklist.water_level = { result: "not_good", remarks: "Water level low" };
  const psi = (values: Record<string, number | null>, result = "good", remarks = "") => ({ values, unit: "PSI", result, remarks });
  return {
    schemaVersion: 2, mode: "dry", checklist,
    measurements: {
      jockey_psi: psi({ cut_in: 80, cut_out: 100 }),
      duty_psi: psi({ cut_in: 70 }, "complete_repair", "Duty pump serviced"),
      standby_psi: psi({ cut_in: null }, "na")
    },
    riserOutlets: [{
      rowUuid, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1,
      zoneSnapshot: null, locationSnapshot: { id: locationId, displayName: "Riser Outlet 1" },
      assetReference: "", locationText: "Riser Outlet 1",
      canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "not_good", doorResult: "good",
      remarks: "", fieldRemarks: { crandleResult: "Crandle bent" }, sortOrder: 1
    }],
    comments: "Accepted V7 riser"
  };
}

function snapshot() {
  return {
    schemaVersion: 2, acceptedAt: "2026-09-05T00:00:00.000Z",
    job: { id: jobId, reference: "SV-20260905-1", title: "Primary Service Site" },
    customer: { id: customerId, code: "DWR", displayName: "Riser Customer" },
    configuration: { revisionId, revisionNumber: 1 },
    template: { id: templateId, code: "MFE-FSSR", version: 7 },
    system: { enabledSystemId: "e", key: "dry_wet_riser", systemKey: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [{ id: locationId, zoneId: null, displayName: "Riser Outlet 1", presetRowCount: 1, rowPreset: {}, sortOrder: 1 }], definition, systemConfiguration: { riserMode: "dry" }, repetitionMode: "single_with_repeatable_rows" },
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null },
    contractSha256,
    evidenceManifest: [
      { photoUuid: photo(1), fieldPath: "dry_wet_riser_checks.water_level", sourceSha256: sha("a") },
      { photoUuid: photo(2), fieldPath: "dry_wet_riser_measurements.duty_psi", sourceSha256: sha("b") },
      { photoUuid: photo(3), fieldPath: `riser_outlet.riser_outlet_rows.rows.${rowUuid}.crandleResult`, sourceSha256: sha("c") }
    ]
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    clientUuid, serverFormInstanceId: formInstanceId, jobId, jobReference: "SV-20260905-1", jobTitle: "Primary Service Site",
    customerName: "Riser Customer", systemKey: "dry_wet_riser", instanceKey: "primary", zoneId: null, locationId: null,
    displaySequence: 1, status: "submitted", performedAt: "2026-09-05T00:00:00.000000Z", receivedAt: "2026-09-05T00:00:00.000000Z",
    templateId, configurationRevisionId: revisionId, inspectionSnapshot: snapshot(), responses: responses(),
    deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "browser-tech",
    ...overrides
  };
}

test("validateAcceptedDryWetRiserV7Detail accepts a schema-2 record with checklist, measurement, and row findings", () => {
  const result = validateAcceptedDryWetRiserV7Detail(row());
  assert.ok(result, "the V7 reader accepts the stored authority");
  assert.equal(result!.adapter.systemKey, "dry_wet_riser");
  assert.equal(result!.riserMode, "dry");
  assert.deepEqual(result!.adapter.derivePoorFieldPaths(row().responses), [
    "dry_wet_riser_checks.water_level",
    "dry_wet_riser_measurements.duty_psi",
    `riser_outlet.riser_outlet_rows.rows.${rowUuid}.crandleResult`
  ]);
});

test("validateAcceptedDryWetRiserV7Detail rejects a manifest that omits a current finding", () => {
  const snap = snapshot();
  snap.evidenceManifest = snap.evidenceManifest.slice(0, 2);
  assert.equal(validateAcceptedDryWetRiserV7Detail(row({ inspectionSnapshot: snap })), undefined);
});

test("validateAcceptedDryWetRiserV7Detail rejects a response whose mode disagrees with the frozen systemConfiguration", () => {
  const body = responses(); body.mode = "wet";
  assert.equal(validateAcceptedDryWetRiserV7Detail(row({ responses: body })), undefined);
});

test("validateAcceptedDryWetRiserV7Detail rejects a schema-1 (legacy) response", () => {
  assert.equal(validateAcceptedDryWetRiserV7Detail(row({
    responses: { schemaVersion: 1, mode: "dry", waterTank: {}, pumpHouse: {}, measurements: {}, riserOutlets: [], comments: "" }
  })), undefined);
});

test("the V1-V6 historical validator still rejects the V7 schema-2 shape (not loosened)", () => {
  assert.equal(validStoredDryWetRiser(responses(), snapshot().system, snapshot().system.systemConfiguration), false);
});
