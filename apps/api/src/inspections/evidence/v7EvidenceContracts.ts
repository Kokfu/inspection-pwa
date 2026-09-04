import { createHash } from "node:crypto";
import { masterServiceReportV7 } from "../templates/masterServiceReportV7.js";
import { isCompatibleSystemContract } from "../templates/systemContractCompatibility.js";

type RecordValue = Record<string, unknown>;
export type V7EvidenceSystemKey = "co2_fire_extinguisher" | "wet_chemical" | "fire_alarm_detector" | "hydrant" | "hose_reel";
export type V7EvidenceFieldPath = string;

export type V7EvidenceContractAdapter = {
  readonly systemKey: V7EvidenceSystemKey;
  readonly templateId: string;
  readonly templateVersion: 7;
  isCanonicalFieldPath(fieldPath: unknown): fieldPath is V7EvidenceFieldPath;
  derivePoorFieldPaths(response: unknown): readonly V7EvidenceFieldPath[] | undefined;
  ownPoorRemark(response: unknown, fieldPath: V7EvidenceFieldPath): string | undefined;
  acceptedEvidenceCaption(fieldPath: V7EvidenceFieldPath): string | undefined;
};

/** A finding needs its own remark and photo.  The other two result states do
 * not; validation of every result token remains definition-driven below. */
export const isV7EvidenceFinding = (value: unknown) => value === "not_good" || value === "complete_repair";

const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalize = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalize).join(",")}]`
  : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`
    : JSON.stringify(value);

export const v7EvidenceContractSha256 = (definition: unknown) => createHash("sha256").update(canonicalize(definition)).digest("hex");

const groups: ReadonlyArray<readonly ["chargerAndBatteries" | "physicalOutlook" | "mainFunctionKeys", string, string, string, string]> = [
  ["chargerAndBatteries", "charger_batteries", "charger_battery_checks", "charger_batteries.charger_battery_checks", "Charger & Batteries"],
  ["physicalOutlook", "physical_outlook", "physical_outlook_checks", "physical_outlook.physical_outlook_checks", "Physical Outlook"],
  ["mainFunctionKeys", "main_function_key", "function_checks", "main_function_key.function_checks", "Main Function Key"]
];

function allowedValues(definition: unknown, sectionKey: string, blockKey: string, fieldKey: string) {
  if (!isRecord(definition) || !Array.isArray(definition.sections)) return undefined;
  const section = definition.sections.find((value) => isRecord(value) && value.key === sectionKey);
  const block = isRecord(section) && Array.isArray(section.blocks)
    ? section.blocks.find((value) => isRecord(value) && value.key === blockKey) : undefined;
  const fields: unknown[] | undefined = isRecord(block) ? (Array.isArray(block.items) ? block.items : Array.isArray(block.columns) ? block.columns : undefined) : undefined;
  const field = fields?.find((value) => isRecord(value) && value.key === fieldKey);
  if (!isRecord(field) || field.control !== "good_poor" || !Array.isArray(field.allowedValues)
    || field.allowedValues.length === 0 || !field.allowedValues.every((value) => typeof value === "string")
    || new Set(field.allowedValues).size !== field.allowedValues.length) return undefined;
  return new Set(field.allowedValues as string[]);
}

