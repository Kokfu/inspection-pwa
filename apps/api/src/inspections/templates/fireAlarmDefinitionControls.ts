import { fireAlarmDetectorV3 } from "./masterServiceReportV3.js";
import type {
  DeviceState,
  FireAlarmDefinition,
  FireAlarmRowPreset,
  GoodPoor,
  ResolvedFireAlarmChecklistItem,
  ResolvedFireAlarmControls,
  ResolvedFireAlarmResult
} from "./fireAlarmTypes.js";
import { isCompatibleSystemContract } from "./systemContractCompatibility.js";

type UnknownRecord = Record<string, unknown>;
type ExpectedField = {
  key: string;
  label: string;
  control: "text" | "remarks" | "good_poor" | "normal_test_isolation";
  required: boolean;
  sortOrder: number;
  allowedValues?: readonly string[];
};

const primaryFields: readonly ExpectedField[] = [
  { key: "asset_reference", label: "No.", control: "text", required: false, sortOrder: 1 },
  { key: "alarm_zone", label: "Alarm Zone", control: "text", required: true, sortOrder: 2 },
  { key: "location", label: "Location", control: "text", required: true, sortOrder: 3 },
  { key: "manual_call_point", label: "Manual Call Point", control: "normal_test_isolation", required: true, sortOrder: 4, allowedValues: ["normal", "test", "isolation"] },
  { key: "flow_switch", label: "Flow Switch", control: "normal_test_isolation", required: true, sortOrder: 5, allowedValues: ["normal", "test", "isolation"] },
  { key: "heat_detector", label: "Heat Detector", control: "normal_test_isolation", required: true, sortOrder: 6, allowedValues: ["normal", "test", "isolation"] },
  { key: "smoke_detector", label: "Smoke Detector", control: "normal_test_isolation", required: true, sortOrder: 7, allowedValues: ["normal", "test", "isolation"] },
  { key: "remarks", label: "Remarks", control: "remarks", required: false, sortOrder: 8 }
];
const chargerFields: readonly ExpectedField[] = [
  { key: "main_supply", label: "Main Supply", control: "good_poor", required: true, sortOrder: 1, allowedValues: ["good", "poor"] },
  { key: "battery", label: "Battery", control: "good_poor", required: true, sortOrder: 2, allowedValues: ["good", "poor"] },
  { key: "charger", label: "Charger", control: "good_poor", required: true, sortOrder: 3, allowedValues: ["good", "poor"] }
];
const functionFields: readonly ExpectedField[] = [
  { key: "main_alarm_reset", label: "Main Alarm Reset", control: "good_poor", required: true, sortOrder: 1, allowedValues: ["good", "poor"] },
  { key: "lamp_test", label: "Lamp Test", control: "good_poor", required: true, sortOrder: 2, allowedValues: ["good", "poor"] },
  { key: "evacuate", label: "Evacuate", control: "good_poor", required: true, sortOrder: 3, allowedValues: ["good", "poor"] },
  { key: "ac_supply", label: "A/C Supply", control: "good_poor", required: true, sortOrder: 4, allowedValues: ["good", "poor"] },
  { key: "dc_supply", label: "D/C Supply", control: "good_poor", required: true, sortOrder: 5, allowedValues: ["good", "poor"] },
  { key: "spka_system", label: "SPKA System", control: "good_poor", required: true, sortOrder: 6, allowedValues: ["good", "poor"] },
  { key: "alarm_lift_trip", label: "Alarm Lift Trip", control: "good_poor", required: true, sortOrder: 7, allowedValues: ["good", "poor"] },
  { key: "signal_gas_discharge", label: "Signal Gas Discharge", control: "good_poor", required: true, sortOrder: 8, allowedValues: ["good", "poor"] }
];
const secondaryFields: readonly ExpectedField[] = [
  { key: "asset_reference", label: "No.", control: "text", required: false, sortOrder: 1 },
  { key: "location", label: "Location", control: "text", required: true, sortOrder: 2 },
  { key: "alarm_bell", label: "Alarm Bell", control: "good_poor", required: true, sortOrder: 3, allowedValues: ["good", "poor"] },
  { key: "manual_call_point", label: "Manual Call Point", control: "good_poor", required: true, sortOrder: 4, allowedValues: ["good", "poor"] },
  { key: "remarks", label: "Remarks", control: "remarks", required: false, sortOrder: 5 }
];

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: UnknownRecord, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);

