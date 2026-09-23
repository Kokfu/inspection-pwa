import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { resolveFm200Controls, type ResolvedFm200Controls } from "../inspections/templates/fm200DefinitionControls.js";
import { parseV7EvidenceManifest, resolveV7EvidenceContract, v7EvidenceContractSha256, v7EvidenceManifestFailureMessage } from "../inspections/evidence/v7EvidenceContracts.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

/**
 * FM200 clone of `co2FormInstanceSync.ts`, stripped of the Wet-Chemical
 * variant (FM200 has no analogous second system sharing this file). FM200 is
 * a fully independent system - own key, own DB rows/evidence/sync - so a
 * customer can have both CO2 and FM200 enabled simultaneously with no shared
 * state. FM200 has no legacy pre-V7 contract, but this mirrors CO2's dual
 * version-branch machinery unchanged: a non-V7 `masterTemplate.version` simply
 * finds no `master_service_report_systems` row for `fm200_fire_suppression`
 * (it only exists on the V7 template) and fails closed with VALIDATION_ERROR,
 * exactly like any other malformed definition reference.
 */
type UnknownRecord = Record<string, unknown>;
type SyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type Payload = {
  clientUuid: string; jobId: string; systemKey: "fm200_fire_suppression"; instanceKey: string;
  configuredZoneId: string | null; configuredLocationId: string; displaySequence: number;
  originalCreatorSnapshot: UnknownRecord | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: number };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: UnknownRecord; responses: UnknownRecord; performedAt: string; evidenceManifest?: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>;
};
type JobRow = {
  status: string; job_reference: string; title: string; master_template_version_id: string;
  customer_configuration_revision_id: string; configuration_snapshot: UnknownRecord;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const v7AcceptedEvidenceUniqueConstraints = new Set([
  "staged_inspection_evidence_v7_accepted_source_per_job_system",
  "staged_inspection_evidence_v7_accepted_stored_per_job_system"
]);
const locationInstanceKey = /^location:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const payloadKeys = ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "performedAt"];
const manifestKeys = ["photoUuid", "fieldPath", "sourceSha256"];
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const isTimestamp = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const fail = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });
const v7Unavailable = (id: string) => fail(id, "JOB_ACCESS_DENIED", "This V7 inspection is unavailable");
export const isV7AcceptedEvidenceUniqueViolation = (error: unknown) => isRecord(error)
  && error.code === "23505" && typeof error.constraint === "string"
  && v7AcceptedEvidenceUniqueConstraints.has(error.constraint);
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function validCreator(value: unknown) {
  return value === null || (isRecord(value) && Object.keys(value).length === 5 && ["source", "userId", "username", "role", "capturedAt"].every((key) => key in value)
    && value.source === "device_reported" && Number.isInteger(value.userId) && typeof value.username === "string"
    && (value.role === "admin" || value.role === "inspector") && isTimestamp(value.capturedAt));
}
/** Structural-only preflight lets an exact idempotent retry be recognized before
 * Job-open checks. The frozen definition adapter below is the sole authority
 * for field paths, allowed values, and required evidence. */
