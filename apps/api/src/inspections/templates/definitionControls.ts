type UnknownRecord = Record<string, unknown>;

export type ResultOptionDefinition = {
  value: string;
  label: string;
};

export type ResultControlDefinition = {
  type: "single_select";
  required: boolean;
  options: ResultOptionDefinition[];
};

export type ResolvedRemarksDefinition = {
  policy: "none" | "optional";
  maxLength: number;
};

export type ResolvedChecklistItem = {
  key: string;
  label: string;
  sortOrder: number;
  result: ResultControlDefinition;
  remarks: ResolvedRemarksDefinition;
};

export type ResolvedMeasurementValue = {
  key: string;
  label: string;
  unit: string;
  required: boolean;
};

export type ResolvedMeasurementRow = {
  key: string;
  label: string;
  sortOrder: number;
  values: ResolvedMeasurementValue[];
  result: ResultControlDefinition;
  remarks: ResolvedRemarksDefinition;
};

export type ResolvedRepeatableResultColumn = {
  key: string;
  label: string;
  sortOrder: number;
  result: ResultControlDefinition;
};

export type ResolvedHoseReelControls = {
  schemaVersion: 1;
  source: {
    templateCode: "MFE-FSSR";
    templateVersion: 1;
    systemKey: "hose_reel";
  };
  checklist: {
    waterTank: ResolvedChecklistItem[];
    pumpHouse: ResolvedChecklistItem[];
  };
  measurements: ResolvedMeasurementRow[];
  repeatableRows: {
    resultColumns: ResolvedRepeatableResultColumn[];
    remarks: ResolvedRemarksDefinition;
  };
  comments: ResolvedRemarksDefinition;
};

const remarksMaxLength = 2000;
const commentsMaxLength = 4000;
const v1OptionLabels: Readonly<Record<string, string>> = {
  good: "Good",
  poor: "Poor"
};

const v1ChecklistLabels: Readonly<Record<string, string>> = {
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

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Hose Reel definition has invalid ${name}`);
  }
  return value;
}

function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Hose Reel definition has invalid ${name}`);
  }
  return value;
}

function records(value: unknown, name: string): UnknownRecord[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`Hose Reel definition has invalid ${name}`);
  }
  return value;
}

function named(recordsToSearch: UnknownRecord[], key: string, name: string): UnknownRecord {
  const match = recordsToSearch.find((value) => value.key === key);
  if (!match) {
    throw new Error(`Hose Reel definition is missing ${name}`);
  }
  return match;
}

function resolveResult(control: unknown, allowedValues: unknown): ResultControlDefinition {
  if (control !== "good_poor" || !Array.isArray(allowedValues) || allowedValues.length === 0) {
    throw new Error("Hose Reel definition has an invalid result control");
  }
  const values = allowedValues.map((value) => requiredString(value, "result option"));
  if (new Set(values).size !== values.length) {
    throw new Error("Hose Reel definition has duplicate result options");
  }
  return {
    type: "single_select",
    required: true,
    options: values.map((value) => {
      const label = v1OptionLabels[value];
      if (!label) {
        throw new Error(`MFE-FSSR V1 has unknown result option ${value}`);
      }
      return { value, label };
    })
  };
}

function optionalRemarks(maxLength = remarksMaxLength): ResolvedRemarksDefinition {
  return { policy: "optional", maxLength };
}

function resolveChecklistItem(item: UnknownRecord): ResolvedChecklistItem {
  const key = requiredString(item.key, "checklist key");
  return {
    key,
    label: v1ChecklistLabels[key] ?? requiredString(item.label, "checklist label"),
    sortOrder: requiredInteger(item.sortOrder, "checklist sort order"),
    result: resolveResult(item.control, item.allowedValues),
    remarks: optionalRemarks()
  };
}

function resolveMeasurementRow(item: UnknownRecord): ResolvedMeasurementRow {
  const result = item.result;
  if (!isRecord(result)) {
    throw new Error("Hose Reel definition has invalid measurement result metadata");
  }
  return {
    key: requiredString(item.key, "measurement key"),
    label: requiredString(item.label, "measurement label"),
    sortOrder: requiredInteger(item.sortOrder, "measurement sort order"),
    values: records(item.measurements, "measurement values").map((measurement) => ({
      key: requiredString(measurement.key, "measurement value key"),
      label: requiredString(measurement.label, "measurement value label"),
      unit: requiredString(measurement.unit, "measurement unit"),
      required: true
    })),
    result: resolveResult(result.control, result.allowedValues),
    remarks: optionalRemarks()
  };
}

function sorted<T extends { sortOrder: number }>(values: T[]): T[] {
  return values.sort((left, right) => left.sortOrder - right.sortOrder);
}

export function resolveHoseReelControls(
  definition: unknown,
  templateCode = "MFE-FSSR",
  templateVersion = 1
): ResolvedHoseReelControls {
  if (templateCode !== "MFE-FSSR" || templateVersion !== 1 || !isRecord(definition) || definition.key !== "hose_reel") {
    throw new Error("Unsupported Hose Reel template definition");
  }

  const sections = records(definition.sections, "sections");
  const waterTank = named(sections, "water_tank", "Water Tank section");
  const pumpHouse = named(sections, "pump_house", "Pump House section");
  const hoseReelDrum = named(sections, "hose_reel_drum", "Hose Reel Drum section");
  const waterChecks = named(records(waterTank.blocks, "Water Tank blocks"), "water_tank_checks", "Water Tank checklist");
  const pumpChecks = named(records(pumpHouse.blocks, "Pump House blocks"), "pump_house_checks", "Pump House checklist");
  const measurements = named(records(pumpHouse.blocks, "Pump House blocks"), "pump_pressure_measurements", "Pump House measurements");
  const rowBlock = named(records(hoseReelDrum.blocks, "Hose Reel Drum blocks"), "hose_reel_rows", "Hose Reel rows");
  const commentsBlock = named(records(hoseReelDrum.blocks, "Hose Reel Drum blocks"), "comments", "Hose Reel comments");

  const resultColumns = records(rowBlock.columns, "Hose Reel row columns")
    .filter((column) => column.control === "good_poor")
    .map((column) => ({
      key: requiredString(column.key, "repeatable result key"),
      label: requiredString(column.label, "repeatable result label"),
      sortOrder: requiredInteger(column.sortOrder, "repeatable result sort order"),
      result: resolveResult(column.control, column.allowedValues)
    }));
  if (resultColumns.length === 0) {
    throw new Error("Hose Reel definition has no repeatable result columns");
  }

  const commentsField = commentsBlock.field;
  if (!isRecord(commentsField) || commentsField.control !== "remarks") {
    throw new Error("Hose Reel definition has invalid comments metadata");
  }

  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: 1, systemKey: "hose_reel" },
    checklist: {
      waterTank: sorted(records(waterChecks.items, "Water Tank items").map(resolveChecklistItem)),
      pumpHouse: sorted(records(pumpChecks.items, "Pump House items").map(resolveChecklistItem))
    },
    measurements: sorted(records(measurements.items, "measurement rows").map(resolveMeasurementRow)),
    repeatableRows: {
      resultColumns: sorted(resultColumns),
      remarks: optionalRemarks()
    },
    comments: optionalRemarks(commentsMaxLength)
  };
}
