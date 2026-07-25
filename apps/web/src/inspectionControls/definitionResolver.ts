import type {
  ResolvedChecklistItem,
  ResolvedHoseReelControls,
  ResolvedMeasurementRow,
  ResolvedRemarksDefinition,
  ResultControlDefinition
} from "./definitionTypes";

type UnknownRecord = Record<string, unknown>;

const optionLabels: Readonly<Record<string, string>> = {
  good: "Good",
  poor: "Poor"
};
const checklistLabels: Readonly<Record<string, string>> = {
  saj_main_water_supply: "S.A.J Main Water Supply",
  water_level: "Water Level",
  automatic_refilling_facilities: "Automatic Refilling Facilities",
  drain_and_stop_valve_positions: "Drain Valve In Close Position And All Stop Valve In Open Position",
  pump_house_clean: "Keep Clean In Pump House",
  standby_pump_service_items: "Stand-By Pump Oil, Fuel and Other Service Items",
  charger_power_failure_alarm: "Battery Charger Power Failure Alarm",
  battery_serviceable: "Battery In Good Serviceable / Function",
  pump_failure_alarm: "Pump Run / Failure Alarm To Fire Alarm Panel",
  pumps_auto_start: "Jockey And Stand-By Pump In Auto Start Position",
  test_and_gate_valve_positions: "Test Valve In Close Position And All Gate Valve In Open Position"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Hose Reel definition has invalid ${name}`);
  }
  return value;
}

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Hose Reel definition has invalid ${name}`);
  }
  return value;
}

function list(value: unknown, name: string): UnknownRecord[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`Hose Reel definition has invalid ${name}`);
  }
  return value;
}

function named(values: UnknownRecord[], key: string, name: string): UnknownRecord {
  const value = values.find((candidate) => candidate.key === key);
  if (!value) {
    throw new Error(`Hose Reel definition is missing ${name}`);
  }
  return value;
}

function resultControl(control: unknown, allowedValues: unknown): ResultControlDefinition {
  if (control !== "good_poor" || !Array.isArray(allowedValues) || allowedValues.length === 0) {
    throw new Error("Hose Reel definition has invalid result metadata");
  }
  const values = allowedValues.map((value) => text(value, "result option"));
  if (new Set(values).size !== values.length) {
    throw new Error("Hose Reel definition has duplicate result options");
  }
  return {
    type: "single_select",
    required: true,
    options: values.map((value) => {
      const label = optionLabels[value];
      if (!label) {
        throw new Error(`MFE-FSSR V1 has unknown result option ${value}`);
      }
      return { value, label };
    })
  };
}

function remarks(maxLength = 2000): ResolvedRemarksDefinition {
  return { policy: "optional", maxLength };
}

function checklistItem(item: UnknownRecord): ResolvedChecklistItem {
  const key = text(item.key, "checklist key");
  return {
    key,
    label: checklistLabels[key] ?? text(item.label, "checklist label"),
    sortOrder: integer(item.sortOrder, "checklist sort order"),
    result: resultControl(item.control, item.allowedValues),
    remarks: remarks()
  };
}

function measurementRow(item: UnknownRecord): ResolvedMeasurementRow {
  if (!isRecord(item.result)) {
    throw new Error("Hose Reel definition has invalid measurement result metadata");
  }
  return {
    key: text(item.key, "measurement key"),
    label: text(item.label, "measurement label"),
    sortOrder: integer(item.sortOrder, "measurement sort order"),
    values: list(item.measurements, "measurement values").map((value) => ({
      key: text(value.key, "measurement value key"),
      label: text(value.label, "measurement value label"),
      unit: text(value.unit, "measurement unit"),
      required: true
    })),
    result: resultControl(item.result.control, item.result.allowedValues),
    remarks: remarks()
  };
}

function sorted<T extends { sortOrder: number }>(values: T[]): T[] {
  return values.sort((left, right) => left.sortOrder - right.sortOrder);
}

