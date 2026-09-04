import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QueryResultRow } from "pg";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { loadConfig } from "../config/env.js";
import { buildJobCompletion, type AcceptedAuthorityRow, type CompletionJobRow } from "../jobs/jobCompletion.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { validateCo2Responses } from "../sync/co2FormInstanceSync.js";
import { validateAutomaticSprinklerHistoricalPayload } from "../sync/automaticSprinklerInspectionSync.js";
import { validStoredDryWetRiser } from "../inspections/dryWetRiserAccepted.js";
import { validateHoseReelHistoricalPayload } from "../inspections/acceptedMasterSystemDetail.js";
import { validateFireAlarmHistoricalPayload } from "../inspections/fireAlarmAccepted.js";
import { resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { validateHydrantHistoricalPayload } from "../sync/hydrantInspectionSync.js";
import { validatePortableHistoricalPayload } from "../sync/portableFireExtinguisherSync.js";
import { parseV7EvidenceManifest, resolveV7EvidenceContract } from "../inspections/evidence/v7EvidenceContracts.js";

type RecordValue = Record<string, unknown>;
type Queryable = { query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> };

export type FinalReportErrorCode = "JOB_NOT_FOUND" | "FINAL_REPORT_NOT_AVAILABLE" | "FINAL_REPORT_DATA_INVALID";
export class FinalReportError extends Error {
  constructor(public readonly code: FinalReportErrorCode, public readonly status: number, message: string) { super(message); }
}

export type FinalReportField = { label: string; value: string; depth: number };
export type FinalReportEvidence = { field: string; caption?: string; content: Buffer; width: number; height: number };
export type FinalReportLocation = { locationId: string; locationLabel: string; zoneId: string | null; zoneLabel: string | null; instanceKey: string };
export type FinalReportSection = { systemKey: string; label: string; location?: FinalReportLocation; fields: FinalReportField[]; evidence: FinalReportEvidence[] };
export type FinalServiceReport = {
  customer: string; site: string; serviceDate: string; jobReference: string; completedAt: string; completedBy: string;
  systems: Array<{ systemKey: string; label: string; status: "Accepted"; locations: string[] }>;
  sections: FinalReportSection[];
};

type ReportJobRow = CompletionJobRow & { reference: string; title: string; service_date: string | null };
type ReportInstanceRow = AcceptedAuthorityRow & { form_instance_id: string; master_template_version_id: string; customer_configuration_revision_id: string; inspection_snapshot: unknown; response_payload: unknown; stored_sha256: string | null; storage_relative_path: string | null; width: number | null; height: number | null };
const supported = new Set(["automatic_sprinkler", "dry_wet_riser", "hose_reel", "fire_alarm_detector", "hydrant", "co2_fire_extinguisher", "wet_chemical", "portable_fire_extinguisher"]);
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactKeys = (value: RecordValue, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : isRecord(value) ? `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const text = (value: unknown, maximum = 4000): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
function requiredText(value: unknown, maximum: number, message: string): string {
  if (!text(value, maximum)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, message);
  return value;
}
function optionalAssetReference(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 250) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
  return value.trim().length > 0 ? value : undefined;
}

function labelFor(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scalar(value: unknown) {
  if (typeof value === "string") {
    const labels: Readonly<Record<string, string>> = {
      good: "Good", poor: "Poor", not_relevant: "Not Relevant",
      not_good: "Not Good", complete_repair: "Complete Repair", na: "No Need Checking / N.A.",
      normal: "Normal", test: "Test", isolation: "Isolation"
    };
    return labels[value] ?? value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "Not recorded";
  return undefined;
}

/** Keeps the accepted response's JSON insertion order, which is the submitted form/section order. */
function flatten(value: unknown, prefix = "", depth = 0, output: FinalReportField[] = []) {
  const simple = scalar(value);
  if (simple !== undefined) { output.push({ label: labelFor(prefix || "Result"), value: simple, depth }); return output; }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix || "Item"} ${index + 1}`, depth + 1, output));
    return output;
  }
  if (!isRecord(value)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted inspection data is malformed and cannot be reported.");
  for (const [key, child] of Object.entries(value)) {
    if (key === "schemaVersion" || /(^|_)(id|uuid)$|Id$/.test(key)) continue;
    flatten(child, prefix ? `${prefix} - ${key}` : key, depth + (prefix ? 1 : 0), output);
  }
  return output;
}

function expectedSystem(snapshot: unknown, key: string) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.enabledSystems)) return undefined;
  return snapshot.enabledSystems.find((system) => isRecord(system) && system.systemKey === key && system.definitionStatus === "confirmed");
}

