import type {
  ResolvedChecklistItem,
  ResolvedMeasurementRow,
  ResolvedRemarksDefinition,
  ResultControlDefinition
} from "../inspectionControls/definitionTypes";
import type { ResolvedDryWetRiserControls } from "./dryWetRiserTypes";

type UnknownRecord = Record<string, unknown>;

/** V7 only: V1/V2 render through the historical hardcoded Good/Poor path in
 * DryWetRiserInspectionForm.tsx and never call this resolver. */
const labels: Readonly<Record<string, string>> = {
  saj_main_water_supply: "S.A.J Main Water Supply",
  water_level: "Water Level",
  automatic_refilling_facilities: "Automatic Refilling Facilities",
  drain_and_stop_valve_positions: "Drain Valve In Close Position And All Stop Valve In Open Position",
  pump_house_clean: "Keep Clean In Pump House",
  manual_start_pumps: "Manual Start Jockey Pump, Duty Pump & Stand-by Pump",
  standby_pump_service_items: "Stand-By Pump Water, Oil, Fuel, Belt and etc",
  battery_charging_alternator: "Correct Operation Of Battery Charging Alternator",
  battery_charger_failure_alarm: "Battery Charger Failure Alarm",
  battery_serviceable: "Battery In Good Serviceable",
  pump_phase_failure_alarm: "Pump Run / Phase Failure Alarm Signal To Main Alarm Panel",
  pumps_auto_start: "Jockey Duty And Stand-by Pump In Auto Start Position",
  test_and_gate_valve_positions: "Test Valve In Close Position And All Gate Valve In Open Position",
  jockey_psi: "Jockey Pump",
  duty_psi: "Duty Pump",
  standby_psi: "Stand-by Pump",
  canvasHoseAt2Result: "Canvas Hose ×2",
  diffuserNozzleResult: "Diffuser Nozzle",
  landingValveResult: "Landing Valve",
  crandleResult: "Crandle",
  doorResult: "Door"
};