const adapter = (systemKey: V7EvidenceSystemKey, fields: Readonly<Record<string, string>>, definition: unknown): V7EvidenceContractAdapter | undefined => {
  const fieldPaths = new Map<string, string>();
  const valuesByPath = new Map<string, Set<string>>();
  for (const [responseGroup, sectionKey, blockKey, prefix, title] of groups) {
    for (const [key, label] of Object.entries(fields)) {
      const group = key.split(":", 1)[0];
      if (group !== responseGroup) continue;
      const path = `${prefix}.${key.slice(group.length + 1)}`;
      const values = allowedValues(definition, sectionKey, blockKey, key.slice(group.length + 1));
      if (!values) return undefined;
      fieldPaths.set(path, `${title} - ${label}`);
      valuesByPath.set(path, values);
    }
  }
  const responseKeyForPath = new Map([...fieldPaths.keys()].map((path) => {
    const [group] = groups.find(([, , , prefix]) => path.startsWith(`${prefix}.`))!;
    return [path, [group, path.slice(path.lastIndexOf(".") + 1)] as const];
  }));
  const responseValue = (response: unknown, fieldPath: string) => {
    if (!isRecord(response)) return undefined;
    const key = responseKeyForPath.get(fieldPath);
    const group = key ? response[key[0]] : undefined;
    if (!key || !isRecord(group)) return undefined;
    const candidate = group[key[1]];
    if (!isRecord(candidate) || typeof candidate.remarks !== "string" || typeof candidate.result !== "string") return undefined;
    return { result: candidate.result, remarks: candidate.remarks } as { result: string; remarks: string };
  };
  return {
    systemKey,
    templateId: masterServiceReportV7.id,
    templateVersion: 7,
    isCanonicalFieldPath: (fieldPath: unknown): fieldPath is string => typeof fieldPath === "string" && fieldPaths.has(fieldPath),
    derivePoorFieldPaths(response: unknown) {
      const poor: string[] = [];
      for (const path of fieldPaths.keys()) {
        const value = responseValue(response, path);
        if (!value || !valuesByPath.get(path)?.has(value.result)) return undefined;
        if (isV7EvidenceFinding(value.result)) {
          if (!value.remarks.trim()) return undefined;
          poor.push(path);
        }
      }
      return poor.sort();
    },
    ownPoorRemark(response: unknown, fieldPath: string) {
      const value = responseValue(response, fieldPath);
      return value && isV7EvidenceFinding(value.result) && value.remarks.trim() ? value.remarks.trim() : undefined;
    },
    acceptedEvidenceCaption: (fieldPath: string) => fieldPaths.get(fieldPath)
  };
};

const co2AdapterFields: Readonly<Record<string, string>> = {
  "chargerAndBatteries:main_supply": "Main Supply", "chargerAndBatteries:battery": "Battery", "chargerAndBatteries:charger": "Charger",
  "physicalOutlook:co2_cylinder": "CO2 Cylinder", "physicalOutlook:electric_actuator": "Electric Actuator", "physicalOutlook:manual_release_key": "Manual Release Key", "physicalOutlook:alarm_bell": "Alarm Bell", "physicalOutlook:twin_flashing_light": "Twin Flashing Light", "physicalOutlook:24v_dc_tripping_device": "24V DC Tripping Device", "physicalOutlook:manual_pull_station": "Manual Pull Station", "physicalOutlook:high_pressure_hose": "High Pressure Hose", "physicalOutlook:discharge_nozzles": "Discharge Nozzles", "physicalOutlook:pilot_cylinder": "Pilot Cylinder",
  "mainFunctionKeys:main_alarm_reset": "Main Alarm Reset", "mainFunctionKeys:lamp_test": "Lamp Test", "mainFunctionKeys:evacuate": "Evacuate", "mainFunctionKeys:ac_supply": "A/C Supply", "mainFunctionKeys:dc_supply": "D/C Supply", "mainFunctionKeys:signal_alarm_to_mfap": "Signal Alarm to MFAP"
};

