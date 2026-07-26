import type {
  ResolvedChecklistItem,
  ResolvedMeasurementRow,
  ResolvedRemarksDefinition,
  ResultControlDefinition
} from "./definitionControls.js";

type UnknownRecord = Record<string, unknown>;

export type ResolvedAutomaticSprinklerControls = {
  schemaVersion: 1;
  source: {
    templateCode: "MFE-FSSR";
    templateVersion: 1;
    systemKey: "automatic_sprinkler";
  };
  repetitionMode: "single";
  instance: {
    key: "primary";
    displaySequence: 1;
    zoneId: null;
    locationId: null;
  };
  checklist: {
    waterTank: ResolvedChecklistItem[];
    pumpHouse: ResolvedChecklistItem[];
    mainAlarmValve: ResolvedChecklistItem[];
  };
  measurements: ResolvedMeasurementRow[];
  layout: {
    waterTank: Array<{ kind: "checklist"; key: string }>;
    pumpHouse: Array<{ kind: "checklist" | "measurement"; key: string }>;
    mainAlarmValve: Array<{ kind: "checklist" | "measurement"; key: string }>;
  };
  comments: ResolvedRemarksDefinition;
};

const labels: Readonly<Record<string, string>> = {
  saj_main_water_supply: "S.A.J Main Water Supply",
  water_level: "Water Level",
  automatic_refilling_facilities: "Automatic Refilling Facilities",
  drain_and_stop_valve_positions: "Drain Valve In Close Position And All Stop Valve In Open Position",
  pump_house_clean: "Keep Clean In Pump House",
  manual_start_pumps: "Manual Start Jockey Pump, Duty Pump & Stand-by Pump",
  jockey_pump_pressure: "Jockey Correct Cut In / Cut Out",
  duty_pump_cut_in: "Correct Duty Pump Cut In",
  standby_pump_cut_in: "Correct Stand-By Pump Cut In",
  standby_pump_service_items: "Stand-By Pump Water, Oil, Fuel, Belt and etc",
  battery_charging_alternator: "Correct Operation Of Battery Charging Alternator",
  battery_serviceable: "Battery In Good Serviceable",
  pump_phase_failure_alarm: "Pump Run / Phase Failure Alarm Signal To Main Alarm Panel",
  pumps_auto_start: "Jockey Duty And Stand-By Pump In Auto Start Position",
  test_and_gate_valve_positions: "Test Valve In Close Position And All Gate Valve In Open Position",
  breaching_inlet: "Breaching Inlet In Good Serviceable",
  alarm_gong: "Alarm Gong In Function",
  water_supply_gauge: "Water Supply Gauge At",
  installation_gauge: "Installation Gauge At",
  flow_meter_valve_positions: "Flow Meter Valve In Close Position And All Valve In Open Position"
};
const waterTankOrder = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"] as const;
const pumpChecklistOrder = ["pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"] as const;
const mainValveChecklistOrder = ["breaching_inlet", "alarm_gong", "flow_meter_valve_positions"] as const;
const measurementOrder = ["jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "water_supply_gauge", "installation_gauge"] as const;
const pumpLayout = [
  { kind: "checklist", key: "pump_house_clean" },
  { kind: "checklist", key: "manual_start_pumps" },
  { kind: "measurement", key: "jockey_pump_pressure" },
  { kind: "measurement", key: "duty_pump_cut_in" },
  { kind: "measurement", key: "standby_pump_cut_in" },
  { kind: "checklist", key: "standby_pump_service_items" },
  { kind: "checklist", key: "battery_charging_alternator" },
  { kind: "checklist", key: "battery_serviceable" },
  { kind: "checklist", key: "pump_phase_failure_alarm" },
  { kind: "checklist", key: "pumps_auto_start" },
  { kind: "checklist", key: "test_and_gate_valve_positions" }
] as const;
const mainValveLayout = [
  { kind: "checklist", key: "breaching_inlet" },
  { kind: "checklist", key: "alarm_gong" },
  { kind: "measurement", key: "water_supply_gauge" },
  { kind: "measurement", key: "installation_gauge" },
  { kind: "checklist", key: "flow_meter_valve_positions" }
] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function text(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Automatic Sprinkler definition has invalid ${name}`);
  return value;
}
function integer(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`Automatic Sprinkler definition has invalid ${name}`);
  return value;
}
function list(value: unknown, name: string): UnknownRecord[] {
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`Automatic Sprinkler definition has invalid ${name}`);
  return value;
}
function named(values: UnknownRecord[], key: string, name: string) {
  const value = values.find((candidate) => candidate.key === key);
  if (!value) throw new Error(`Automatic Sprinkler definition is missing ${name}`);
  return value;
}
function exactMembers(values: UnknownRecord[], expected: readonly string[], name: string) {
  const actual = values.map((value) => text(value.key, `${name} key`));
  if (actual.length !== expected.length || expected.some((key) => !actual.includes(key))) {
    throw new Error(`Automatic Sprinkler definition has invalid ${name} members`);
  }
}
function result(control: unknown, allowedValues: unknown): ResultControlDefinition {
  if (control !== "good_poor" || !Array.isArray(allowedValues)
    || allowedValues.length !== 2 || allowedValues[0] !== "good" || allowedValues[1] !== "poor") {
    throw new Error("Automatic Sprinkler definition has invalid result metadata");
  }
  return {
    type: "single_select",
    required: true,
    options: [{ value: "good", label: "Good" }, { value: "poor", label: "Poor" }]
  };
}
const remarks = (maxLength = 2000): ResolvedRemarksDefinition => ({ policy: "optional", maxLength });
function checklist(item: UnknownRecord): ResolvedChecklistItem {
  const key = text(item.key, "checklist key");
  return {
    key,
    label: labels[key] ?? text(item.label, "checklist label"),
    sortOrder: integer(item.sortOrder, "checklist sort order"),
    result: result(item.control, item.allowedValues),
    remarks: remarks()
  };
}
function measurement(item: UnknownRecord): ResolvedMeasurementRow {
  if (!isRecord(item.result)) throw new Error("Automatic Sprinkler measurement result metadata is invalid");
  const key = text(item.key, "measurement key");
  const values = list(item.measurements, `${key} values`).map((value) => ({
    key: text(value.key, "measurement value key"),
    label: text(value.label, "measurement value label"),
    unit: text(value.unit, "measurement unit"),
    required: true
  }));
  if (values.some((value) => value.unit !== "PSI")) throw new Error("Automatic Sprinkler measurement unit must be PSI");
  return {
    key,
    label: labels[key] ?? text(item.label, "measurement label"),
    sortOrder: integer(item.sortOrder, "measurement sort order"),
    values,
    result: result(item.result.control, item.result.allowedValues),
    remarks: remarks()
  };
}
const ordered = <T extends { key: string }>(values: T[], keys: readonly string[]) =>
  keys.map((key) => {
    const value = values.find((candidate) => candidate.key === key);
    if (!value) throw new Error(`Automatic Sprinkler definition is missing ${key}`);
    return value;
  });

export function resolveAutomaticSprinklerControls(
  definition: unknown,
  templateCode = "MFE-FSSR",
  templateVersion = 1
): ResolvedAutomaticSprinklerControls {
  if (templateCode !== "MFE-FSSR" || templateVersion !== 1 || !isRecord(definition)
    || definition.key !== "automatic_sprinkler" || !isRecord(definition.configuration)
    || definition.configuration.supportsZones !== false
    || definition.configuration.supportsLocations !== false
    || definition.configuration.supportsPresetRows !== false) {
    throw new Error("Unsupported Automatic Sprinkler template definition");
  }
  const sections = list(definition.sections, "sections");
  const water = named(sections, "water_tank", "Water Tank section");
  const pump = named(sections, "pump_house", "Pump House section");
  const valve = named(sections, "main_alarm_valve", "Main Alarm Valve section");
  const waterItems = list(named(list(water.blocks, "Water Tank blocks"), "water_tank_checks", "Water Tank checks").items, "Water Tank items");
  const pumpBlocks = list(pump.blocks, "Pump House blocks");
  const pumpItems = list(named(pumpBlocks, "pump_house_checks", "Pump House checks").items, "Pump House items");
  const pumpMeasurements = list(named(pumpBlocks, "pump_pressure_measurements", "Pump measurements").items, "Pump measurement items");
  const valveBlocks = list(valve.blocks, "Main Alarm Valve blocks");
  const valveItems = list(named(valveBlocks, "main_alarm_valve_checks", "Main Alarm Valve checks").items, "Main Alarm Valve items");
  const valveMeasurements = list(named(valveBlocks, "alarm_valve_measurements", "Main Alarm Valve measurements").items, "Main Alarm Valve measurement items");
  const commentsBlock = named(valveBlocks, "comments", "Comments");
  if (!isRecord(commentsBlock.field) || commentsBlock.field.control !== "remarks") throw new Error("Automatic Sprinkler comments metadata is invalid");

  exactMembers(waterItems, waterTankOrder, "Water Tank");
  exactMembers(pumpItems, pumpChecklistOrder, "Pump House checklist");
  exactMembers(valveItems, mainValveChecklistOrder, "Main Alarm Valve checklist");
  exactMembers([...pumpMeasurements, ...valveMeasurements], measurementOrder, "measurement");
  const measurements = ordered([...pumpMeasurements, ...valveMeasurements].map(measurement), measurementOrder);
  const jockey = measurements.find((item) => item.key === "jockey_pump_pressure");
  if (!jockey || jockey.values.map((value) => value.key).join(",") !== "cut_in,cut_out") {
    throw new Error("Automatic Sprinkler Jockey measurement shape is invalid");
  }
  if (measurements.filter((item) => item.key !== "jockey_pump_pressure")
    .some((item) => item.values.length !== 1 || item.values[0]?.key !== "value")) {
    throw new Error("Automatic Sprinkler single measurement shape is invalid");
  }

  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: 1, systemKey: "automatic_sprinkler" },
    repetitionMode: "single",
    instance: { key: "primary", displaySequence: 1, zoneId: null, locationId: null },
    checklist: {
      waterTank: ordered(waterItems.map(checklist), waterTankOrder),
      pumpHouse: ordered(pumpItems.map(checklist), pumpChecklistOrder),
      mainAlarmValve: ordered(valveItems.map(checklist), mainValveChecklistOrder)
    },
    measurements,
    layout: {
      waterTank: waterTankOrder.map((key) => ({ kind: "checklist", key })),
      pumpHouse: [...pumpLayout],
      mainAlarmValve: [...mainValveLayout]
    },
    comments: remarks(4000)
  };
}
