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
 * Pilot: Automatic Sprinkler only. Every other system keeps the global common-remarks behaviour.
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

export const sectionRemarkSystemKeys = ["automatic_sprinkler"] as const;
export type SectionRemarkSystemKey = typeof sectionRemarkSystemKeys[number];

const keysBySystem: Record<SectionRemarkSystemKey, readonly string[]> = {
  automatic_sprinkler: [
    ...(Object.keys(sprinklerChecklistRows) as SprinklerChecklistSection[])
      .flatMap((section) => sprinklerChecklistRows[section].map((rowKey) => checklistRemarkSectionKey(section, rowKey))),
    ...sprinklerMeasurementRows.map(measurementRemarkSectionKey),
    commentsSectionKey
  ]
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
