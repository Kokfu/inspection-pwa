import type {
  FieldDefinition,
  MasterServiceReportDefinition,
  MeasurementRowDefinition,
  SystemDefinition
} from "./templateTypes.js";

const goodPoorValues = ["good", "poor"] as const;
const normalTestIsolationValues = ["normal", "test", "isolation"] as const;

function goodPoor(key: string, label: string, sortOrder: number): FieldDefinition {
  return {
    key,
    label,
    control: "good_poor",
    required: false,
    sortOrder,
    allowedValues: goodPoorValues,
    remarksPolicy: "optional"
  };
}

function detectorState(key: string, label: string, sortOrder: number): FieldDefinition {
  return {
    key,
    label,
    control: "normal_test_isolation",
    required: false,
    sortOrder,
    allowedValues: normalTestIsolationValues,
    remarksPolicy: "optional"
  };
}

function textField(key: string, label: string, sortOrder: number): FieldDefinition {
  return { key, label, control: "text", required: false, sortOrder };
}

function psiMeasurementRow(
  key: string,
  label: string,
  sortOrder: number,
  measurements: readonly { key: string; label: string }[]
): MeasurementRowDefinition {
  return {
    key,
    label,
    sortOrder,
    measurements: measurements.map((measurement) => ({
      ...measurement,
      required: false,
      unit: "PSI"
    })),
    result: {
      control: "good_poor",
      required: false,
      allowedValues: goodPoorValues
    },
    remarksPolicy: "optional"
  };
}

function comments(sortOrder: number) {
  return {
    key: "comments",
    title: "Comments",
    type: "comments" as const,
    sortOrder,
    field: {
      key: "comments",
      label: "Comments",
      control: "remarks" as const,
      required: false,
      sortOrder: 1
    }
  };
}

function waterTankSection(): SystemDefinition["sections"][number] {
  return {
    key: "water_tank",
    title: "Water Tank",
    sortOrder: 1,
    blocks: [{
      key: "water_tank_checks",
      title: "Water Tank Checks",
      type: "checklist",
      sortOrder: 1,
      items: [
        goodPoor("saj_main_water_supply", "S.A.J Main Water Supply", 1),
        goodPoor("water_level", "Water Level", 2),
        goodPoor("automatic_refilling_facilities", "Automatic Refilling Facilities", 3),
        goodPoor("drain_and_stop_valve_positions", "Drain Valve Closed and Stop Valves Open", 4)
      ]
    }]
  };
}

function fullPumpHouseSection(options: { includeBatteryChargerFailureAlarm?: boolean } = {}): SystemDefinition["sections"][number] {
  const batteryOffset = options.includeBatteryChargerFailureAlarm ? 1 : 0;
  return {
    key: "pump_house",
    title: "Pump House",
    sortOrder: 2,
    blocks: [
      {
        key: "pump_house_checks",
        title: "Pump House Checks",
        type: "checklist",
        sortOrder: 1,
        items: [
          goodPoor("pump_house_clean", "Keep Clean in Pump House", 1),
          goodPoor("manual_start_pumps", "Manual Start Jockey, Duty and Stand-by Pumps", 2),
          goodPoor("standby_pump_service_items", "Stand-by Pump Water, Oil, Fuel, Belt and Other Service Items", 3),
          goodPoor("battery_charging_alternator", "Battery Charging Alternator Operation", 4),
          ...(options.includeBatteryChargerFailureAlarm
            ? [goodPoor("battery_charger_failure_alarm", "Battery Charger Failure Alarm", 5)]
            : []),
          goodPoor("battery_serviceable", "Battery in Good Serviceable Condition", 5 + batteryOffset),
          goodPoor("pump_phase_failure_alarm", "Pump Run / Phase Failure Alarm Signal to Main Alarm Panel", 6 + batteryOffset),
          goodPoor("pumps_auto_start", "Jockey, Duty and Stand-by Pumps in Auto Start Position", 7 + batteryOffset),
          goodPoor("test_and_gate_valve_positions", "Test Valve Closed and Gate Valves Open", 8 + batteryOffset)
        ]
      },
      {
        key: "pump_pressure_measurements",
        title: "Pump Pressure Measurements",
        type: "measurement",
        sortOrder: 2,
        items: [
          psiMeasurementRow("jockey_pump_pressure", "Jockey Pump", 1, [
            { key: "cut_in", label: "Cut In" },
            { key: "cut_out", label: "Cut Out" }
          ]),
          psiMeasurementRow("duty_pump_cut_in", "Duty Pump Cut In", 2, [
            { key: "value", label: "Cut In" }
          ]),
          psiMeasurementRow("standby_pump_cut_in", "Stand-by Pump Cut In", 3, [
            { key: "value", label: "Cut In" }
          ])
        ]
      }
    ]
  };
}

