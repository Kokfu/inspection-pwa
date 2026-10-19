import * as accepted from "../inspections/acceptedMasterSystemDetail.js";
import { validateStoredFireAlarmDetail } from "../inspections/fireAlarmAccepted.js";




import { resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";

import { validateFireAlarmV7AcceptedResponses } from "../sync/fireAlarmV7Acceptance.js";
import { resolveV7EvidenceContract, parseV7EvidenceManifest, v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";

export type R = Record<string, unknown>;
export const record = (v: unknown): v is R => typeof v === "object" && v !== null && !Array.isArray(v);
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class RepairError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
}
export const invalidSource = (): never => { throw new RepairError("REPAIR_SOURCE_INVALID", "Original accepted inspection or evidence is invalid."); };
export type FindingPart = { fieldPath: string; responsePath: string; rowUuid: string | null; result: "good" | "not_good" | "na"; remark: string; caption: string; sectionLabel: string; fieldLabel: string; unit: R | null };

const groupedSystems = new Set(["co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression", "fire_alarm_detector"]);
const staticGroups: R = { charger_batteries: "chargerAndBatteries", physical_outlook: "physicalOutlook", main_function_key: "mainFunctionKeys" };
const rowMappings: Record<string, { prefix: string; collection: string; keys: Record<string, string> }> = {
  fire_alarm_detector: { prefix: "alarm_devices.alarm_device_rows.rows", collection: "secondaryAlarmDeviceRows", keys: { alarm_bell: "alarmBell", manual_call_point: "manualCallPoint" } },
  hydrant: { prefix: "hydrant_set.hydrant_rows.rows", collection: "rows", keys: { canvas_hose_1: "canvasHose1Result", canvas_hose_2: "canvasHose2Result", diffuser_nozzle: "diffuserNozzleResult", landing_valve: "landingValveResult", landing_valve_handle: "landingValveHandleResult", hose_cabinet: "hoseCabinetResult", key_lock: "keyLockResult" } },
  hose_reel: { prefix: "hose_reel_drum.hose_reel_rows.rows", collection: "rows", keys: { drum: "drumResult", hose: "hoseResult", nozzle: "nozzleResult", valve: "valveResult", nozzle_box: "nozzleBoxResult" } },
  dry_wet_riser: { prefix: "riser_outlet.riser_outlet_rows.rows", collection: "riserOutlets", keys: Object.fromEntries(["canvasHoseAt2Result", "diffuserNozzleResult", "landingValveResult", "crandleResult", "doorResult"].map(k => [k,k])) },
  smoke_ventilation: { prefix: "fan_schedule.fan_schedule_rows.rows", collection: "rows", keys: { auto: "autoResult", manual: "manualResult" } },
  fire_intercom: { prefix: "station_schedule.station_schedule_rows.rows", collection: "rows", keys: { condition: "conditionResult" } },
  fire_rated_roller_shutter: { prefix: "roller_shutter_schedule.roller_shutter_schedule_rows.rows", collection: "rows", keys: { auto_alarm_mode: "autoAlarmModeResult", manual_mode: "manualModeResult" } }
};
const flatPrefixes: Record<string, string> = { hose_reel: "hose_reel", automatic_sprinkler: "automatic_sprinkler", dry_wet_riser: "dry_wet_riser", smoke_ventilation: "smoke_ventilation" };
/** Explicit canonical-to-response mapping. Never search recursively for result-looking strings. */
export function resolveRepairField(system: string, response: R, path: string) {
  const rowMap = rowMappings[system];
  if (rowMap && path.startsWith(`${rowMap.prefix}.`)) {
    const tail = path.slice(rowMap.prefix.length + 1).split(".");
    if (tail.length !== 2 || !uuid.test(tail[0]!) || !Object.hasOwn(rowMap.keys, tail[1]!)) return undefined;
    const rows = response[rowMap.collection];
    const matches = Array.isArray(rows) ? rows.filter(v => record(v) && v.rowUuid === tail[0]) : [];
    if (matches.length !== 1 || !record(matches[0])) return undefined;
    const row = matches[0], key = rowMap.keys[tail[1]!]!;
    return { result: row[key], remark: record(row.fieldRemarks) ? row.fieldRemarks[key] : row.remarks,
      responsePath: `${rowMap.collection}.${tail[0]}.${key}`, rowUuid: tail[0]!, unit: row };
  }
  const segments = path.split(".");
  let group: unknown;
  const blocks: Record<string,string> = { charger_batteries: "charger_battery_checks", physical_outlook: "physical_outlook_checks", main_function_key: "function_checks" };
  if (groupedSystems.has(system) && segments.length === 3 && blocks[segments[0]!] === segments[1]) group = staticGroups[segments[0]!];
  const prefix = flatPrefixes[system];
  if (prefix && segments.length === 2) group = segments[0] === `${prefix}_checks` ? "checklist" : segments[0] === `${prefix}_measurements` ? "measurements" : undefined;
  if (typeof group !== "string" || !record(response[group])) return undefined;
  const key = segments.at(-1)!; const field = (response[group] as R)[key];
  return record(field) ? { result: field.result, remark: field.remarks, responsePath: `${group}.${key}.result`, rowUuid: null, unit: null } : undefined;
}

const validators: Record<string, (row: R) => unknown> = {
  co2_fire_extinguisher: accepted.validateAcceptedCo2Detail, wet_chemical: accepted.validateAcceptedWetChemicalDetail,
  fm200_fire_suppression: accepted.validateAcceptedFm200Detail, fire_alarm_detector: validateStoredFireAlarmDetail,
  hydrant: accepted.validateAcceptedHydrantV7Detail, hose_reel: accepted.validateAcceptedHoseReelV7Detail,
  automatic_sprinkler: accepted.validateAcceptedAutomaticSprinklerV7Detail, dry_wet_riser: accepted.validateAcceptedDryWetRiserV7Detail,
  smoke_ventilation: accepted.validateAcceptedSmokeVentilationV7Detail, fire_intercom: accepted.validateAcceptedFireIntercomV7Detail,
  fire_rated_roller_shutter: accepted.validateAcceptedFireRatedRollerShutterV7Detail
};

export function isLegacyFireAlarmCatalog(row: R): boolean {
  const snapshot = row.inspectionSnapshot;
  return row.systemKey === "fire_alarm_detector" && record(snapshot) && record(snapshot.template) && snapshot.template.version === 7
    && record(snapshot.system) && resolveFireAlarmV6Controls(snapshot.system.definition, 7).chargerAndBatteries
      .some(field => field.result.options.some(option => option.value === "poor"));
}

/** Validate the frozen contract and manifest before translating its result names
 * for the new catalog. Stored responses, detector states and paths stay intact. */
export function legacyFireAlarmCatalog(row: R, response: R = row.responses as R) {
  if (!validateStoredFireAlarmDetail(row) || !record(row.inspectionSnapshot) || !record(row.inspectionSnapshot.system)
    || !record(row.inspectionSnapshot.template) || !record(row.responses)) return invalidSource();
  const snapshot = row.inspectionSnapshot, system = snapshot.system as R;
  const template = snapshot.template as R, definition = system.definition as R, original = row.responses;
  if (!isLegacyFireAlarmCatalog(row) || !validateFireAlarmV7AcceptedResponses(original, definition)) return invalidSource();
  const contractSha256 = v7EvidenceContractSha256(definition);
  const adapter = resolveV7EvidenceContract({ systemKey: row.systemKey, templateId: template.id, templateVersion: 7,
    definition, contractSha256 });
  if (!adapter || !Array.isArray(definition.sections)) return invalidSource();
  const paths: string[] = [];
  for (const section of definition.sections) {
    if (!record(section) || !Array.isArray(section.blocks)) return invalidSource();
    for (const block of section.blocks) {
      if (!record(block) || block.type !== "checklist") continue;
      if (!Array.isArray(block.items)) return invalidSource();
      for (const item of block.items) if (record(item) && item.control === "good_poor") paths.push(`${section.key}.${block.key}.${item.key}`);
    }
  }
  if (!Array.isArray(original.secondaryAlarmDeviceRows)) return invalidSource();
  for (const unit of original.secondaryAlarmDeviceRows) {
    if (!record(unit) || typeof unit.rowUuid !== "string" || !uuid.test(unit.rowUuid)) return invalidSource();
    for (const key of Object.keys(rowMappings.fire_alarm_detector!.keys)) paths.push(`${rowMappings.fire_alarm_detector!.prefix}.${unit.rowUuid}.${key}`);
  }
  const readParts = (values: R): FindingPart[] => paths.map(fieldPath => {
    const field = resolveRepairField("fire_alarm_detector", values, fieldPath), caption = adapter.acceptedEvidenceCaption(fieldPath);
    if (!field || !caption || !["good", "poor", "not_relevant"].includes(String(field.result))
      || field.remark !== undefined && typeof field.remark !== "string"
      || field.result === "poor" && (typeof field.remark !== "string" || !field.remark.trim())) return invalidSource();
    const result = field.result === "poor" ? "not_good" : field.result === "not_relevant" ? "na" : "good";
    const [sectionLabel, ...labels] = caption.split(" - ");
    return { ...field, fieldPath, result, remark: typeof field.remark === "string" ? field.remark : "", caption,
      sectionLabel: sectionLabel!, fieldLabel: labels.join(" - ") || caption };
  });
  const originalParts = readParts(original);
  const requiredPaths = originalParts.filter(part => part.result === "not_good").map(part => part.fieldPath);
  // The frozen legacy contract required one photo per Poor field and had no
  // optional-photo slot. Keep that exact scope when parsing its V7 manifest.
  const manifest = parseV7EvidenceManifest(snapshot.evidenceManifest, { ...adapter,
    derivePhotoFieldPaths: () => ({ required: requiredPaths, optional: [] }) }, original);
  if (!manifest) return invalidSource();
  return { parts: response === original ? originalParts : readParts(response), requiredPaths,
    allowedPaths: requiredPaths, manifest: [...manifest], version: 7, contractSha256 };
}
export function readFindingParts(row: R): { parts: FindingPart[]; requiredPaths: string[]; allowedPaths?: string[]; manifest: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }> | null; version: number; contractSha256: string } {
  const snapshot = row.inspectionSnapshot;
  if (!record(snapshot) || !record(snapshot.template) || !record(snapshot.system) || !record(row.responses)
    || !record(snapshot.job) || snapshot.job.id !== row.jobId || snapshot.template.id !== row.templateId
    || !record(snapshot.configuration) || snapshot.configuration.revisionId !== row.configurationRevisionId
    || row.status !== "submitted" || !uuid.test(String(row.serverFormInstanceId)) || !uuid.test(String(row.clientUuid))) return invalidSource();
  const canonicalTime = (value: unknown, micro = false) => typeof value === "string" && (micro ? /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/ : /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/).test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === (micro ? `${value.slice(0,23)}Z` : value);
  if (!canonicalTime(row.performedAt,true) || !canonicalTime(row.receivedAt,true) || !canonicalTime(snapshot.acceptedAt)
    || snapshot.job.reference !== row.jobReference || snapshot.job.title !== row.jobTitle || snapshot.template.code !== "MFE-FSSR"
    || !Number.isSafeInteger(snapshot.template.version) || !uuid.test(String(row.jobId))) return invalidSource();
  const system = String(row.systemKey), version = Number(snapshot.template.version), response = row.responses;
  if (version !== 7 || !validators[system]) return invalidSource();
  if (version === 7) {
    if (!validators[system]?.(row)) return invalidSource();
    if (system === "fire_alarm_detector") {
      if (!validateFireAlarmV7AcceptedResponses(response,snapshot.system.definition)) return invalidSource();
      const controls=resolveFireAlarmV6Controls(snapshot.system.definition,7);
      if (controls.chargerAndBatteries.some(field=>field.result.options.some(option=>option.value==="poor"))) {
        return legacyFireAlarmCatalog(row);
      }
    }
    const suppression = ["co2_fire_extinguisher","wet_chemical","fm200_fire_suppression"].includes(system);
    const contractSha256 = suppression ? v7EvidenceContractSha256(snapshot.system.definition) : snapshot.contractSha256;
    const adapter = resolveV7EvidenceContract({ systemKey: system, templateId: snapshot.template.id, templateVersion: version,
      definition: snapshot.system.definition, contractSha256 });
    const manifest = suppression ? null : adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response);
    const photoPaths = adapter?.derivePhotoFieldPaths(response);
    const paths = photoPaths ? [...photoPaths.required, ...photoPaths.optional] : undefined;
    if (!adapter || (!suppression && !manifest) || !paths) return invalidSource();
    const parts: FindingPart[] = [];
    for (const fieldPath of paths) {
      const field = resolveRepairField(system, response, fieldPath);
      if (!field) return invalidSource();
      if (field.result === "complete_repair") continue;
      if (!["good", "not_good", "na"].includes(String(field.result))) return invalidSource();
      const caption = adapter.acceptedEvidenceCaption(fieldPath), ownRemark = adapter.ownPoorRemark(response, fieldPath);
      if (!caption || field.result === "not_good" && !ownRemark) return invalidSource();
      if (field.remark !== undefined && typeof field.remark !== "string") return invalidSource();
      const remark = typeof field.remark === "string" ? field.remark : "";
      const [sectionLabel,...labels]=caption.split(" - ");
      parts.push({ ...field, fieldPath, result: field.result as FindingPart["result"], caption, remark,sectionLabel:sectionLabel!,fieldLabel:labels.join(" - ") || caption });
    }
    return { parts, requiredPaths: [...photoPaths!.required], allowedPaths: [...paths], manifest: manifest ? [...manifest] : null, version, contractSha256: String(contractSha256) };
  }
  return invalidSource();
}