const wetChemicalAdapterFields: Readonly<Record<string, string>> = {
  "chargerAndBatteries:main_supply": "Main Supply", "chargerAndBatteries:battery": "Battery", "chargerAndBatteries:charger": "Charger",
  "physicalOutlook:wet_chemical_cylinder": "Wet Chemical Cylinder", "physicalOutlook:electric_actuator": "Electric Actuator", "physicalOutlook:manual_release_key": "Manual Release Key", "physicalOutlook:alarm_bell": "Alarm Bell", "physicalOutlook:twin_flashing_light": "Twin Flashing Light", "physicalOutlook:manual_pull_station": "Manual Pull Station", "physicalOutlook:high_pressure_hose": "High Pressure Hose", "physicalOutlook:discharge_nozzle": "Discharge Nozzle",
  "mainFunctionKeys:main_alarm_reset": "Main Alarm Reset", "mainFunctionKeys:lamp_test": "Lamp Test", "mainFunctionKeys:evacuate": "Evacuate", "mainFunctionKeys:ac_supply": "A/C Supply", "mainFunctionKeys:dc_supply": "D/C Supply", "mainFunctionKeys:signal_alarm_to_mfap": "Signal Alarm to MFAP"
};

const fireAlarmStaticFields: Readonly<Record<string, string>> = {
  "chargerAndBatteries:main_supply": "Charger & Batteries - Main Supply", "chargerAndBatteries:battery": "Charger & Batteries - Battery", "chargerAndBatteries:charger": "Charger & Batteries - Charger",
  "mainFunctionKeys:main_alarm_reset": "Main Function Key - Main Alarm Reset", "mainFunctionKeys:lamp_test": "Main Function Key - Lamp Test", "mainFunctionKeys:evacuate": "Main Function Key - Evacuate", "mainFunctionKeys:ac_supply": "Main Function Key - A/C Supply", "mainFunctionKeys:dc_supply": "Main Function Key - D/C Supply", "mainFunctionKeys:spka_system": "Main Function Key - SPKA System", "mainFunctionKeys:alarm_lift_trip": "Main Function Key - Alarm Lift Trip", "mainFunctionKeys:signal_gas_discharge": "Main Function Key - Signal Gas Discharge"
};
const fireAlarmStaticPaths: Map<string, { group: "chargerAndBatteries" | "mainFunctionKeys"; field: string; caption: string }> = new Map(Object.entries(fireAlarmStaticFields).map(([key, caption]) => {
  const [group, field] = key.split(":") as ["chargerAndBatteries" | "mainFunctionKeys", string];
  return [`${group === "chargerAndBatteries" ? "charger_batteries.charger_battery_checks" : "main_function_key.function_checks"}.${field}`, { group, field, caption }] as const;
}));
const fireAlarmRowPath = /^alarm_devices\.alarm_device_rows\.rows\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(alarm_bell|manual_call_point)$/i;
const fireAlarmAdapter = (definition: unknown): V7EvidenceContractAdapter | undefined => {
  const staticValues = new Map<string, Set<string>>();
  for (const [path, target] of fireAlarmStaticPaths) {
    const values = allowedValues(definition,
      target.group === "chargerAndBatteries" ? "charger_batteries" : "main_function_key",
      target.group === "chargerAndBatteries" ? "charger_battery_checks" : "function_checks", target.field);
    if (!values) return undefined;
    staticValues.set(path, values);
  }
  const rowValues = new Map<"alarmBell" | "manualCallPoint", Set<string>>();
  for (const [key, field] of [["alarmBell", "alarm_bell"], ["manualCallPoint", "manual_call_point"]] as const) {
    const values = allowedValues(definition, "alarm_devices", "alarm_device_rows", field);
    if (!values) return undefined;
    rowValues.set(key, values);
  }
  return {
  systemKey: "fire_alarm_detector", templateId: masterServiceReportV7.id, templateVersion: 7,
  isCanonicalFieldPath(fieldPath: unknown): fieldPath is string { return typeof fieldPath === "string" && (fireAlarmStaticPaths.has(fieldPath) || fireAlarmRowPath.test(fieldPath)); },
  derivePoorFieldPaths(response: unknown) {
    if (!isRecord(response) || !Array.isArray(response.secondaryAlarmDeviceRows)) return undefined;
    const poor: string[] = [];
    for (const [path, target] of fireAlarmStaticPaths) {
      const group = response[target.group]; const value = isRecord(group) ? group[target.field] : undefined;
      if (!isRecord(value) || typeof value.result !== "string" || typeof value.remarks !== "string" || !staticValues.get(path)?.has(value.result)) return undefined;
      if (isV7EvidenceFinding(value.result)) { if (!value.remarks.trim()) return undefined; poor.push(path); }
    }
    const rowIds = new Set<string>();
    for (const row of response.secondaryAlarmDeviceRows) {
      if (!isRecord(row) || typeof row.rowUuid !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.rowUuid) || rowIds.has(row.rowUuid) || !isRecord(row.fieldRemarks)) return undefined;
      rowIds.add(row.rowUuid);
      for (const [key, wire] of [["alarmBell", "alarm_bell"], ["manualCallPoint", "manual_call_point"]] as const) {
        if (!rowValues.get(key)?.has(String(row[key]))) return undefined;
        const remark = row.fieldRemarks[key];
        if (isV7EvidenceFinding(row[key])) { if (typeof remark !== "string" || !remark.trim()) return undefined; poor.push(`alarm_devices.alarm_device_rows.rows.${row.rowUuid}.${wire}`); }
      }
    }
    return poor.sort();
  },
  ownPoorRemark(response: unknown, fieldPath: string) {
    if (!isRecord(response)) return undefined;
    const staticTarget = fireAlarmStaticPaths.get(fieldPath);
    if (staticTarget) { const group = response[staticTarget.group]; const value = isRecord(group) ? group[staticTarget.field] : undefined; return isRecord(value) && isV7EvidenceFinding(value.result) && typeof value.remarks === "string" && value.remarks.trim() ? value.remarks.trim() : undefined; }
    const match = fireAlarmRowPath.exec(fieldPath); if (!match || !Array.isArray(response.secondaryAlarmDeviceRows)) return undefined;
    const row = response.secondaryAlarmDeviceRows.find((value) => isRecord(value) && value.rowUuid === match[1]); const key = match[2] === "alarm_bell" ? "alarmBell" : "manualCallPoint";
    return isRecord(row) && isV7EvidenceFinding(row[key]) && isRecord(row.fieldRemarks) && typeof row.fieldRemarks[key] === "string" && row.fieldRemarks[key].trim() ? row.fieldRemarks[key].trim() : undefined;
  },
  acceptedEvidenceCaption(fieldPath: string) { return fireAlarmStaticPaths.get(fieldPath)?.caption ?? (fireAlarmRowPath.test(fieldPath) ? `Alarm Devices - ${fieldPath.endsWith(".alarm_bell") ? "Alarm Bell" : "Manual Call Point"}` : undefined); }
  };
};