function chargerBatteryItems() {
  return [
    goodPoor("main_supply", "Main Supply", 1),
    goodPoor("battery", "Battery", 2),
    goodPoor("charger", "Charger", 3)
  ];
}

function commonFunctionItems(includeSpka = false) {
  const items = [
    goodPoor("main_alarm_reset", "Main Alarm Reset", 1),
    goodPoor("lamp_test", "Lamp Test", 2),
    goodPoor("evacuate", "Evacuate", 3),
    goodPoor("ac_supply", "A/C Supply", 4),
    goodPoor("dc_supply", "D/C Supply", 5)
  ];
  if (includeSpka) {
    items.push(
      goodPoor("spka_system", "SPKA System", 6),
      goodPoor("alarm_lift_trip", "Alarm Lift Trip", 7),
      goodPoor("signal_gas_discharge", "Signal Gas Discharge", 8)
    );
  } else {
    items.push(goodPoor("signal_alarm_to_mfap", "Signal Alarm to MFAP", 6));
  }
  return items;
}

const automaticSprinkler: SystemDefinition = {
  key: "automatic_sprinkler",
  displayName: "Automatic Sprinkler System",
  sortOrder: 1,
  definitionStatus: "confirmed",
  configuration: { supportsZones: false, supportsLocations: false, supportsPresetRows: false },
  sections: [
    waterTankSection(),
    fullPumpHouseSection(),
    {
      key: "main_alarm_valve",
      title: "Main Alarm Valve",
      sortOrder: 3,
      blocks: [
        {
          key: "main_alarm_valve_checks",
          title: "Main Alarm Valve Checks",
          type: "checklist",
          sortOrder: 1,
          items: [
            goodPoor("breaching_inlet", "Breaching Inlet in Good Serviceable Condition", 1),
            goodPoor("alarm_gong", "Alarm Gong in Function", 2),
            goodPoor("flow_meter_valve_positions", "Flow Meter Valve Closed and Other Valves Open", 3)
          ]
        },
        {
          key: "alarm_valve_measurements",
          title: "Alarm Valve Measurements",
          type: "measurement",
          sortOrder: 2,
          items: [
            psiMeasurementRow("water_supply_gauge", "Water Supply Gauge", 1, [
              { key: "value", label: "Gauge Reading" }
            ]),
            psiMeasurementRow("installation_gauge", "Installation Gauge", 2, [
              { key: "value", label: "Gauge Reading" }
            ])
          ]
        },
        comments(3)
      ]
    }
  ]
};

