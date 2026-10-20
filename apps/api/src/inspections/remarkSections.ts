/**
 * CR-07: the allowlist of form sections that accept a technician-added remark, per system.
 *
 * BYTE-IDENTICAL TWO COPIES: apps/api/src/inspections/remarkSections.ts (server authority) and
 * apps/web/src/inspectionControls/remarkSections.ts. apps/web/tests/remarkSectionsParity.test.ts
 * asserts the two copies are identical AND that the checklist / measurement keys equal the canonical label-override
 * paths (labelOverrides.ts `collectResolvedLabelPaths`) of the real resolved Automatic Sprinkler controls.
 *
 * A section key identifies a template SLOT, never a row UUID: repeated rows share one list.
 *   checklist.<section>.<rowKey>  -- a checklist row's Remark picker (label-override canonical path)
 *   measurements.<rowKey>         -- a measurement row's Remark picker (label-override canonical path)
 *   comments                      -- the Comments box, its own section
 * Automatic Sprinkler (R1-R3) plus Hose Reel, Hydrant, Fire Alarm, FM200 and CO2 (R4). The other five services stay plain text.
 * For the R4 systems the Comments box is NOT a section (no `comments` key): it keeps the system-wide common-remarks list.
 *   <group>.<rowKey> / rows.<column> / rows.remarks -- the template slot of a repeated row: all rows share one key
 */
export const commentsSectionKey = "comments";

export const sprinklerChecklistRows = {
  waterTank: ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"],
  pumpHouse: [
    "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator",
    "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"
  ],
  mainAlarmValve: ["breaching_inlet", "alarm_gong", "flow_meter_valve_positions"],
  testRunFirePump: ["trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"]
} as const;
export const sprinklerMeasurementRows = [
  "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "water_supply_gauge", "installation_gauge"
] as const;

export type SprinklerChecklistSection = keyof typeof sprinklerChecklistRows;

export const checklistRemarkSectionKey = (section: SprinklerChecklistSection, rowKey: string) => `checklist.${section}.${rowKey}`;
export const measurementRemarkSectionKey = (rowKey: string) => `measurements.${rowKey}`;

/** R4: the checklist / result-column slots of the other five services (stable across the historical templates that have the system). */
export const hoseReelRemarkRows = {
  checklistWaterTank: ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"],
  checklistPumpHouse: [
    "pump_house_clean", "standby_pump_service_items", "charger_power_failure_alarm", "battery_serviceable",
    "pump_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"
  ],
  checklistTestRunFirePump: ["trfp_duty_pump", "trfp_standby_pump"],
  measurements: ["jockey_pump_pressure", "standby_pump_cut_in"],
  rowColumns: ["drum", "hose", "nozzle", "valve", "nozzle_box"]
} as const;
export const hydrantRemarkColumns = [
  "canvas_hose_1", "canvas_hose_2", "diffuser_nozzle", "landing_valve", "landing_valve_handle", "hose_cabinet", "key_lock"
] as const;
export const fireAlarmRemarkRows = {
  chargerAndBatteries: ["main_supply", "battery", "charger"],
  mainFunctionKeys: [
    "main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "spka_system", "alarm_lift_trip", "signal_gas_discharge"
  ],
  secondaryColumns: ["alarm_bell", "manual_call_point"]
} as const;
export const suppressionRemarkRows = {
  chargerAndBatteries: ["main_supply", "battery", "charger"],
  physicalOutlook: [
    "co2_cylinder", "electric_actuator", "manual_release_key", "alarm_bell", "twin_flashing_light", "24v_dc_tripping_device",
    "manual_pull_station", "high_pressure_hose", "discharge_nozzles", "pilot_cylinder"
  ],
  mainFunctionKeys: ["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "signal_alarm_to_mfap"]
} as const;

export const sectionRemarkSystemKeys = [
  "automatic_sprinkler", "hose_reel", "hydrant", "fire_alarm_detector", "fm200_fire_suppression", "co2_fire_extinguisher"
] as const;
export type SectionRemarkSystemKey = typeof sectionRemarkSystemKeys[number];

export const rowRemarksSectionKey = "rows.remarks";
export const rowColumnRemarkSectionKey = (column: string) => `rows.${column}`;
export const detectorRowRemarksSectionKey = "detectorRows.remarks";
export const groupedRemarkSectionKey = (group: string, rowKey: string) => `${group}.${rowKey}`;

const prefixed = (group: string, rowKeys: readonly string[]) => rowKeys.map((rowKey) => groupedRemarkSectionKey(group, rowKey));
const suppressionKeys = [
  ...(Object.keys(suppressionRemarkRows) as Array<keyof typeof suppressionRemarkRows>)
    .flatMap((group) => prefixed(group, suppressionRemarkRows[group])),
  detectorRowRemarksSectionKey
];

const keysBySystem: Record<SectionRemarkSystemKey, readonly string[]> = {
  automatic_sprinkler: [
    ...(Object.keys(sprinklerChecklistRows) as SprinklerChecklistSection[])
      .flatMap((section) => sprinklerChecklistRows[section].map((rowKey) => checklistRemarkSectionKey(section, rowKey))),
    ...sprinklerMeasurementRows.map(measurementRemarkSectionKey),
    commentsSectionKey
  ],
  hose_reel: [
    ...prefixed("checklist.waterTank", hoseReelRemarkRows.checklistWaterTank),
    ...prefixed("checklist.pumpHouse", hoseReelRemarkRows.checklistPumpHouse),
    ...prefixed("checklist.testRunFirePump", hoseReelRemarkRows.checklistTestRunFirePump),
    ...hoseReelRemarkRows.measurements.map(measurementRemarkSectionKey),
    ...hoseReelRemarkRows.rowColumns.map(rowColumnRemarkSectionKey),
    rowRemarksSectionKey
  ],
  hydrant: [...hydrantRemarkColumns.map(rowColumnRemarkSectionKey), rowRemarksSectionKey],
  fire_alarm_detector: [
    ...prefixed("chargerAndBatteries", fireAlarmRemarkRows.chargerAndBatteries),
    ...prefixed("mainFunctionKeys", fireAlarmRemarkRows.mainFunctionKeys),
    "primaryRows.remarks",
    ...fireAlarmRemarkRows.secondaryColumns.map((column) => `secondaryRows.${column}`),
    "secondaryRows.remarks"
  ],
  fm200_fire_suppression: suppressionKeys,
  co2_fire_extinguisher: suppressionKeys
};

export function isSectionRemarkSystemKey(value: unknown): value is SectionRemarkSystemKey {
  return typeof value === "string" && (sectionRemarkSystemKeys as readonly string[]).includes(value);
}

export function sectionRemarkKeysFor(systemKey: SectionRemarkSystemKey): readonly string[] {
  return keysBySystem[systemKey];
}

export function isSectionRemarkKey(systemKey: unknown, sectionKey: unknown): boolean {
  return isSectionRemarkSystemKey(systemKey) && typeof sectionKey === "string" && keysBySystem[systemKey].includes(sectionKey);
}
