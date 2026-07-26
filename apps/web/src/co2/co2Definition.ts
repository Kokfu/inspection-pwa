import type {
  ResolvedChecklistItem,
  ResolvedCo2Controls,
  ResolvedRemarksDefinition,
  ResolvedRepeatableResultColumn,
  ResultControlDefinition
} from "../inspectionControls/definitionTypes";

type UnknownRecord = Record<string, unknown>;
const optionLabels: Readonly<Record<string, string>> = {
  good: "Good",
  poor: "Poor",
  normal: "Normal",
  test: "Test",
  isolation: "Isolation"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`CO2 definition has invalid ${name}`);
  return value;
}

function integer(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`CO2 definition has invalid ${name}`);
  return value;
}

function list(value: unknown, name: string): UnknownRecord[] {
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`CO2 definition has invalid ${name}`);
  return value;
}

function named(values: UnknownRecord[], key: string, name: string) {
  const match = values.find((value) => value.key === key);
  if (!match) throw new Error(`CO2 definition is missing ${name}`);
  return match;
}

function resultControl(control: unknown, allowedValues: unknown): ResultControlDefinition {
  if ((control !== "good_poor" && control !== "normal_test_isolation") || !Array.isArray(allowedValues)) {
    throw new Error("CO2 definition has invalid result metadata");
  }
  const values = allowedValues.map((value) => text(value, "result option"));
  if (values.length === 0 || new Set(values).size !== values.length) throw new Error("CO2 result options are invalid");
  return {
    type: "single_select",
    required: control === "good_poor",
    options: values.map((value) => {
      const label = optionLabels[value];
      if (!label) throw new Error(`MFE-FSSR V1 has unknown result option ${value}`);
      return { value, label };
    })
  };
}

const remarks = (maxLength = 2000): ResolvedRemarksDefinition => ({ policy: "optional", maxLength });

function checklistItem(item: UnknownRecord): ResolvedChecklistItem {
  return {
    key: text(item.key, "checklist key"),
    label: text(item.label, "checklist label"),
    sortOrder: integer(item.sortOrder, "checklist sort order"),
    result: { ...resultControl(item.control, item.allowedValues), required: true },
    remarks: remarks()
  };
}

function detectorColumn(column: UnknownRecord): ResolvedRepeatableResultColumn {
  return {
    key: text(column.key, "detector key"),
    label: text(column.label, "detector label"),
    sortOrder: integer(column.sortOrder, "detector sort order"),
    result: resultControl(column.control, column.allowedValues)
  };
}

function sorted<T extends { sortOrder: number }>(items: T[]) {
  return items.sort((left, right) => left.sortOrder - right.sortOrder);
}

export function resolvePublishedCo2Controls(
  definition: unknown,
  templateCode = "MFE-FSSR",
  templateVersion = 1
): ResolvedCo2Controls {
  if (templateCode !== "MFE-FSSR" || templateVersion !== 1 || !isRecord(definition) || definition.key !== "co2_fire_extinguisher") {
    throw new Error("Unsupported CO2 template definition");
  }
  const sections = list(definition.sections, "sections");
  const controlPanel = named(sections, "control_panel", "Control Panel section");
  const charger = named(sections, "charger_batteries", "Charger & Batteries section");
  const physical = named(sections, "physical_outlook", "Physical Outlook section");
  const functions = named(sections, "main_function_key", "Main Function Key section");
  const panelBlocks = list(controlPanel.blocks, "Control Panel blocks");
  const panelLocation = named(panelBlocks, "control_panel_location", "Control Panel Location");
  const panelField = named(list(panelLocation.items, "Control Panel Location items"), "control_panel_location", "Control Panel Location field");
  const detectorRows = named(panelBlocks, "detector_rows", "Detector Rows");
  const detectorColumns = list(detectorRows.columns, "Detector columns");
  const alarmZone = named(detectorColumns, "alarm_zone", "Alarm Zone");
  const location = named(detectorColumns, "location", "Location");
  const heatDetector = named(detectorColumns, "heat_detector", "Heat Detector");
  const smokeDetector = named(detectorColumns, "smoke_detector", "Smoke Detector");
  const chargerChecks = named(list(charger.blocks, "Charger blocks"), "charger_battery_checks", "Charger checks");
  const physicalChecks = named(list(physical.blocks, "Physical blocks"), "physical_outlook_checks", "Physical checks");
  const functionBlocks = list(functions.blocks, "Function blocks");
  const functionChecks = named(functionBlocks, "function_checks", "Function checks");
  const comments = named(functionBlocks, "comments", "Comments");
  if (!isRecord(comments.field) || comments.field.control !== "remarks") throw new Error("CO2 comments metadata is invalid");

  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: 1, systemKey: "co2_fire_extinguisher" },
    repetitionMode: "per_location",
    controlPanelLocation: {
      key: "control_panel_location",
      label: text(panelField.label, "Control Panel Location label"),
      required: true,
      maxLength: 300
    },
    detectorRows: {
      minimum: 1,
      maximum: 250,
      alarmZone: { key: "alarm_zone", label: text(alarmZone.label, "Alarm Zone label"), required: true, maxLength: 200 },
      location: { key: "location", label: text(location.label, "Location label"), required: true, maxLength: 300 },
      heatDetector: detectorColumn(heatDetector),
      smokeDetector: detectorColumn(smokeDetector),
      remarks: remarks()
    },
    chargerAndBatteries: sorted(list(chargerChecks.items, "Charger items").map(checklistItem)),
    physicalOutlook: sorted(list(physicalChecks.items, "Physical items").map(checklistItem)),
    mainFunctionKeys: sorted(list(functionChecks.items, "Function items").map(checklistItem)),
    comments: remarks(4000)
  };
}

export function controlsForCo2Snapshot(snapshot: {
  template: { code: string; version: number };
  system: { definition: unknown; resolvedControls: ResolvedCo2Controls };
}) {
  const controls = snapshot.system.resolvedControls;
  if (controls?.schemaVersion !== 1 || controls.source?.systemKey !== "co2_fire_extinguisher" || controls.repetitionMode !== "per_location") {
    throw new Error("Frozen CO2 controls are invalid");
  }
  return controls;
}
