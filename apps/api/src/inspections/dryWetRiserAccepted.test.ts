import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV2 } from "./templates/masterServiceReportV2.js";
import { validStoredDryWetRiser } from "./dryWetRiserAccepted.js";

const locationId = "40000000-0000-4000-8000-000000000001";
const rowId = "40000000-0000-4000-8000-000000000002";
const definition = masterServiceReportV2.systems.find((system) => system.key === "dry_wet_riser")!;
const checks = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, { result: "good", remarks: "" }]));
const system = {
  enabledSystemId: "40000000-0000-4000-8000-000000000003", systemKey: "dry_wet_riser", definitionStatus: "confirmed",
  definition, systemConfiguration: { riserMode: "dry" }, zones: [],
  locations: [{ id: locationId, zoneId: null, key: "outlet-a", displayName: "Outlet A", presetRowCount: 1, rowPreset: { assetReference: "DW-01" }, sortOrder: 1 }]
};
const responses = {
  schemaVersion: 1, mode: "dry", waterTank: checks(["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"]),
  pumpHouse: checks(["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"]),
  measurements: { jockeyCutIn: 10, jockeyCutOut: 11, dutyCutIn: 12, standbyCutIn: 13, unit: "PSI" },
  riserOutlets: [{ rowUuid: rowId, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1, zoneSnapshot: null, locationSnapshot: { id: locationId, displayName: "Outlet A" }, assetReference: "DW-01", locationText: "Outlet A", canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good", remarks: "", sortOrder: 1 }], comments: ""
};

test("Dry/Wet Riser stored responses require their frozen authoritative definition", () => {
  assert.equal(validStoredDryWetRiser(responses, system, system.systemConfiguration), true);
  const corrupt = structuredClone(system) as any;
  corrupt.definition.sections[0].title = "Corrupt historical contract";
  assert.equal(validStoredDryWetRiser(responses, corrupt, corrupt.systemConfiguration), false);
});
