import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import {
  parseFireAlarmRowPreset,
  resolveFireAlarmControls
} from "../inspections/templates/fireAlarmDefinitionControls.js";
import type { ResolvedFireAlarmControls } from "../inspections/templates/fireAlarmTypes.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type UnknownRecord = Record<string, unknown>;
type SyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type Payload = {
  clientUuid: string; jobId: string; systemKey: "fire_alarm_detector"; instanceKey: "primary";
  configuredZoneId: null; configuredLocationId: null; displaySequence: 1;
  originalCreatorSnapshot: UnknownRecord | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: number };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: UnknownRecord; responses: UnknownRecord; performedAt: string;
};
type JobRow = {
  status: string; job_reference: string; title: string; master_template_version_id: string;
  customer_configuration_revision_id: string; configuration_snapshot: UnknownRecord;
};
type ExpectedConfigured = {
  table: "primary" | "secondary"; locationId: string; ordinal: number;
  assetReference: string; zoneSnapshot: { id: string; displayName: string } | null;
  locationSnapshot: { id: string; displayName: string };
};
type FireAlarmSyncTestBoundary = "beforeParentInsert" | "beforeChildInsert";

let testBoundaryHook: ((boundary: FireAlarmSyncTestBoundary) => Promise<void>) | undefined;
/** Test-only in-process fault/race hook; production leaves this undefined. */
export function setFireAlarmSyncTestBoundaryHook(
  hook: ((boundary: FireAlarmSyncTestBoundary) => Promise<void>) | undefined
) { testBoundaryHook = hook; }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const groupConstraint = "master_system_inspections_job_id_system_key_key";
const clientUuidConstraint = "master_system_form_instances_client_uuid_key";
const childGroupConstraint = "master_system_form_instances_inspection_group_id_instance_key_key";
const canonicalUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const responseKeys = ["schemaVersion", "controlPanelLocation", "primaryDeviceRows", "chargerAndBatteries", "mainFunctionKeys", "secondaryAlarmDeviceRows", "comments"] as const;
const primaryKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "displaySequence", "assetReference", "alarmZone", "location", "manualCallPoint", "flowSwitch", "heatDetector", "smokeDetector", "remarks"] as const;
const secondaryKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "displaySequence", "assetReference", "location", "alarmBell", "manualCallPoint", "remarks"] as const;
const chargerKeys = ["main_supply", "battery", "charger"] as const;
const functionKeys = ["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "spka_system", "alarm_lift_trip", "signal_gas_discharge"] as const;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const isTimestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 24
  && canonicalUtc.test(value) && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString() === value;
const exactKeys = (value: UnknownRecord, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const validText = (value: unknown, maximum: number) => typeof value === "string" && value.length <= maximum;
const failure = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });
const same = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalCreator(value: unknown): UnknownRecord | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["source", "userId", "username", "role", "capturedAt"])
    || value.source !== "device_reported" || !Number.isSafeInteger(value.userId) || Number(value.userId) <= 0
    || typeof value.username !== "string" || (value.role !== "admin" && value.role !== "inspector")
    || !isTimestamp(value.capturedAt)) return undefined;
  const username = value.username.trim();
  return username.length > 0 && username.length <= 160 ? { ...value, username } : undefined;
}

function validateEnvelope(item: SyncItem): { payload?: Payload; failure?: SyncFailure } {
  const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!isUuid(item.operationId) || item.entityType !== "masterSystemInspection" || item.action !== "create"
    || !isUuid(item.entityId) || !isRecord(item.payload)) return { failure: failure(id, "VALIDATION_ERROR", "Fire Alarm operation is invalid") };
  const payload = item.payload;
  const originalCreatorSnapshot = canonicalCreator(payload.originalCreatorSnapshot);
  if (!exactKeys(payload, ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "performedAt"])
    || !isUuid(payload.clientUuid) || payload.clientUuid !== item.entityId || !isUuid(payload.jobId)
    || payload.systemKey !== "fire_alarm_detector" || payload.instanceKey !== "primary"
    || payload.configuredZoneId !== null || payload.configuredLocationId !== null || payload.displaySequence !== 1
    || originalCreatorSnapshot === undefined || !isRecord(payload.masterTemplate)
    || !exactKeys(payload.masterTemplate, ["id", "code", "version"]) || !isUuid(payload.masterTemplate.id)
    || payload.masterTemplate.code !== "MFE-FSSR" || !Number.isSafeInteger(payload.masterTemplate.version) || Number(payload.masterTemplate.version) < 1
    || !isRecord(payload.configuration) || !exactKeys(payload.configuration, ["revisionId", "revisionNumber"])
    || !isUuid(payload.configuration.revisionId) || !Number.isInteger(payload.configuration.revisionNumber)
    || !isRecord(payload.inspectionSnapshot) || !isRecord(payload.responses) || !isTimestamp(payload.performedAt)) {
    return { failure: failure(id, "VALIDATION_ERROR", "Fire Alarm payload is invalid") };
  }
  return { payload: { ...payload, originalCreatorSnapshot } as unknown as Payload };
}