const hydrantRowFields = [
  ["canvasHose1Result", "canvas_hose_1", "Canvas Hose 1"],
  ["canvasHose2Result", "canvas_hose_2", "Canvas Hose 2"],
  ["diffuserNozzleResult", "diffuser_nozzle", "Diffuser Nozzle"],
  ["landingValveResult", "landing_valve", "Landing Valve"],
  ["landingValveHandleResult", "landing_valve_handle", "Landing Valve Handle"],
  ["hoseCabinetResult", "hose_cabinet", "Hose Cabinet"],
  ["keyLockResult", "key_lock", "Key Lock"]
] as const;
const hydrantRowPath = /^hydrant_set\.hydrant_rows\.rows\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(canvas_hose_1|canvas_hose_2|diffuser_nozzle|landing_valve|landing_valve_handle|hose_cabinet|key_lock)$/i;

/** Row UUIDs are client-generated, so canonical path validation can validate
 * only their UUID shape. As in Fire Alarm, response traversal resolves that
 * UUID against the submitted row before deriving a finding or its own remark. */
const repeatableRowAdapter = (definition: unknown): V7EvidenceContractAdapter | undefined => {
  const valuesByResponseKey = new Map<string, Set<string>>();
  const responseKeyByColumn = new Map<string, string>();
  for (const [responseKey, columnKey] of hydrantRowFields) {
    const values = allowedValues(definition, "hydrant_set", "hydrant_rows", columnKey);
    if (!values) return undefined;
    valuesByResponseKey.set(responseKey, values);
    responseKeyByColumn.set(columnKey, responseKey);
  }
  const rowForPath = (response: unknown, fieldPath: string) => {
    const match = hydrantRowPath.exec(fieldPath);
    if (!match || !isRecord(response) || !Array.isArray(response.rows)) return undefined;
    const row = response.rows.find((value) => isRecord(value) && value.rowUuid === match[1]);
    const responseKey = responseKeyByColumn.get(match[2]!);
    return isRecord(row) && responseKey ? { row, responseKey } : undefined;
  };
  return {
    systemKey: "hydrant", templateId: masterServiceReportV7.id, templateVersion: 7,
    isCanonicalFieldPath(fieldPath: unknown): fieldPath is string {
      return typeof fieldPath === "string" && hydrantRowPath.test(fieldPath);
    },
    derivePoorFieldPaths(response: unknown) {
      if (!isRecord(response) || !Array.isArray(response.rows)) return undefined;
      const poor: string[] = []; const rowIds = new Set<string>();
      for (const row of response.rows) {
        if (!isRecord(row) || typeof row.rowUuid !== "string" || !uuid.test(row.rowUuid) || rowIds.has(row.rowUuid) || !isRecord(row.fieldRemarks)) return undefined;
        rowIds.add(row.rowUuid);
        for (const [responseKey, columnKey] of hydrantRowFields) {
          const result = row[responseKey];
          if (typeof result !== "string" || !valuesByResponseKey.get(responseKey)?.has(result)) return undefined;
          if (isV7EvidenceFinding(result)) {
            const remark = row.fieldRemarks[responseKey];
            if (typeof remark !== "string" || !remark.trim()) return undefined;
            poor.push(`hydrant_set.hydrant_rows.rows.${row.rowUuid}.${columnKey}`);
          }
        }
      }
      return poor.sort();
    },
    ownPoorRemark(response: unknown, fieldPath: string) {
      const target = rowForPath(response, fieldPath);
      if (!target || !isV7EvidenceFinding(target.row[target.responseKey]) || !isRecord(target.row.fieldRemarks)) return undefined;
      const remark = target.row.fieldRemarks[target.responseKey];
      return typeof remark === "string" && remark.trim() ? remark.trim() : undefined;
    },
    acceptedEvidenceCaption(fieldPath: string) {
      const match = hydrantRowPath.exec(fieldPath);
      const field = match && hydrantRowFields.find(([, columnKey]) => columnKey === match[2]);
      return field ? `Hydrant Set - ${field[2]}` : undefined;
    }
  };
};