const waterTankOrder = [
  "saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"
] as const;
const pumpChecklistOrder = [
  "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator",
  "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start",
  "test_and_gate_valve_positions"
] as const;
const measurementOrder = ["jockey_psi", "duty_psi", "standby_psi"] as const;
const rowResultOrder = ["canvasHoseAt2Result", "diffuserNozzleResult", "landingValveResult", "crandleResult", "doorResult"] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function text(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Dry/Wet Riser definition has invalid ${name}`);
  return value;
}
function integer(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`Dry/Wet Riser definition has invalid ${name}`);
  return value;
}
function list(value: unknown, name: string): UnknownRecord[] {
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`Dry/Wet Riser definition has invalid ${name}`);
  return value;
}
function named(values: UnknownRecord[], key: string, name: string) {
  const value = values.find((candidate) => candidate.key === key);
  if (!value) throw new Error(`Dry/Wet Riser definition is missing ${name}`);
  return value;
}
function exactMembers(values: UnknownRecord[], expected: readonly string[], name: string) {
  const actual = values.map((value) => text(value.key, `${name} key`));
  if (actual.length !== expected.length || expected.some((key) => !actual.includes(key))) {
    throw new Error(`Dry/Wet Riser definition has invalid ${name} members`);
  }
}
const optionLabels: Readonly<Record<string, string>> = {
  good: "Good", poor: "Poor", not_good: "Not Good", complete_repair: "Complete Repair", na: "N.A."
};
function result(control: unknown, allowedValues: unknown): ResultControlDefinition {
  if (control !== "good_poor" || !Array.isArray(allowedValues) || allowedValues.length === 0
    || !allowedValues.every((value) => typeof value === "string" && optionLabels[value] !== undefined)
    || new Set(allowedValues).size !== allowedValues.length) {
    throw new Error("Dry/Wet Riser definition has invalid result metadata");
  }
  return {
    type: "single_select",
    required: true,
    options: allowedValues.map((value) => ({ value, label: optionLabels[value] }))
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
  if (!isRecord(item.result)) throw new Error("Dry/Wet Riser measurement result metadata is invalid");
  const key = text(item.key, "measurement key");
  const values = list(item.measurements, `${key} values`).map((value) => ({
    key: text(value.key, "measurement value key"),
    label: text(value.label, "measurement value label"),
    unit: text(value.unit, "measurement unit"),
    required: true
  }));
  if (values.some((value) => value.unit !== "PSI")) throw new Error("Dry/Wet Riser measurement unit must be PSI");
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
    if (!value) throw new Error(`Dry/Wet Riser definition is missing ${key}`);
    return value;
  });

export function resolvePublishedDryWetRiserControls(
  definition: unknown,
  templateCode = "MFE-FSSR",
  templateVersion = 7
): ResolvedDryWetRiserControls {
  if (templateCode !== "MFE-FSSR" || templateVersion !== 7 || !isRecord(definition) || definition.key !== "dry_wet_riser") {
    throw new Error("Unsupported Dry/Wet Riser template definition");
  }
  const sections = list(definition.sections, "sections");
  const waterTank = named(sections, "water_tank", "Water Tank section");
  const pumpHouse = named(sections, "pump_house", "Pump House section");
  const riserOutlet = named(sections, "riser_outlet", "Riser Outlet section");
  const waterItems = list(named(list(waterTank.blocks, "Water Tank blocks"), "water_tank_checks", "Water Tank checks").items, "Water Tank items");
  const pumpBlocks = list(pumpHouse.blocks, "Pump House blocks");
  const pumpItems = list(named(pumpBlocks, "pump_house_checks", "Pump House checks").items, "Pump House items");
  const pumpMeasurements = list(named(pumpBlocks, "pump_measurements", "Pump measurements").items, "Pump measurement items");
  const outletBlocks = list(riserOutlet.blocks, "Riser Outlet blocks");
  const rowsBlock = named(outletBlocks, "riser_outlet_rows", "Riser Outlet rows");
  const commentsBlock = named(outletBlocks, "comments", "Comments");
  if (!isRecord(commentsBlock.field) || commentsBlock.field.control !== "remarks") throw new Error("Dry/Wet Riser comments metadata is invalid");

  exactMembers(waterItems, waterTankOrder, "Water Tank");
  exactMembers(pumpItems, pumpChecklistOrder, "Pump House checklist");
  exactMembers(pumpMeasurements, measurementOrder, "measurement");
  const measurements = ordered(pumpMeasurements.map(measurement), measurementOrder);
  const jockey = measurements.find((item) => item.key === "jockey_psi");
  if (!jockey || jockey.values.map((value) => value.key).join(",") !== "cut_in,cut_out") {
    throw new Error("Dry/Wet Riser Jockey measurement shape is invalid");
  }
  if (measurements.filter((item) => item.key !== "jockey_psi")
    .some((item) => item.values.length !== 1 || item.values[0]?.key !== "cut_in")) {
    throw new Error("Dry/Wet Riser single measurement shape is invalid");
  }

  const resultColumns = list(rowsBlock.columns, "Riser Outlet row columns")
    .filter((column) => column.control === "good_poor")
    .map((column) => ({
      key: text(column.key, "repeatable result key"),
      label: labels[column.key as string] ?? text(column.label, "repeatable result label"),
      sortOrder: integer(column.sortOrder, "repeatable result sort order"),
      result: result(column.control, column.allowedValues)
    }));
  exactMembers(list(rowsBlock.columns, "Riser Outlet row columns").filter((column) => column.control === "good_poor"), rowResultOrder, "Riser Outlet result column");

  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: 7, systemKey: "dry_wet_riser" },
    checklist: {
      waterTank: ordered(waterItems.map(checklist), waterTankOrder),
      pumpHouse: ordered(pumpItems.map(checklist), pumpChecklistOrder)
    },
    measurements,
    repeatableRows: {
      resultColumns: ordered(resultColumns, rowResultOrder),
      remarks: remarks()
    },
    comments: remarks(4000)
  };
}