function enabledSystem(snapshot: UnknownRecord) {
  const systems = Array.isArray(snapshot.enabledSystems) ? snapshot.enabledSystems.filter(isRecord) : [];
  return systems.find((system) => system.systemKey === "fire_alarm_detector" && system.definitionStatus === "confirmed");
}

function expectedConfiguredRows(system: UnknownRecord): ExpectedConfigured[] | undefined {
  const zones = Array.isArray(system.zones) ? system.zones.filter(isRecord) : undefined;
  const locations = Array.isArray(system.locations) ? system.locations.filter(isRecord) : undefined;
  if (!zones || !locations) return undefined;
  const zonesById = new Map(zones.filter((zone) => isUuid(zone.id)).map((zone) => [zone.id as string, zone]));
  const expected: ExpectedConfigured[] = [];
  for (const location of locations.slice().sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder) || String(left.id).localeCompare(String(right.id)))) {
    if (!isUuid(location.id) || !validText(location.displayName, 300) || !Number.isInteger(location.presetRowCount)
      || Number(location.presetRowCount) < 0 || Number(location.presetRowCount) > 250) return undefined;
    const preset = parseFireAlarmRowPreset(location.rowPreset);
    if (!preset) return undefined;
    const zone = location.zoneId === null ? undefined : zonesById.get(String(location.zoneId));
    if (location.zoneId !== null && !zone) return undefined;
    if (zone && (!isUuid(zone.id) || !validText(zone.displayName, 200))) return undefined;
    for (let ordinal = 1; ordinal <= Number(location.presetRowCount); ordinal += 1) {
      expected.push({
        table: preset.fireAlarmTable, locationId: location.id, ordinal,
        assetReference: preset.assetReference ?? "",
        zoneSnapshot: zone ? { id: zone.id as string, displayName: zone.displayName as string } : null,
        locationSnapshot: { id: location.id, displayName: location.displayName as string }
      });
    }
  }
  return expected;
}

function validChecklist(value: unknown, keys: readonly string[]) {
  return isRecord(value) && exactKeys(value, keys) && keys.every((key) => {
    const item = value[key];
    return isRecord(item) && exactKeys(item, ["result", "remarks"])
      && (item.result === "good" || item.result === "poor") && validText(item.remarks, 2000);
  });
}