/** Validates the persisted suppression-form authority; no live/current definition is consulted. */
function validSuppressionInstance(row: ReportInstanceRow, snapshot: RecordValue, system: RecordValue) {
  if (!isRecord(snapshot.instance) || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
    || snapshot.instance.instanceKey !== row.instance_key || snapshot.instance.displaySequence !== row.display_sequence
    || !Array.isArray(system.locations) || !Array.isArray(system.zones)) return false;
  const locations = system.locations.filter(isRecord);
  const zones = system.zones.filter(isRecord);
  if (locations.length !== system.locations.length || zones.length !== system.zones.length) return false;
  const location = locations.find((candidate) => candidate.id === row.location_id);
  if (!location || row.instance_key !== `location:${row.location_id}` || row.location_id === null
    || row.zone_id !== (location.zoneId ?? null) || !isRecord(snapshot.instance.location)
    || !exactKeys(snapshot.instance.location, ["id", "key", "displayName", "sortOrder"])
    || snapshot.instance.location.id !== location.id || snapshot.instance.location.key !== location.key
    || snapshot.instance.location.displayName !== location.displayName || snapshot.instance.location.sortOrder !== location.sortOrder) return false;
  const zone = row.zone_id === null ? null : zones.find((candidate) => candidate.id === row.zone_id);
  if ((zone === null && snapshot.instance.zone !== null) || (zone !== null && (!zone || !isRecord(snapshot.instance.zone)
    || !exactKeys(snapshot.instance.zone, ["id", "key", "displayName", "sortOrder"])
    || snapshot.instance.zone.id !== zone.id || snapshot.instance.zone.key !== zone.key
    || snapshot.instance.zone.displayName !== zone.displayName || snapshot.instance.zone.sortOrder !== zone.sortOrder))) return false;
  const order = locations.slice().sort((left, right) => {
    const leftZone = typeof left.zoneId === "string" ? zones.find((zoneItem) => zoneItem.id === left.zoneId)?.sortOrder : Number.MAX_SAFE_INTEGER;
    const rightZone = typeof right.zoneId === "string" ? zones.find((zoneItem) => zoneItem.id === right.zoneId)?.sortOrder : Number.MAX_SAFE_INTEGER;
    return Number(leftZone ?? Number.MAX_SAFE_INTEGER) - Number(rightZone ?? Number.MAX_SAFE_INTEGER)
      || Number(left.sortOrder) - Number(right.sortOrder) || String(left.id).localeCompare(String(right.id));
  });
  return row.display_sequence === order.findIndex((candidate) => candidate.id === row.location_id) + 1;
}

