import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import { masterServiceReportV2 } from "./masterServiceReportV2.js";
import type {
  FieldDefinition,
  MasterServiceReportDefinition,
  SystemDefinition
} from "./templateTypes.js";

const goodPoorValues = ["good", "poor"] as const;
const deviceStateValues = ["normal", "test", "isolation"] as const;

function textField(
  key: string,
  label: string,
  required: boolean,
  sortOrder: number,
  control: "text" | "remarks" = "text"
): FieldDefinition {
  return { key, label, control, required, sortOrder };
}

function resultField(
  key: string,
  label: string,
  control: "good_poor" | "normal_test_isolation",
  sortOrder: number
): FieldDefinition {
  return {
    key,
    label,
    control,
    required: true,
    sortOrder,
    allowedValues: control === "good_poor" ? goodPoorValues : deviceStateValues,
    remarksPolicy: "optional"
  };
}

function checklistItems(
  entries: readonly (readonly [key: string, label: string])[]
): FieldDefinition[] {
  return entries.map(([key, label], index) => resultField(key, label, "good_poor", index + 1));
}

export const fireAlarmDetectorV3 = {
  key: "fire_alarm_detector",
  displayName: "Fire Alarm / Detector System",
  sortOrder: 5,
  definitionStatus: "confirmed",
  configuration: {
    supportsZones: true,
    supportsLocations: true,
    supportsPresetRows: true
  },
  sections: [
    {
      key: "fire_alarm_control_panel",
      title: "Fire Alarm Control Panel",
      sortOrder: 1,
      blocks: [
        {
          key: "control_panel_location",
          title: "Control Panel Location",
          type: "checklist",
          sortOrder: 1,
          items: [textField("control_panel_location", "Control Panel Location", true, 1)]
        },
        {
          key: "device_rows",
          title: "Zone and Device Rows",
          type: "repeatable_table",
          sortOrder: 2,
          supportsZones: true,
          supportsLocations: true,
          columns: [
            textField("asset_reference", "No.", false, 1),
            textField("alarm_zone", "Alarm Zone", true, 2),
            textField("location", "Location", true, 3),
            resultField("manual_call_point", "Manual Call Point", "normal_test_isolation", 4),
            resultField("flow_switch", "Flow Switch", "normal_test_isolation", 5),
            resultField("heat_detector", "Heat Detector", "normal_test_isolation", 6),
            resultField("smoke_detector", "Smoke Detector", "normal_test_isolation", 7),
            textField("remarks", "Remarks", false, 8, "remarks")
          ]
        }
      ]
    },
    {
      key: "charger_batteries",
      title: "Charger & Batteries",
      sortOrder: 2,
      blocks: [{
        key: "charger_battery_checks",
        title: "Charger & Battery Checks",
        type: "checklist",
        sortOrder: 1,
        items: checklistItems([
          ["main_supply", "Main Supply"],
          ["battery", "Battery"],
          ["charger", "Charger"]
        ])
      }]
    },
    {
      key: "main_function_key",
      title: "Main Function Key",
      sortOrder: 3,
      blocks: [{
        key: "function_checks",
        title: "Function Checks",
        type: "checklist",
        sortOrder: 1,
        items: checklistItems([
          ["main_alarm_reset", "Main Alarm Reset"],
          ["lamp_test", "Lamp Test"],
          ["evacuate", "Evacuate"],
          ["ac_supply", "A/C Supply"],
          ["dc_supply", "D/C Supply"],
          ["spka_system", "SPKA System"],
          ["alarm_lift_trip", "Alarm Lift Trip"],
          ["signal_gas_discharge", "Signal Gas Discharge"]
        ])
      }]
    },
    {
      key: "alarm_devices",
      title: "Alarm Devices",
      sortOrder: 4,
      blocks: [
        {
          key: "alarm_device_rows",
          title: "Alarm Bell and Manual Call Point Rows",
          type: "repeatable_table",
          sortOrder: 1,
          supportsZones: false,
          supportsLocations: true,
          columns: [
            textField("asset_reference", "No.", false, 1),
            textField("location", "Location", true, 2),
            resultField("alarm_bell", "Alarm Bell", "good_poor", 3),
            resultField("manual_call_point", "Manual Call Point", "good_poor", 4),
            textField("remarks", "Remarks", false, 5, "remarks")
          ]
        },
        {
          key: "comments",
          title: "Comments",
          type: "comments",
          sortOrder: 2,
          field: textField("comments", "Comments", false, 1, "remarks")
        }
      ]
    }
  ]
} as const satisfies SystemDefinition;

function v1System(key: string): SystemDefinition {
  const system = masterServiceReportV1.systems.find((candidate) => candidate.key === key);
  if (!system) throw new Error(`MFE-FSSR V1 is missing ${key}`);
  return system;
}

function futureSystem(key: string): SystemDefinition {
  return { ...v1System(key), definitionStatus: "requires_confirmation" };
}

const dryWetRiserV3: SystemDefinition = {
  ...masterServiceReportV2.systems[0],
  sortOrder: 2
};

export const masterServiceReportV3 = {
  id: "00000000-0000-4000-8000-000000000803",
  code: "MFE-FSSR",
  name: "MFE Fire System Service Report Template",
  version: 3,
  selectionPolicy: "preset_only",
  header: masterServiceReportV1.header,
  reportBoilerplate: masterServiceReportV1.reportBoilerplate,
  systems: [
    v1System("automatic_sprinkler"),
    dryWetRiserV3,
    v1System("hose_reel"),
    v1System("co2_fire_extinguisher"),
    fireAlarmDetectorV3,
    futureSystem("wet_chemical"),
    v1System("hydrant"),
    futureSystem("fm200"),
    futureSystem("portable_fire_extinguisher")
  ]
} as const satisfies MasterServiceReportDefinition;