function canonicalResponses(value: UnknownRecord, expected: ExpectedConfigured[], controls: ResolvedFireAlarmControls): UnknownRecord | undefined {
  if (!exactKeys(value, responseKeys) || value.schemaVersion !== 1
    || !validText(value.controlPanelLocation, controls.controlPanelLocation.maxLength) || !(value.controlPanelLocation as string).trim()
    || !validText(value.comments, controls.comments.maxLength)
    || !Array.isArray(value.primaryDeviceRows) || value.primaryDeviceRows.length < controls.primaryDeviceRows.minimum || value.primaryDeviceRows.length > controls.primaryDeviceRows.maximum
    || !Array.isArray(value.secondaryAlarmDeviceRows) || value.secondaryAlarmDeviceRows.length > controls.secondaryAlarmDeviceRows.maximum
    || !validChecklist(value.chargerAndBatteries, chargerKeys) || !validChecklist(value.mainFunctionKeys, functionKeys)) return undefined;
  const expectedByKey = new Map(expected.map((row) => [`${row.table}:${row.locationId}:${row.ordinal}`, row]));
  const seenConfigured = new Set<string>(); const seenUuids = new Set<string>();
  const parseRows = (rows: unknown[], table: "primary" | "secondary") => {
    const canonicalRows: UnknownRecord[] = []; let technicianSeen = false;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!isRecord(row) || !exactKeys(row, table === "primary" ? primaryKeys : secondaryKeys)
        || !isUuid(row.rowUuid) || seenUuids.has(row.rowUuid) || row.displaySequence !== index + 1
        || !validText(row.assetReference, 250) || !validText(row.location, 300) || !validText(row.remarks, 2000)) return undefined;
      seenUuids.add(row.rowUuid);
      let accepted: UnknownRecord = { ...row };
      if (row.source === "configured") {
        if (technicianSeen || !isUuid(row.configuredLocationId) || !Number.isInteger(row.configuredRowOrdinal)) return undefined;
        const key = `${table}:${row.configuredLocationId}:${row.configuredRowOrdinal}`;
        const configured = expectedByKey.get(key);
        if (!configured || seenConfigured.has(key) || row.assetReference !== configured.assetReference
          || !same(row.zoneSnapshot, configured.zoneSnapshot) || !same(row.locationSnapshot, configured.locationSnapshot)) return undefined;
        if (table === "primary" && (row.alarmZone !== (configured.zoneSnapshot?.displayName ?? "") || row.location !== configured.locationSnapshot.displayName)) return undefined;
        if (table === "secondary" && row.location !== configured.locationSnapshot.displayName) return undefined;
        seenConfigured.add(key);
        accepted = { ...row, assetReference: configured.assetReference, zoneSnapshot: configured.zoneSnapshot, locationSnapshot: configured.locationSnapshot,
          ...(table === "primary" ? { alarmZone: configured.zoneSnapshot?.displayName ?? "", location: configured.locationSnapshot.displayName } : { location: configured.locationSnapshot.displayName }) };
      } else {
        technicianSeen = true;
        if (row.source !== "technician" || row.configuredLocationId !== null || row.configuredRowOrdinal !== null || row.zoneSnapshot !== null || row.locationSnapshot !== null) return undefined;
      }
      if (table === "primary") {
        if (!validText(row.alarmZone, 200) || !(row.alarmZone as string).trim() || !(row.location as string).trim()
          || ![row.manualCallPoint, row.flowSwitch, row.heatDetector, row.smokeDetector].every((result) => result === "normal" || result === "test" || result === "isolation")) return undefined;
      } else if (!(row.location as string).trim() || (row.alarmBell !== "good" && row.alarmBell !== "poor") || (row.manualCallPoint !== "good" && row.manualCallPoint !== "poor")) return undefined;
      canonicalRows.push(accepted);
    }
    return canonicalRows;
  };
  const primary = parseRows(value.primaryDeviceRows, "primary");
  const secondary = parseRows(value.secondaryAlarmDeviceRows, "secondary");
  if (!primary || !secondary || seenConfigured.size !== expectedByKey.size) return undefined;
  return { schemaVersion: 1, controlPanelLocation: value.controlPanelLocation, primaryDeviceRows: primary,
    chargerAndBatteries: value.chargerAndBatteries, mainFunctionKeys: value.mainFunctionKeys,
    secondaryAlarmDeviceRows: secondary, comments: value.comments };
}

function isExpectedUniqueViolation(error: unknown) {
  return isRecord(error) && error.code === "23505"
    && (error.constraint === groupConstraint
      || error.constraint === clientUuidConstraint
      || error.constraint === childGroupConstraint);
}

