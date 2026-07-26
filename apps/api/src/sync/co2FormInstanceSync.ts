import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { resolveCo2Controls, type ResolvedCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type UnknownRecord = Record<string, unknown>;
type SyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type Payload = {
  clientUuid: string; jobId: string; systemKey: "co2_fire_extinguisher"; instanceKey: string;
  configuredZoneId: string | null; configuredLocationId: string; displaySequence: number;
  originalCreatorSnapshot: UnknownRecord | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: 1 };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: UnknownRecord; responses: UnknownRecord; performedAt: string;
};
type JobRow = {
  status: string; job_reference: string; title: string; master_template_version_id: string;
  customer_configuration_revision_id: string; configuration_snapshot: UnknownRecord;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const isTimestamp = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const fail = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });
const exactKeys = (value: UnknownRecord, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const validText = (value: unknown, max: number, required = false) => typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function validCreator(value: unknown) {
  return value === null || (isRecord(value) && exactKeys(value, ["source", "userId", "username", "role", "capturedAt"])
    && value.source === "device_reported" && Number.isInteger(value.userId) && typeof value.username === "string"
    && (value.role === "admin" || value.role === "inspector") && isTimestamp(value.capturedAt));
}
function validateEnvelope(item: SyncItem): { payload?: Payload; failure?: SyncFailure } {
  const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!isUuid(item.operationId) || item.entityType !== "masterSystemFormInstance" || item.action !== "create" || !isUuid(item.entityId) || !isRecord(item.payload)) return { failure: fail(id, "VALIDATION_ERROR", "CO2 form instance operation is invalid") };
  const p = item.payload;
  if (!isUuid(p.clientUuid) || p.clientUuid !== item.entityId || !isUuid(p.jobId) || p.systemKey !== "co2_fire_extinguisher"
    || typeof p.instanceKey !== "string" || !isUuid(p.configuredLocationId) || !(p.configuredZoneId === null || isUuid(p.configuredZoneId))
    || !Number.isInteger(p.displaySequence) || (p.displaySequence as number) < 1 || !validCreator(p.originalCreatorSnapshot)
    || !isRecord(p.masterTemplate) || !isUuid(p.masterTemplate.id) || p.masterTemplate.code !== "MFE-FSSR" || p.masterTemplate.version !== 1
    || !isRecord(p.configuration) || !isUuid(p.configuration.revisionId) || !Number.isInteger(p.configuration.revisionNumber)
    || !isRecord(p.inspectionSnapshot) || !isRecord(p.responses) || !isTimestamp(p.performedAt)) {
    return { failure: fail(id, "VALIDATION_ERROR", "CO2 form instance payload is invalid") };
  }
  return { payload: p as unknown as Payload };
}
function allowed(control: { options: Array<{ value: string }> }, value: unknown) {
  return typeof value === "string" && control.options.some((option) => option.value === value);
}
function validChecklist(value: unknown, definitions: ResolvedCo2Controls["chargerAndBatteries"]) {
  if (!isRecord(value) || !exactKeys(value, definitions.map((item) => item.key))) return false;
  return definitions.every((item) => {
    const response = value[item.key];
    return isRecord(response) && exactKeys(response, ["result", "remarks"]) && allowed(item.result, response.result) && validText(response.remarks, item.remarks.maxLength);
  });
}
function validateResponses(value: UnknownRecord, controls: ResolvedCo2Controls) {
  if (!exactKeys(value, ["controlPanelLocation", "detectorRows", "chargerAndBatteries", "physicalOutlook", "mainFunctionKeys", "comments"])
    || !validText(value.controlPanelLocation, controls.controlPanelLocation.maxLength, true)
    || !Array.isArray(value.detectorRows) || value.detectorRows.length < controls.detectorRows.minimum || value.detectorRows.length > controls.detectorRows.maximum
    || !validChecklist(value.chargerAndBatteries, controls.chargerAndBatteries)
    || !validChecklist(value.physicalOutlook, controls.physicalOutlook)
    || !validChecklist(value.mainFunctionKeys, controls.mainFunctionKeys)
    || !validText(value.comments, controls.comments.maxLength)) return false;
  const seen = new Set<string>();
  const sequences = new Set<number>();
  return value.detectorRows.every((candidate) => {
    if (!isRecord(candidate) || !exactKeys(candidate, ["rowUuid", "displaySequence", "alarmZone", "location", "heatDetectorStatus", "smokeDetectorStatus", "remarks"])
      || !isUuid(candidate.rowUuid) || seen.has(candidate.rowUuid) || !Number.isInteger(candidate.displaySequence)
      || (candidate.displaySequence as number) < 1 || sequences.has(candidate.displaySequence as number)
      || !validText(candidate.alarmZone, controls.detectorRows.alarmZone.maxLength, true)
      || !validText(candidate.location, controls.detectorRows.location.maxLength, true)
      || !validText(candidate.remarks, controls.detectorRows.remarks.maxLength)) return false;
    seen.add(candidate.rowUuid);
    sequences.add(candidate.displaySequence as number);
    const heat = candidate.heatDetectorStatus;
    const smoke = candidate.smokeDetectorStatus;
    if (heat !== null && !allowed(controls.detectorRows.heatDetector.result, heat)) return false;
    if (smoke !== null && !allowed(controls.detectorRows.smokeDetector.result, smoke)) return false;
    return allowed(controls.detectorRows.heatDetector.result, heat) || allowed(controls.detectorRows.smokeDetector.result, smoke);
  });
}
function findSystem(snapshot: UnknownRecord) {
  const systems = Array.isArray(snapshot.enabledSystems) ? snapshot.enabledSystems.filter(isRecord) : [];
  return systems.find((system) => system.systemKey === "co2_fire_extinguisher" && system.definitionStatus === "confirmed");
}
function canonicalInstance(system: UnknownRecord, locationId: string) {
  const locations = Array.isArray(system.locations) ? system.locations.filter(isRecord) : [];
  const zones = Array.isArray(system.zones) ? system.zones.filter(isRecord) : [];
  const location = locations.find((item) => item.id === locationId);
  if (!location || !isUuid(location.id) || typeof location.key !== "string" || typeof location.displayName !== "string" || !Number.isInteger(location.sortOrder)) return;
  const zone = location.zoneId === null ? null : zones.find((item) => item.id === location.zoneId);
  if (location.zoneId !== null && (!zone || !isUuid(zone.id) || typeof zone.key !== "string" || typeof zone.displayName !== "string" || !Number.isInteger(zone.sortOrder))) return;
  const ordered = locations.slice().sort((a, b) => {
    const az = zones.find((zoneItem) => zoneItem.id === a.zoneId);
    const bz = zones.find((zoneItem) => zoneItem.id === b.zoneId);
    return Number(az?.sortOrder ?? Number.MAX_SAFE_INTEGER) - Number(bz?.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || Number(a.sortOrder) - Number(b.sortOrder) || String(a.id).localeCompare(String(b.id));
  });
  return {
    instanceKey: `location:${location.id}`,
    displaySequence: ordered.findIndex((item) => item.id === location.id) + 1,
    location,
    zone: zone ?? null
  };
}
async function classifyConflict(client: PoolClient, payload: Payload, fingerprint: string, groupId: string) {
  const byUuid = await client.query<{ request_fingerprint: string }>("SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid = $1", [payload.clientUuid]);
  if (byUuid.rowCount) return byUuid.rows[0].request_fingerprint === fingerprint
    ? { duplicate: true as const }
    : { failure: fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different CO2 data") };
  const byKey = await client.query("SELECT 1 FROM master_system_form_instances WHERE inspection_group_id = $1 AND instance_key = $2", [groupId, payload.instanceKey]);
  return byKey.rowCount
    ? { failure: fail(payload.clientUuid, "INSTANCE_ALREADY_EXISTS", "This configured CO2 location already has a different form instance") }
    : undefined;
}

export async function syncCo2FormInstances(items: SyncItem[], actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };
  for (const item of items) {
    const checked = validateEnvelope(item);
    if (!checked.payload) { result.failed.push(checked.failure ?? fail("unknown", "VALIDATION_ERROR", "Invalid CO2 form")); continue; }
    const payload = checked.payload;
    const client = await pool.connect();
    let requestFingerprint = "";
    try {
      await client.query("BEGIN");
      const jobResult = await client.query<JobRow>("SELECT status, job_reference, title, master_template_version_id, customer_configuration_revision_id, configuration_snapshot FROM inspection_jobs WHERE id = $1", [payload.jobId]);
      const job = jobResult.rows[0];
      const configuration = job && isRecord(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined;
      const template = job && isRecord(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined;
      const system = job ? findSystem(job.configuration_snapshot) : undefined;
      if (!job || !system || !configuration || !template || job.master_template_version_id !== payload.masterTemplate.id
        || job.customer_configuration_revision_id !== payload.configuration.revisionId || configuration.revisionId !== payload.configuration.revisionId
        || configuration.revisionNumber !== payload.configuration.revisionNumber || template.id !== payload.masterTemplate.id
        || template.code !== "MFE-FSSR" || template.version !== 1) {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "CO2 job configuration is unavailable")); continue;
      }
      const canonical = canonicalInstance(system, payload.configuredLocationId);
      if (!canonical || canonical.instanceKey !== payload.instanceKey || canonical.displaySequence !== payload.displaySequence
        || (canonical.zone?.id ?? null) !== payload.configuredZoneId) {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "Configured CO2 location identity is invalid")); continue;
      }
      const definitionResult = await client.query<{ definition: unknown; definition_status: string }>("SELECT definition, definition_status FROM master_service_report_systems WHERE template_version_id = $1 AND system_key = 'co2_fire_extinguisher'", [payload.masterTemplate.id]);
      if (definitionResult.rowCount !== 1 || definitionResult.rows[0].definition_status !== "confirmed") {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "CO2 definition is unavailable")); continue;
      }
      let controls: ResolvedCo2Controls;
      try { controls = resolveCo2Controls(definitionResult.rows[0].definition, "MFE-FSSR", 1); }
      catch { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "CO2 definition is invalid")); continue; }
      if (!validateResponses(payload.responses, controls)) {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "CO2 form is incomplete or invalid")); continue;
      }
      const fingerprint = createHash("sha256").update(canonicalize({
        clientUuid: payload.clientUuid, jobId: payload.jobId, systemKey: payload.systemKey,
        instanceKey: canonical.instanceKey, configuredZoneId: canonical.zone?.id ?? null,
        configuredLocationId: canonical.location.id, displaySequence: canonical.displaySequence,
        masterTemplate: payload.masterTemplate, configuration: payload.configuration,
        responses: payload.responses, performedAt: payload.performedAt,
        originalCreatorSnapshot: payload.originalCreatorSnapshot
      })).digest("hex");
      requestFingerprint = fingerprint;
      const existingUuid = await client.query<{ request_fingerprint: string }>("SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid = $1", [payload.clientUuid]);
      if (existingUuid.rowCount) {
        await client.query("ROLLBACK");
        if (existingUuid.rows[0].request_fingerprint === fingerprint) result.duplicateIds.push(payload.clientUuid);
        else result.failed.push(fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different CO2 data"));
        continue;
      }
      if (job.status !== "open") { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "Inspection job is closed")); continue; }
      const groupId = randomUUID();
      await client.query("INSERT INTO master_system_inspections (id, job_id, system_key, created_by_user_id) VALUES ($1, $2, 'co2_fire_extinguisher', $3) ON CONFLICT (job_id, system_key) DO NOTHING", [groupId, payload.jobId, actorUserId ?? null]);
      const group = await client.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id = $1 AND system_key = 'co2_fire_extinguisher' FOR UPDATE", [payload.jobId]);
      const resolvedGroupId = group.rows[0]?.id;
      if (!resolvedGroupId) throw new Error("CO2 group could not be resolved");
      const conflict = await classifyConflict(client, payload, fingerprint, resolvedGroupId);
      if (conflict) {
        await client.query("ROLLBACK");
        if ("duplicate" in conflict) result.duplicateIds.push(payload.clientUuid);
        else result.failed.push(conflict.failure);
        continue;
      }
      const acceptedAt = new Date().toISOString();
      const zoneSnapshot = canonical.zone ? { id: canonical.zone.id, key: canonical.zone.key, displayName: canonical.zone.displayName, sortOrder: canonical.zone.sortOrder } : null;
      const locationSnapshot = { id: canonical.location.id, key: canonical.location.key, displayName: canonical.location.displayName, sortOrder: canonical.location.sortOrder };
      const inspectionSnapshot = {
        schemaVersion: 1, acceptedAt,
        job: { id: payload.jobId, reference: job.job_reference, title: job.title },
        customer: job.configuration_snapshot.customer,
        configuration: job.configuration_snapshot.configuration,
        template: { id: payload.masterTemplate.id, code: "MFE-FSSR", version: 1 },
        system: { key: "co2_fire_extinguisher", displayName: system.displayName, definition: definitionResult.rows[0].definition, resolvedControls: controls, repetitionMode: "per_location" },
        instance: { instanceKey: canonical.instanceKey, displaySequence: canonical.displaySequence, zone: zoneSnapshot, location: locationSnapshot }
      };
      await client.query(
        `INSERT INTO master_system_form_instances
          (id, inspection_group_id, client_uuid, instance_key, zone_id, location_id, zone_snapshot, location_snapshot,
           display_sequence, master_template_version_id, customer_configuration_revision_id, snapshot_schema_version,
           inspection_snapshot, response_schema_version, response_payload, request_fingerprint, status, performed_at,
           original_creator_snapshot, synced_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,1,$13,$14,'submitted',$15,$16,$17)`,
        [randomUUID(), resolvedGroupId, payload.clientUuid, canonical.instanceKey, canonical.zone?.id ?? null,
          canonical.location.id, zoneSnapshot, locationSnapshot, canonical.displaySequence, payload.masterTemplate.id,
          payload.configuration.revisionId, inspectionSnapshot, payload.responses, fingerprint, payload.performedAt,
          payload.originalCreatorSnapshot, actorUserId]
      );
      await client.query("COMMIT");
      result.acceptedIds.push(payload.clientUuid);
    } catch {
      await client.query("ROLLBACK").catch(() => undefined);
      const group = await pool.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id = $1 AND system_key = 'co2_fire_extinguisher'", [payload.jobId]).catch(() => ({ rows: [] }));
      const conflict = group.rows[0] && requestFingerprint
        ? await classifyConflict(client, payload, requestFingerprint, group.rows[0].id).catch(() => undefined)
        : undefined;
      const conflictFailure = conflict && "failure" in conflict ? conflict.failure : undefined;
      if (conflict && "duplicate" in conflict) result.duplicateIds.push(payload.clientUuid);
      else if (conflictFailure) result.failed.push(conflictFailure);
      else result.failed.push(fail(payload.clientUuid, "SERVER_ERROR", "CO2 form could not be saved"));
    } finally { client.release(); }
  }
  return result;
}