const dryWetRiser: SystemDefinition = {
  key: "dry_wet_riser",
  displayName: "Dry / Wet Riser System",
  sortOrder: 2,
  definitionStatus: "confirmed",
  configuration: { supportsZones: true, supportsLocations: true, supportsPresetRows: true },
  confirmationNotes: ["Confirm whether Dry and Wet modes are mutually exclusive.", "Confirm source wording 'Crandle'."],
  sections: [
    {
      key: "riser_mode",
      title: "Riser Mode",
      sortOrder: 1,
      blocks: [{
        key: "riser_mode",
        title: "Riser Mode",
        type: "checklist",
        sortOrder: 1,
        confirmationNote: "The source does not establish whether both modes may be selected.",
        items: [{
          key: "mode",
          label: "Riser Mode",
          control: "select",
          required: false,
          sortOrder: 1,
          allowedValues: ["dry", "wet"],
          confirmationNote: "Selection cardinality requires confirmation."
        }]
      }]
    },
    { ...waterTankSection(), sortOrder: 2 },
    { ...fullPumpHouseSection({ includeBatteryChargerFailureAlarm: true }), sortOrder: 3 },
    {
      key: "riser_outlet",
      title: "Riser Outlet",
      sortOrder: 4,
      blocks: [
        {
          key: "riser_outlet_rows",
          title: "Riser Outlet Rows",
          type: "repeatable_table",
          sortOrder: 1,
          supportsZones: true,
          supportsLocations: true,
          columns: [
            textField("asset_reference", "No.", 1),
            textField("location", "Location", 2),
            goodPoor("canvas_hose_1", "Canvas Hose 1", 3),
            goodPoor("canvas_hose_2", "Canvas Hose 2", 4),
            goodPoor("diffuser_nozzle", "Diffuser Nozzle", 5),
            goodPoor("landing_valve", "Landing Valve", 6),
            goodPoor("crandle", "Crandle", 7),
            goodPoor("door", "Door", 8),
            { ...textField("remarks", "Remarks", 9), control: "remarks" }
          ]
        },
        comments(2)
      ]
    }
  ]
};

const hoseReel: SystemDefinition = {
  key: "hose_reel",
  displayName: "Hose Reel System",
  sortOrder: 3,
  definitionStatus: "confirmed",
  configuration: { supportsZones: true, supportsLocations: true, supportsPresetRows: true },
  confirmationNotes: ["Confirm whether Swing and Fixed drum types are mutually exclusive."],
  sections: [
    waterTankSection(),
    {
      key: "pump_house",
      title: "Pump House",
      sortOrder: 2,
      blocks: [
        {
          key: "pump_house_checks",
          title: "Pump House Checks",
          type: "checklist",
          sortOrder: 1,
          items: [
            goodPoor("pump_house_clean", "Keep Clean in Pump House", 1),
            goodPoor("standby_pump_service_items", "Stand-by Pump Oil, Fuel and Other Service Items", 2),
            goodPoor("charger_power_failure_alarm", "Battery Charger Power Failure Alarm", 3),
            goodPoor("battery_serviceable", "Battery in Good Serviceable Condition / Function", 4),
            goodPoor("pump_failure_alarm", "Pump Run / Failure Alarm to Fire Alarm Panel", 5),
            goodPoor("pumps_auto_start", "Jockey and Stand-by Pumps in Auto Start Position", 6),
            goodPoor("test_and_gate_valve_positions", "Test Valve Closed and Gate Valves Open", 7)
          ]
        },
        {
          key: "pump_pressure_measurements",
          title: "Pump Pressure Measurements",
          type: "measurement",
          sortOrder: 2,
          items: [
            psiMeasurementRow("jockey_pump_pressure", "Jockey Pump", 1, [
              { key: "cut_in", label: "Cut In" },
              { key: "cut_out", label: "Cut Out" }
            ]),
            psiMeasurementRow("standby_pump_cut_in", "Stand-by Pump Cut In", 2, [
              { key: "value", label: "Cut In" }
            ])
          ]
        }
      ]
    },
    {
      key: "hose_reel_drum",
      title: "Hose Reel Drum",
      sortOrder: 3,
      blocks: [
        {
          key: "drum_type",
          title: "Drum Type",
          type: "checklist",
          sortOrder: 1,
          items: [{
            key: "drum_type",
            label: "Drum Type",
            control: "select",
            required: false,
            sortOrder: 1,
            allowedValues: ["swing", "fixed"],
            confirmationNote: "Selection cardinality requires confirmation."
          }]
        },
        {
          key: "hose_reel_rows",
          title: "Hose Reel Location Rows",
          type: "repeatable_table",
          sortOrder: 2,
          supportsZones: true,
          supportsLocations: true,
          columns: [
            textField("asset_reference", "No.", 1),
            textField("location", "Location", 2),
            goodPoor("drum", "Drum", 3),
            goodPoor("hose", "Hose", 4),
            goodPoor("nozzle", "Nozzle", 5),
            goodPoor("valve", "Valve", 6),
            goodPoor("nozzle_box", "Nozzle Box", 7),
            { ...textField("remarks", "Remarks", 8), control: "remarks" }
          ]
        },
        comments(3)
      ]
    }
  ]
};