export function resolvePublishedHoseReelControls(
  definition: unknown,
  templateCode = "MFE-FSSR",
  templateVersion = 1
): ResolvedHoseReelControls {
  if (templateCode !== "MFE-FSSR" || templateVersion !== 1 || !isRecord(definition) || definition.key !== "hose_reel") {
    throw new Error("Unsupported Hose Reel template definition");
  }
  const sections = list(definition.sections, "sections");
  const waterTank = named(sections, "water_tank", "Water Tank section");
  const pumpHouse = named(sections, "pump_house", "Pump House section");
  const drum = named(sections, "hose_reel_drum", "Hose Reel Drum section");
  const waterChecks = named(list(waterTank.blocks, "Water Tank blocks"), "water_tank_checks", "Water Tank checklist");
  const pumpBlocks = list(pumpHouse.blocks, "Pump House blocks");
  const pumpChecks = named(pumpBlocks, "pump_house_checks", "Pump House checklist");
  const measurements = named(pumpBlocks, "pump_pressure_measurements", "Pump House measurements");
  const drumBlocks = list(drum.blocks, "Hose Reel Drum blocks");
  const rowBlock = named(drumBlocks, "hose_reel_rows", "Hose Reel rows");
  const commentsBlock = named(drumBlocks, "comments", "Hose Reel comments");
  const commentsField = commentsBlock.field;
  if (!isRecord(commentsField) || commentsField.control !== "remarks") {
    throw new Error("Hose Reel definition has invalid comments metadata");
  }

  const resultColumns = list(rowBlock.columns, "Hose Reel row columns")
    .filter((column) => column.control === "good_poor")
    .map((column) => ({
      key: text(column.key, "repeatable result key"),
      label: text(column.label, "repeatable result label"),
      sortOrder: integer(column.sortOrder, "repeatable result sort order"),
      result: resultControl(column.control, column.allowedValues)
    }));
  if (resultColumns.length === 0) {
    throw new Error("Hose Reel definition has no repeatable result columns");
  }

  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: 1, systemKey: "hose_reel" },
    checklist: {
      waterTank: sorted(list(waterChecks.items, "Water Tank items").map(checklistItem)),
      pumpHouse: sorted(list(pumpChecks.items, "Pump House items").map(checklistItem))
    },
    measurements: sorted(list(measurements.items, "measurement rows").map(measurementRow)),
    repeatableRows: {
      resultColumns: sorted(resultColumns),
      remarks: remarks()
    },
    comments: remarks(4000)
  };
}

function sameOptionValues(control: unknown): control is ResultControlDefinition {
  if (!isRecord(control) || control.type !== "single_select" || typeof control.required !== "boolean" || !Array.isArray(control.options)) {
    return false;
  }
  return control.options.length > 0 && control.options.every((option) =>
    isRecord(option)
    && typeof option.value === "string"
    && optionLabels[option.value] === option.label
  );
}

export function parseFrozenHoseReelControls(value: unknown): ResolvedHoseReelControls | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.source)
    || value.source.templateCode !== "MFE-FSSR" || value.source.templateVersion !== 1
    || value.source.systemKey !== "hose_reel" || !isRecord(value.checklist)
    || !Array.isArray(value.checklist.waterTank) || !Array.isArray(value.checklist.pumpHouse)
    || !Array.isArray(value.measurements) || !isRecord(value.repeatableRows)
    || !Array.isArray(value.repeatableRows.resultColumns) || !isRecord(value.comments)) {
    return undefined;
  }
  const checklist = [...value.checklist.waterTank, ...value.checklist.pumpHouse];
  const validRemarks = (candidate: unknown) =>
    isRecord(candidate)
    && (candidate.policy === "none" || candidate.policy === "optional")
    && Number.isInteger(candidate.maxLength) && (candidate.maxLength as number) >= 0;
  const valid = checklist.every((item) =>
    isRecord(item) && typeof item.key === "string" && typeof item.label === "string"
    && Number.isInteger(item.sortOrder) && sameOptionValues(item.result)
    && validRemarks(item.remarks)
  ) && value.measurements.every((item) =>
    isRecord(item) && typeof item.key === "string" && typeof item.label === "string"
    && Number.isInteger(item.sortOrder) && sameOptionValues(item.result)
    && validRemarks(item.remarks) && Array.isArray(item.values)
    && item.values.every((measurement) =>
      isRecord(measurement)
      && typeof measurement.key === "string" && typeof measurement.label === "string"
      && typeof measurement.unit === "string" && typeof measurement.required === "boolean"
    )
  ) && value.repeatableRows.resultColumns.every((column) =>
    isRecord(column) && typeof column.key === "string" && typeof column.label === "string"
    && Number.isInteger(column.sortOrder) && sameOptionValues(column.result)
  ) && validRemarks(value.repeatableRows.remarks) && validRemarks(value.comments);
  return valid ? value as unknown as ResolvedHoseReelControls : undefined;
}

export function controlsForHoseReelSnapshot(snapshot: {
  template: { code: string; version: number };
  system: { definition: unknown; resolvedControls?: unknown };
}): ResolvedHoseReelControls {
  return parseFrozenHoseReelControls(snapshot.system.resolvedControls)
    ?? resolvePublishedHoseReelControls(
      snapshot.system.definition,
      snapshot.template.code,
      snapshot.template.version
    );
}
