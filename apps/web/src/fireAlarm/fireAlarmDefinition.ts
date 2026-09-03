import type {
  DeviceState,
  FireAlarmDefinitionField,
  FireAlarmRowPreset,
  FireAlarmSystemDefinition,
  GoodPoor,
  ResolvedFireAlarmChecklistItem,
  ResolvedFireAlarmControls,
  ResolvedFireAlarmResult
} from "./fireAlarmTypes";

type UnknownRecord = Record<string, unknown>;
const goodPoor = ["good", "poor"] as const;
const goodPoorV6 = ["good", "poor", "not_relevant"] as const;
const deviceStates = ["normal", "test", "isolation"] as const;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (key: string, label: string, required: boolean, sortOrder: number, control: "text" | "remarks" = "text"): FireAlarmDefinitionField =>
  ({ key, label, control, required, sortOrder });
const result = (
  key: string,
  label: string,
  control: "good_poor" | "normal_test_isolation" | "normal_test_isolation_multi",
  sortOrder: number,
  version: 3 | 6 | 7 = 3
): FireAlarmDefinitionField => ({
  key,
  label,
  control,
  required: true,
  sortOrder,
  allowedValues: control === "good_poor" ? (version === 6 || version === 7 ? goodPoorV6 : goodPoor) : deviceStates,
  remarksPolicy: "optional"
});
const checklist = (entries: readonly (readonly [string, string])[], version: 3 | 6 | 7) =>
  entries.map(([key, label], index) => result(key, label, "good_poor", index + 1, version));

function canonicalDefinition(version: 3 | 6 | 7 = 3): FireAlarmSystemDefinition {
  return {
    key: "fire_alarm_detector",
    displayName: "Fire Alarm / Detector System",
    sortOrder: 5,
    definitionStatus: "confirmed",
    configuration: { supportsZones: true, supportsLocations: true, supportsPresetRows: true },
    sections: [
      {
        key: "fire_alarm_control_panel", title: "Fire Alarm Control Panel", sortOrder: 1,
        blocks: [
          { key: "control_panel_location", title: "Control Panel Location", type: "checklist", sortOrder: 1, items: [text("control_panel_location", "Control Panel Location", true, 1)] },
          { key: "device_rows", title: "Zone and Device Rows", type: "repeatable_table", sortOrder: 2, supportsZones: true, supportsLocations: true, columns: [
            text("asset_reference", "No.", false, 1), text("alarm_zone", "Alarm Zone", true, 2), text("location", "Location", true, 3),
            result("manual_call_point", "Manual Call Point", version === 7 ? "normal_test_isolation_multi" : "normal_test_isolation", 4, version), result("flow_switch", "Flow Switch", version === 7 ? "normal_test_isolation_multi" : "normal_test_isolation", 5, version),
            result("heat_detector", "Heat Detector", version === 7 ? "normal_test_isolation_multi" : "normal_test_isolation", 6, version), result("smoke_detector", "Smoke Detector", version === 7 ? "normal_test_isolation_multi" : "normal_test_isolation", 7, version),
            text("remarks", "Remarks", false, 8, "remarks")
          ] }
        ]
      },
      {
        key: "charger_batteries", title: "Charger & Batteries", sortOrder: 2,
        blocks: [{ key: "charger_battery_checks", title: "Charger & Battery Checks", type: "checklist", sortOrder: 1, items: checklist([
          ["main_supply", "Main Supply"], ["battery", "Battery"], ["charger", "Charger"]
        ], version) }]
      },
      {
        key: "main_function_key", title: "Main Function Key", sortOrder: 3,
        blocks: [{ key: "function_checks", title: "Function Checks", type: "checklist", sortOrder: 1, items: checklist([
          ["main_alarm_reset", "Main Alarm Reset"], ["lamp_test", "Lamp Test"], ["evacuate", "Evacuate"],
          ["ac_supply", "A/C Supply"], ["dc_supply", "D/C Supply"], ["spka_system", "SPKA System"],
          ["alarm_lift_trip", "Alarm Lift Trip"], ["signal_gas_discharge", "Signal Gas Discharge"]
        ], version) }]
      },
      {
        key: "alarm_devices", title: "Alarm Devices", sortOrder: 4,
        blocks: [
          { key: "alarm_device_rows", title: "Alarm Bell and Manual Call Point Rows", type: "repeatable_table", sortOrder: 1, supportsZones: false, supportsLocations: true, columns: [
            text("asset_reference", "No.", false, 1), text("location", "Location", true, 2),
            result("alarm_bell", "Alarm Bell", "good_poor", 3, version), result("manual_call_point", "Manual Call Point", "good_poor", 4, version),
            text("remarks", "Remarks", false, 5, "remarks")
          ] },
          { key: "comments", title: "Comments", type: "comments", sortOrder: 2, field: text("comments", "Comments", false, 1, "remarks") }
        ]
      }
    ]
  };
}

export function getPublishedFireAlarmDefinition(): FireAlarmSystemDefinition {
  return canonicalDefinition();
}

export function resolveFireAlarmVisibleLabels(definition: unknown, version: 3 | 6 | 7 = 3) {
  const parsed = parseFireAlarmSystemDefinition(definition, version);
  if (!parsed) throw new Error(`Unsupported or malformed Fire Alarm MFE-FSSR V${version} definition`);
  const blocks = parsed.sections.flatMap((section) => section.blocks);
  const primary = blocks.find((block) => block.key === "device_rows");
  const secondary = blocks.find((block) => block.key === "alarm_device_rows");
  const comments = blocks.find((block) => block.key === "comments");
  const assetReference = primary?.columns?.find((column) => column.key === "asset_reference");
  if (!primary || !secondary || !comments || !assetReference) throw new Error("Fire Alarm visible labels are unavailable");
  return { primaryRows: primary.title, assetReference: assetReference.label, secondaryRows: secondary.title, comments: comments.title };
}