function suppressionPanelSystem(
  key: "co2_fire_extinguisher" | "wet_chemical",
  displayName: string,
  sortOrder: number
): SystemDefinition {
  const isWetChemical = key === "wet_chemical";
  const physicalItems = isWetChemical
    ? [
        goodPoor("wet_chemical_cylinder", "Wet Chemical Cylinder", 1),
        goodPoor("electric_actuator", "Electric Actuator", 2),
        goodPoor("manual_release_key", "Manual Release Key", 3),
        goodPoor("alarm_bell", "Alarm Bell", 4),
        goodPoor("twin_flashing_light", "Twin Flashing Light", 5),
        goodPoor("manual_pull_station", "Manual Pull Station", 6),
        goodPoor("high_pressure_hose", "High Pressure Hose", 7),
        goodPoor("discharge_nozzle", "Discharge Nozzle", 8)
      ]
    : [
        goodPoor("co2_cylinder", "CO2 Cylinder", 1),
        goodPoor("electric_actuator", "Electric Actuator", 2),
        goodPoor("manual_release_key", "Manual Release Key", 3),
        goodPoor("alarm_bell", "Alarm Bell", 4),
        goodPoor("twin_flashing_light", "Twin Flashing Light", 5),
        goodPoor("24v_dc_tripping_device", "24V DC Tripping Device", 6),
        goodPoor("manual_pull_station", "Manual Pull Station", 7),
        goodPoor("high_pressure_hose", "High Pressure Hose", 8),
        goodPoor("discharge_nozzles", "Discharge Nozzles", 9),
        goodPoor("pilot_cylinder", "Pilot Cylinder", 10)
      ];

  return {
    key,
    displayName,
    sortOrder,
    definitionStatus: "confirmed",
    configuration: { supportsZones: true, supportsLocations: true, supportsPresetRows: true },
    confirmationNotes: isWetChemical
      ? [
          "The source repeats the label Heat Detector for two detector groups; the second label requires confirmation.",
          "The source shows two unlabeled result positions for charger and battery rows; their meaning requires confirmation."
        ]
      : undefined,
    sections: [
      {
        key: "control_panel",
        title: isWetChemical ? "Wet Chemical Control Panel" : "CO2 Control Panel",
        sortOrder: 1,
        blocks: [
          {
            key: "control_panel_location",
            title: "Control Panel Location",
            type: "checklist",
            sortOrder: 1,
            items: [textField("control_panel_location", "Control Panel Location", 1)]
          },
          {
            key: "detector_rows",
            title: "Zone and Detector Rows",
            type: "repeatable_table",
            sortOrder: 2,
            supportsZones: true,
            supportsLocations: true,
            columns: [
              textField("alarm_zone", "Alarm Zone", 1),
              textField("location", "Location", 2),
              detectorState("heat_detector", "Heat Detector", 3),
              {
                ...detectorState(
                  isWetChemical ? "unconfirmed_second_heat_detector" : "smoke_detector",
                  isWetChemical ? "Heat Detector (Second Source Column - Unconfirmed)" : "Smoke Detector",
                  4
                ),
                confirmationNote: isWetChemical
                  ? "The authoritative source duplicates Heat Detector wording."
                  : undefined
              },
              { ...textField("remarks", "Remarks", 5), control: "remarks" }
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
          confirmationNote: isWetChemical
            ? "The source's dual result marks are retained as an unresolved presentation question."
            : undefined,
          items: chargerBatteryItems()
        }]
      },
      {
        key: "physical_outlook",
        title: "Physical Outlook Checking",
        sortOrder: 3,
        blocks: [{
          key: "physical_outlook_checks",
          title: "Physical Outlook Checks",
          type: "checklist",
          sortOrder: 1,
          items: physicalItems
        }]
      },
      {
        key: "main_function_key",
        title: "Main Function Key",
        sortOrder: 4,
        blocks: [
          {
            key: "function_checks",
            title: "Function Checks",
            type: "checklist",
            sortOrder: 1,
            items: commonFunctionItems()
          },
          comments(2)
        ]
      }
    ]
  };
}

const fireAlarmDetector: SystemDefinition = {
  key: "fire_alarm_detector",
  displayName: "Fire Alarm / Detector System",
  sortOrder: 5,
  definitionStatus: "confirmed",
  configuration: { supportsZones: true, supportsLocations: true, supportsPresetRows: true },
  confirmationNotes: ["Confirm the source abbreviation SPKA before report publication."],
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
          items: [textField("control_panel_location", "Control Panel Location", 1)]
        },
        {
          key: "device_rows",
          title: "Zone and Device Rows",
          type: "repeatable_table",
          sortOrder: 2,
          supportsZones: true,
          supportsLocations: true,
          columns: [
            textField("alarm_zone", "Alarm Zone", 1),
            textField("location", "Location", 2),
            detectorState("manual_call_point", "Manual Call Point", 3),
            detectorState("flow_switch", "Flow Switch", 4),
            detectorState("heat_detector", "Heat Detector", 5),
            detectorState("smoke_detector", "Smoke Detector", 6),
            { ...textField("remarks", "Remarks", 7), control: "remarks" }
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
        items: chargerBatteryItems()
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
        items: commonFunctionItems(true)
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
          supportsZones: true,
          supportsLocations: true,
          columns: [
            textField("asset_reference", "No.", 1),
            textField("location", "Location", 2),
            goodPoor("alarm_bell", "Alarm Bell", 3),
            goodPoor("manual_call_point", "Manual Call Point", 4),
            { ...textField("remarks", "Remarks", 5), control: "remarks" }
          ]
        },
        comments(2)
      ]
    }
  ]
};