function v7Manifest(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const fields = new Set<string>(), photos = new Set<string>(), sources = new Set<string>();
  const result: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }> = [];
  for (const entry of value) {
    if (!isRecord(entry) || Object.keys(entry).length !== manifestKeys.length || !manifestKeys.every((key) => key in entry)) return undefined;
    const photoUuid = entry.photoUuid, fieldPath = entry.fieldPath, sourceSha256 = entry.sourceSha256;
    if (!isUuid(photoUuid) || typeof fieldPath !== "string" || typeof sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceSha256) || fields.has(fieldPath) || photos.has(photoUuid) || sources.has(sourceSha256)) return undefined;
    fields.add(fieldPath); photos.add(photoUuid); sources.add(sourceSha256); result.push({ photoUuid, fieldPath, sourceSha256 });
  }
  return result.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath));
}
function validateEnvelope(item: SyncItem): { payload?: Payload; failure?: SyncFailure } {
  const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!isRecord(item) || !isUuid(item.operationId) || item.entityType !== "masterSystemFormInstance" || item.action !== "create" || !isUuid(item.entityId) || !isRecord(item.payload)) return { failure: fail(id, "VALIDATION_ERROR", "FM200 form instance operation is invalid") };
  const p = item.payload;
  const keys = p.masterTemplate && isRecord(p.masterTemplate) && p.masterTemplate.version === 7 ? [...payloadKeys, "evidenceManifest"] : payloadKeys;
  if (Object.keys(p).length !== keys.length || !keys.every((key) => key in p)
    || !isUuid(p.clientUuid) || p.clientUuid !== item.entityId || !isUuid(p.jobId)
    || p.systemKey !== "fm200_fire_suppression"
    || typeof p.instanceKey !== "string" || !locationInstanceKey.test(p.instanceKey)
    || !isUuid(p.configuredLocationId) || p.instanceKey !== `location:${p.configuredLocationId}` || !(p.configuredZoneId === null || isUuid(p.configuredZoneId))
    || !Number.isInteger(p.displaySequence) || (p.displaySequence as number) < 1 || !validCreator(p.originalCreatorSnapshot)
    || !isRecord(p.masterTemplate) || !isUuid(p.masterTemplate.id) || p.masterTemplate.code !== "MFE-FSSR"
    || !Number.isSafeInteger(p.masterTemplate.version) || Number(p.masterTemplate.version) < 1
    || !isRecord(p.configuration) || !isUuid(p.configuration.revisionId) || !Number.isInteger(p.configuration.revisionNumber)
    || !isRecord(p.inspectionSnapshot) || !isRecord(p.responses) || !isTimestamp(p.performedAt)
    || (p.masterTemplate.version === 7 && !v7Manifest(p.evidenceManifest))) {
    return { failure: fail(id, "VALIDATION_ERROR", "FM200 form instance payload is invalid") };
  }
  const responses = p.masterTemplate.version === 7 ? canonicalV7Fm200Responses(p.responses) : p.responses;
  if (!responses) return { failure: fail(id, "VALIDATION_ERROR", "FM200 detector states are invalid") };
  return { payload: { ...p, responses } as unknown as Payload };
}
function allowed(control: { options: Array<{ value: string }> }, value: unknown) {
  return typeof value === "string" && control.options.some((option) => option.value === value);
}
const detectorStates = ["normal", "test", "isolation"] as const;
function canonicalV7DetectorStates(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > detectorStates.length || new Set(value).size !== value.length
    || !value.every((item) => typeof item === "string" && detectorStates.includes(item as typeof detectorStates[number]))) return undefined;
  return detectorStates.filter((item) => value.includes(item));
}
function canonicalV7Fm200Responses(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.detectorRows)) return undefined;
  const detectorRows = value.detectorRows.map((row) => {
    if (!isRecord(row)) return undefined;
    const heatDetectorStatus = canonicalV7DetectorStates(row.heatDetectorStatus);
    const smokeDetectorStatus = canonicalV7DetectorStates(row.smokeDetectorStatus);
    return !heatDetectorStatus || !smokeDetectorStatus ? undefined : { ...row, heatDetectorStatus, smokeDetectorStatus };
  });
  return detectorRows.some((row) => !row) ? undefined : { ...value, detectorRows };
}
export function validCanonicalDetectorStates(control: { options: Array<{ value: string }> }, value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.length <= control.options.length
    && value.every((item, index) => typeof item === "string" && control.options.some((option) => option.value === item)
      && (index === 0 || control.options.findIndex((option) => option.value === value[index - 1]) < control.options.findIndex((option) => option.value === item)));
}
function validChecklist(value: unknown, definitions: ResolvedFm200Controls["chargerAndBatteries"]) {
  if (!isRecord(value) || Object.keys(value).length !== definitions.length || !definitions.every((item) => item.key in value)) return false;
  return definitions.every((item) => {
    const response = value[item.key];
    return isRecord(response) && Object.keys(response).length === 2 && "result" in response && "remarks" in response
      && allowed(item.result, response.result) && typeof response.remarks === "string" && response.remarks.length <= item.remarks.maxLength;
  });
}
export function validateFm200Responses(value: UnknownRecord, controls: ResolvedFm200Controls) {
  const shellKeys = ["controlPanelLocation", "detectorRows", "chargerAndBatteries", "physicalOutlook", "mainFunctionKeys", "comments"];
  if (Object.keys(value).length !== shellKeys.length || !shellKeys.every((key) => key in value)
    || typeof value.controlPanelLocation !== "string" || !value.controlPanelLocation.trim() || value.controlPanelLocation.length > controls.controlPanelLocation.maxLength
    || !Array.isArray(value.detectorRows) || value.detectorRows.length < controls.detectorRows.minimum || value.detectorRows.length > controls.detectorRows.maximum
    || !validChecklist(value.chargerAndBatteries, controls.chargerAndBatteries)
    || !validChecklist(value.physicalOutlook, controls.physicalOutlook)
    || !validChecklist(value.mainFunctionKeys, controls.mainFunctionKeys)
    || typeof value.comments !== "string" || value.comments.length > controls.comments.maxLength) return false;
  const seen = new Set<string>();
  const sequences = new Set<number>();
  const rowKeys = ["rowUuid", "displaySequence", "alarmZone", "location", "heatDetectorStatus", "smokeDetectorStatus", "remarks"];
  return value.detectorRows.every((candidate) => {
    if (!isRecord(candidate) || Object.keys(candidate).length !== rowKeys.length || !rowKeys.every((key) => key in candidate)
      || !isUuid(candidate.rowUuid) || seen.has(candidate.rowUuid) || !Number.isInteger(candidate.displaySequence)
      || (candidate.displaySequence as number) < 1 || sequences.has(candidate.displaySequence as number)
      || typeof candidate.alarmZone !== "string" || !candidate.alarmZone.trim() || candidate.alarmZone.length > controls.detectorRows.alarmZone.maxLength
      || typeof candidate.location !== "string" || !candidate.location.trim() || candidate.location.length > controls.detectorRows.location.maxLength
      || typeof candidate.remarks !== "string" || candidate.remarks.length > controls.detectorRows.remarks.maxLength) return false;
    seen.add(candidate.rowUuid);
    sequences.add(candidate.displaySequence as number);
    return validCanonicalDetectorStates(controls.detectorRows.heatDetector.result, candidate.heatDetectorStatus)
      && validCanonicalDetectorStates(controls.detectorRows.smokeDetector.result, candidate.smokeDetectorStatus);
  });
}
function findSystem(snapshot: UnknownRecord, systemKey: Payload["systemKey"]) {
  const systems = Array.isArray(snapshot.enabledSystems) ? snapshot.enabledSystems.filter(isRecord) : [];
  return systems.find((system) => system.systemKey === systemKey && system.definitionStatus === "confirmed");
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
    : { failure: fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different FM200 data") };
  const byKey = await client.query("SELECT 1 FROM master_system_form_instances WHERE inspection_group_id = $1 AND instance_key = $2", [groupId, payload.instanceKey]);
  return byKey.rowCount
    ? { failure: fail(payload.clientUuid, "INSTANCE_ALREADY_EXISTS", "This configured FM200 location already has a different form instance") }
    : undefined;
}

export async function syncFm200FormInstances(items: SyncItem[], actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };
  for (const item of items) {
    const checked = validateEnvelope(item);
    if (!checked.payload) { result.failed.push(checked.failure ?? fail("unknown", "VALIDATION_ERROR", "Invalid FM200 form")); continue; }
    const payload = checked.payload;
    const client = await pool.connect();
    let requestFingerprint = "";
    try {
      await client.query("BEGIN");
      const preManifest = payload.masterTemplate.version === 7 ? v7Manifest(payload.evidenceManifest) : [];
      if (payload.masterTemplate.version === 7 && !preManifest) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", v7EvidenceManifestFailureMessage(payload.evidenceManifest, "V7 evidence manifest is invalid"))); continue; }
      if (payload.masterTemplate.version === 7) {
        requestFingerprint = createHash("sha256").update(canonicalize({ clientUuid: payload.clientUuid, jobId: payload.jobId, systemKey: payload.systemKey, instanceKey: payload.instanceKey, configuredZoneId: payload.configuredZoneId, configuredLocationId: payload.configuredLocationId, displaySequence: payload.displaySequence, masterTemplate: payload.masterTemplate, configuration: payload.configuration, responses: payload.responses, performedAt: payload.performedAt, originalCreatorSnapshot: payload.originalCreatorSnapshot, evidenceManifest: preManifest })).digest("hex");
        const existing = await client.query<{ request_fingerprint: string; synced_by_user_id: string }>("SELECT instance.request_fingerprint,instance.synced_by_user_id FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE instance.client_uuid=$1 AND inspection.system_key=$2 FOR UPDATE", [payload.clientUuid, payload.systemKey]);
        if (existing.rowCount) { await client.query("ROLLBACK"); if (existing.rows[0]!.synced_by_user_id !== String(actorUserId)) result.failed.push(v7Unavailable(payload.clientUuid)); else if (existing.rows[0]!.request_fingerprint === requestFingerprint) result.duplicateIds.push(payload.clientUuid); else result.failed.push(fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different FM200 data")); continue; }
      }
      const jobResult = await client.query<JobRow>(payload.masterTemplate.version === 7 ? "SELECT status, job_reference, title, master_template_version_id, customer_configuration_revision_id, configuration_snapshot FROM inspection_jobs WHERE id = $1 AND status='open' AND technician_visible=true FOR UPDATE" : "SELECT status, job_reference, title, master_template_version_id, customer_configuration_revision_id, configuration_snapshot FROM inspection_jobs WHERE id = $1 FOR UPDATE", [payload.jobId]);
      const job = jobResult.rows[0];
      const configuration = job && isRecord(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined;
      const template = job && isRecord(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined;
      const system = job ? findSystem(job.configuration_snapshot, payload.systemKey) : undefined;
      if (!job || !system || !configuration || !template || job.master_template_version_id !== payload.masterTemplate.id
        || job.customer_configuration_revision_id !== payload.configuration.revisionId || configuration.revisionId !== payload.configuration.revisionId
        || configuration.revisionNumber !== payload.configuration.revisionNumber || template.id !== payload.masterTemplate.id
        || template.code !== "MFE-FSSR" || template.version !== payload.masterTemplate.version) {
        await client.query("ROLLBACK"); result.failed.push(payload.masterTemplate.version === 7 ? v7Unavailable(payload.clientUuid) : fail(payload.clientUuid, "VALIDATION_ERROR", "FM200 job configuration is unavailable")); continue;
      }
      const canonical = canonicalInstance(system, payload.configuredLocationId);
      if (!canonical || canonical.instanceKey !== payload.instanceKey || canonical.displaySequence !== payload.displaySequence
        || (canonical.zone?.id ?? null) !== payload.configuredZoneId) {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "Configured FM200 location identity is invalid")); continue;
      }
      const definitionResult = await client.query<{ definition: unknown; definition_status: string }>("SELECT definition, definition_status FROM master_service_report_systems WHERE template_version_id = $1 AND system_key = $2", [payload.masterTemplate.id, payload.systemKey]);
      if (definitionResult.rowCount !== 1 || definitionResult.rows[0].definition_status !== "confirmed") {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "FM200 definition is unavailable")); continue;
      }
      let controls: ResolvedFm200Controls;
      try { controls = resolveFm200Controls(definitionResult.rows[0].definition, "MFE-FSSR", payload.masterTemplate.version); }
      catch { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "FM200 definition is invalid")); continue; }
      if (controls.source.systemKey !== payload.systemKey) {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "FM200 definition identity is invalid")); continue;
      }
      if (!validateFm200Responses(payload.responses, controls)) {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "FM200 form is incomplete or invalid")); continue;
      }
      const v7Adapter = payload.masterTemplate.version === 7 ? resolveV7EvidenceContract({ systemKey: payload.systemKey, templateId: payload.masterTemplate.id, templateVersion: 7, definition: definitionResult.rows[0].definition, contractSha256: v7EvidenceContractSha256(definitionResult.rows[0].definition) }) : undefined;
      const evidenceManifest = v7Adapter ? parseV7EvidenceManifest(payload.evidenceManifest, v7Adapter, payload.responses) : [];
      if (payload.masterTemplate.version === 7 && (!v7Adapter || !evidenceManifest || !actorUserId)) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", v7Adapter && actorUserId ? v7EvidenceManifestFailureMessage(payload.evidenceManifest, "V7 evidence photos do not match the current findings") : "V7 evidence manifest is invalid")); continue; }
      if (payload.masterTemplate.version === 7) {
        const reservation = await client.query<{ job_id: string; system_key: string; master_template_version_id: string; master_template_version: number; system_contract_sha256: string; reserved_by_user_id: string }>(
          "SELECT job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id FROM inspection_evidence_reservations WHERE inspection_client_uuid=$1 FOR UPDATE",
          [payload.clientUuid]
        );
        const row = reservation.rows[0]; const contractSha256 = v7EvidenceContractSha256(definitionResult.rows[0].definition);
        if (((evidenceManifest?.length ?? 0) > 0 || row) && (!row || row.job_id !== payload.jobId || row.system_key !== payload.systemKey || row.master_template_version_id !== payload.masterTemplate.id
          || row.master_template_version !== 7 || row.system_contract_sha256 !== contractSha256 || row.reserved_by_user_id !== String(actorUserId))) {
          await client.query("ROLLBACK"); result.failed.push(v7Unavailable(payload.clientUuid)); continue;
        }
      }
      const fingerprint = createHash("sha256").update(canonicalize({
        clientUuid: payload.clientUuid, jobId: payload.jobId, systemKey: payload.systemKey,
        instanceKey: canonical.instanceKey, configuredZoneId: canonical.zone?.id ?? null,
        configuredLocationId: canonical.location.id, displaySequence: canonical.displaySequence,
        masterTemplate: payload.masterTemplate, configuration: payload.configuration,
        responses: payload.responses, performedAt: payload.performedAt,
        originalCreatorSnapshot: payload.originalCreatorSnapshot, evidenceManifest
      })).digest("hex");
      requestFingerprint = fingerprint;
      const existingUuid = await client.query<{ request_fingerprint: string; synced_by_user_id: string }>("SELECT request_fingerprint,synced_by_user_id FROM master_system_form_instances WHERE client_uuid = $1", [payload.clientUuid]);
      if (existingUuid.rowCount) {
        await client.query("ROLLBACK");
        if (payload.masterTemplate.version === 7 && existingUuid.rows[0].synced_by_user_id !== String(actorUserId)) result.failed.push(fail(payload.clientUuid, "JOB_ACCESS_DENIED", "This V7 form is not available to this actor"));
        else if (existingUuid.rows[0].request_fingerprint === fingerprint) result.duplicateIds.push(payload.clientUuid);
        else result.failed.push(fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different FM200 data"));
        continue;
      }
      if (job.status !== "open") {
        await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "JOB_CLOSED", "Inspection job is completed")); continue;
      }
      const groupId = randomUUID();
      await client.query("INSERT INTO master_system_inspections (id, job_id, system_key, created_by_user_id) VALUES ($1, $2, $3, $4) ON CONFLICT (job_id, system_key) DO NOTHING", [groupId, payload.jobId, payload.systemKey, actorUserId ?? null]);
      const group = await client.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id = $1 AND system_key = $2 FOR UPDATE", [payload.jobId, payload.systemKey]);
      const resolvedGroupId = group.rows[0]?.id;
      if (!resolvedGroupId) throw new Error("FM200 group could not be resolved");
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
      const schemaVersion = payload.masterTemplate.version === 7 ? 2 : 1;
      const inspectionSnapshot = {
        schemaVersion, acceptedAt,
        job: { id: payload.jobId, reference: job.job_reference, title: job.title },
        customer: job.configuration_snapshot.customer,
        configuration: job.configuration_snapshot.configuration,
        template: { id: payload.masterTemplate.id, code: "MFE-FSSR", version: payload.masterTemplate.version },
        system: { key: payload.systemKey, displayName: system.displayName, definition: definitionResult.rows[0].definition, resolvedControls: controls, repetitionMode: "per_location" },
        instance: { instanceKey: canonical.instanceKey, displaySequence: canonical.displaySequence, zone: zoneSnapshot, location: locationSnapshot }
      };
      const formInstanceId = randomUUID();
      if (evidenceManifest && evidenceManifest.length) {
        const staged = await client.query<{ photo_uuid: string; field_path: string; source_sha256: string; stored_sha256: string; uploader_user_id: string; job_id: string; system_key: string; master_template_version_id: string; master_template_version: number; system_contract_sha256: string }>(`SELECT photo_uuid,field_path,source_sha256,stored_sha256,uploader_user_id,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256 FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 AND status='staged' FOR UPDATE`, [payload.clientUuid]);
        const byPath = new Map(staged.rows.map((row) => [row.field_path, row]));
        const contractSha256 = v7EvidenceContractSha256(definitionResult.rows[0].definition);
        // Two different source images can still normalize to the same stored bytes,
        // which the manifest check cannot see.  Reported on its own rather than as
        // "not available to this actor", which is untrue and unactionable (G7).
        if (staged.rows.length === evidenceManifest.length && new Set(staged.rows.map((row) => row.stored_sha256)).size !== staged.rows.length) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_NOT_STAGED", "Each finding needs its own photo; two findings resolved to the same stored image")); continue; }
        if (staged.rows.length !== evidenceManifest.length || evidenceManifest.some((entry) => { const row = byPath.get(entry.fieldPath); return !row || row.photo_uuid !== entry.photoUuid || row.source_sha256 !== entry.sourceSha256 || row.job_id !== payload.jobId || row.system_key !== payload.systemKey || row.master_template_version_id !== payload.masterTemplate.id || row.master_template_version !== 7 || row.system_contract_sha256 !== contractSha256 || row.uploader_user_id !== String(actorUserId); })) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "JOB_ACCESS_DENIED", "This V7 form is not available to this actor")); continue; }
        const acceptedHashes = await client.query<{ photo_uuid: string; field_path: string; source_sha256: string; stored_sha256: string }>(`SELECT photo_uuid,field_path,source_sha256,stored_sha256 FROM staged_inspection_evidence WHERE job_id=$1 AND system_key=$2 AND master_template_version=7 AND status='accepted' AND (photo_uuid=ANY($3::uuid[]) OR source_sha256=ANY($4::text[]) OR stored_sha256=ANY($5::text[])) FOR UPDATE`, [payload.jobId, payload.systemKey, staged.rows.map((row) => row.photo_uuid), staged.rows.map((row) => row.source_sha256), staged.rows.map((row) => row.stored_sha256)]);
        if (acceptedHashes.rowCount) {
          // This is a permanent, already-committed job+system collision, not a
          // transient upload failure. Name the bound canonical field so the
          // technician can return the Failed form to Draft and replace it.
          await client.query("ROLLBACK");
          result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", `V7 evidence for ${acceptedHashes.rows[0]!.field_path} is already bound to another location in this Job`));
          continue;
        }
      }
      if (payload.masterTemplate.version === 7) {
        await client.query(
          `INSERT INTO master_system_form_instances
            (id, inspection_group_id, client_uuid, instance_key, zone_id, location_id, zone_snapshot, location_snapshot,
             display_sequence, master_template_version_id, customer_configuration_revision_id, snapshot_schema_version,
             inspection_snapshot, response_schema_version, response_payload, request_fingerprint, status, performed_at,
             original_creator_snapshot, synced_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12,$14,$15,'submitted',$16,$17,$18)`,
          [formInstanceId, resolvedGroupId, payload.clientUuid, canonical.instanceKey, canonical.zone?.id ?? null,
            canonical.location.id, zoneSnapshot, locationSnapshot, canonical.displaySequence, payload.masterTemplate.id,
            payload.configuration.revisionId, schemaVersion, inspectionSnapshot, payload.responses, fingerprint, payload.performedAt,
            payload.originalCreatorSnapshot, actorUserId]
        );
      } else {
        await client.query(
          `INSERT INTO master_system_form_instances
            (id, inspection_group_id, client_uuid, instance_key, zone_id, location_id, zone_snapshot, location_snapshot,
             display_sequence, master_template_version_id, customer_configuration_revision_id, snapshot_schema_version,
             inspection_snapshot, response_schema_version, response_payload, request_fingerprint, status, performed_at,
             original_creator_snapshot, synced_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,1,$13,$14,'submitted',$15,$16,$17)`,
          [formInstanceId, resolvedGroupId, payload.clientUuid, canonical.instanceKey, canonical.zone?.id ?? null,
            canonical.location.id, zoneSnapshot, locationSnapshot, canonical.displaySequence, payload.masterTemplate.id,
            payload.configuration.revisionId, inspectionSnapshot, payload.responses, fingerprint, payload.performedAt,
            payload.originalCreatorSnapshot, actorUserId]
        );
      }
      if (evidenceManifest && evidenceManifest.length) await client.query(`UPDATE staged_inspection_evidence SET status='accepted', form_instance_id=$1, accepted_at=now() WHERE inspection_client_uuid=$2 AND status='staged'`, [formInstanceId, payload.clientUuid]);
      await client.query("COMMIT");
      result.acceptedIds.push(payload.clientUuid);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isV7AcceptedEvidenceUniqueViolation(error)) {
        result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence was accepted concurrently for another location and needs attention"));
        continue;
      }
      const group = await pool.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id = $1 AND system_key = $2", [payload.jobId, payload.systemKey]).catch(() => ({ rows: [] }));
      const conflict = group.rows[0] && requestFingerprint
        ? await classifyConflict(client, payload, requestFingerprint, group.rows[0].id).catch(() => undefined)
        : undefined;
      const conflictFailure = conflict && "failure" in conflict ? conflict.failure : undefined;
      if (conflict && "duplicate" in conflict) result.duplicateIds.push(payload.clientUuid);
      else if (conflictFailure) result.failed.push(conflictFailure);
      else result.failed.push(fail(payload.clientUuid, "SERVER_ERROR", "FM200 form could not be saved"));
    } finally { client.release(); }
  }
  return result;
}
