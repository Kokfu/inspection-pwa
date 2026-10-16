import * as accepted from "../inspections/acceptedMasterSystemDetail.js";
import { validateStoredFireAlarmDetail } from "../inspections/fireAlarmAccepted.js";
import { validStoredDryWetRiser } from "../inspections/dryWetRiserAccepted.js";
import { validateHydrantHistoricalPayload } from "../sync/hydrantInspectionSync.js";
import { validateAutomaticSprinklerHistoricalPayload } from "../sync/automaticSprinklerInspectionSync.js";
import { validatePortableHistoricalPayload } from "../sync/portableFireExtinguisherSync.js";
import { resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { parseV6EvidenceManifest } from "../inspections/evidence/fireAlarmV6Evidence.js";
import { validateFireAlarmV7AcceptedResponses } from "../sync/fireAlarmV7Acceptance.js";
import { resolveV7EvidenceContract, parseV7EvidenceManifest, v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";

export type R = Record<string, unknown>;
export const record = (v: unknown): v is R => typeof v === "object" && v !== null && !Array.isArray(v);
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class RepairError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
}
export const invalidSource = (): never => { throw new RepairError("REPAIR_SOURCE_INVALID", "Original accepted inspection or evidence is invalid."); };
export type FindingPart = { fieldPath: string; responsePath: string; rowUuid: string | null; result: "not_good" | "poor"; remark: string; caption: string; sectionLabel: string; fieldLabel: string; unit: R | null };

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
  if (system === "portable_fire_extinguisher") {
    if (!validatePortableHistoricalPayload(response,snapshot)) return invalidSource();
    return { parts: [], requiredPaths: [], manifest: [], version, contractSha256: v7EvidenceContractSha256(snapshot.system.definition) };
  }
  if (version === 7) {
    if (!validators[system]?.(row)) return invalidSource();
    if (system === "fire_alarm_detector") {
      if (!validateFireAlarmV7AcceptedResponses(response,snapshot.system.definition)) return invalidSource();
      const controls=resolveFireAlarmV6Controls(snapshot.system.definition,7);
      if (controls.chargerAndBatteries.some(field=>field.result.options.some(option=>option.value==="poor"))) {
        return readHistoricalParts(row,snapshot as R & {system:R},system,version,response,true);
      }
    }
    const suppression = ["co2_fire_extinguisher","wet_chemical","fm200_fire_suppression"].includes(system);
    const contractSha256 = suppression ? v7EvidenceContractSha256(snapshot.system.definition) : snapshot.contractSha256;
    const adapter = resolveV7EvidenceContract({ systemKey: system, templateId: snapshot.template.id, templateVersion: version,
      definition: snapshot.system.definition, contractSha256 });
    const manifest = suppression ? null : adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response);
    const paths = adapter?.derivePoorFieldPaths(response);
    if (!adapter || (!suppression && !manifest) || !paths) return invalidSource();
    const parts: FindingPart[] = [];
    for (const fieldPath of paths) {
      const field = resolveRepairField(system, response, fieldPath);
      if (!field || !["not_good","complete_repair"].includes(String(field.result))) return invalidSource();
      if (field.result !== "not_good") continue;
      const caption = adapter.acceptedEvidenceCaption(fieldPath), ownRemark = adapter.ownPoorRemark(response, fieldPath);
      if (!caption || !ownRemark || typeof field.remark !== "string" || !field.remark.trim()) return invalidSource();
      const remark = field.remark;
      const [sectionLabel,...labels]=caption.split(" - ");
      parts.push({ ...field, fieldPath, result: "not_good", caption, remark,sectionLabel:sectionLabel!,fieldLabel:labels.join(" - ") || caption });
    }
    return { parts, requiredPaths: [...paths], allowedPaths: [...paths,...adapter.derivePhotoFieldPaths(response)!.optional], manifest: manifest ? [...manifest] : null, version, contractSha256: String(contractSha256) };
  }
  return readHistoricalParts(row, snapshot as R & { system: R }, system, version, response);
}