const hydrant: SystemDefinition = {
  key: "hydrant",
  displayName: "Hydrant System",
  sortOrder: 7,
  definitionStatus: "confirmed",
  configuration: { supportsZones: true, supportsLocations: true, supportsPresetRows: true },
  confirmationNotes: ["Confirm whether Pressurize, Meter and Public hydrant types are mutually exclusive."],
  sections: [{
    key: "hydrant_set",
    title: "Hydrant Set",
    sortOrder: 1,
    blocks: [
      {
        key: "hydrant_type",
        title: "Hydrant Type",
        type: "checklist",
        sortOrder: 1,
        items: [{
          key: "hydrant_type",
          label: "Hydrant Type",
          control: "select",
          required: false,
          sortOrder: 1,
          allowedValues: ["pressurize", "meter", "public"],
          confirmationNote: "Selection cardinality requires confirmation."
        }]
      },
      {
        key: "hydrant_rows",
        title: "Hydrant Location Rows",
        type: "repeatable_table",
        sortOrder: 2,
        supportsZones: true,
        supportsLocations: true,
        columns: [
          textField("asset_reference", "No.", 1),
          textField("location", "Location", 2),
          goodPoor("canvas_hose_1", "Canvas Hose 1", 3),
          goodPoor("canvas_hose_2", "Canvas Hose 2", 4),
          goodPoor("diffuser_nozzle", "Diffuser Nozzle", 5),
          goodPoor("landing_valve", "Landing Valve", 6),
          goodPoor("landing_valve_handle", "Landing Valve Handle", 7),
          goodPoor("hose_cabinet", "Hose Cabinet", 8),
          goodPoor("key_lock", "Key Lock", 9),
          { ...textField("remarks", "Remarks", 10), control: "remarks" }
        ]
      },
      comments(3)
    ]
  }]
};

const fm200: SystemDefinition = {
  key: "fm200",
  displayName: "FM 200 System",
  sortOrder: 8,
  definitionStatus: "requires_confirmation",
  configuration: { supportsZones: false, supportsLocations: false, supportsPresetRows: false },
  confirmationNotes: [
    "FM200_TEMPLATE_REQUIRES_CONFIRMATION: the authoritative detailed form is unavailable.",
    "Do not enable this system or infer fields from CO2 or Wet Chemical definitions."
  ],
  sections: []
};

