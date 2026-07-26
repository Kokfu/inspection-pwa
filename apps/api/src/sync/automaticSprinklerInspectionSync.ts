import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import {
  resolveAutomaticSprinklerControls,
  type ResolvedAutomaticSprinklerControls
} from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type UnknownRecord = Record<string, unknown>;
type SyncItem = {
  operationId: unknown;
  entityType: unknown;
  entityId: unknown;
  action: unknown;
  payload: unknown;
};
type Payload = {
  clientUuid: string;
  jobId: string;
  systemKey: "automatic_sprinkler";
  instanceKey: "primary";
  configuredZoneId: null;
  configuredLocationId: null;
  displaySequence: 1;
  originalCreatorSnapshot: UnknownRecord | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: 1 };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: UnknownRecord;
  responses: UnknownRecord;
  performedAt: string;
};
type JobRow = {
  status: string;
  job_reference: string;
  title: string;
  master_template_version_id: string;
  customer_configuration_revision_id: string;
  configuration_snapshot: UnknownRecord;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const groupConstraint = "master_system_inspections_job_id_system_key_key";
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));
const exactKeys = (value: UnknownRecord, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);
const failure = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });
const validText = (value: unknown, maxLength: number) =>
  typeof value === "string" && value.length <= maxLength;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validCreator(value: unknown) {
  return value === null || (
    isRecord(value)
    && exactKeys(value, ["source", "userId", "username", "role", "capturedAt"])
    && value.source === "device_reported"
    && Number.isInteger(value.userId)
    && validText(value.username, 160)
    && (value.role === "admin" || value.role === "inspector")
    && isTimestamp(value.capturedAt)
  );
}

function validateEnvelope(item: SyncItem): { payload?: Payload; failure?: SyncFailure } {
  const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!isUuid(item.operationId) || item.entityType !== "masterSystemInspection"
    || item.action !== "create" || !isUuid(item.entityId) || !isRecord(item.payload)) {
    return { failure: failure(id, "VALIDATION_ERROR", "Automatic Sprinkler operation is invalid") };
  }
  const payload = item.payload;
  if (!exactKeys(payload, [
    "clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId",
    "configuredLocationId", "displaySequence", "originalCreatorSnapshot",
    "masterTemplate", "configuration", "inspectionSnapshot", "responses", "performedAt"
  ]) || !isUuid(payload.clientUuid) || payload.clientUuid !== item.entityId
    || !isUuid(payload.jobId) || payload.systemKey !== "automatic_sprinkler"
    || payload.instanceKey !== "primary" || payload.configuredZoneId !== null
    || payload.configuredLocationId !== null || payload.displaySequence !== 1
    || !validCreator(payload.originalCreatorSnapshot)
    || !isRecord(payload.masterTemplate)
    || !exactKeys(payload.masterTemplate, ["id", "code", "version"])
    || !isUuid(payload.masterTemplate.id) || payload.masterTemplate.code !== "MFE-FSSR"
    || payload.masterTemplate.version !== 1
    || !isRecord(payload.configuration)
    || !exactKeys(payload.configuration, ["revisionId", "revisionNumber"])
    || !isUuid(payload.configuration.revisionId)
    || !Number.isInteger(payload.configuration.revisionNumber)
    || !isRecord(payload.inspectionSnapshot) || !isRecord(payload.responses)
    || !isTimestamp(payload.performedAt)) {
    return { failure: failure(id, "VALIDATION_ERROR", "Automatic Sprinkler payload is invalid") };
  }
  return { payload: payload as unknown as Payload };
}

function allowed(control: { options: Array<{ value: string }> }, value: unknown) {
  return typeof value === "string" && control.options.some((option) => option.value === value);
}

function validateRows(value: unknown, definitions: Array<{
  key: string;
  result: { options: Array<{ value: string }> };
  remarks: { maxLength: number };
}>) {
  if (!isRecord(value) || !exactKeys(value, definitions.map((definition) => definition.key))) return false;
  return definitions.every((definition) => {
    const response = value[definition.key];
    return isRecord(response)
      && exactKeys(response, ["result", "remarks"])
      && allowed(definition.result, response.result)
      && validText(response.remarks, definition.remarks.maxLength);
  });
}