function exactValue(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(value)
      && value.length === expected.length
      && expected.every((item, index) => exactValue(value[index], item));
  }
  if (isRecord(expected)) {
    if (!isRecord(value)) return false;
    const actual = value;
    const expectedRecord = expected;
    const keys = Object.keys(expectedRecord);
    return Object.keys(actual).length === keys.length
      && keys.every((key) => key in actual && exactValue(actual[key], expectedRecord[key]));
  }
  return value === expected;
}

export function parseFireAlarmSystemDefinition(value: unknown, version: 3 | 6 | 7 = 3): FireAlarmSystemDefinition | undefined {
  const canonical = canonicalDefinition(version);
  if (!exactValue(value, canonical)) return undefined;
  return canonicalDefinition(version);
}

export function parseFireAlarmRowPreset(value: unknown): FireAlarmRowPreset | undefined {
  if (!isRecord(value)) return undefined;
  const item = value;
  const keys = Object.keys(item);
  if (!(keys.length === 1 && keys[0] === "fireAlarmTable"
    || keys.length === 2 && keys.includes("fireAlarmTable") && keys.includes("assetReference"))
    || (item.fireAlarmTable !== "primary" && item.fireAlarmTable !== "secondary")) return undefined;
  if ("assetReference" in item) {
    const assetReference = item.assetReference;
    if (typeof assetReference !== "string" || assetReference.length > 250) return undefined;
    return { fireAlarmTable: item.fireAlarmTable, assetReference };
  }
  return { fireAlarmTable: item.fireAlarmTable };
}

const deviceResult = (multi = false): ResolvedFireAlarmResult<DeviceState> => ({
  type: multi ? "multi_select" : "single_select", required: true,
  options: [{ value: "normal", label: "Normal" }, { value: "test", label: "Test" }, { value: "isolation", label: "Isolation" }]
});
const goodPoorResult = (version: 3 | 6 | 7): ResolvedFireAlarmResult<GoodPoor> => ({
  type: "single_select", required: true,
  options: version === 6 || version === 7
    ? [{ value: "good", label: "Good" }, { value: "poor", label: "Poor" }, { value: "not_relevant", label: "Not Relevant" }]
    : [{ value: "good", label: "Good" }, { value: "poor", label: "Poor" }]
});
function resolvedChecklist<K extends string>(key: K, label: string, sortOrder: number, version: 3 | 6 | 7): ResolvedFireAlarmChecklistItem<K> {
  return { key, label, sortOrder, result: goodPoorResult(version), remarks: { policy: "optional", maxLength: 2000 } };
}

export function resolveFireAlarmControls(definition: unknown, templateCode = "MFE-FSSR", definitionVersion: 3 | 6 | 7 = 3): ResolvedFireAlarmControls {
  if (templateCode !== "MFE-FSSR" || !parseFireAlarmSystemDefinition(definition, definitionVersion)) {
    throw new Error("Unsupported or malformed Fire Alarm MFE-FSSR V3 definition");
  }
  return {
    schemaVersion: definitionVersion === 6 || definitionVersion === 7 ? 2 : 1,
    source: { templateCode: "MFE-FSSR", templateVersion: definitionVersion, systemKey: "fire_alarm_detector" },
    repetitionMode: "single_with_two_repeatable_tables",
    instance: { key: "primary", displaySequence: 1, zoneId: null, locationId: null },
    controlPanelLocation: { key: "control_panel_location", label: "Control Panel Location", required: true, maxLength: 300 },
    primaryDeviceRows: {
      minimum: 1, maximum: 250,
      assetReference: { key: "asset_reference", label: "No.", required: false, maxLength: 250 },
      alarmZone: { key: "alarm_zone", label: "Alarm Zone", required: true, maxLength: 200 },
      location: { key: "location", label: "Location", required: true, maxLength: 300 },
      manualCallPoint: deviceResult(definitionVersion === 7), flowSwitch: deviceResult(definitionVersion === 7), heatDetector: deviceResult(definitionVersion === 7), smokeDetector: deviceResult(definitionVersion === 7),
      remarks: { policy: "optional", maxLength: 2000 }
    },
    chargerAndBatteries: [resolvedChecklist("main_supply", "Main Supply", 1, definitionVersion), resolvedChecklist("battery", "Battery", 2, definitionVersion), resolvedChecklist("charger", "Charger", 3, definitionVersion)],
    mainFunctionKeys: [
      resolvedChecklist("main_alarm_reset", "Main Alarm Reset", 1, definitionVersion), resolvedChecklist("lamp_test", "Lamp Test", 2, definitionVersion),
      resolvedChecklist("evacuate", "Evacuate", 3, definitionVersion), resolvedChecklist("ac_supply", "A/C Supply", 4, definitionVersion),
      resolvedChecklist("dc_supply", "D/C Supply", 5, definitionVersion), resolvedChecklist("spka_system", "SPKA System", 6, definitionVersion),
      resolvedChecklist("alarm_lift_trip", "Alarm Lift Trip", 7, definitionVersion), resolvedChecklist("signal_gas_discharge", "Signal Gas Discharge", 8, definitionVersion)
    ],
    secondaryAlarmDeviceRows: {
      minimum: 0, maximum: 250,
      assetReference: { key: "asset_reference", label: "No.", required: false, maxLength: 250 },
      location: { key: "location", label: "Location", required: true, maxLength: 300 },
      alarmBell: goodPoorResult(definitionVersion), manualCallPoint: goodPoorResult(definitionVersion), remarks: { policy: "optional", maxLength: 2000 }
    },
    comments: { policy: "optional", maxLength: 4000 }
  };
}