function validSuppressionHistoricalUnit(row: ReportInstanceRow, snapshot: RecordValue, response: RecordValue, system: RecordValue) {
  if (!exactKeys(snapshot, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system", "instance"])
    || typeof snapshot.acceptedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(snapshot.acceptedAt)
    || !isRecord(snapshot.system) || !exactKeys(snapshot.system, ["key", "displayName", "definition", "resolvedControls", "repetitionMode"])
    || snapshot.system.key !== row.system_key || snapshot.system.displayName !== system.displayName
    || snapshot.system.repetitionMode !== "per_location" || !validSuppressionInstance(row, snapshot, system)) return false;
  try {
    const controls = resolveCo2Controls(snapshot.system.definition, "MFE-FSSR", (snapshot.template as RecordValue).version as number);
    return controls.source.systemKey === row.system_key
      && canonical(snapshot.system.resolvedControls) === canonical(controls)
      && validateCo2Responses(response, controls);
  } catch { return false; }
}

function validHistoricalUnit(row: ReportInstanceRow, job: ReportJobRow, system: RecordValue) {
  const snapshot = row.inspection_snapshot;
  const response = row.response_payload;
  const frozenJob = isRecord(job.configuration_snapshot) ? job.configuration_snapshot : undefined;
  const frozenTemplate = frozenJob && isRecord(frozenJob.template) ? frozenJob.template : undefined;
  const frozenConfiguration = frozenJob && isRecord(frozenJob.configuration) ? frozenJob.configuration : undefined;
  const v7Suppression = (row.system_key === "co2_fire_extinguisher" || row.system_key === "wet_chemical" || row.system_key === "fire_alarm_detector" || row.system_key === "hydrant" || row.system_key === "hose_reel") && isRecord(snapshot) && snapshot.schemaVersion === 2;
  if (!isRecord(snapshot) || !isRecord(response) || Object.keys(response).length === 0
    || (snapshot.schemaVersion !== 1 && !(row.system_key === "fire_alarm_detector" && snapshot.schemaVersion === 2) && !v7Suppression) || !isRecord(snapshot.job) || !isRecord(snapshot.configuration)
    || !isRecord(snapshot.template) || !isRecord(snapshot.system)
    || !frozenTemplate || !frozenConfiguration
    || snapshot.job.id !== job.id || snapshot.job.reference !== job.reference
    || frozenConfiguration.revisionId !== row.customer_configuration_revision_id
    || !Number.isSafeInteger(frozenConfiguration.revisionNumber) || Number(frozenConfiguration.revisionNumber) < 1
    || snapshot.configuration.revisionId !== frozenConfiguration.revisionId
    || snapshot.configuration.revisionNumber !== frozenConfiguration.revisionNumber
    || frozenTemplate.id !== row.master_template_version_id
    || !Number.isSafeInteger(frozenTemplate.version) || Number(frozenTemplate.version) < 1
    || snapshot.template.id !== frozenTemplate.id || snapshot.template.version !== frozenTemplate.version
    || snapshot.template.code !== "MFE-FSSR" || !Number.isSafeInteger(snapshot.template.version)
    || (snapshot.system.systemKey !== row.system_key && snapshot.system.key !== row.system_key)) return false;
  if (row.system_key === "fire_alarm_detector" && snapshot.schemaVersion === 2) {
    return (frozenTemplate.version === 6 || frozenTemplate.version === 7) && row.master_template_version_id === frozenTemplate.id
      && snapshot.template.id === frozenTemplate.id && (snapshot.template.version === 6 || snapshot.template.version === 7)
      && validateFireAlarmHistoricalPayload(snapshot, response);
  }
  // CO2 and Wet Chemical accepted snapshots predate the common systemKey field
  // and their responses intentionally have no schemaVersion property. Reuse the
  // same frozen-definition validator that accepted their production payload.
  if ((row.system_key === "co2_fire_extinguisher" || row.system_key === "wet_chemical")
    && snapshot.system.key === row.system_key) {
    return validSuppressionHistoricalUnit(row, snapshot, response, system);
  }
  if (row.system_key === "hydrant" && snapshot.schemaVersion === 2) {
    if (frozenTemplate.version !== 7 || snapshot.template.version !== 7 || snapshot.system.key !== "hydrant"
      || snapshot.system.systemKey !== "hydrant" || snapshot.system.repetitionMode !== "single_with_repeatable_rows"
      || !isRecord(snapshot.system.definition) || !isRecord(snapshot.instance)
      || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
      || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
      || typeof snapshot.contractSha256 !== "string") return false;
    const adapter = resolveV7EvidenceContract({ systemKey: "hydrant", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
    return !!adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response) !== undefined;
  }
  if (row.system_key === "hose_reel" && snapshot.schemaVersion === 2) {
    if (frozenTemplate.version !== 7 || snapshot.template.version !== 7 || snapshot.system.key !== "hose_reel"
      || snapshot.system.systemKey !== "hose_reel" || snapshot.system.repetitionMode !== "single_with_repeatable_rows"
      || !isRecord(snapshot.system.definition) || !isRecord(snapshot.instance)
      || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
      || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
      || typeof snapshot.contractSha256 !== "string") return false;
    const adapter = resolveV7EvidenceContract({ systemKey: "hose_reel", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
    return !!adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response) !== undefined;
  }
  if (row.system_key === "automatic_sprinkler" && snapshot.schemaVersion === 2) {
    if (frozenTemplate.version !== 7 || snapshot.template.version !== 7 || snapshot.system.key !== "automatic_sprinkler"
      || snapshot.system.systemKey !== "automatic_sprinkler" || snapshot.system.repetitionMode !== "single"
      || !isRecord(snapshot.system.definition) || !isRecord(snapshot.instance)
      || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
      || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
      || typeof snapshot.contractSha256 !== "string") return false;
    const adapter = resolveV7EvidenceContract({ systemKey: "automatic_sprinkler", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
    return !!adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response) !== undefined;
  }
  if (snapshot.system.enabledSystemId !== system.enabledSystemId || snapshot.system.definitionStatus !== "confirmed") return false;
  switch (row.system_key) {
    case "automatic_sprinkler": return validateAutomaticSprinklerHistoricalPayload(response, snapshot);
    case "dry_wet_riser": return validStoredDryWetRiser(response, snapshot.system, snapshot.system.systemConfiguration);
    case "hose_reel": return validateHoseReelHistoricalPayload(snapshot, response);
    case "fire_alarm_detector": return validateFireAlarmHistoricalPayload(snapshot, response);
    case "hydrant": return validateHydrantHistoricalPayload(response, snapshot);
    case "portable_fire_extinguisher": return validatePortableHistoricalPayload(response, snapshot);
    default: return false;
  }
}

function fireAlarmV6PoorFields(snapshot: unknown, response: unknown) {
  const context = fireAlarmV6ReportContext(snapshot, response);
  if (!context || context.response.schemaVersion !== 2) return undefined;
  const version = context.controls.source.templateVersion;
  const finding = (value: unknown) => version === 7 ? value === "not_good" || value === "complete_repair" : value === "poor";
  const fields: string[] = [];
  const checklist = [["chargerAndBatteries", "charger_batteries.charger_battery_checks", context.controls.chargerAndBatteries], ["mainFunctionKeys", "main_function_key.function_checks", context.controls.mainFunctionKeys]] as const;
  for (const [group, prefix, definitions] of checklist) { const values = context.response[group]; if (!isRecord(values) || !exactKeys(values, definitions.map((item) => item.key))) return undefined; for (const definition of definitions) { const item = values[definition.key]; if (!isRecord(item) || !definition.result.options.some((option) => option.value === item.result)) return undefined; if (finding(item.result)) fields.push(`${prefix}.${definition.key}`); } }
  if (!Array.isArray(context.response.secondaryAlarmDeviceRows)) return undefined;
  const rowIds = new Set<string>();
  for (const row of context.response.secondaryAlarmDeviceRows) { if (!isRecord(row) || !uuid.test(String(row.rowUuid)) || rowIds.has(String(row.rowUuid)) || !isRecord(row.fieldRemarks)) return undefined; rowIds.add(String(row.rowUuid)); for (const [key, pathKey, definition] of [["alarmBell", "alarm_bell", context.controls.secondaryAlarmDeviceRows.alarmBell], ["manualCallPoint", "manual_call_point", context.controls.secondaryAlarmDeviceRows.manualCallPoint]] as const) { if (!definition.options.some((option) => option.value === row[key]) || (finding(row[key]) && (!text(row.fieldRemarks[key], 2000)))) return undefined; if (finding(row[key])) fields.push(`alarm_devices.alarm_device_rows.rows.${row.rowUuid}.${pathKey}`); } }
  return fields.sort();
}

function v6Result(value: unknown) {
  if (value === "good") return "Good";
  if (value === "poor") return "Poor";
  if (value === "not_relevant") return "Not Relevant";
  if (value === "not_good") return "Not Good";
  if (value === "complete_repair") return "Complete Repair";
  if (value === "na") return "No Need Checking / N.A.";
  return undefined;
}

type FireAlarmV6ReportResponse = RecordValue & {
  primaryDeviceRows: unknown[];
  secondaryAlarmDeviceRows: unknown[];
  chargerAndBatteries: RecordValue;
  mainFunctionKeys: RecordValue;
};

function fireAlarmV6ReportContext(snapshot: unknown, response: unknown) {
  if (!isRecord(snapshot) || !isRecord(snapshot.system) || !isRecord(snapshot.system.definition) || !isRecord(response)) return undefined;
  try {
    const template = isRecord(snapshot.template) ? snapshot.template : undefined;
    const version = template?.version === 7 ? 7 : 6;
    const controls = resolveFireAlarmV6Controls(snapshot.system.definition, version);
    if (!Array.isArray(response.primaryDeviceRows) || !Array.isArray(response.secondaryAlarmDeviceRows) || !isRecord(response.chargerAndBatteries) || !isRecord(response.mainFunctionKeys)) return undefined;
    return { controls, response: response as FireAlarmV6ReportResponse };
  } catch { return undefined; }
}

function fireAlarmV6Fields(snapshot: unknown, response: unknown) {
  const context = fireAlarmV6ReportContext(snapshot, response);
  if (!context) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
  const fields: FinalReportField[] = [];
  const add = (label: string, value: unknown, depth = 0) => {
    const rendered = typeof value === "string" ? value
      : Array.isArray(value) && value.length > 0 && value.every((item, index) => typeof item === "string"
        && ["normal", "test", "isolation"].includes(item)
        && (index === 0 || ["normal", "test", "isolation"].indexOf(value[index - 1] as string) < ["normal", "test", "isolation"].indexOf(item)))
        ? value.map((item) => item[0]!.toUpperCase() + item.slice(1)).join(", ")
        : undefined;
    if (!rendered) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
    fields.push({ label, value: rendered, depth });
  };
  add(context.controls.controlPanelLocation.label, context.response.controlPanelLocation);
  for (const [index, row] of context.response.primaryDeviceRows.entries()) {
    if (!isRecord(row)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
    const prefix = `Control Panel Row ${index + 1}`;
    const assetReference = optionalAssetReference(row.assetReference);
    if (assetReference) add(`${prefix} - ${context.controls.primaryDeviceRows.assetReference.label}`, assetReference);
    add(`${prefix} - ${context.controls.primaryDeviceRows.alarmZone.label}`, row.alarmZone);
    add(`${prefix} - ${context.controls.primaryDeviceRows.location.label}`, row.location);
    add(`${prefix} - Manual Call Point`, row.manualCallPoint);
    add(`${prefix} - Flow Switch`, row.flowSwitch);
    add(`${prefix} - Heat Detector`, row.heatDetector);
    add(`${prefix} - Smoke Detector`, row.smokeDetector);
    if (typeof row.remarks === "string" && row.remarks) add(`${prefix} - Remarks`, row.remarks);
  }
  const checklist = (title: string, values: RecordValue, items: readonly { key: string; label: string }[]) => {
    for (const item of items) {
      const value = values[item.key]; if (!isRecord(value)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
      const result = v6Result(value.result); if (!result || typeof value.remarks !== "string") throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
      add(`${title} - ${item.label}`, result); if ((result === "Poor") || (context.controls.source.templateVersion === 7 && (result === "Not Good" || result === "Complete Repair"))) add(`${title} - ${item.label} Remark`, value.remarks, 1);
    }
  };
  checklist("Charger & Batteries", context.response.chargerAndBatteries, context.controls.chargerAndBatteries);
  checklist("Main Function Key", context.response.mainFunctionKeys, context.controls.mainFunctionKeys);
  for (const [index, row] of context.response.secondaryAlarmDeviceRows.entries()) {
    if (!isRecord(row) || !isRecord(row.fieldRemarks) || typeof row.location !== "string") throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
    const prefix = `Alarm Device Row ${index + 1} (${row.location})`;
    const assetReference = optionalAssetReference(row.assetReference);
    if (assetReference) add(`${prefix} - ${context.controls.secondaryAlarmDeviceRows.assetReference.label}`, assetReference);
    for (const [key, item] of [["alarmBell", context.controls.secondaryAlarmDeviceRows.alarmBell], ["manualCallPoint", context.controls.secondaryAlarmDeviceRows.manualCallPoint]] as const) {
      const result = v6Result(row[key]); if (!result) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
      add(`${prefix} - ${key === "alarmBell" ? "Alarm Bell" : "Manual Call Point"}`, result);
      if ((result === "Poor") || (context.controls.source.templateVersion === 7 && (result === "Not Good" || result === "Complete Repair"))) add(`${prefix} - ${key === "alarmBell" ? "Alarm Bell" : "Manual Call Point"} Remark`, row.fieldRemarks[key], 1);
    }
    if (typeof row.remarks === "string" && row.remarks) add(`${prefix} - Remarks`, row.remarks);
  }
  if (typeof context.response.comments === "string" && context.response.comments) add("Comments", context.response.comments);
  return fields;
}

function fireAlarmV6EvidenceCaption(snapshot: unknown, response: unknown, fieldPath: string) {
  const context = fireAlarmV6ReportContext(snapshot, response);
  if (!context) return undefined;
  for (const [title, prefix, items] of [["Charger & Batteries", "charger_batteries.charger_battery_checks", context.controls.chargerAndBatteries], ["Main Function Key", "main_function_key.function_checks", context.controls.mainFunctionKeys]] as const) {
    for (const item of items) if (fieldPath === `${prefix}.${item.key}`) return `${title} - ${item.label}`;
  }
  const match = /^alarm_devices\.alarm_device_rows\.rows\.([0-9a-f-]{36})\.(alarm_bell|manual_call_point)$/.exec(fieldPath);
  if (!match) return undefined;
  const rowIndex = context.response.secondaryAlarmDeviceRows.findIndex((row) => isRecord(row) && row.rowUuid === match[1]); const row = context.response.secondaryAlarmDeviceRows[rowIndex];
  if (!isRecord(row) || typeof row.location !== "string" || rowIndex < 0) return undefined;
  return `Alarm Device Row ${rowIndex + 1} (${row.location}) - ${match[2] === "alarm_bell" ? "Alarm Bell" : "Manual Call Point"}`;
}

async function validatedFireAlarmV6Evidence(database: Queryable, row: ReportInstanceRow) {
  const required = fireAlarmV6PoorFields(row.inspection_snapshot, row.response_payload);
  if (!required) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 evidence requirements are invalid.");
  const rows = (await database.query<{ field_path: string; stored_sha256: string; storage_relative_path: string; width: number; height: number }>(`SELECT field_path,stored_sha256,storage_relative_path,width,height FROM staged_inspection_evidence WHERE form_instance_id=$1 AND status='accepted' ORDER BY field_path,photo_uuid`, [row.form_instance_id])).rows;
  if (rows.length !== required.length || rows.some((item, index) => item.field_path !== required[index])) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 evidence is incomplete or mismatched.");
  const uploadsRoot = path.resolve(loadConfig().uploadsPath); const evidence: FinalReportEvidence[] = [];
  for (const item of rows) { const caption = fireAlarmV6EvidenceCaption(row.inspection_snapshot, row.response_payload, item.field_path); if (!caption || !text(item.storage_relative_path, 500) || !/^[0-9a-f]{64}$/.test(item.stored_sha256) || !Number.isInteger(item.width) || !Number.isInteger(item.height)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 evidence is invalid."); const relative=item.storage_relative_path; if (relative.includes("\\") || relative.split("/").some((part)=>part===""||part==="."||part==="..")) throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is invalid."); const file=path.resolve(uploadsRoot,...relative.split("/")); if(!file.startsWith(`${uploadsRoot}${path.sep}`))throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is invalid."); let content:Buffer;try{content=await readFile(file);}catch{throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is unavailable.");} if(createHash("sha256").update(content).digest("hex")!==item.stored_sha256)throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is corrupt."); let metadata:{format?:string;width?:number;height?:number};try{metadata=await sharp(content,{failOn:"error"}).metadata();}catch{throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is corrupt.");}if(metadata.format!=="jpeg"||metadata.width!==item.width||metadata.height!==item.height)throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is corrupt.");evidence.push({field:item.field_path,caption,content,width:item.width,height:item.height}); }
  return evidence;
}

async function validatedV7SuppressionEvidence(database: Queryable, row: ReportInstanceRow) {
  const snapshot = row.inspection_snapshot;
  if (!isRecord(snapshot) || !isRecord(snapshot.template) || !isRecord(snapshot.system) || !isRecord(snapshot.system.definition)
    || (snapshot.system.key !== "co2_fire_extinguisher" && snapshot.system.key !== "wet_chemical" && snapshot.system.key !== "fire_alarm_detector" && snapshot.system.key !== "hydrant" && snapshot.system.key !== "hose_reel" && snapshot.system.key !== "automatic_sprinkler")) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence authority is invalid.");
  const adapter = resolveV7EvidenceContract({ systemKey: snapshot.system.key, templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: createHash("sha256").update(canonical(snapshot.system.definition)).digest("hex") });
  const required = adapter?.derivePoorFieldPaths(row.response_payload);
  if (!adapter || !required) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence requirements are invalid.");
  const rows = (await database.query<{ field_path: string; stored_sha256: string; storage_relative_path: string; width: number; height: number }>(`SELECT field_path,stored_sha256,storage_relative_path,width,height FROM staged_inspection_evidence WHERE form_instance_id=$1 AND master_template_version=7 AND status='accepted' ORDER BY field_path,photo_uuid`, [row.form_instance_id])).rows;
  if (rows.length !== required.length || rows.some((item, index) => item.field_path !== required[index])) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is incomplete or mismatched.");
  const uploadsRoot = path.resolve(loadConfig().uploadsPath); const evidence: FinalReportEvidence[] = [];
  for (const item of rows) {
    const caption = adapter.acceptedEvidenceCaption(item.field_path); const relative = item.storage_relative_path;
    if (!caption || !text(relative, 500) || !/^[0-9a-f]{64}$/.test(item.stored_sha256) || !Number.isInteger(item.width) || !Number.isInteger(item.height) || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is invalid.");
    const file = path.resolve(uploadsRoot, ...relative.split("/")); if (!file.startsWith(`${uploadsRoot}${path.sep}`)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is invalid.");
    let content: Buffer; try { content = await readFile(file); } catch { throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is unavailable."); }
    if (createHash("sha256").update(content).digest("hex") !== item.stored_sha256) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is corrupt.");
    let metadata: { format?: string; width?: number; height?: number }; try { metadata = await sharp(content, { failOn: "error" }).metadata(); } catch { throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is corrupt."); }
    if (metadata.format !== "jpeg" || metadata.width !== item.width || metadata.height !== item.height) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is corrupt.");
    evidence.push({ field: item.field_path, caption, content, width: item.width, height: item.height });
  }
  return evidence;
}

function historicalLocation(system: RecordValue, unit: { authorityKey: string; label: string }, instanceKey: string): FinalReportLocation | undefined {
  if (!unit.authorityKey.startsWith("location:") || !Array.isArray(system.locations) || !Array.isArray(system.zones)) return undefined;
  const locationId = unit.authorityKey.slice("location:".length);
  const location = system.locations.find((item) => isRecord(item) && item.id === locationId);
  if (!isRecord(location) || !text(location.displayName, 300) || !(location.zoneId === null || typeof location.zoneId === "string")) return undefined;
  const zone = location.zoneId === null ? undefined : system.zones.find((item) => isRecord(item) && item.id === location.zoneId);
  if (location.zoneId !== null && (!isRecord(zone) || !text(zone.displayName, 200))) return undefined;
  return { locationId, locationLabel: location.displayName, zoneId: location.zoneId, zoneLabel: isRecord(zone) ? zone.displayName as string : null, instanceKey };
}

function instanceMatches(row: ReportInstanceRow, system: RecordValue, authorityKey: string) {
  if (authorityKey === "primary") return row.instance_key === "primary" && row.location_id === null && row.zone_id === null && row.display_sequence === 1;
  const locationId = authorityKey.slice("location:".length);
  // buildJobCompletion has already strictly validated frozen location UUIDs.
  if (!Array.isArray(system.locations)) return false;
  const location = system.locations.find((value) => isRecord(value) && value.id === locationId);
  if (!isRecord(location)) return false;
  const zones = new Map((Array.isArray(system.zones) ? system.zones : []).filter(isRecord).map((zone) => [String(zone.id), Number(zone.sortOrder)]));
  const ordered = system.locations.filter(isRecord).sort((left, right) => {
    const leftZone = typeof left.zoneId === "string" ? zones.get(left.zoneId) : Number.MAX_SAFE_INTEGER;
    const rightZone = typeof right.zoneId === "string" ? zones.get(right.zoneId) : Number.MAX_SAFE_INTEGER;
    return (leftZone ?? Number.MAX_SAFE_INTEGER) - (rightZone ?? Number.MAX_SAFE_INTEGER)
      || Number(left.sortOrder) - Number(right.sortOrder) || String(left.id).localeCompare(String(right.id));
  });
  return row.instance_key === authorityKey && row.location_id === locationId && row.zone_id === (location.zoneId ?? null)
    && row.display_sequence === ordered.findIndex((value) => value.id === locationId) + 1;
}

async function validatedEvidence(rows: ReportInstanceRow[], system: RecordValue) {
  const policy = system.evidencePolicy;
  if (policy === undefined) return [];
  if (!isRecord(policy) || !isRecord(policy.definition) || !isRecord(policy.definition.points) || !text(policy.id, 64)) {
    throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Frozen Automatic Sprinkler evidence requirements are invalid.");
  }
  const required = Object.entries(policy.definition.points).filter(([, point]) => isRecord(point) && point.required === true).map(([field]) => field);
  const uploadsRoot = path.resolve(loadConfig().uploadsPath);
  const evidence: FinalReportEvidence[] = [];
  for (const field of required) {
    const match = rows.filter((row) => row.attachment_field_path === field);
    if (match.length !== 1 || !match[0] || !text(match[0].storage_relative_path, 500) || !text(match[0].stored_sha256, 64)
      || !Number.isInteger(match[0].width) || !Number.isInteger(match[0].height)) {
      throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is unavailable.");
    }
    const relative = match[0].storage_relative_path!;
    if (relative.includes("\\") || relative.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is unavailable.");
    }
    const file = path.resolve(uploadsRoot, ...relative.split("/"));
    if (!file.startsWith(`${uploadsRoot}${path.sep}`)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is unavailable.");
    let content: Buffer;
    try { content = await readFile(file); } catch { throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is unavailable."); }
    if (createHash("sha256").update(content).digest("hex") !== match[0].stored_sha256 || content.length > 2_097_152 || content.length < 4) {
      throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is corrupt.");
    }
    let metadata: { format?: string; width?: number; height?: number };
    try { metadata = await sharp(content, { failOn: "error" }).metadata(); } catch { throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is corrupt."); }
    if (metadata.format !== "jpeg" || metadata.width !== match[0].width || metadata.height !== match[0].height) {
      throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is corrupt.");
    }
    evidence.push({ field, content, width: match[0].width!, height: match[0].height! });
  }
  return evidence;
}

export type FinalReportAccess = "technician" | "manager";

/**
 * Access selection is derived by the authenticated route caller, never from a
 * browser parameter. Content validation below remains identical for both.
 */
export async function loadFinalServiceReport(
  jobId: string,
  database: Queryable,
  access: FinalReportAccess = "technician"
): Promise<FinalServiceReport> {
  const accessClause = access === "manager"
    ? "job.is_sample = false"
    : "job.technician_visible = true AND job.is_sample = false";
  const jobResult = await database.query<ReportJobRow>(`SELECT job.id, job.status, job.configuration_snapshot, job.completed_at, job.completed_by_user_id,
      job.completed_by_display_name, NULL::text AS completed_by_username,
      job.job_reference AS reference, job.title, job.service_date::text AS service_date
    FROM inspection_jobs job
    WHERE job.id = $1 AND job.master_template_version_id IS NOT NULL
      AND ${accessClause}
    LIMIT 1`, [jobId]);
  const job = jobResult.rows[0];
  if (!job) throw new FinalReportError("JOB_NOT_FOUND", 404, "Service visit not found.");
  if (job.status !== "closed" || !job.completed_at || !job.completed_by_display_name) {
    throw new FinalReportError("FINAL_REPORT_NOT_AVAILABLE", 409, "A final report is available only after this service visit is completed.");
  }
  const frozen = isRecord(job.configuration_snapshot) ? job.configuration_snapshot : undefined;
  const frozenCustomer = frozen && isRecord(frozen.customer) ? frozen.customer.displayName : undefined;
  const frozenSite = frozen && isRecord(frozen.site) ? frozen.site.displayName : undefined;
  const customer = requiredText(frozenCustomer, 250, "Completed service visit details are incomplete and cannot be reported.");
  const site = requiredText(frozenSite, 300, "Completed service visit details are incomplete and cannot be reported.");
  const reference = requiredText(job.reference, 250, "Completed service visit details are incomplete and cannot be reported.");
  const serviceDate = requiredText(job.service_date, 10, "Completed service visit details are incomplete and cannot be reported.");
  const rows = (await database.query<ReportInstanceRow>(`SELECT instance.id AS form_instance_id, inspection.system_key, instance.instance_key, instance.zone_id, instance.location_id, instance.display_sequence, instance.client_uuid,
      instance.master_template_version_id, instance.customer_configuration_revision_id,
      instance.evidence_policy_id, instance.evidence_policy_version, instance.evidence_policy_snapshot, instance.evidence_policy_sha256,
      true AS evidence_policy_matches, attachment.field_path AS attachment_field_path, attachment.evidence_policy_id AS attachment_evidence_policy_id,
      attachment.mime_type AS attachment_mime_type, attachment.source_sha256 AS attachment_source_sha256, attachment.stored_sha256 AS attachment_stored_sha256,
      attachment.source_size_bytes AS attachment_source_size_bytes, attachment.stored_size_bytes AS attachment_stored_size_bytes,
      attachment.source_width AS attachment_source_width, attachment.source_height AS attachment_source_height, attachment.width AS attachment_width, attachment.height AS attachment_height,
      instance.inspection_snapshot, instance.response_payload, attachment.stored_sha256, attachment.storage_relative_path, attachment.width, attachment.height
    FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id = instance.inspection_group_id
    LEFT JOIN inspection_attachments attachment ON attachment.form_instance_id = instance.id
    WHERE inspection.job_id = $1 AND instance.status = 'submitted'
    ORDER BY inspection.system_key, instance.display_sequence, attachment.field_path`, [jobId])).rows;
  const completion = buildJobCompletion(job, rows);
  if (!completion.eligible) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required accepted inspection results are incomplete or invalid.");
  const sections: FinalReportSection[] = [];
  for (const completeSystem of completion.systems) {
    if (!supported.has(completeSystem.systemKey)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "The completed service visit contains an unsupported system.");
    const system = expectedSystem(job.configuration_snapshot, completeSystem.systemKey);
    if (!system) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Frozen service configuration is unavailable.");
    for (const unit of completeSystem.units) {
      const matching = rows.filter((row) => row.system_key === completeSystem.systemKey && instanceMatches(row, system, unit.authorityKey));
      const clientUuids = new Set(matching.map((row) => row.client_uuid));
      if (clientUuids.size !== 1 || !validHistoricalUnit(matching[0]!, job, system)) {
        throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, `Required accepted inspection history is unavailable for ${completeSystem.systemLabel}.`);
      }
      const location = historicalLocation(system, unit, matching[0]!.instance_key);
      if (unit.authorityKey.startsWith("location:") && !location) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Frozen report location identity is unavailable.");
      sections.push({ systemKey: completeSystem.systemKey, label: completeSystem.systemLabel, location,
        fields: completeSystem.systemKey === "fire_alarm_detector" && isRecord(matching[0]!.inspection_snapshot) && matching[0]!.inspection_snapshot.schemaVersion === 2 ? fireAlarmV6Fields(matching[0]!.inspection_snapshot, matching[0]!.response_payload) : flatten(matching[0]!.response_payload), evidence: completeSystem.systemKey === "automatic_sprinkler" ? (isRecord(matching[0]!.inspection_snapshot) && matching[0]!.inspection_snapshot.schemaVersion === 2 ? await validatedV7SuppressionEvidence(database, matching[0]!) : await validatedEvidence(matching, system)) : completeSystem.systemKey === "fire_alarm_detector" && isRecord(matching[0]!.inspection_snapshot) && matching[0]!.inspection_snapshot.schemaVersion === 2 ? (matching[0]!.master_template_version_id === "00000000-0000-4000-8000-000000000807" ? await validatedV7SuppressionEvidence(database, matching[0]!) : await validatedFireAlarmV6Evidence(database, matching[0]!)) : (completeSystem.systemKey === "co2_fire_extinguisher" || completeSystem.systemKey === "wet_chemical" || completeSystem.systemKey === "hydrant" || completeSystem.systemKey === "hose_reel") && isRecord(matching[0]!.inspection_snapshot) && matching[0]!.inspection_snapshot.schemaVersion === 2 ? await validatedV7SuppressionEvidence(database, matching[0]!) : [] });
    }
  }
  return { customer, site, serviceDate, jobReference: reference,
    completedAt: job.completed_at instanceof Date ? job.completed_at.toISOString() : job.completed_at!, completedBy: job.completed_by_display_name!,
    systems: completion.systems.map((item) => ({ systemKey: item.systemKey, label: item.systemLabel, status: "Accepted" as const, locations: item.units.map((unit) => unit.label) })), sections };
}

/**
 * PDFKit embeds this SFNT TrueType asset directly.  Do not substitute a
 * browser WOFF/WOFF2 subset here: it can produce PDFs that parse but render
 * as missing-glyph boxes in real viewers.
 */
export const finalReportFontAssetPath = fileURLToPath(new URL("./assets/DejaVuSans.ttf", import.meta.url));
const reportFont = readFileSync(finalReportFontAssetPath);

/** PDFKit embeds a Unicode-capable TrueType font and wraps all business text on A4 pages. */
export async function renderFinalServiceReportPdf(report: FinalServiceReport): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margin: 46, autoFirstPage: true, info: { Title: `Service Report ${report.jobReference}`, Author: "MFE Services Sdn. Bhd." } });
  const chunks: Buffer[] = []; document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  document.registerFont("DejaVuSans", reportFont); document.font("DejaVuSans");
  const header = () => { document.font("DejaVuSans").fontSize(15).text("MFE SERVICES SDN. BHD."); document.fontSize(11).text("Field Service Inspection Report"); document.moveDown(0.7); };
  const pageBreakFor = (height: number) => { if (document.y + height > document.page.height - document.page.margins.bottom) { document.addPage(); header(); } };
  const paragraph = (value: string, options: PDFKit.Mixins.TextOptions = {}) => { const height = document.heightOfString(value, { width: document.page.width - document.page.margins.left - document.page.margins.right, ...options }); pageBreakFor(height); document.text(value, options); };
  header();
  for (const [key, value] of [["Customer", report.customer], ["Site", report.site], ["Service Date", report.serviceDate], ["Job Reference", report.jobReference], ["Service Status", "Completed"], ["Completed Date", report.completedAt], ["Completed By", report.completedBy]]) paragraph(`${key}: ${value}`);
  document.moveDown(0.5); paragraph("Service Summary", { underline: true });
  report.systems.forEach((system) => paragraph(`• ${system.label}: Accepted${system.locations.length > 1 ? ` (${system.locations.join(", ")})` : ""}`, { indent: 10 }));
  for (const section of report.sections) {
    document.moveDown(0.7); paragraph(`${section.label}${section.location ? ` - ${section.location.zoneLabel ? `${section.location.zoneLabel} / ` : ""}${section.location.locationLabel}` : ""}`, { underline: true });
    for (const field of section.fields) paragraph(`${field.label}: ${field.value}`, { indent: Math.min(field.depth, 3) * 14 });
    for (const evidence of section.evidence) { paragraph(`Final evidence included: ${evidence.caption ?? labelFor(evidence.field)}`); pageBreakFor(330); document.image(evidence.content, { fit: [500, 300], align: "center" }); document.moveDown(0.5); }
  }
  document.end(); return done;
}

export function finalReportFilename(report: FinalServiceReport) {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "Service-Report";
  return `Service-Report_${clean(report.jobReference)}_${clean(report.serviceDate)}.pdf`;
}