function validateMeasurements(value: unknown, controls: ResolvedAutomaticSprinklerControls) {
  if (!isRecord(value) || !exactKeys(value, controls.measurements.map((definition) => definition.key))) return false;
  return controls.measurements.every((definition) => {
    const response = value[definition.key];
    if (!isRecord(response) || !exactKeys(response, ["values", "unit", "result", "remarks"])
      || !isRecord(response.values)
      || !exactKeys(response.values, definition.values.map((item) => item.key))
      || !allowed(definition.result, response.result)
      || !validText(response.remarks, definition.remarks.maxLength)) return false;
    const measurementValues = response.values;
    const units = new Set(definition.values.map((item) => item.unit));
    if (units.size !== 1 || response.unit !== definition.values[0]?.unit) return false;
    return definition.values.every((item) =>
      typeof measurementValues[item.key] === "number"
      && Number.isFinite(measurementValues[item.key])
    );
  });
}

function validateResponses(value: UnknownRecord, controls: ResolvedAutomaticSprinklerControls) {
  return exactKeys(value, ["schemaVersion", "waterTank", "pumpHouse", "measurements", "mainAlarmValve", "comments"])
    && value.schemaVersion === 1
    && validateRows(value.waterTank, controls.checklist.waterTank)
    && validateRows(value.pumpHouse, controls.checklist.pumpHouse)
    && validateMeasurements(value.measurements, controls)
    && validateRows(value.mainAlarmValve, controls.checklist.mainAlarmValve)
    && validText(value.comments, controls.comments.maxLength);
}

function enabledSystem(snapshot: UnknownRecord) {
  const systems = Array.isArray(snapshot.enabledSystems)
    ? snapshot.enabledSystems.filter(isRecord)
    : [];
  return systems.find((system) =>
    system.systemKey === "automatic_sprinkler" && system.definitionStatus === "confirmed"
  );
}

function isExpectedGroupConflict(error: unknown) {
  return isRecord(error) && error.code === "23505" && error.constraint === groupConstraint;
}

