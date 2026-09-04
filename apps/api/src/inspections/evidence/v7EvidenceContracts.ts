import { createHash } from "node:crypto";
import { masterServiceReportV7 } from "../templates/masterServiceReportV7.js";
import { isCompatibleSystemContract } from "../templates/systemContractCompatibility.js";

type RecordValue = Record<string, unknown>;
export type V7EvidenceSystemKey = "co2_fire_extinguisher" | "wet_chemical" | "fire_alarm_detector";
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

export function resolveV7EvidenceContract(values: { systemKey: unknown; templateId: unknown; templateVersion: unknown; definition: unknown; contractSha256: unknown }): V7EvidenceContractAdapter | undefined {
  if ((values.systemKey !== "co2_fire_extinguisher" && values.systemKey !== "wet_chemical" && values.systemKey !== "fire_alarm_detector")
    || values.templateId !== masterServiceReportV7.id || values.templateVersion !== 7
    || typeof values.contractSha256 !== "string" || !/^[0-9a-f]{64}$/.test(values.contractSha256)
    || !isCompatibleSystemContract(values.systemKey, "confirmed", values.definition, { id: masterServiceReportV7.id, version: 7 })
    || v7EvidenceContractSha256(values.definition) !== values.contractSha256) return undefined;
  if (values.systemKey === "co2_fire_extinguisher") return adapter("co2_fire_extinguisher", co2AdapterFields, values.definition);
  if (values.systemKey === "wet_chemical") return adapter("wet_chemical", wetChemicalAdapterFields, values.definition);
  return fireAlarmAdapter(values.definition);
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