async function classifyIdentity(clientUuid: string, jobId: string, fingerprint: string) {
  const existing = await pool.query<{ request_fingerprint: string }>("SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid=$1", [clientUuid]);
  if (existing.rowCount) return existing.rows[0].request_fingerprint === fingerprint
    ? { duplicate: true as const }
    : { failure: failure(clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different Fire Alarm data") };
  const group = await pool.query("SELECT 1 FROM master_system_inspections WHERE job_id=$1 AND system_key='fire_alarm_detector'", [jobId]);
  return group.rowCount ? { failure: failure(clientUuid, "ACTIVE_INSPECTION_EXISTS", "This job already has a Fire Alarm inspection") } : undefined;
}

/** Test-only access to the exact production unique-violation gate and post-rollback classifier. */
export async function classifyFireAlarmUniqueViolationForTest(error: unknown, clientUuid: string, jobId: string, fingerprint: string) {
  return isExpectedUniqueViolation(error)
    ? classifyIdentity(clientUuid, jobId, fingerprint)
    : undefined;
}

export async function syncFireAlarmInspections(items: SyncItem[], actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };
  for (const item of items) {
    const checked = validateEnvelope(item);
    if (!checked.payload) { result.failed.push(checked.failure ?? failure("unknown", "VALIDATION_ERROR", "Invalid Fire Alarm inspection")); continue; }
    const payload = checked.payload; const client = await pool.connect(); let fingerprint = "";
    try {
      await client.query("BEGIN");
      const loaded = await client.query<JobRow>("SELECT status,job_reference,title,master_template_version_id,customer_configuration_revision_id,configuration_snapshot FROM inspection_jobs WHERE id=$1", [payload.jobId]);
      const job = loaded.rows[0]; const system = job ? enabledSystem(job.configuration_snapshot) : undefined;
      const configuration = job && isRecord(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined;
      const template = job && isRecord(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined;
      if (!job || job.status !== "open" || !system || !configuration || !template
        || job.master_template_version_id !== payload.masterTemplate.id || job.customer_configuration_revision_id !== payload.configuration.revisionId
        || configuration.revisionId !== payload.configuration.revisionId || configuration.revisionNumber !== payload.configuration.revisionNumber
        || template.id !== payload.masterTemplate.id || template.code !== "MFE-FSSR" || template.version !== payload.masterTemplate.version) {
        await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Fire Alarm job configuration is unavailable")); continue;
      }
      const definition = await client.query<{ definition: unknown; definition_status: string }>("SELECT definition,definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='fire_alarm_detector'", [payload.masterTemplate.id]);
      let controls: ResolvedFireAlarmControls;
      try {
        if (definition.rowCount !== 1 || definition.rows[0].definition_status !== "confirmed") throw new Error("unavailable");
        controls = resolveFireAlarmControls(definition.rows[0].definition, "MFE-FSSR", payload.masterTemplate.version);
      } catch {
        await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Fire Alarm definition is unavailable or invalid")); continue;
      }
      const expected = expectedConfiguredRows(system);
      const responses = expected ? canonicalResponses(payload.responses, expected, controls) : undefined;
      if (!responses) { await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Fire Alarm inspection or configured row identity is incomplete or invalid")); continue; }
      const authority = { job: { id: payload.jobId, reference: job.job_reference, title: job.title }, customer: job.configuration_snapshot.customer,
        configuration: job.configuration_snapshot.configuration, template: { id: payload.masterTemplate.id, code: "MFE-FSSR", version: payload.masterTemplate.version }, system };
      fingerprint = createHash("sha256").update(canonicalize({ clientUuid: payload.clientUuid, jobId: payload.jobId, systemKey: "fire_alarm_detector", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, authority, responses, performedAt: payload.performedAt, originalCreatorSnapshot: payload.originalCreatorSnapshot, actorUserId: actorUserId ?? null })).digest("hex");
      const existing = await client.query<{ request_fingerprint: string }>("SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid=$1", [payload.clientUuid]);
      if (existing.rowCount) { await client.query("ROLLBACK"); existing.rows[0].request_fingerprint === fingerprint ? result.duplicateIds.push(payload.clientUuid) : result.failed.push(failure(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different Fire Alarm data")); continue; }
      const existingGroup = await client.query("SELECT 1 FROM master_system_inspections WHERE job_id=$1 AND system_key='fire_alarm_detector' FOR UPDATE", [payload.jobId]);
      if (existingGroup.rowCount) { await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "ACTIVE_INSPECTION_EXISTS", "This job already has a Fire Alarm inspection")); continue; }
      const canonicalSnapshot = { schemaVersion: 1, acceptedAt: new Date().toISOString(), ...authority,
        system: { ...system, definition: definition.rows[0].definition, resolvedControls: controls, repetitionMode: "single_with_two_repeatable_tables" },
        instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null } };
      const groupId = randomUUID();
      await testBoundaryHook?.("beforeParentInsert");
      await client.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3)", [groupId, payload.jobId, actorUserId ?? null]);
      await testBoundaryHook?.("beforeChildInsert");
      await client.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) VALUES($1,$2,$3,'primary',NULL,NULL,NULL,NULL,1,$4,$5,1,$6,1,$7,$8,'submitted',$9,$10,$11)`, [randomUUID(), groupId, payload.clientUuid, payload.masterTemplate.id, payload.configuration.revisionId, canonicalSnapshot, responses, fingerprint, payload.performedAt, payload.originalCreatorSnapshot, actorUserId ?? null]);
      await client.query("COMMIT"); result.acceptedIds.push(payload.clientUuid);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const conflict = fingerprint && isExpectedUniqueViolation(error)
        ? await classifyIdentity(payload.clientUuid, payload.jobId, fingerprint).catch(() => undefined)
        : undefined;
      if (conflict && "duplicate" in conflict) result.duplicateIds.push(payload.clientUuid);
      else if (conflict && "failure" in conflict) result.failed.push(conflict.failure);
      else result.failed.push(failure(payload.clientUuid, "SERVER_ERROR", "Fire Alarm inspection could not be saved"));
    } finally { client.release(); }
  }
  return result;
}