function exactArray(value: unknown, expected: readonly string[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

function field(value: unknown, expected: ExpectedField) {
  if (!isRecord(value)) return false;
  const resultField = expected.allowedValues !== undefined;
  const keys = resultField
    ? ["key", "label", "control", "required", "sortOrder", "allowedValues", "remarksPolicy"]
    : ["key", "label", "control", "required", "sortOrder"];
  return exactKeys(value, keys)
    && value.key === expected.key
    && value.label === expected.label
    && value.control === expected.control
    && value.required === expected.required
    && value.sortOrder === expected.sortOrder
    && (!resultField
      || exactArray(value.allowedValues, expected.allowedValues ?? [])
        && value.remarksPolicy === "optional");
}

function exactFields(value: unknown, expected: readonly ExpectedField[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => field(item, expected[index]));
}

function section(value: unknown, key: string, title: string, sortOrder: number, blocks: readonly UnknownRecord[]) {
  return isRecord(value)
    && exactKeys(value, ["key", "title", "sortOrder", "blocks"])
    && value.key === key
    && value.title === title
    && value.sortOrder === sortOrder
    && Array.isArray(value.blocks)
    && value.blocks.length === blocks.length
    && value.blocks.every((block, index) => block === blocks[index]);
}

function checklistBlock(value: unknown, key: string, title: string, sortOrder: number, fields: readonly ExpectedField[]) {
  return isRecord(value)
    && exactKeys(value, ["key", "title", "type", "sortOrder", "items"])
    && value.key === key
    && value.title === title
    && value.type === "checklist"
    && value.sortOrder === sortOrder
    && exactFields(value.items, fields);
}

function repeatableBlock(
  value: unknown,
  key: string,
  title: string,
  sortOrder: number,
  supportsZones: boolean,
  fields: readonly ExpectedField[]
) {
  return isRecord(value)
    && exactKeys(value, ["key", "title", "type", "sortOrder", "supportsZones", "supportsLocations", "columns"])
    && value.key === key
    && value.title === title
    && value.type === "repeatable_table"
    && value.sortOrder === sortOrder
    && value.supportsZones === supportsZones
    && value.supportsLocations === true
    && exactFields(value.columns, fields);
}

function commentsBlock(value: unknown) {
  return isRecord(value)
    && exactKeys(value, ["key", "title", "type", "sortOrder", "field"])
    && value.key === "comments"
    && value.title === "Comments"
    && value.type === "comments"
    && value.sortOrder === 2
    && field(value.field, { key: "comments", label: "Comments", control: "remarks", required: false, sortOrder: 1 });
}

export function parseFireAlarmSystemDefinition(value: unknown): FireAlarmDefinition | undefined {
  if (!isRecord(value)
    || !exactKeys(value, ["key", "displayName", "sortOrder", "definitionStatus", "configuration", "sections"])
    || value.key !== "fire_alarm_detector"
    || value.displayName !== "Fire Alarm / Detector System"
    || value.sortOrder !== 5
    || value.definitionStatus !== "confirmed"
    || !isRecord(value.configuration)
    || !exactKeys(value.configuration, ["supportsZones", "supportsLocations", "supportsPresetRows"])
    || value.configuration.supportsZones !== true
    || value.configuration.supportsLocations !== true
    || value.configuration.supportsPresetRows !== true
    || !Array.isArray(value.sections)
    || value.sections.length !== 4) return undefined;

  const [panel, charger, functions, devices] = value.sections;
  if (!isRecord(panel) || !Array.isArray(panel.blocks) || panel.blocks.length !== 2
    || !checklistBlock(panel.blocks[0], "control_panel_location", "Control Panel Location", 1, [
      { key: "control_panel_location", label: "Control Panel Location", control: "text", required: true, sortOrder: 1 }
    ])
    || !repeatableBlock(panel.blocks[1], "device_rows", "Zone and Device Rows", 2, true, primaryFields)
    || !section(panel, "fire_alarm_control_panel", "Fire Alarm Control Panel", 1, panel.blocks)
    || !isRecord(charger) || !Array.isArray(charger.blocks) || charger.blocks.length !== 1
    || !checklistBlock(charger.blocks[0], "charger_battery_checks", "Charger & Battery Checks", 1, chargerFields)
    || !section(charger, "charger_batteries", "Charger & Batteries", 2, charger.blocks)
    || !isRecord(functions) || !Array.isArray(functions.blocks) || functions.blocks.length !== 1
    || !checklistBlock(functions.blocks[0], "function_checks", "Function Checks", 1, functionFields)
    || !section(functions, "main_function_key", "Main Function Key", 3, functions.blocks)
    || !isRecord(devices) || !Array.isArray(devices.blocks) || devices.blocks.length !== 2
    || !repeatableBlock(devices.blocks[0], "alarm_device_rows", "Alarm Bell and Manual Call Point Rows", 1, false, secondaryFields)
    || !commentsBlock(devices.blocks[1])
    || !section(devices, "alarm_devices", "Alarm Devices", 4, devices.blocks)) return undefined;

  return {
    key: fireAlarmDetectorV3.key,
    displayName: fireAlarmDetectorV3.displayName,
    sortOrder: fireAlarmDetectorV3.sortOrder,
    definitionStatus: fireAlarmDetectorV3.definitionStatus,
    configuration: { ...fireAlarmDetectorV3.configuration },
    sections: fireAlarmDetectorV3.sections.map((item) => ({
      ...item,
      blocks: item.blocks.map((block) => ({ ...block }))
    }))
  };
}

export function parseFireAlarmRowPreset(value: unknown): FireAlarmRowPreset | undefined {
  if (!isRecord(value)
    || !(exactKeys(value, ["fireAlarmTable"]) || exactKeys(value, ["fireAlarmTable", "assetReference"]))
    || (value.fireAlarmTable !== "primary" && value.fireAlarmTable !== "secondary")
    || ("assetReference" in value
      && (typeof value.assetReference !== "string" || value.assetReference.length > 250))) return undefined;
  if ("assetReference" in value) {
    const assetReference = value.assetReference;
    if (typeof assetReference !== "string") return undefined;
    return { fireAlarmTable: value.fireAlarmTable, assetReference };
  }
  return { fireAlarmTable: value.fireAlarmTable };
}

const deviceStateResult = (): ResolvedFireAlarmResult<DeviceState> => ({
  type: "single_select",
  required: true,
  options: [
    { value: "normal", label: "Normal" },
    { value: "test", label: "Test" },
    { value: "isolation", label: "Isolation" }
  ]
});
const goodPoorResult = (): ResolvedFireAlarmResult<GoodPoor> => ({
  type: "single_select",
  required: true,
  options: [{ value: "good", label: "Good" }, { value: "poor", label: "Poor" }]
});
function checklist<K extends string>(key: K, label: string, sortOrder: number): ResolvedFireAlarmChecklistItem<K> {
  return { key, label, sortOrder, result: goodPoorResult(), remarks: { policy: "optional", maxLength: 2000 } };
}

export function resolveFireAlarmControls(
  definition: unknown,
  templateCode = "MFE-FSSR",
  templateVersion = 3
): ResolvedFireAlarmControls {
  if (templateCode !== "MFE-FSSR" || !Number.isSafeInteger(templateVersion) || templateVersion < 1
    || !isCompatibleSystemContract("fire_alarm_detector", "confirmed", definition)
    || !parseFireAlarmSystemDefinition(definition)) {
    throw new Error("Unsupported or malformed Fire Alarm MFE-FSSR V3 definition");
  }
  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: 3, systemKey: "fire_alarm_detector" },
    repetitionMode: "single_with_two_repeatable_tables",
    instance: { key: "primary", displaySequence: 1, zoneId: null, locationId: null },
    controlPanelLocation: { key: "control_panel_location", label: "Control Panel Location", required: true, maxLength: 300 },
    primaryDeviceRows: {
      minimum: 1,
      maximum: 250,
      assetReference: { key: "asset_reference", label: "No.", required: false, maxLength: 250 },
      alarmZone: { key: "alarm_zone", label: "Alarm Zone", required: true, maxLength: 200 },
      location: { key: "location", label: "Location", required: true, maxLength: 300 },
      manualCallPoint: deviceStateResult(),
      flowSwitch: deviceStateResult(),
      heatDetector: deviceStateResult(),
      smokeDetector: deviceStateResult(),
      remarks: { policy: "optional", maxLength: 2000 }
    },
    chargerAndBatteries: [
      checklist("main_supply", "Main Supply", 1),
      checklist("battery", "Battery", 2),
      checklist("charger", "Charger", 3)
    ],
    mainFunctionKeys: [
      checklist("main_alarm_reset", "Main Alarm Reset", 1),
      checklist("lamp_test", "Lamp Test", 2),
      checklist("evacuate", "Evacuate", 3),
      checklist("ac_supply", "A/C Supply", 4),
      checklist("dc_supply", "D/C Supply", 5),
      checklist("spka_system", "SPKA System", 6),
      checklist("alarm_lift_trip", "Alarm Lift Trip", 7),
      checklist("signal_gas_discharge", "Signal Gas Discharge", 8)
    ],
    secondaryAlarmDeviceRows: {
      minimum: 0,
      maximum: 250,
      assetReference: { key: "asset_reference", label: "No.", required: false, maxLength: 250 },
      location: { key: "location", label: "Location", required: true, maxLength: 300 },
      alarmBell: goodPoorResult(),
      manualCallPoint: goodPoorResult(),
      remarks: { policy: "optional", maxLength: 2000 }
    },
    comments: { policy: "optional", maxLength: 4000 }
  };
}