const hoseChecklistFields = [
  ["water_tank", "water_tank_checks", "saj_main_water_supply", "Water Tank - S.A.J Main Water Supply"],
  ["water_tank", "water_tank_checks", "water_level", "Water Tank - Water Level"],
  ["water_tank", "water_tank_checks", "automatic_refilling_facilities", "Water Tank - Automatic Refilling Facilities"],
  ["water_tank", "water_tank_checks", "drain_and_stop_valve_positions", "Water Tank - Drain Valve In Close Position And All Stop Valve"],
  ["pump_house", "pump_house_checks", "pump_house_clean", "Pump House - Keep Clean In Pump House"],
  ["pump_house", "pump_house_checks", "standby_pump_service_items", "Pump House - Stand-by Pump Oil, Fuel and Other Service Items"],
  ["pump_house", "pump_house_checks", "charger_power_failure_alarm", "Pump House - Battery Charger Power Failure Alarm"],
  ["pump_house", "pump_house_checks", "battery_serviceable", "Pump House - Battery in Good Serviceable Condition / Function"],
  ["pump_house", "pump_house_checks", "pump_failure_alarm", "Pump House - Pump Run / Failure Alarm to Fire Alarm Panel"],
  ["pump_house", "pump_house_checks", "pumps_auto_start", "Pump House - Jockey and Stand-by Pumps in Auto Start Position"],
  ["pump_house", "pump_house_checks", "test_and_gate_valve_positions", "Pump House - Test Valve Closed and Gate Valves Open"],
  ["test_run_fire_pump_30_minutes", "test_run_fire_pump_checks", "trfp_duty_pump", "Test Run Fire Pump 30 Minutes - Duty Pump"],
  ["test_run_fire_pump_30_minutes", "test_run_fire_pump_checks", "trfp_standby_pump", "Test Run Fire Pump 30 Minutes - Standby Pump"]
] as const;
const hoseRowFields = [
  ["drumResult", "drum", "Drum"], ["hoseResult", "hose", "Hose"], ["nozzleResult", "nozzle", "Nozzle"],
  ["valveResult", "valve", "Valve"], ["nozzleBoxResult", "nozzle_box", "Nozzle Box"]
] as const;
const hoseMeasurementFields = [
  ["jockey_pump_pressure", "Jockey Pump Pressure"], ["standby_pump_cut_in", "Stand-by Pump Cut In"]
] as const;
const hoseRowPath = /^hose_reel_drum\.hose_reel_rows\.rows\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(drum|hose|nozzle|valve|nozzle_box)$/i;

