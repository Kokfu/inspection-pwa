import { sectionRemarkKeysFor, type SectionRemarkSystemKey } from "./remarkSections";

/**
 * R3: the name a reviewer sees for a remark section ("Water Tank › S.A.J Main Water Supply"). The server stores only the
 * section KEY (a template slot), never a label, so this table is the template's default wording. A per-customer label
 * override is not applied here (it would need the customer's configuration); the key is always shown as the fallback so a
 * section can never be mistaken for another.
 */
const systemNames: Readonly<Record<SectionRemarkSystemKey, string>> = {
  automatic_sprinkler: "Automatic Sprinkler System", hose_reel: "Hose Reel System", hydrant: "Hydrant System",
  fire_alarm_detector: "Fire Alarm System", fm200_fire_suppression: "FM200 System", co2_fire_extinguisher: "CO2 System"
};

const groups: Readonly<Record<string, string>> = {
  waterTank: "Water Tank", pumpHouse: "Pump House", mainAlarmValve: "Main Alarm Valve", testRunFirePump: "Test Run Fire Pump"
};
const rows: Readonly<Record<string, string>> = {
  saj_main_water_supply: "S.A.J Main Water Supply",
  water_level: "Water Level",
  automatic_refilling_facilities: "Automatic Refilling Facilities",
  drain_and_stop_valve_positions: "Drain Valve In Close Position And All Stop Valve In Open Position",
  pump_house_clean: "Keep Clean In Pump House",
  manual_start_pumps: "Manual Start Jockey Pump, Duty Pump & Stand-by Pump",
  standby_pump_service_items: "Stand-By Pump Water, Oil, Fuel, Belt and etc",
  battery_charging_alternator: "Correct Operation Of Battery Charging Alternator",
  battery_serviceable: "Battery In Good Serviceable",
  pump_phase_failure_alarm: "Pump Run / Phase Failure Alarm Signal To Main Alarm Panel",
  pumps_auto_start: "Jockey Duty And Stand-By Pump In Auto Start Position",
  test_and_gate_valve_positions: "Test Valve In Close Position And All Gate Valve In Open Position",
  breaching_inlet: "Breaching Inlet In Good Serviceable",
  alarm_gong: "Alarm Gong In Function",
  flow_meter_valve_positions: "Flow Meter Valve In Close Position And All Valve In Open Position",
  trfp_jockey_pump: "Jockey Pump",
  trfp_duty_pump: "Duty Pump",
  trfp_standby_pump: "Stand-By Pump",
  jockey_pump_pressure: "Jockey Correct Cut In / Cut Out",
  duty_pump_cut_in: "Correct Duty Pump Cut In",
  standby_pump_cut_in: "Correct Stand-By Pump Cut In",
  water_supply_gauge: "Water Supply Gauge At",
  installation_gauge: "Installation Gauge At"
};

/**
 * R4: the other five services. A section key is "<group>.<row>" (or "rows.<column>"); the table is per service because the same
 * row key can be worded differently in two services. Repeated rows share one slot, so a repeated-row slot reads "(every row)".
 */