/** V6 is deliberately separate from the historical parser.  A malformed V6
 * definition never falls back to the V3 Good/Poor contract. */
export function resolveFireAlarmV6Controls(definition: unknown, templateVersion: 6 | 7 = 6) {
  if (!isCompatibleSystemContract("fire_alarm_detector", "confirmed", definition, {
    id: templateVersion === 7 ? "00000000-0000-4000-8000-000000000807" : "00000000-0000-4000-8000-000000000806", version: templateVersion
  })) throw new Error("Unsupported or malformed Fire Alarm evidence definition");
  const legacyShape = structuredClone(definition) as UnknownRecord;
  const sections = legacyShape.sections;
  if (!Array.isArray(sections)) throw new Error("Malformed Fire Alarm MFE-FSSR V6 definition");
  for (const section of sections) {
    if (!isRecord(section) || !Array.isArray(section.blocks)) throw new Error("Malformed Fire Alarm MFE-FSSR V6 definition");
    for (const block of section.blocks) {
      if (!isRecord(block)) throw new Error("Malformed Fire Alarm MFE-FSSR V6 definition");
      const fields = Array.isArray(block.items) ? block.items : Array.isArray(block.columns) ? block.columns : [];
      for (const field of fields) {
        if (isRecord(field) && field.control === "good_poor") field.allowedValues = ["good", "poor"];
      }
    }
  }
  // Retain the proven structural parser after asserting the frozen V6 identity.
  const v3 = resolveFireAlarmControls(legacyShape, "MFE-FSSR", 3);
  const withV6Result = () => ({ type: "single_select" as const, required: true as const,
    options: [{ value: "good" as const, label: "Good" }, { value: "poor" as const, label: "Poor" }, { value: "not_relevant" as const, label: "Not Relevant" }] });
  return {
    ...v3,
    source: { templateCode: "MFE-FSSR" as const, templateVersion, systemKey: "fire_alarm_detector" as const },
    chargerAndBatteries: v3.chargerAndBatteries.map((item) => ({ ...item, result: withV6Result() })),
    mainFunctionKeys: v3.mainFunctionKeys.map((item) => ({ ...item, result: withV6Result() })),
    secondaryAlarmDeviceRows: { ...v3.secondaryAlarmDeviceRows, alarmBell: withV6Result(), manualCallPoint: withV6Result() }
  };
}