async function classifyAfterConflict(payload: Payload, requestFingerprint: string) {
  const existing = await pool.query<{ request_fingerprint: string }>(
    "SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid = $1",
    [payload.clientUuid]
  );
  if (existing.rowCount) {
    return existing.rows[0].request_fingerprint === requestFingerprint
      ? { duplicate: true as const }
      : { failure: failure(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different Automatic Sprinkler data") };
  }
  const group = await pool.query(
    "SELECT 1 FROM master_system_inspections WHERE job_id = $1 AND system_key = 'automatic_sprinkler'",
    [payload.jobId]
  );
  return group.rowCount
    ? { failure: failure(payload.clientUuid, "ACTIVE_INSPECTION_EXISTS", "This job already has an Automatic Sprinkler inspection") }
    : undefined;
}

export async function syncAutomaticSprinklerInspections(
  items: SyncItem[],
  actorUserId?: number
): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };
  for (const item of items) {
    const checked = validateEnvelope(item);
    if (!checked.payload) {
      result.failed.push(checked.failure ?? failure("unknown", "VALIDATION_ERROR", "Invalid Automatic Sprinkler inspection"));
      continue;
    }
    const payload = checked.payload;
    const client = await pool.connect();
    let requestFingerprint = "";
    try {
      await client.query("BEGIN");
      const jobResult = await client.query<JobRow>(
        `SELECT status, job_reference, title, master_template_version_id,
          customer_configuration_revision_id, configuration_snapshot
         FROM inspection_jobs WHERE id = $1`,
        [payload.jobId]
      );
      const job = jobResult.rows[0];
      const system = job ? enabledSystem(job.configuration_snapshot) : undefined;
      const configuration = job && isRecord(job.configuration_snapshot.configuration)
        ? job.configuration_snapshot.configuration
        : undefined;
      const template = job && isRecord(job.configuration_snapshot.template)
        ? job.configuration_snapshot.template
        : undefined;
      if (!job || !system || !configuration || !template
        || job.master_template_version_id !== payload.masterTemplate.id
        || job.customer_configuration_revision_id !== payload.configuration.revisionId
        || configuration.revisionId !== payload.configuration.revisionId
        || configuration.revisionNumber !== payload.configuration.revisionNumber
        || template.id !== payload.masterTemplate.id || template.code !== "MFE-FSSR"
        || template.version !== 1 || !Array.isArray(system.zones) || system.zones.length !== 0
        || !Array.isArray(system.locations) || system.locations.length !== 0) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Automatic Sprinkler job configuration is unavailable"));
        continue;
      }
      if (job.status !== "open") {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Inspection job is closed"));
        continue;
      }
      const definitionResult = await client.query<{ definition: unknown; definition_status: string }>(
        `SELECT definition, definition_status
           FROM master_service_report_systems
          WHERE template_version_id = $1 AND system_key = 'automatic_sprinkler'`,
        [payload.masterTemplate.id]
      );
      if (definitionResult.rowCount !== 1 || definitionResult.rows[0].definition_status !== "confirmed") {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Automatic Sprinkler definition is unavailable"));
        continue;
      }
      let controls: ResolvedAutomaticSprinklerControls;
      try {
        controls = resolveAutomaticSprinklerControls(definitionResult.rows[0].definition, "MFE-FSSR", 1);
      } catch {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Automatic Sprinkler definition is invalid"));
        continue;
      }
      if (!validateResponses(payload.responses, controls)) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Automatic Sprinkler inspection is incomplete or invalid"));
        continue;
      }

      requestFingerprint = createHash("sha256").update(canonicalize({
        clientUuid: payload.clientUuid,
        jobId: payload.jobId,
        systemKey: payload.systemKey,
        instanceKey: "primary",
        configuredZoneId: null,
        configuredLocationId: null,
        displaySequence: 1,
        masterTemplate: payload.masterTemplate,
        configuration: payload.configuration,
        responses: payload.responses,
        performedAt: payload.performedAt,
        originalCreatorSnapshot: payload.originalCreatorSnapshot
      })).digest("hex");
      const existing = await client.query<{ request_fingerprint: string }>(
        "SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid = $1",
        [payload.clientUuid]
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        if (existing.rows[0].request_fingerprint === requestFingerprint) {
          result.duplicateIds.push(payload.clientUuid);
        } else {
          result.failed.push(failure(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different Automatic Sprinkler data"));
        }
        continue;
      }
      const existingGroup = await client.query(
        "SELECT 1 FROM master_system_inspections WHERE job_id = $1 AND system_key = 'automatic_sprinkler' FOR UPDATE",
        [payload.jobId]
      );
      if (existingGroup.rowCount) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "ACTIVE_INSPECTION_EXISTS", "This job already has an Automatic Sprinkler inspection"));
        continue;
      }

      const acceptedAt = new Date().toISOString();
      const canonicalSnapshot = {
        schemaVersion: 1,
        acceptedAt,
        job: { id: payload.jobId, reference: job.job_reference, title: job.title },
        customer: job.configuration_snapshot.customer,
        configuration: job.configuration_snapshot.configuration,
        template: { id: payload.masterTemplate.id, code: "MFE-FSSR", version: 1 },
        system: {
          ...system,
          definition: definitionResult.rows[0].definition,
          resolvedControls: controls,
          repetitionMode: "single"
        },
        instance: {
          instanceKey: "primary",
          displaySequence: 1,
          zone: null,
          location: null
        }
      };
      const groupId = randomUUID();
      await client.query(
        `INSERT INTO master_system_inspections (id, job_id, system_key, created_by_user_id)
         VALUES ($1, $2, 'automatic_sprinkler', $3)`,
        [groupId, payload.jobId, actorUserId ?? null]
      );
      await client.query(
        `INSERT INTO master_system_form_instances (
          id, inspection_group_id, client_uuid, instance_key, zone_id, location_id,
          zone_snapshot, location_snapshot, display_sequence, master_template_version_id,
          customer_configuration_revision_id, snapshot_schema_version, inspection_snapshot,
          response_schema_version, response_payload, request_fingerprint, status, performed_at,
          original_creator_snapshot, synced_by_user_id
        ) VALUES ($1,$2,$3,'primary',NULL,NULL,NULL,NULL,1,$4,$5,1,$6,1,$7,$8,'submitted',$9,$10,$11)`,
        [
          randomUUID(), groupId, payload.clientUuid, payload.masterTemplate.id,
          payload.configuration.revisionId, canonicalSnapshot, payload.responses,
          requestFingerprint, payload.performedAt, payload.originalCreatorSnapshot, actorUserId
        ]
      );
      await client.query("COMMIT");
      result.acceptedIds.push(payload.clientUuid);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const conflict = requestFingerprint
        ? await classifyAfterConflict(payload, requestFingerprint).catch(() => undefined)
        : undefined;
      if (conflict && "duplicate" in conflict) result.duplicateIds.push(payload.clientUuid);
      else if (conflict && "failure" in conflict) result.failed.push(conflict.failure);
      else if (isExpectedGroupConflict(error)) {
        result.failed.push(failure(payload.clientUuid, "ACTIVE_INSPECTION_EXISTS", "This job already has an Automatic Sprinkler inspection"));
      } else {
        result.failed.push(failure(payload.clientUuid, "SERVER_ERROR", "Automatic Sprinkler inspection could not be saved"));
      }
    } finally {
      client.release();
    }
  }
  return result;
}
