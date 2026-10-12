import assert from "node:assert/strict";
import test from "node:test";
import { parseServerHydrantDetail } from "../src/hydrant/serverHydrantApi.js";
import { parseServerDryWetRiserDetail } from "../src/dryWetRiser/serverDryWetRiserApi.js";

/**
 * I-63 (found on the phone): once an Admin approves a layout, the NEXT visit's configured rows carry the saved text ('Lobby') while their
 * location is 'General'. The server validated those rows against the frozen layout before accepting them, and the accepted detail does not
 * carry the layout, so the web parsers must show them (they used to demand text equal to the location name and refuse the whole detail:
 * 'Server returned an invalid Hydrant accepted detail').
 */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const locationId = uuid(20);
const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];

const hydrantRow = (n: number, order: number, change: Record<string, unknown> = {}) => ({
  rowUuid: uuid(n), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "Basement",
  canvasHose1Result: "good", canvasHose2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", landingValveHandleResult: "good", hoseCabinetResult: "good", keyLockResult: "good",
  remarks: "", fieldRemarks: {}, sortOrder: order, ...change
});
const savedHydrantRow = (n: number, order: number, text: string) => hydrantRow(n, order, { source: "configured", configuredLocationId: locationId, configuredRowOrdinal: order, locationSnapshot: { id: locationId, displayName: "General" }, locationText: text });
const hydrantDetail = (rows: unknown[]) => ({
  clientUuid: uuid(1), serverFormInstanceId: uuid(2), jobId: uuid(3), jobReference: "SV-1", jobTitle: "Hydrant", customerName: "Customer", systemKey: "hydrant", systemLabel: "Hydrant System", instanceKey: "primary",
  zoneId: null, locationId: null, displaySequence: 1, status: "submitted", performedAt: "2026-10-12T03:20:00.000000Z", receivedAt: "2026-10-12T03:20:45.000000Z",
  template: { id: uuid(4), code: "MFE-FSSR", version: 7 }, configuration: { revisionId: uuid(5), revisionNumber: 3 }, responses: { schemaVersion: 1, hydrantType: "meter", rows, comments: "" }, displayControls: {},
  deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "technician"
});

const riserRow = (n: number, order: number, change: Record<string, unknown> = {}) => ({
  rowUuid: uuid(n), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "Core A",
  canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good", remarks: "", fieldRemarks: {}, sortOrder: order, ...change
});
const savedRiserRow = (n: number, order: number, text: string) => riserRow(n, order, { source: "configured", configuredLocationId: locationId, configuredRowOrdinal: order, locationSnapshot: { id: locationId, displayName: "General" }, locationText: text });
const riserDetail = (outlets: unknown[]) => {
  const psi = (values: Record<string, unknown>) => ({ values, unit: "PSI", result: "good", remarks: "" });
  return {
    clientUuid: uuid(1), serverFormInstanceId: uuid(2), jobId: uuid(3), jobReference: "SV-1", jobTitle: "Riser", customerId: uuid(6), customerCode: "C-1", customerName: "Customer", systemKey: "dry_wet_riser", systemLabel: "Dry / Wet Riser System",
    status: "submitted", performedAt: "2026-10-12T03:20:00.000Z", receivedAt: "2026-10-12T03:20:45.000Z", template: { id: uuid(4), code: "MFE-FSSR", version: 7 }, configuration: { revisionId: uuid(5), revisionNumber: 3 },
    systemConfiguration: { riserMode: "dry" },
    responses: { schemaVersion: 2, mode: "dry", checklist: Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])),
      measurements: { jockey_psi: psi({ cut_in: 80, cut_out: 100 }), duty_psi: psi({ cut_in: 70 }), standby_psi: psi({ cut_in: 60 }) }, riserOutlets: outlets, comments: "" },
    deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "technician"
  };
};

test("Hydrant: an accepted detail whose configured rows carry saved-layout text (not the location name) is shown", () => {
  const detail = parseServerHydrantDetail(hydrantDetail([savedHydrantRow(10, 1, "Lobby"), savedHydrantRow(11, 2, "Roof"), hydrantRow(12, 3)]));
  assert.ok(detail, "saved-layout rows are accepted");
  assert.deepEqual(detail!.responses.rows.map((row) => [row.source, row.locationText]), [["configured", "Lobby"], ["configured", "Roof"], ["technician", "Basement"]]);
  // Everything else stays strict.
  assert.equal(parseServerHydrantDetail(hydrantDetail([savedHydrantRow(10, 1, "")])), undefined, "blank text");
  assert.equal(parseServerHydrantDetail(hydrantDetail([savedHydrantRow(10, 1, "x".repeat(301))])), undefined, "oversized text");
  assert.equal(parseServerHydrantDetail(hydrantDetail([{ ...savedHydrantRow(10, 1, "Lobby"), configuredLocationId: uuid(99) }])), undefined, "location snapshot must still match the configured location id");
  assert.equal(parseServerHydrantDetail(hydrantDetail([{ ...savedHydrantRow(10, 1, "Lobby"), foreign: "x" }])), undefined, "unknown row key");
});

test("Dry/Wet Riser V7: an accepted detail whose configured outlets carry saved-layout text is shown", () => {
  const detail = parseServerDryWetRiserDetail(riserDetail([savedRiserRow(10, 1, "Lobby"), savedRiserRow(11, 2, "Roof"), riserRow(12, 3)]));
  assert.ok(detail, "saved-layout outlets are accepted");
  assert.deepEqual((detail!.responses as { riserOutlets: Array<{ source: string; locationText: string }> }).riserOutlets.map((row) => [row.source, row.locationText]), [["configured", "Lobby"], ["configured", "Roof"], ["technician", "Core A"]]);
  assert.equal(parseServerDryWetRiserDetail(riserDetail([savedRiserRow(10, 1, "")])), undefined, "blank text");
  assert.equal(parseServerDryWetRiserDetail(riserDetail([savedRiserRow(10, 1, "x".repeat(251))])), undefined, "oversized text");
  assert.equal(parseServerDryWetRiserDetail(riserDetail([{ ...savedRiserRow(10, 1, "Lobby"), configuredLocationId: uuid(99) }])), undefined, "location snapshot must still match the configured location id");
});
