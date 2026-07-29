import type { MasterServiceReportDefinition, SystemDefinition } from "./templateTypes.js";
import { masterServiceReportV1 } from "./masterServiceReportV1.js";

const goodPoor = (key: string, label: string, sortOrder: number) => ({
  key, label, control: "good_poor" as const, required: false, sortOrder,
  allowedValues: ["good", "poor"] as const, remarksPolicy: "optional" as const
});
const measurement = (key: string, label: string, sortOrder: number, values: readonly { key: string; label: string }[]) => ({
  key, label, sortOrder, measurements: values.map((value) => ({ ...value, required: false, unit: "PSI" })),
  result: { control: "good_poor" as const, required: false, allowedValues: ["good", "poor"] as const }, remarksPolicy: "optional" as const
});

/** A new immutable definition: V1 deliberately remains untouched for historical jobs. */
const dryWetRiserV2: SystemDefinition = {
  key: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 1, definitionStatus: "confirmed",
  configuration: { supportsZones: true, supportsLocations: true, supportsPresetRows: true },
  sections: [
    { key: "water_tank", title: "Water Tank", sortOrder: 1, blocks: [{ key: "water_tank_checks", title: "Water Tank", type: "checklist", sortOrder: 1, items: [
      goodPoor("saj_main_water_supply", "S.A.J Main Water Supply", 1), goodPoor("water_level", "Water Level", 2), goodPoor("automatic_refilling_facilities", "Automatic Refilling Facilities", 3), goodPoor("drain_and_stop_valve_positions", "Drain Valve In Close Position And All Stop Valve In Open Position", 4)
    ] }] },
    { key: "pump_house", title: "Pump House", sortOrder: 2, blocks: [
      { key: "pump_house_checks", title: "Pump House", type: "checklist", sortOrder: 1, items: [
        goodPoor("pump_house_clean", "Keep Clean In Pump House", 1), goodPoor("manual_start_pumps", "Manual Start Jockey Pump, Duty Pump & Stand-by Pump", 2), goodPoor("jockey_pump_pressure", "Jockey Correct Cut In / Cut Out", 3), goodPoor("duty_pump_cut_in", "Correct Duty Pump Cut In", 4), goodPoor("standby_pump_cut_in", "Correct Stand-By Pump Cut In", 5), goodPoor("standby_pump_service_items", "Stand-By Pump Water, Oil, Fuel, Belt and etc", 6), goodPoor("battery_charging_alternator", "Correct Operation Of Battery Charging Alternator", 7), goodPoor("battery_charger_failure_alarm", "Battery Charger Failure Alarm", 8), goodPoor("battery_serviceable", "Battery In Good Serviceable", 9), goodPoor("pump_phase_failure_alarm", "Pump Run / Phase Failure Alarm Signal To Main Alarm Panel", 10), goodPoor("pumps_auto_start", "Jockey Duty And Stand-by Pump In Auto Start Position", 11), goodPoor("test_and_gate_valve_positions", "Test Valve In Close Position And All Gate Valve In Open Position", 12)
      ] },
      { key: "pump_measurements", title: "PSI", type: "measurement", sortOrder: 2, items: [measurement("jockey_psi", "Jockey Pump", 1, [{ key: "cut_in", label: "Cut In" }, { key: "cut_out", label: "Cut Out" }]), measurement("duty_psi", "Duty Pump", 2, [{ key: "cut_in", label: "Cut In" }]), measurement("standby_psi", "Stand-by Pump", 3, [{ key: "cut_in", label: "Cut In" }])] }
    ] },
    { key: "riser_outlet", title: "Riser Outlet", sortOrder: 3, blocks: [{ key: "riser_outlet_rows", title: "Riser Outlet Rows", type: "repeatable_table", sortOrder: 1, supportsZones: true, supportsLocations: true, columns: [
      { key: "assetReference", label: "No.", control: "text", required: false, sortOrder: 1 }, { key: "locationText", label: "Location", control: "text", required: true, sortOrder: 2 }, goodPoor("canvasHoseAt2Result", "Canvas hose@2", 3), goodPoor("diffuserNozzleResult", "Diffuser Nozzle", 4), goodPoor("landingValveResult", "Landing Valve", 5), goodPoor("crandleResult", "Crandle", 6), goodPoor("doorResult", "Door", 7), { key: "remarks", label: "Remarks", control: "remarks", required: false, sortOrder: 8 }
    ] }, { key: "comments", title: "Comments", type: "comments", sortOrder: 2, field: { key: "comments", label: "Comments", control: "remarks", required: false, sortOrder: 1 } }] }
  ]
};

export const masterServiceReportV2 = {
  id: "00000000-0000-4000-8000-000000000802", code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 2, selectionPolicy: "preset_only",
  header: masterServiceReportV1.header, reportBoilerplate: masterServiceReportV1.reportBoilerplate, systems: [dryWetRiserV2]
} as const satisfies MasterServiceReportDefinition;
