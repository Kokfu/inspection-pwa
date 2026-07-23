import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type SyncRequestItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type UnknownRecord = Record<string, unknown>;
type CreatorSnapshot = { source: "device_reported"; userId: number; username: string; role: "admin" | "inspector"; capturedAt: string };
type HoseReelPayload = { clientUuid: string; jobId: string; systemKey: "hose_reel"; originalCreatorSnapshot: CreatorSnapshot | null; masterTemplate: { id: string; code: "MFE-FSSR"; version: 1 }; configuration: { revisionId: string; revisionNumber: number }; inspectionSnapshot: UnknownRecord; responses: UnknownRecord; performedAt: string };
type JobRow = { status: "open" | "closed"; job_reference: string; title: string; master_template_version_id: string; customer_configuration_revision_id: string; configuration_snapshot: UnknownRecord };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resultValues = new Set(["good", "poor"]);
const groupConstraint = "master_system_inspections_job_id_system_key_key";
const limits = { comments: 4000, remarks: 2000, location: 300, assetReference: 200, rows: 250, username: 160 };
const checklistKeys = new Set(["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "standby_pump_service_items", "charger_power_failure_alarm", "battery_serviceable", "pump_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"]);

function isRecord(value: unknown): value is UnknownRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isUuid(value: unknown): value is string { return typeof value === "string" && uuidPattern.test(value); }
function isTimestamp(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function failure(id: string, code: string, message: string): SyncFailure { return { id, code, message }; }
function stringValue(value: unknown, maximum: number) { return typeof value === "string" && value.length <= maximum; }
function exactKeys(value: UnknownRecord, keys: string[]) { return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); }
function canonicalize(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; const object = value as UnknownRecord; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`; }
function isExpectedGroupConflict(error: unknown) { return isRecord(error) && error.code === "23505" && error.constraint === groupConstraint; }

function validCreatorSnapshot(value: unknown): value is CreatorSnapshot | null {
  if (value === null) return true;
  if (!isRecord(value) || !exactKeys(value, ["source", "userId", "username", "role", "capturedAt"])) return false;
  return value.source === "device_reported" && typeof value.userId === "number" && Number.isInteger(value.userId) && value.userId > 0 && typeof value.username === "string" && stringValue(value.username, limits.username) && value.username.trim().length > 0 && (value.role === "admin" || value.role === "inspector") && isTimestamp(value.capturedAt);
}

function validChecklist(value: unknown) {
  if (!isRecord(value) || Object.keys(value).length !== checklistKeys.size || !Object.keys(value).every((key) => checklistKeys.has(key))) return false;
  return [...checklistKeys].every((key) => { const item = value[key]; return isRecord(item) && exactKeys(item, ["result", "remarks"]) && (item.result === null || resultValues.has(item.result as string)) && stringValue(item.remarks, limits.remarks); });
}

function validMeasurement(value: unknown, keys: string[]) {
  if (!isRecord(value) || !exactKeys(value, ["values", "unit", "result", "remarks"]) || !isRecord(value.values) || !exactKeys(value.values, keys) || value.unit !== "PSI" || !stringValue(value.remarks, limits.remarks)) return false;
  if (value.result !== null && !resultValues.has(value.result as string)) return false;
  const values = value.values;
  return keys.every((key) => values[key] === null || (typeof values[key] === "number" && Number.isFinite(values[key])));
}

function validRows(value: unknown) {
  if (!Array.isArray(value) || value.length > limits.rows) return false;
  const rowIds = new Set<string>();
  return value.every((row) => {
    if (!isRecord(row) || !isUuid(row.rowUuid) || rowIds.has(row.rowUuid)) return false;
    rowIds.add(row.rowUuid);
    const configured = row.source === "configured";
    return exactKeys(row, ["rowUuid", "source", "configuredLocationId", "zoneSnapshot", "locationSnapshot", "locationText", "assetReference", "sortOrder", "drumResult", "hoseResult", "nozzleResult", "valveResult", "nozzleBoxResult", "remarks"])
      && (configured || row.source === "technician")
      && (configured ? isUuid(row.configuredLocationId) : row.configuredLocationId === null)
      && stringValue(row.locationText, limits.location)
      && (row.assetReference === null || stringValue(row.assetReference, limits.assetReference))
      && typeof row.sortOrder === "number" && Number.isInteger(row.sortOrder) && row.sortOrder > 0
      && ["drumResult", "hoseResult", "nozzleResult", "valveResult", "nozzleBoxResult"].every((key) => row[key] === null || resultValues.has(row[key] as string))
      && stringValue(row.remarks, limits.remarks);
  });
}

function submitRequirements(responses: UnknownRecord) {
  if (!exactKeys(responses, ["checklist", "measurements", "drumTypes", "rows", "comments"]) || !validChecklist(responses.checklist) || !isRecord(responses.measurements) || !exactKeys(responses.measurements, ["jockey_pump_pressure", "standby_pump_cut_in"]) || !isRecord(responses.drumTypes) || !exactKeys(responses.drumTypes, ["swing", "fixed"]) || typeof responses.drumTypes.swing !== "boolean" || typeof responses.drumTypes.fixed !== "boolean" || !stringValue(responses.comments, limits.comments) || !validRows(responses.rows)) return false;
  const jockey = responses.measurements.jockey_pump_pressure;
  const standby = responses.measurements.standby_pump_cut_in;
  if (!validMeasurement(jockey, ["cut_in", "cut_out"]) || !validMeasurement(standby, ["value"])) return false;
  const checklistComplete = Object.values(responses.checklist as UnknownRecord).every((item) => isRecord(item) && resultValues.has(item.result as string));
  const measurementsComplete = [jockey, standby].every((measurement) => isRecord(measurement) && isRecord(measurement.values) && Object.values(measurement.values).every((number) => typeof number === "number" && Number.isFinite(number)) && resultValues.has(measurement.result as string));
  const rows = responses.rows as UnknownRecord[];
  const rowsComplete = rows.length > 0 && rows.every((row) => typeof row.locationText === "string" && row.locationText.trim().length > 0 && ["drumResult", "hoseResult", "nozzleResult", "valveResult", "nozzleBoxResult"].every((key) => resultValues.has(row[key] as string)));
  return checklistComplete && measurementsComplete && rowsComplete;
}

function validateItem(item: SyncRequestItem): { payload?: HoseReelPayload; failure?: SyncFailure } {
  const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!isUuid(item.operationId) || item.entityType !== "masterSystemInspection" || item.action !== "create" || !isUuid(item.entityId) || !isRecord(item.payload)) return { failure: failure(id, "VALIDATION_ERROR", "Master system inspection operation is invalid") };
  const payload = item.payload;
  if (!isUuid(payload.clientUuid) || payload.clientUuid !== item.entityId || !isUuid(payload.jobId) || payload.systemKey !== "hose_reel" || !isRecord(payload.masterTemplate) || !isUuid(payload.masterTemplate.id) || payload.masterTemplate.code !== "MFE-FSSR" || payload.masterTemplate.version !== 1 || !isRecord(payload.configuration) || !isUuid(payload.configuration.revisionId) || !Number.isInteger(payload.configuration.revisionNumber) || !isRecord(payload.inspectionSnapshot) || !validCreatorSnapshot(payload.originalCreatorSnapshot) || !isRecord(payload.responses) || !isTimestamp(payload.performedAt)) return { failure: failure(id, "VALIDATION_ERROR", "Master system inspection payload is invalid") };
  if (!submitRequirements(payload.responses)) return { failure: failure(id, "VALIDATION_ERROR", "Hose Reel inspection is incomplete or invalid") };
  return { payload: payload as HoseReelPayload };
}

function enabledSystem(snapshot: UnknownRecord) {
  const systems = Array.isArray(snapshot.enabledSystems) ? snapshot.enabledSystems : [];
  return systems.find((system) => isRecord(system) && system.systemKey === "hose_reel" && system.definitionStatus === "confirmed");
}

function canonicalizeRows(rows: UnknownRecord[], system: UnknownRecord): UnknownRecord[] | undefined {
  const locations = Array.isArray(system.locations) ? system.locations.filter(isRecord) : [];
  const zones = Array.isArray(system.zones) ? system.zones.filter(isRecord) : [];
  const byId = new Map(locations.filter((location) => isUuid(location.id)).map((location) => [location.id as string, location]));
  const zonesById = new Map(zones.filter((zone) => isUuid(zone.id)).map((zone) => [zone.id as string, zone]));
  const canonicalRows: UnknownRecord[] = [];
  for (const row of rows) {
    if (row.source === "technician") {
      canonicalRows.push({ ...row, configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null });
      continue;
    }
    const location = typeof row.configuredLocationId === "string" ? byId.get(row.configuredLocationId) : undefined;
    if (!location || typeof location.displayName !== "string" || typeof location.key !== "string") return undefined;
    const zoneId = typeof location.zoneId === "string" ? location.zoneId : null;
    const zone = zoneId ? zonesById.get(zoneId) : undefined;
    if (zoneId && (!zone || typeof zone.key !== "string" || typeof zone.displayName !== "string")) return undefined;
    canonicalRows.push({
      ...row,
      configuredLocationId: location.id,
      locationText: location.displayName,
      locationSnapshot: { id: location.id, key: location.key, displayName: location.displayName, presetRowCount: location.presetRowCount, rowPreset: location.rowPreset },
      zoneSnapshot: zone ? { id: zone.id, key: zone.key, displayName: zone.displayName } : null
    });
  }
  return canonicalRows;
}

function canonicalizeResponses(responses: UnknownRecord, system: UnknownRecord) {
  const rows = canonicalizeRows(responses.rows as UnknownRecord[], system);
  return rows ? { checklist: responses.checklist, measurements: responses.measurements, drumTypes: responses.drumTypes, rows, comments: responses.comments } : undefined;
}

function fingerprint(payload: HoseReelPayload, responses: UnknownRecord) {
  return createHash("sha256").update(canonicalize({ clientUuid: payload.clientUuid, jobId: payload.jobId, systemKey: payload.systemKey, masterTemplate: payload.masterTemplate, configuration: payload.configuration, responses, performedAt: payload.performedAt, originalCreatorSnapshot: payload.originalCreatorSnapshot })).digest("hex");
}

export async function syncMasterSystemInspections(items: SyncRequestItem[], actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };
  for (const item of items) {
    const validation = validateItem(item);
    if (!validation.payload) { result.failed.push(validation.failure ?? failure("unknown", "VALIDATION_ERROR", "Invalid inspection")); continue; }
    const payload = validation.payload;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const job = await client.query<JobRow>(`SELECT status, job_reference, title, master_template_version_id, customer_configuration_revision_id, configuration_snapshot FROM inspection_jobs WHERE id = $1`, [payload.jobId]);
      const jobRow = job.rows[0];
      if (!jobRow || jobRow.master_template_version_id !== payload.masterTemplate.id || jobRow.customer_configuration_revision_id !== payload.configuration.revisionId) { await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Hose Reel job identity is unavailable")); continue; }
      const system = enabledSystem(jobRow.configuration_snapshot);
      const configuration = isRecord(jobRow.configuration_snapshot.configuration) ? jobRow.configuration_snapshot.configuration : undefined;
      const template = isRecord(jobRow.configuration_snapshot.template) ? jobRow.configuration_snapshot.template : undefined;
      if (!system || !configuration || !template || configuration.revisionId !== payload.configuration.revisionId || configuration.revisionNumber !== payload.configuration.revisionNumber || template.id !== payload.masterTemplate.id || template.code !== "MFE-FSSR" || template.version !== 1) { await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Hose Reel job configuration is unavailable")); continue; }
      const normalizedResponses = canonicalizeResponses(payload.responses, system);
      if (!normalizedResponses) { await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Configured Hose Reel row identity is invalid")); continue; }
      const requestFingerprint = fingerprint(payload, normalizedResponses);
      const existing = await client.query<{ request_fingerprint: string }>("SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid = $1", [payload.clientUuid]);
      if (existing.rowCount) { await client.query("ROLLBACK"); if (existing.rows[0].request_fingerprint === requestFingerprint) result.duplicateIds.push(payload.clientUuid); else result.failed.push(failure(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different inspection data")); continue; }
      if (jobRow.status !== "open") { await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Inspection job is closed")); continue; }
      const definition = await client.query<{ definition: UnknownRecord; definition_status: string }>(`SELECT definition, definition_status FROM master_service_report_systems WHERE template_version_id = $1 AND system_key = 'hose_reel'`, [payload.masterTemplate.id]);
      if (definition.rowCount !== 1 || definition.rows[0].definition_status !== "confirmed") { await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Hose Reel definition is unavailable")); continue; }
      const existingGroup = await client.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id = $1 AND system_key = 'hose_reel' FOR UPDATE", [payload.jobId]);
      if (existingGroup.rowCount) { await client.query("ROLLBACK"); result.failed.push(failure(payload.clientUuid, "ACTIVE_INSPECTION_EXISTS", "This job already has a Hose Reel inspection group")); continue; }
      const acceptedAt = new Date().toISOString();
      const canonicalSnapshot = { schemaVersion: 1, acceptedAt, job: { id: payload.jobId, reference: jobRow.job_reference, title: jobRow.title }, customer: jobRow.configuration_snapshot.customer, configuration: jobRow.configuration_snapshot.configuration, template: { id: payload.masterTemplate.id, code: "MFE-FSSR", version: 1 }, system: { ...system, definition: definition.rows[0].definition, repetitionMode: "single_with_repeatable_rows", drumTypeCardinality: "pending_confirmation" } };
      const groupId = randomUUID();
      const instanceId = randomUUID();
      await client.query(`INSERT INTO master_system_inspections (id, job_id, system_key, created_by_user_id) VALUES ($1, $2, 'hose_reel', $3)`, [groupId, payload.jobId, actorUserId ?? null]);
      await client.query(`INSERT INTO master_system_form_instances (id, inspection_group_id, client_uuid, instance_key, display_sequence, master_template_version_id, customer_configuration_revision_id, snapshot_schema_version, inspection_snapshot, response_schema_version, response_payload, request_fingerprint, status, performed_at, original_creator_snapshot, synced_by_user_id) VALUES ($1, $2, $3, 'primary', 1, $4, $5, 1, $6, 1, $7, $8, 'submitted', $9, $10, $11)`, [instanceId, groupId, payload.clientUuid, payload.masterTemplate.id, payload.configuration.revisionId, canonicalSnapshot, normalizedResponses, requestFingerprint, payload.performedAt, payload.originalCreatorSnapshot, actorUserId]);
      await client.query("COMMIT"); result.acceptedIds.push(payload.clientUuid);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isExpectedGroupConflict(error)) result.failed.push(failure(payload.clientUuid, "ACTIVE_INSPECTION_EXISTS", "This job already has a Hose Reel inspection group"));
      else result.failed.push(failure(payload.clientUuid, "SERVER_ERROR", "Hose Reel inspection could not be saved"));
    } finally { client.release(); }
  }
  return result;
}