/** Hose Reel is the first V7 system to combine flat checklist findings with
 * row-scoped findings.  Validate both against their frozen per-field values. */
const hoseReelAdapter = (definition: unknown): V7EvidenceContractAdapter | undefined => {
  const checklistValues = new Map<string, Set<string>>();
  const checklistPaths = new Map<string, string>();
  for (const [section, block, key, caption] of hoseChecklistFields) {
    const values = allowedValues(definition, section, block, key);
    if (!values) return undefined;
    checklistValues.set(key, values);
    checklistPaths.set(`hose_reel_checks.${key}`, caption);
  }
  const rowValues = new Map<string, Set<string>>();
  const rowKeyByColumn = new Map<string, string>();
  for (const [responseKey, columnKey] of hoseRowFields) {
    const values = allowedValues(definition, "hose_reel_drum", "hose_reel_rows", columnKey);
    if (!values) return undefined;
    rowValues.set(responseKey, values);
    rowKeyByColumn.set(columnKey, responseKey);
  }
  const measurementValues = new Map<string, Set<string>>();
  for (const [key] of hoseMeasurementFields) {
    if (!isRecord(definition) || !Array.isArray(definition.sections)) return undefined;
    const section = definition.sections.find((value) => isRecord(value) && value.key === "pump_house");
    const block = isRecord(section) && Array.isArray(section.blocks) ? section.blocks.find((value) => isRecord(value) && value.key === "pump_pressure_measurements") : undefined;
    const item = isRecord(block) && Array.isArray(block.items) ? block.items.find((value) => isRecord(value) && value.key === key) : undefined;
    const result = isRecord(item) ? item.result : undefined;
    if (!isRecord(result) || result.control !== "good_poor" || !Array.isArray(result.allowedValues) || result.allowedValues.length === 0 || !result.allowedValues.every((value) => typeof value === "string")) return undefined;
    measurementValues.set(key, new Set(result.allowedValues as string[]));
  }
  const rowTarget = (response: unknown, fieldPath: string) => {
    const match = hoseRowPath.exec(fieldPath);
    if (!match || !isRecord(response) || !Array.isArray(response.rows)) return undefined;
    const row = response.rows.find((value) => isRecord(value) && value.rowUuid === match[1]);
    const responseKey = rowKeyByColumn.get(match[2]!);
    return isRecord(row) && responseKey ? { row, responseKey } : undefined;
  };
  return {
    systemKey: "hose_reel", templateId: masterServiceReportV7.id, templateVersion: 7,
    isCanonicalFieldPath(fieldPath: unknown): fieldPath is string {
      return typeof fieldPath === "string" && (checklistPaths.has(fieldPath) || measurementValues.has(fieldPath.replace("hose_reel_measurements.", "")) && fieldPath.startsWith("hose_reel_measurements.") || hoseRowPath.test(fieldPath));
    },
    derivePoorFieldPaths(response: unknown) {
      if (!isRecord(response) || !isRecord(response.checklist) || !Array.isArray(response.rows)) return undefined;
      const poor: string[] = [];
      for (const [, , key] of hoseChecklistFields) {
        const value = response.checklist[key];
        if (!isRecord(value) || typeof value.result !== "string" || typeof value.remarks !== "string" || !checklistValues.get(key)?.has(value.result)) return undefined;
        if (isV7EvidenceFinding(value.result)) { if (!value.remarks.trim()) return undefined; poor.push(`hose_reel_checks.${key}`); }
      }
      if (!isRecord(response.measurements)) return undefined;
      for (const [key] of hoseMeasurementFields) {
        const value = response.measurements[key];
        if (!isRecord(value) || typeof value.result !== "string" || typeof value.remarks !== "string" || !measurementValues.get(key)?.has(value.result)) return undefined;
        if (isV7EvidenceFinding(value.result)) { if (!value.remarks.trim()) return undefined; poor.push(`hose_reel_measurements.${key}`); }
      }
      const rowIds = new Set<string>();
      for (const row of response.rows) {
        if (!isRecord(row) || typeof row.rowUuid !== "string" || !uuid.test(row.rowUuid) || rowIds.has(row.rowUuid) || !isRecord(row.fieldRemarks)) return undefined;
        rowIds.add(row.rowUuid);
        for (const [responseKey, columnKey] of hoseRowFields) {
          const result = row[responseKey];
          if (typeof result !== "string" || !rowValues.get(responseKey)?.has(result)) return undefined;
          if (isV7EvidenceFinding(result)) {
            const remark = row.fieldRemarks[responseKey];
            if (typeof remark !== "string" || !remark.trim()) return undefined;
            poor.push(`hose_reel_drum.hose_reel_rows.rows.${row.rowUuid}.${columnKey}`);
          }
        }
      }
      return poor.sort();
    },
    ownPoorRemark(response: unknown, fieldPath: string) {
      if (!isRecord(response)) return undefined;
      const checklistKey = fieldPath.startsWith("hose_reel_checks.") ? fieldPath.slice("hose_reel_checks.".length) : undefined;
      const checklist = checklistKey && isRecord(response.checklist) ? response.checklist[checklistKey] : undefined;
      if (isRecord(checklist) && isV7EvidenceFinding(checklist.result) && typeof checklist.remarks === "string" && checklist.remarks.trim()) return checklist.remarks.trim();
      const measurementKey = fieldPath.startsWith("hose_reel_measurements.") ? fieldPath.slice("hose_reel_measurements.".length) : undefined;
      const measurement = measurementKey && isRecord(response.measurements) ? response.measurements[measurementKey] : undefined;
      if (isRecord(measurement) && isV7EvidenceFinding(measurement.result) && typeof measurement.remarks === "string" && measurement.remarks.trim()) return measurement.remarks.trim();
      const target = rowTarget(response, fieldPath);
      if (!target || !isV7EvidenceFinding(target.row[target.responseKey]) || !isRecord(target.row.fieldRemarks)) return undefined;
      const remark = target.row.fieldRemarks[target.responseKey];
      return typeof remark === "string" && remark.trim() ? remark.trim() : undefined;
    },
    acceptedEvidenceCaption(fieldPath: string) {
      const checklist = checklistPaths.get(fieldPath); if (checklist) return checklist;
      if (fieldPath.startsWith("hose_reel_measurements.")) return `Pump House - ${hoseMeasurementFields.find(([key]) => key === fieldPath.slice("hose_reel_measurements.".length))?.[1] ?? ""}`;
      const match = hoseRowPath.exec(fieldPath);
      const field = match && hoseRowFields.find(([, columnKey]) => columnKey === match[2]);
      return field ? `Hose Reel Drum - ${field[2]}` : undefined;
    }
  };
};

