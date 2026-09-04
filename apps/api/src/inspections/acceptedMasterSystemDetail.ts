import { resolveHoseReelControls } from "./templates/definitionControls.js";
import { resolveCo2Controls } from "./templates/co2DefinitionControls.js";
import { validateHoseReelSubmission } from "../sync/masterSystemInspectionSync.js";
import { validateCo2Responses } from "../sync/co2FormInstanceSync.js";
import { parseV7EvidenceManifest, resolveV7EvidenceContract } from "./evidence/v7EvidenceContracts.js";

type R = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rec = (value: unknown): value is R => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: R, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value: unknown, maximum: number) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const acceptedRowKeys = ["clientUuid", "serverFormInstanceId", "jobId", "jobReference", "jobTitle", "customerName", "systemKey", "instanceKey", "zoneId", "locationId", "displaySequence", "status", "performedAt", "receivedAt", "templateId", "configurationRevisionId", "inspectionSnapshot", "responses", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername"];
const canonicalMillis = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const canonicalMicros = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value)) return false;
  const millis = `${value.slice(0, 23)}Z`;
  return !Number.isNaN(Date.parse(millis)) && new Date(millis).toISOString() === millis;
};
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : rec(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

function identity(row: R) {
  return exact(row, acceptedRowKeys) && typeof row.clientUuid === "string" && uuid.test(row.clientUuid)
    && typeof row.serverFormInstanceId === "string" && uuid.test(row.serverFormInstanceId)
    && typeof row.jobId === "string" && uuid.test(row.jobId)
    && text(row.jobReference, 250) && text(row.jobTitle, 300) && text(row.customerName, 250)
    && row.status === "submitted" && canonicalMicros(row.performedAt) && canonicalMicros(row.receivedAt)
    && text(row.syncedByUsername, 160)
    && (row.deviceReportedCreatorUsername === null || text(row.deviceReportedCreatorUsername, 160))
    && (row.verifiedOriginalCreatorUsername === null || text(row.verifiedOriginalCreatorUsername, 160));
}

function snapshotBase(value: unknown): (R & { job: R; template: R; configuration: R; system: R }) | undefined {
  if (!rec(value) || !exact(value, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system"]) || value.schemaVersion !== 1
    || !canonicalMillis(value.acceptedAt)
    || !rec(value.job) || !exact(value.job, ["id", "reference", "title"]) || typeof value.job.id !== "string" || !uuid.test(value.job.id)
    || !text(value.job.reference, 250) || !text(value.job.title, 300)
    || !rec(value.customer) || !exact(value.customer, ["id", "code", "displayName"])
    || typeof value.customer.id !== "string" || !uuid.test(value.customer.id) || !text(value.customer.code, 100) || !text(value.customer.displayName, 250)
    || !rec(value.template) || !exact(value.template, ["id", "code", "version"])
    || typeof value.template.id !== "string" || !uuid.test(value.template.id) || value.template.code !== "MFE-FSSR"
    || !Number.isSafeInteger(value.template.version) || Number(value.template.version) < 1
    || !rec(value.configuration) || !exact(value.configuration, ["revisionId", "revisionNumber"])
    || typeof value.configuration.revisionId !== "string" || !uuid.test(value.configuration.revisionId)
    || !Number.isSafeInteger(value.configuration.revisionNumber) || Number(value.configuration.revisionNumber) < 1
    || !rec(value.system)) return undefined;
  return value as R & { job: R; template: R; configuration: R; system: R };
}

export function validateAcceptedHoseReelDetail(row: R) {
  const snapshot = snapshotBase(row.inspectionSnapshot);
  if (!identity(row) || row.systemKey !== "hose_reel" || row.instanceKey !== "primary" || row.zoneId !== null
    || row.locationId !== null || row.displaySequence !== 1 || !snapshot || !rec(row.responses)
    || snapshot.job.id !== row.jobId || snapshot.system.systemKey !== "hose_reel" || snapshot.system.definitionStatus !== "confirmed"
    || snapshot.template.id !== row.templateId || snapshot.configuration.revisionId !== row.configurationRevisionId) return undefined;
  try {
    const controls = resolveHoseReelControls(snapshot.system.definition, "MFE-FSSR", snapshot.template.version as number);
    if (canonical(snapshot.system.resolvedControls) !== canonical(controls) || !validateHoseReelSubmission(row.responses, controls)) return undefined;
    return { snapshot, controls };
  } catch { return undefined; }
}

/** Read-only report adapter for an already accepted historical Hose Reel payload. */
export function validateHoseReelHistoricalPayload(snapshotValue: unknown, responseValue: unknown) {
  const snapshot = snapshotBase(snapshotValue);
  if (!snapshot || !rec(responseValue) || snapshot.system.systemKey !== "hose_reel") return false;
  try {
    const controls = resolveHoseReelControls(snapshot.system.definition, "MFE-FSSR", snapshot.template.version as number);
    return canonical(snapshot.system.resolvedControls) === canonical(controls)
      && validateHoseReelSubmission(responseValue, controls);
  } catch { return false; }
}

function validateAcceptedSuppressionDetail(row: R, expectedSystemKey: "co2_fire_extinguisher" | "wet_chemical") {
  if (!identity(row) || row.systemKey !== expectedSystemKey || typeof row.locationId !== "string" || !uuid.test(row.locationId)
    || !(row.zoneId === null || typeof row.zoneId === "string" && uuid.test(row.zoneId))
    || row.instanceKey !== `location:${row.locationId}` || !Number.isSafeInteger(row.displaySequence) || Number(row.displaySequence) < 1
    || !rec(row.inspectionSnapshot) || !exact(row.inspectionSnapshot, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system", "instance"])
    || !canonicalMillis(row.inspectionSnapshot.acceptedAt)
    || !rec(row.inspectionSnapshot.job) || !exact(row.inspectionSnapshot.job, ["id", "reference", "title"])
    || row.inspectionSnapshot.job.id !== row.jobId || !text(row.inspectionSnapshot.job.reference, 250) || !text(row.inspectionSnapshot.job.title, 300)
    || !rec(row.inspectionSnapshot.customer) || !exact(row.inspectionSnapshot.customer, ["id", "code", "displayName"])
    || typeof row.inspectionSnapshot.customer.id !== "string" || !uuid.test(row.inspectionSnapshot.customer.id)
    || !text(row.inspectionSnapshot.customer.code, 100) || !text(row.inspectionSnapshot.customer.displayName, 250)
    || !rec(row.inspectionSnapshot.template) || !rec(row.inspectionSnapshot.configuration)
    || !rec(row.inspectionSnapshot.system) || !rec(row.inspectionSnapshot.instance) || !rec(row.responses)) return undefined;
  const snapshot = row.inspectionSnapshot;
  const template = snapshot.template as R, configuration = snapshot.configuration as R;
  const system = snapshot.system as R, instance = snapshot.instance as R;
  if (!exact(template, ["id", "code", "version"]) || template.id !== row.templateId || template.code !== "MFE-FSSR"
    || !Number.isSafeInteger(template.version) || Number(template.version) < 1
    || !exact(configuration, ["revisionId", "revisionNumber"]) || configuration.revisionId !== row.configurationRevisionId
    || system.key !== expectedSystemKey || system.repetitionMode !== "per_location"
    || !exact(instance, ["instanceKey", "displaySequence", "zone", "location"])
    || instance.instanceKey !== row.instanceKey || instance.displaySequence !== row.displaySequence
    || !rec(instance.location) || instance.location.id !== row.locationId
    || (row.zoneId === null ? instance.zone !== null : !rec(instance.zone) || instance.zone.id !== row.zoneId)
    || row.inspectionSnapshot.schemaVersion !== (template.version === 7 ? 2 : 1)) return undefined;
  try {
    const controls = resolveCo2Controls(system.definition, "MFE-FSSR", template.version as number);
    if (controls.source.systemKey !== expectedSystemKey || canonical(system.resolvedControls) !== canonical(controls)
      || !validateCo2Responses(row.responses, controls)) return undefined;
    return { snapshot, controls };
  } catch { return undefined; }
}

export function validateAcceptedCo2Detail(row: R) {
  return validateAcceptedSuppressionDetail(row, "co2_fire_extinguisher");
}

export function validateAcceptedWetChemicalDetail(row: R) {
  return validateAcceptedSuppressionDetail(row, "wet_chemical");
}

/**
 * V7 Hydrant snapshots intentionally have a different, frozen shape from the
 * V1-V6 Hydrant snapshot.  Keep this reader separate so accepting the V7
 * `instance` and `evidenceManifest` keys can never broaden the historical
 * validator.
 */
export function validateAcceptedHydrantV7Detail(row: R) {
  if (!identity(row) || row.systemKey !== "hydrant" || row.instanceKey !== "primary"
    || row.zoneId !== null || row.locationId !== null || row.displaySequence !== 1
    || !rec(row.inspectionSnapshot) || !rec(row.responses)) return undefined;
  const snapshot = row.inspectionSnapshot;
  if (!exact(snapshot, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system", "contractSha256", "instance", "evidenceManifest"])
    || snapshot.schemaVersion !== 2 || !canonicalMillis(snapshot.acceptedAt)
    || !rec(snapshot.job) || !exact(snapshot.job, ["id", "reference", "title"]) || snapshot.job.id !== row.jobId
    || !text(snapshot.job.reference, 250) || !text(snapshot.job.title, 300)
    || !rec(snapshot.customer) || !exact(snapshot.customer, ["id", "code", "displayName"])
    || typeof snapshot.customer.id !== "string" || !uuid.test(snapshot.customer.id) || !text(snapshot.customer.code, 100) || !text(snapshot.customer.displayName, 250)
    || !rec(snapshot.configuration) || !exact(snapshot.configuration, ["revisionId", "revisionNumber"]) || snapshot.configuration.revisionId !== row.configurationRevisionId
    || typeof snapshot.configuration.revisionId !== "string" || !uuid.test(snapshot.configuration.revisionId) || !Number.isSafeInteger(snapshot.configuration.revisionNumber) || Number(snapshot.configuration.revisionNumber) < 1
    || !rec(snapshot.template) || !exact(snapshot.template, ["id", "code", "version"]) || snapshot.template.id !== row.templateId || snapshot.template.code !== "MFE-FSSR" || snapshot.template.version !== 7
    || !rec(snapshot.system) || snapshot.system.key !== "hydrant" || snapshot.system.systemKey !== "hydrant" || snapshot.system.definitionStatus !== "confirmed" || snapshot.system.repetitionMode !== "single_with_repeatable_rows" || !rec(snapshot.system.definition)
    || !rec(snapshot.instance) || !exact(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"]) || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
    || typeof snapshot.contractSha256 !== "string" || !/^[0-9a-f]{64}$/.test(snapshot.contractSha256)) return undefined;
  const response = row.responses;
  const responseKeys = ["schemaVersion", "hydrantType", "rows", "comments"];
  const rowKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "locationText", "canvasHose1Result", "canvasHose2Result", "diffuserNozzleResult", "landingValveResult", "landingValveHandleResult", "hoseCabinetResult", "keyLockResult", "remarks", "fieldRemarks", "sortOrder"];
  const resultKeys = ["canvasHose1Result", "canvasHose2Result", "diffuserNozzleResult", "landingValveResult", "landingValveHandleResult", "hoseCabinetResult", "keyLockResult"];
  if (!exact(response, responseKeys) || response.schemaVersion !== 1 || !["pressurize", "meter", "public"].includes(String(response.hydrantType)) || typeof response.comments !== "string" || response.comments.length > 4000
    || !Array.isArray(response.rows) || response.rows.length < 1 || response.rows.length > 250) return undefined;
  const rowIds = new Set<string>();
  for (const [index, item] of response.rows.entries()) {
    if (!rec(item) || !exact(item, rowKeys) || typeof item.rowUuid !== "string" || !uuid.test(item.rowUuid) || rowIds.has(item.rowUuid)
      || item.sortOrder !== index + 1 || !text(item.locationText, 300) || typeof item.assetReference !== "string" || item.assetReference.length > 200 || typeof item.remarks !== "string" || item.remarks.length > 2000
      || !rec(item.fieldRemarks) || Object.keys(item.fieldRemarks).some((key) => !resultKeys.includes(key)) || Object.values(item.fieldRemarks).some((value) => typeof value !== "string" || value.length > 2000)) return undefined;
    if (item.source === "configured") {
      if (typeof item.configuredLocationId !== "string" || !uuid.test(item.configuredLocationId) || !Number.isSafeInteger(item.configuredRowOrdinal) || Number(item.configuredRowOrdinal) < 1) return undefined;
    } else if (item.source !== "technician" || item.configuredLocationId !== null || item.configuredRowOrdinal !== null || item.zoneSnapshot !== null || item.locationSnapshot !== null) return undefined;
    rowIds.add(item.rowUuid);
  }
  const adapter = resolveV7EvidenceContract({ systemKey: "hydrant", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
  if (!adapter || !parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response)) return undefined;
  return { snapshot, adapter };
}

/**
 * Hose Reel V7 has a frozen evidence manifest and a schema-2 response that
 * the V1-V6 reader must never learn to accept.  Re-derive the adapter from
 * the stored definition, then re-parse that manifest against the stored
 * response before exposing accepted authority.
 */
export function validateAcceptedHoseReelV7Detail(row: R) {
  if (!identity(row) || row.systemKey !== "hose_reel" || row.instanceKey !== "primary"
    || row.zoneId !== null || row.locationId !== null || row.displaySequence !== 1
    || !rec(row.inspectionSnapshot) || !rec(row.responses)) return undefined;
  const snapshot = row.inspectionSnapshot;
  if (!exact(snapshot, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system", "contractSha256", "instance", "evidenceManifest"])
    || snapshot.schemaVersion !== 2 || !canonicalMillis(snapshot.acceptedAt)
    || !rec(snapshot.job) || !exact(snapshot.job, ["id", "reference", "title"]) || snapshot.job.id !== row.jobId
    || !text(snapshot.job.reference, 250) || !text(snapshot.job.title, 300)
    || !rec(snapshot.customer) || !exact(snapshot.customer, ["id", "code", "displayName"])
    || typeof snapshot.customer.id !== "string" || !uuid.test(snapshot.customer.id) || !text(snapshot.customer.code, 100) || !text(snapshot.customer.displayName, 250)
    || !rec(snapshot.configuration) || !exact(snapshot.configuration, ["revisionId", "revisionNumber"]) || snapshot.configuration.revisionId !== row.configurationRevisionId
    || typeof snapshot.configuration.revisionId !== "string" || !uuid.test(snapshot.configuration.revisionId) || !Number.isSafeInteger(snapshot.configuration.revisionNumber) || Number(snapshot.configuration.revisionNumber) < 1
    || !rec(snapshot.template) || !exact(snapshot.template, ["id", "code", "version"]) || snapshot.template.id !== row.templateId || snapshot.template.code !== "MFE-FSSR" || snapshot.template.version !== 7
    || !rec(snapshot.system) || snapshot.system.key !== "hose_reel" || snapshot.system.systemKey !== "hose_reel" || snapshot.system.definitionStatus !== "confirmed" || snapshot.system.repetitionMode !== "single_with_repeatable_rows" || !rec(snapshot.system.definition)
    || !rec(snapshot.instance) || !exact(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"]) || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
    || typeof snapshot.contractSha256 !== "string" || !/^[0-9a-f]{64}$/.test(snapshot.contractSha256)) return undefined;
  const response = row.responses;
  const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "standby_pump_service_items", "charger_power_failure_alarm", "battery_serviceable", "pump_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions", "trfp_duty_pump", "trfp_standby_pump"];
  const rowKeys = ["rowUuid", "source", "configuredLocationId", "zoneSnapshot", "locationSnapshot", "locationText", "assetReference", "sortOrder", "drumResult", "hoseResult", "nozzleResult", "valveResult", "nozzleBoxResult", "remarks", "fieldRemarks"];
  const rowResultKeys = ["drumResult", "hoseResult", "nozzleResult", "valveResult", "nozzleBoxResult"];
  if (!exact(response, ["schemaVersion", "checklist", "measurements", "drumTypes", "rows", "comments"]) || response.schemaVersion !== 2
    || !rec(response.checklist) || !exact(response.checklist, checklistKeys) || !rec(response.measurements)
    || !exact(response.measurements, ["jockey_pump_pressure", "standby_pump_cut_in"]) || !rec(response.drumTypes)
    || !exact(response.drumTypes, ["swing", "fixed"]) || typeof response.drumTypes.swing !== "boolean" || typeof response.drumTypes.fixed !== "boolean"
    || typeof response.comments !== "string" || response.comments.length > 4000 || !Array.isArray(response.rows) || response.rows.length < 1 || response.rows.length > 250) return undefined;
  for (const key of checklistKeys) {
    const item = response.checklist[key];
    if (!rec(item) || !exact(item, ["result", "remarks"]) || typeof item.result !== "string" || typeof item.remarks !== "string" || item.remarks.length > 2000) return undefined;
  }
  for (const [key, measurementKeys] of [["jockey_pump_pressure", ["cut_in", "cut_out"]], ["standby_pump_cut_in", ["value"]]] as const) {
    const item = response.measurements[key];
    const values = rec(item) && rec(item.values) ? item.values : undefined;
    if (!rec(item) || !exact(item, ["values", "unit", "result", "remarks"]) || !values || !exact(values, measurementKeys)
      || item.unit !== "PSI" || typeof item.result !== "string" || typeof item.remarks !== "string" || item.remarks.length > 2000
      || measurementKeys.some((field) => values[field] !== null && (typeof values[field] !== "number" || !Number.isFinite(values[field])))) return undefined;
  }
  const rowIds = new Set<string>();
  for (const [index, item] of response.rows.entries()) {
    if (!rec(item) || !exact(item, rowKeys) || typeof item.rowUuid !== "string" || !uuid.test(item.rowUuid) || rowIds.has(item.rowUuid)
      || item.sortOrder !== index + 1 || typeof item.locationText !== "string" || !item.locationText.trim() || item.locationText.length > 300
      || !(item.assetReference === null || typeof item.assetReference === "string" && item.assetReference.length <= 200)
      || typeof item.remarks !== "string" || item.remarks.length > 2000 || !rec(item.fieldRemarks)
      || Object.keys(item.fieldRemarks).some((key) => !rowResultKeys.includes(key)) || Object.values(item.fieldRemarks).some((value) => typeof value !== "string" || value.length > 2000)) return undefined;
    if (item.source === "configured") {
      if (typeof item.configuredLocationId !== "string" || !uuid.test(item.configuredLocationId)) return undefined;
    } else if (item.source !== "technician" || item.configuredLocationId !== null || item.zoneSnapshot !== null || item.locationSnapshot !== null) return undefined;
    rowIds.add(item.rowUuid);
  }
  const adapter = resolveV7EvidenceContract({ systemKey: "hose_reel", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
  if (!adapter || !parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response)) return undefined;
  return { snapshot, adapter };
}

/**
 * Automatic Sprinkler V7 is single-instance with no repeatable table.  Its
 * schema-2 response carries a flat checklist (including the three-row Test Run
 * block) plus PSI measurement rows, and a frozen evidence manifest.  V7
 * Automatic Sprinkler deliberately DROPS the legacy Cut-In/Cut-Out PSI photo
 * lifecycle, so there is no evidence policy on the form instance and nothing to
 * reconcile against `inspection_attachments` here.  This reader stays separate
 * from `validateAutomaticSprinklerHistoricalPayload` so the V1-V6 validator can
 * never learn the schema-2 shape.  Re-derive the adapter from the stored
 * definition, then re-parse the manifest against the stored response.
 */
export function validateAcceptedAutomaticSprinklerV7Detail(row: R) {
  if (!identity(row) || row.systemKey !== "automatic_sprinkler" || row.instanceKey !== "primary"
    || row.zoneId !== null || row.locationId !== null || row.displaySequence !== 1
    || !rec(row.inspectionSnapshot) || !rec(row.responses)) return undefined;
  const snapshot = row.inspectionSnapshot;
  if (!exact(snapshot, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system", "contractSha256", "instance", "evidenceManifest"])
    || snapshot.schemaVersion !== 2 || !canonicalMillis(snapshot.acceptedAt)
    || !rec(snapshot.job) || !exact(snapshot.job, ["id", "reference", "title"]) || snapshot.job.id !== row.jobId
    || !text(snapshot.job.reference, 250) || !text(snapshot.job.title, 300)
    || !rec(snapshot.customer) || !exact(snapshot.customer, ["id", "code", "displayName"])
    || typeof snapshot.customer.id !== "string" || !uuid.test(snapshot.customer.id) || !text(snapshot.customer.code, 100) || !text(snapshot.customer.displayName, 250)
    || !rec(snapshot.configuration) || !exact(snapshot.configuration, ["revisionId", "revisionNumber"]) || snapshot.configuration.revisionId !== row.configurationRevisionId
    || typeof snapshot.configuration.revisionId !== "string" || !uuid.test(snapshot.configuration.revisionId) || !Number.isSafeInteger(snapshot.configuration.revisionNumber) || Number(snapshot.configuration.revisionNumber) < 1
    || !rec(snapshot.template) || !exact(snapshot.template, ["id", "code", "version"]) || snapshot.template.id !== row.templateId || snapshot.template.code !== "MFE-FSSR" || snapshot.template.version !== 7
    || !rec(snapshot.system) || snapshot.system.key !== "automatic_sprinkler" || snapshot.system.systemKey !== "automatic_sprinkler" || snapshot.system.definitionStatus !== "confirmed" || snapshot.system.repetitionMode !== "single" || !rec(snapshot.system.definition)
    || !rec(snapshot.instance) || !exact(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"]) || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
    || typeof snapshot.contractSha256 !== "string" || !/^[0-9a-f]{64}$/.test(snapshot.contractSha256)) return undefined;
  const response = row.responses;
  const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions", "breaching_inlet", "alarm_gong", "flow_meter_valve_positions", "trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"];
  const measurementKeys = [["jockey_pump_pressure", ["cut_in", "cut_out"]], ["duty_pump_cut_in", ["value"]], ["standby_pump_cut_in", ["value"]], ["water_supply_gauge", ["value"]], ["installation_gauge", ["value"]]] as const;
  if (!exact(response, ["schemaVersion", "checklist", "measurements", "comments"]) || response.schemaVersion !== 2
    || !rec(response.checklist) || !exact(response.checklist, checklistKeys) || !rec(response.measurements)
    || !exact(response.measurements, measurementKeys.map(([key]) => key))
    || typeof response.comments !== "string" || response.comments.length > 4000) return undefined;
  for (const key of checklistKeys) {
    const item = response.checklist[key];
    if (!rec(item) || !exact(item, ["result", "remarks"]) || typeof item.result !== "string" || typeof item.remarks !== "string" || item.remarks.length > 2000) return undefined;
  }
  for (const [key, valueKeys] of measurementKeys) {
    const item = response.measurements[key];
    const values = rec(item) && rec(item.values) ? item.values : undefined;
    if (!rec(item) || !exact(item, ["values", "unit", "result", "remarks"]) || !values || !exact(values, valueKeys)
      || item.unit !== "PSI" || typeof item.result !== "string" || typeof item.remarks !== "string" || item.remarks.length > 2000
      || valueKeys.some((field) => values[field] !== null && (typeof values[field] !== "number" || !Number.isFinite(values[field])))) return undefined;
  }
  const adapter = resolveV7EvidenceContract({ systemKey: "automatic_sprinkler", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
  if (!adapter || !parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response)) return undefined;
  return { snapshot, adapter };
}