const portableFireExtinguisher: SystemDefinition = {
  key: "portable_fire_extinguisher",
  displayName: "Portable Fire Extinguisher",
  sortOrder: 9,
  definitionStatus: "confirmed",
  configuration: { supportsZones: false, supportsLocations: false, supportsPresetRows: false },
  confirmationNotes: ["Confirm whether Others requires separate description and quantity values."],
  sections: [{
    key: "extinguisher_quantities",
    title: "Portable Fire Extinguisher Quantities",
    sortOrder: 1,
    blocks: [
      {
        key: "quantity_summary",
        title: "Quantity Summary",
        type: "quantity_summary",
        sortOrder: 1,
        items: [
          { key: "total", label: "Total Fire Extinguisher", control: "count", required: false, sortOrder: 1 },
          { key: "dry_powder_9kg", label: "9KG Dry Powder Fire Extinguisher", control: "count", required: false, sortOrder: 2 },
          { key: "co2_2kg", label: "2KG CO2 Portable Fire Extinguisher", control: "count", required: false, sortOrder: 3 },
          textField("others", "Others", 4)
        ]
      },
      comments(2)
    ]
  }]
};

export const masterServiceReportV1 = {
  id: "00000000-0000-4000-8000-000000000501",
  code: "MFE-FSSR",
  name: "MFE Fire System Service Report Template",
  version: 1,
  selectionPolicy: "preset_only",
  header: {
    fields: [
      { key: "customer", label: "Customer", control: "text", required: true, sortOrder: 1 },
      { key: "service_date", label: "Service Date", control: "date", required: true, sortOrder: 2 },
      { key: "telephone", label: "Telephone No.", control: "text", required: false, sortOrder: 3 },
      { key: "contact", label: "Contact", control: "text", required: false, sortOrder: 4 },
      { key: "service_call_number", label: "Service Call No.", control: "text", required: false, sortOrder: 5 },
      { key: "arrival", label: "Arrival", control: "time", required: false, sortOrder: 6 },
      { key: "departure", label: "Departure", control: "time", required: false, sortOrder: 7 },
      { key: "applicable_systems", label: "Applicable Fire Systems", control: "boolean_status", required: true, sortOrder: 8 },
      { key: "description", label: "Description", control: "remarks", required: false, sortOrder: 9 },
      { key: "completion_status", label: "Completion Status", control: "select", required: true, sortOrder: 10, allowedValues: ["to_be_continued", "completed"] },
      { key: "service_by", label: "Service By / Technician", control: "text", required: true, sortOrder: 11 },
      { key: "technician_confirmation_date", label: "Technician Confirmation Date", control: "date", required: false, sortOrder: 12 },
      { key: "confirmed_by", label: "Confirmed By", control: "text", required: false, sortOrder: 13 },
      { key: "technician_signature", label: "Technician Signature", control: "future_signature", required: false, sortOrder: 14 },
      { key: "customer_signature_stamp", label: "Customer Signature & Stamp", control: "future_signature", required: false, sortOrder: 15 }
    ]
  },
  reportBoilerplate: {
    conditions: [
      "All fire systems are tested and inspected.",
      "Abnormal conditions that may damage customer systems or threaten safety or the environment require immediate customer action."
    ],
    resultLegend: {
      good: "In Good Working Condition",
      poor: "In Poor Working Condition"
    },
    footerKey: "mfe_service_report_footer_v1"
  },
  systems: [
    automaticSprinkler,
    dryWetRiser,
    hoseReel,
    suppressionPanelSystem("co2_fire_extinguisher", "CO2 Fire Extinguisher System", 4),
    fireAlarmDetector,
    suppressionPanelSystem("wet_chemical", "Wet Chemical System", 6),
    hydrant,
    fm200,
    portableFireExtinguisher
  ]
} as const satisfies MasterServiceReportDefinition;