export function resolveV7EvidenceContract(values: { systemKey: unknown; templateId: unknown; templateVersion: unknown; definition: unknown; contractSha256: unknown }): V7EvidenceContractAdapter | undefined {
  if ((values.systemKey !== "co2_fire_extinguisher" && values.systemKey !== "wet_chemical" && values.systemKey !== "fire_alarm_detector" && values.systemKey !== "hydrant" && values.systemKey !== "hose_reel")
    || values.templateId !== masterServiceReportV7.id || values.templateVersion !== 7
    || typeof values.contractSha256 !== "string" || !/^[0-9a-f]{64}$/.test(values.contractSha256)
    || !isCompatibleSystemContract(values.systemKey, "confirmed", values.definition, { id: masterServiceReportV7.id, version: 7 })
    || v7EvidenceContractSha256(values.definition) !== values.contractSha256) return undefined;
  if (values.systemKey === "co2_fire_extinguisher") return adapter("co2_fire_extinguisher", co2AdapterFields, values.definition);
  if (values.systemKey === "wet_chemical") return adapter("wet_chemical", wetChemicalAdapterFields, values.definition);
  if (values.systemKey === "fire_alarm_detector") return fireAlarmAdapter(values.definition);
  if (values.systemKey === "hose_reel") return hoseReelAdapter(values.definition);
  return repeatableRowAdapter(values.definition);
}

