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
  not_relevant: "Not Relevant",
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
  if ((control !== "good_poor" && control !== "normal_test_isolation" && control !== "normal_test_isolation_multi") || !Array.isArray(allowedValues)) {
    throw new Error("CO2 definition has invalid result metadata");
  }
  const values = allowedValues.map((value) => text(value, "result option"));
  if (values.length === 0 || new Set(values).size !== values.length) throw new Error("CO2 result options are invalid");
  return {
    type: control === "normal_test_isolation_multi" ? "multi_select" : "single_select",
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

const exact = (value: UnknownRecord, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function frozenRemarks(value: unknown, maximum: number) { return isRecord(value) && exact(value, ["policy", "maxLength"]) && value.policy === "optional" && value.maxLength === maximum; }
function frozenResult(value: unknown, values: readonly string[], required: boolean, type: "single_select" | "multi_select" = "single_select") {
  return isRecord(value) && exact(value, ["type", "required", "options"]) && value.type === type && value.required === required
    && Array.isArray(value.options) && value.options.length === values.length
    && value.options.every((option, index) => isRecord(option) && exact(option, ["value", "label"])
      && option.value === values[index] && option.label === optionLabels[values[index]]);
}
function frozenChecklist(value: unknown, definitions: readonly (readonly [string, string])[], values: readonly string[]) {
  return Array.isArray(value) && value.length === definitions.length && value.every((item, index) => isRecord(item)
    && exact(item, ["key", "label", "sortOrder", "result", "remarks"]) && item.key === definitions[index]?.[0]
    && item.label === definitions[index]?.[1] && item.sortOrder === index + 1
    && frozenResult(item.result, values, true) && frozenRemarks(item.remarks, 2000));
}

export function parseFrozenCo2Controls(value: unknown): ResolvedCo2Controls | undefined {
  const physical = [["co2_cylinder", "CO2 Cylinder"], ["electric_actuator", "Electric Actuator"], ["manual_release_key", "Manual Release Key"], ["alarm_bell", "Alarm Bell"], ["twin_flashing_light", "Twin Flashing Light"], ["24v_dc_tripping_device", "24V DC Tripping Device"], ["manual_pull_station", "Manual Pull Station"], ["high_pressure_hose", "High Pressure Hose"], ["discharge_nozzles", "Discharge Nozzles"], ["pilot_cylinder", "Pilot Cylinder"]] as const;
  const functions = [["main_alarm_reset", "Main Alarm Reset"], ["lamp_test", "Lamp Test"], ["evacuate", "Evacuate"], ["ac_supply", "A/C Supply"], ["dc_supply", "D/C Supply"], ["signal_alarm_to_mfap", "Signal Alarm to MFAP"]] as const;
  const isV7 = isRecord(value) && isRecord(value.source) && value.source.templateVersion === 7;
  const checklistValues = isV7 ? ["good", "poor", "not_relevant"] : ["good", "poor"];
  if (!isRecord(value) || !exact(value, ["schemaVersion", "source", "repetitionMode", "controlPanelLocation", "detectorRows", "chargerAndBatteries", "physicalOutlook", "mainFunctionKeys", "comments"])
    || value.schemaVersion !== 1 || !isRecord(value.source) || !exact(value.source, ["templateCode", "templateVersion", "systemKey"])
    || value.source.templateCode !== "MFE-FSSR" || !(value.source.templateVersion === 1 || value.source.templateVersion === 7) || value.source.systemKey !== "co2_fire_extinguisher"
    || value.repetitionMode !== "per_location" || !isRecord(value.controlPanelLocation)
    || !exact(value.controlPanelLocation, ["key", "label", "required", "maxLength"]) || value.controlPanelLocation.key !== "control_panel_location"
    || value.controlPanelLocation.label !== "Control Panel Location" || value.controlPanelLocation.required !== true || value.controlPanelLocation.maxLength !== 300
    || !isRecord(value.detectorRows) || !exact(value.detectorRows, ["minimum", "maximum", "alarmZone", "location", "heatDetector", "smokeDetector", "remarks"])
    || value.detectorRows.minimum !== 1 || value.detectorRows.maximum !== 250 || !isRecord(value.detectorRows.alarmZone) || !isRecord(value.detectorRows.location)
    || !exact(value.detectorRows.alarmZone, ["key", "label", "required", "maxLength"]) || value.detectorRows.alarmZone.key !== "alarm_zone" || value.detectorRows.alarmZone.label !== "Alarm Zone" || value.detectorRows.alarmZone.required !== true || value.detectorRows.alarmZone.maxLength !== 200
    || !exact(value.detectorRows.location, ["key", "label", "required", "maxLength"]) || value.detectorRows.location.key !== "location" || value.detectorRows.location.label !== "Location" || value.detectorRows.location.required !== true || value.detectorRows.location.maxLength !== 300
    || !isRecord(value.detectorRows.heatDetector) || !exact(value.detectorRows.heatDetector, ["key", "label", "sortOrder", "result"]) || value.detectorRows.heatDetector.key !== "heat_detector" || value.detectorRows.heatDetector.label !== "Heat Detector" || value.detectorRows.heatDetector.sortOrder !== 3 || !frozenResult(value.detectorRows.heatDetector.result, ["normal", "test", "isolation"], false, isV7 ? "multi_select" : "single_select")
    || !isRecord(value.detectorRows.smokeDetector) || !exact(value.detectorRows.smokeDetector, ["key", "label", "sortOrder", "result"]) || value.detectorRows.smokeDetector.key !== "smoke_detector" || value.detectorRows.smokeDetector.label !== "Smoke Detector" || value.detectorRows.smokeDetector.sortOrder !== 4 || !frozenResult(value.detectorRows.smokeDetector.result, ["normal", "test", "isolation"], false, isV7 ? "multi_select" : "single_select")
    || !frozenRemarks(value.detectorRows.remarks, 2000) || !frozenChecklist(value.chargerAndBatteries, [["main_supply", "Main Supply"], ["battery", "Battery"], ["charger", "Charger"]], checklistValues)
    || !frozenChecklist(value.physicalOutlook, physical, checklistValues) || !frozenChecklist(value.mainFunctionKeys, functions, checklistValues) || !frozenRemarks(value.comments, 4000)) return undefined;
  return value as unknown as ResolvedCo2Controls;
}

export function resolvePublishedCo2Controls(
  definition: unknown,
  templateCode = "MFE-FSSR",
  templateVersion = 1
): ResolvedCo2Controls {
  const wetChemical = isRecord(definition) && definition.key === "wet_chemical";
  if (templateCode !== "MFE-FSSR" || !isRecord(definition)
    || !Number.isSafeInteger(templateVersion) || templateVersion < 1
    || (!wetChemical && definition.key !== "co2_fire_extinguisher")) {
    throw new Error("Unsupported suppression-system template definition");
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
  const smokeDetector = named(detectorColumns, wetChemical ? "unconfirmed_second_heat_detector" : "smoke_detector", wetChemical ? "Second Heat Detector" : "Smoke Detector");
  const chargerChecks = named(list(charger.blocks, "Charger blocks"), "charger_battery_checks", "Charger checks");
  const physicalChecks = named(list(physical.blocks, "Physical blocks"), "physical_outlook_checks", "Physical checks");
  const functionBlocks = list(functions.blocks, "Function blocks");
  const functionChecks = named(functionBlocks, "function_checks", "Function checks");
  const comments = named(functionBlocks, "comments", "Comments");
  if (!isRecord(comments.field) || comments.field.control !== "remarks") throw new Error("CO2 comments metadata is invalid");

  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: templateVersion === 7 ? 7 : wetChemical ? 4 : 1, systemKey: wetChemical ? "wet_chemical" : "co2_fire_extinguisher" },
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
  if (controls?.schemaVersion !== 1 || (controls.source?.systemKey !== "co2_fire_extinguisher" && controls.source?.systemKey !== "wet_chemical") || controls.repetitionMode !== "per_location") {
    throw new Error("Frozen suppression-system controls are invalid");
  }
  return controls;
}