const suppressionRows: Readonly<Record<string, string>> = {
  main_supply: "Main Supply", battery: "Battery", charger: "Charger",
  co2_cylinder: "CO2 Cylinder", electric_actuator: "Electric Actuator", manual_release_key: "Manual Release Key", alarm_bell: "Alarm Bell",
  twin_flashing_light: "Twin Flashing Light", "24v_dc_tripping_device": "24V DC Tripping Device", manual_pull_station: "Manual Pull Station",
  high_pressure_hose: "High Pressure Hose", discharge_nozzles: "Discharge Nozzles", pilot_cylinder: "Pilot Cylinder",
  main_alarm_reset: "Main Alarm Reset", lamp_test: "Lamp Test", evacuate: "Evacuate", ac_supply: "A/C Supply", dc_supply: "D/C Supply",
  signal_alarm_to_mfap: "Signal Alarm to MFAP"
};
const suppressionGroups: Readonly<Record<string, string>> = {
  chargerAndBatteries: "Charger & Batteries", physicalOutlook: "Physical Outlook", mainFunctionKeys: "Main Function Keys"
};
const otherServiceLabels: Readonly<Record<Exclude<SectionRemarkSystemKey, "automatic_sprinkler">, Readonly<Record<string, string>>>> = {
  hose_reel: {
    "checklist.waterTank.saj_main_water_supply": "Water Tank › S.A.J Main Water Supply",
    "checklist.waterTank.water_level": "Water Tank › Water Level",
    "checklist.waterTank.automatic_refilling_facilities": "Water Tank › Automatic Refilling Facilities",
    "checklist.waterTank.drain_and_stop_valve_positions": "Water Tank › Drain Valve In Close Position And All Stop Valve In Open Position",
    "checklist.pumpHouse.pump_house_clean": "Pump House › Keep Clean In Pump House",
    "checklist.pumpHouse.standby_pump_service_items": "Pump House › Stand-By Pump Oil, Fuel and Other Service Items",
    "checklist.pumpHouse.charger_power_failure_alarm": "Pump House › Battery Charger Power Failure Alarm",
    "checklist.pumpHouse.battery_serviceable": "Pump House › Battery In Good Serviceable / Function",
    "checklist.pumpHouse.pump_failure_alarm": "Pump House › Pump Run / Failure Alarm To Fire Alarm Panel",
    "checklist.pumpHouse.pumps_auto_start": "Pump House › Jockey And Stand-By Pump In Auto Start Position",
    "checklist.pumpHouse.test_and_gate_valve_positions": "Pump House › Test Valve In Close Position And All Gate Valve In Open Position",
    "checklist.testRunFirePump.trfp_duty_pump": "Test Run Fire Pump › Duty Pump",
    "checklist.testRunFirePump.trfp_standby_pump": "Test Run Fire Pump › Standby Pump",
    "measurements.jockey_pump_pressure": "Pump House pressure › Jockey Pump",
    "measurements.standby_pump_cut_in": "Pump House pressure › Stand-by Pump Cut In",
    "rows.drum": "Hose reel rows › Drum (every row)", "rows.hose": "Hose reel rows › Hose (every row)",
    "rows.nozzle": "Hose reel rows › Nozzle (every row)", "rows.valve": "Hose reel rows › Valve (every row)",
    "rows.nozzle_box": "Hose reel rows › Nozzle Box (every row)", "rows.remarks": "Hose reel rows › Row remarks (every row)"
  },
  hydrant: {
    "rows.canvas_hose_1": "Hydrant rows › Canvas Hose 1 (every row)", "rows.canvas_hose_2": "Hydrant rows › Canvas Hose 2 (every row)",
    "rows.diffuser_nozzle": "Hydrant rows › Diffuser Nozzle (every row)", "rows.landing_valve": "Hydrant rows › Landing Valve (every row)",
    "rows.landing_valve_handle": "Hydrant rows › Landing Valve Handle (every row)", "rows.hose_cabinet": "Hydrant rows › Hose Cabinet (every row)",
    "rows.key_lock": "Hydrant rows › Key Lock (every row)", "rows.remarks": "Hydrant rows › Row remarks (every row)"
  },
  fire_alarm_detector: {
    "chargerAndBatteries.main_supply": "Charger & Batteries › Main Supply", "chargerAndBatteries.battery": "Charger & Batteries › Battery",
    "chargerAndBatteries.charger": "Charger & Batteries › Charger",
    "mainFunctionKeys.main_alarm_reset": "Main Function Keys › Main Alarm Reset", "mainFunctionKeys.lamp_test": "Main Function Keys › Lamp Test",
    "mainFunctionKeys.evacuate": "Main Function Keys › Evacuate", "mainFunctionKeys.ac_supply": "Main Function Keys › A/C Supply",
    "mainFunctionKeys.dc_supply": "Main Function Keys › D/C Supply", "mainFunctionKeys.spka_system": "Main Function Keys › SPKA System",
    "mainFunctionKeys.alarm_lift_trip": "Main Function Keys › Alarm Lift Trip", "mainFunctionKeys.signal_gas_discharge": "Main Function Keys › Signal Gas Discharge",
    "primaryRows.remarks": "Primary device rows › Row remarks (every row)",
    "secondaryRows.alarm_bell": "Secondary alarm device rows › Alarm Bell (every row)",
    "secondaryRows.manual_call_point": "Secondary alarm device rows › Manual Call Point (every row)",
    "secondaryRows.remarks": "Secondary alarm device rows › Row remarks (every row)"
  },
  fm200_fire_suppression: suppressionLabels(),
  co2_fire_extinguisher: suppressionLabels()
};
function suppressionLabels(): Record<string, string> {
  const labels: Record<string, string> = { "detectorRows.remarks": "Detector table › Row remarks (every row)" };
  for (const group of Object.keys(suppressionGroups)) {
    for (const key of sectionRemarkKeysFor("fm200_fire_suppression").filter((candidate) => candidate.startsWith(`${group}.`))) {
      const row = suppressionRows[key.slice(group.length + 1)];
      if (row) labels[key] = `${suppressionGroups[group]} › ${row}`;
    }
  }
  return labels;
}

export function systemDisplayName(systemKey: string): string {
  return systemNames[systemKey as SectionRemarkSystemKey] ?? systemKey;
}

/** "Water Tank › S.A.J Main Water Supply", "Pressure › Jockey Correct Cut In / Cut Out", or the raw key when unknown. */
export function sectionDisplayLabel(sectionKey: string, systemKey: string = "automatic_sprinkler"): string {
  if (systemKey !== "automatic_sprinkler") return otherServiceLabels[systemKey as keyof typeof otherServiceLabels]?.[sectionKey] ?? sectionKey;
  const parts = sectionKey.split(".");
  const rowKey = parts[parts.length - 1] ?? sectionKey;
  const row = rows[rowKey];
  if (!row) return sectionKey;
  if (parts[0] === "checklist" && parts.length === 3) {
    const group = groups[parts[1]!];
    return group ? `${group} › ${row}` : sectionKey;
  }
  if (parts[0] === "measurements" && parts.length === 2) return `Pressure and gauges › ${row}`;
  return sectionKey;
}

/** Every section a request can be made for (the Comments box is excluded), for tests and the reviewer's filter. */
export function requestableSectionKeys(systemKey: SectionRemarkSystemKey): readonly string[] {
  return sectionRemarkKeysFor(systemKey).filter((key) => key !== "comments");
}