/** `parseV7EvidenceManifest` deliberately collapses every refusal into one
 * `undefined` so a caller cannot use it to probe the frozen contract.  The
 * technician still has to be told which of their own actions to undo, and
 * attaching one photo to two findings is the only case they can reach by hand —
 * so that one is named.  Nothing here reads the contract or the response. */
export function v7EvidenceManifestFailureMessage(value: unknown, fallback: string) {
  const sources = (Array.isArray(value) ? value : [])
    .map((entry) => isRecord(entry) && typeof entry.sourceSha256 === "string" ? entry.sourceSha256 : undefined)
    .filter((entry): entry is string => entry !== undefined);
  return new Set(sources).size !== sources.length
    ? "Each finding needs its own photo; the same image is attached to more than one finding"
    : fallback;
}

export function parseV7EvidenceManifest(value: unknown, adapter: V7EvidenceContractAdapter, response: unknown) {
  if (!Array.isArray(value) || value.length > 250) return undefined;
  const required = adapter.derivePoorFieldPaths(response);
  if (!required) return undefined;
  const paths = new Set<string>(); const photos = new Set<string>(); const sources = new Set<string>();
  const parsed: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }> = [];
  for (const entry of value) {
    if (!isRecord(entry) || Object.keys(entry).length !== 3 || typeof entry.photoUuid !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.photoUuid)
      || !adapter.isCanonicalFieldPath(entry.fieldPath) || typeof entry.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sourceSha256)
      || paths.has(entry.fieldPath) || photos.has(entry.photoUuid) || sources.has(entry.sourceSha256)) return undefined;
    paths.add(entry.fieldPath); photos.add(entry.photoUuid); sources.add(entry.sourceSha256);
    parsed.push({ photoUuid: entry.photoUuid, fieldPath: entry.fieldPath, sourceSha256: entry.sourceSha256 });
  }
  if (paths.size !== required.length || required.some((fieldPath) => !paths.has(fieldPath))) return undefined;
  return parsed.sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
}