function readHistoricalParts(row: R, snapshot: R & { system: R }, system: string, version: number, response: R, legacyV7 = false) {
  const evidenceRequired = system === "fire_alarm_detector" && (version === 6 || legacyV7);
  let valid = false;
  if (system === "co2_fire_extinguisher") valid = !!accepted.validateAcceptedCo2Detail(row);
  if (system === "wet_chemical") valid = !!accepted.validateAcceptedWetChemicalDetail(row);
  if (system === "hose_reel") valid = !!accepted.validateAcceptedHoseReelDetail(row);
  if (system === "fire_alarm_detector") valid = !!validateStoredFireAlarmDetail(row);
  if (system === "hydrant") valid = validateHydrantHistoricalPayload(response, snapshot);
  if (system === "automatic_sprinkler") valid = validateAutomaticSprinklerHistoricalPayload(response, snapshot);
  if (system === "dry_wet_riser") valid = validStoredDryWetRiser(response, snapshot.system, snapshot.system.systemConfiguration);
  if (!valid || !Number.isSafeInteger(version) || version < 1 || version > (legacyV7 ? 7 : 6)) return invalidSource();
  if (evidenceRequired) {
    // The legacy accepted-detail reader checks result groups; also check its independent
    // scalar detector rows here. Never reinterpret a V6 detector as a V7 multiselect.
    const ids=new Set<string>();
    for(const collection of ["primaryDeviceRows","secondaryAlarmDeviceRows"]) {
      const rows=response[collection];if(!Array.isArray(rows)||rows.length>250||collection==="primaryDeviceRows"&&rows.length<1)return invalidSource();
      for(const [index,item] of rows.entries()) {
        if(!record(item)||typeof item.rowUuid!=="string"||!uuid.test(item.rowUuid)||ids.has(item.rowUuid)||item.displaySequence!==index+1
          ||typeof item.location!=="string"||!item.location.trim()||item.location.length>300||typeof item.remarks!=="string"||item.remarks.length>2000)return invalidSource();
        ids.add(item.rowUuid);
        if(collection==="primaryDeviceRows"&&(typeof item.alarmZone!=="string"||!item.alarmZone.trim()||item.alarmZone.length>200
          ||["manualCallPoint","flowSwitch","heatDetector","smokeDetector"].some(k=>typeof item[k]!=="string"||!["normal","test","isolation"].includes(item[k] as string))))return invalidSource();
      }
    }
  }
  const parts: FindingPart[] = [];
  const historicLabels = (path: string, canonical: string) => {
    const responseGroup=path.split(".")[0]!, key=path.split(".").at(-1)==="result" ? path.split(".").at(-2)! : path.split(".").at(-1)!;
    const map=rowMappings[system];
    const wire=map && Object.entries(map.keys).find(([,responseKey])=>responseKey===key)?.[0] || key;
    const definition=snapshot.system.definition;
    if (record(definition) && Array.isArray(definition.sections)) for (const section of definition.sections) {
      if (!record(section) || !Array.isArray(section.blocks)) continue;
      for(const block of section.blocks) {
        if(!record(block))continue;
        const fields=Array.isArray(block.items)?block.items:Array.isArray(block.columns)?block.columns:[];
        const match=fields.find(f=>record(f)&&f.key===wire&&(f.control==="good_poor"||record(f.result)));
        if(record(match)&&typeof match.label==="string"&&typeof section.title==="string")return {sectionLabel:section.title,fieldLabel:match.label,caption:`${section.title} - ${match.label}`};
      }
    }
    // Labels only; candidates were already selected by the version-specific result reader.
    return {sectionLabel:responseGroup,fieldLabel:key,caption:canonical};
  };
  const add = (path: string, result: unknown, remark: unknown, rowUuid: string | null = null, unit: R | null = null, canonical = path) => {
    if (result !== "poor") return;
    if (typeof remark !== "string" || evidenceRequired && !remark.trim()) return invalidSource();
    parts.push({ fieldPath: canonical, responsePath: path, rowUuid, unit, result: "poor", remark, ...historicLabels(path,canonical) });
  };
  // These groups are defined by historical readers above, not inferred from arbitrary payload keys.
  const groups = groupedSystems.has(system) ? ["chargerAndBatteries","physicalOutlook","mainFunctionKeys"]
    : system === "hydrant" ? [] : system === "hose_reel" ? ["checklist","measurements"] : ["waterTank","pumpHouse","testRunFirePump","mainAlarmValve","measurements"];
  for (const group of groups) {
    if (!record(response[group])) continue;
    for (const [key, field] of Object.entries(response[group] as R)) {
      if (!record(field)) continue;
      const staticPrefix: Record<string,string> = { chargerAndBatteries: "charger_batteries.charger_battery_checks", physicalOutlook: "physical_outlook.physical_outlook_checks", mainFunctionKeys: "main_function_key.function_checks" };
      add(`${group}.${key}.result`, field.result, field.remarks, null, null, staticPrefix[group] ? `${staticPrefix[group]}.${key}` : `${group}.${key}.result`);
    }
  }
  const map = rowMappings[system];
  if (map && Array.isArray(response[map.collection])) {
    const ids = new Set<string>();
    for (const row of response[map.collection] as unknown[]) {
      if (!record(row) || typeof row.rowUuid !== "string" || !uuid.test(row.rowUuid) || ids.has(row.rowUuid)) return invalidSource();
      ids.add(row.rowUuid);
      for (const [wire,key] of Object.entries(map.keys)) add(`${map.collection}.${row.rowUuid}.${key}`, row[key], record(row.fieldRemarks) ? row.fieldRemarks[key] : row.remarks, row.rowUuid, row,
        evidenceRequired ? `${map.prefix}.${row.rowUuid}.${wire}` : `${map.collection}.${row.rowUuid}.${key}`);
    }
  }
  let manifest = evidenceRequired && !legacyV7 ? parseV6EvidenceManifest(snapshot.evidenceManifest) : [];
  if (legacyV7) {
    const adapter=resolveV7EvidenceContract({systemKey:system,templateId:(snapshot.template as R).id,templateVersion:version,
      definition:snapshot.system.definition,contractSha256:snapshot.contractSha256});
    if (!adapter) return invalidSource();
    // Legacy V7 Poor fields require photos; Good/Not Relevant had no optional-photo slot.
    // Reuse strict V7 UUID/path/hash/uniqueness parsing with this frozen result scope.
    manifest=parseV7EvidenceManifest(snapshot.evidenceManifest,{...adapter,
      derivePhotoFieldPaths:()=>({required:parts.map(p=>p.fieldPath),optional:[]})},response);
  }
  if (!Array.isArray(manifest) || manifest.some(v => !record(v) || typeof v.photoUuid !== "string" || !uuid.test(v.photoUuid) || typeof v.fieldPath !== "string" || typeof v.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(v.sourceSha256))) return invalidSource();
  if (evidenceRequired && (manifest.length !== parts.length || parts.some(p => manifest.filter(v => (v as R).fieldPath === p.fieldPath).length !== 1))) return invalidSource();
  return { parts, requiredPaths: evidenceRequired ? parts.map(p => p.fieldPath) : [],
    manifest: manifest as Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>, version, contractSha256: v7EvidenceContractSha256(snapshot.system.definition) };
}
