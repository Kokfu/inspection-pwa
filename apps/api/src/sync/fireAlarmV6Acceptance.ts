import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { fireAlarmV6ContractSha256, isFireAlarmV6EvidenceFieldPath, parseV6EvidenceManifest, reserveFireAlarmV6Session, type EvidenceManifestEntry, V6EvidenceError } from "../inspections/evidence/fireAlarmV6Evidence.js";
import { resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { expectedConfiguredRows } from "./fireAlarmInspectionSync.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type Value = Record<string, unknown>;
type SyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type TestRaceBoundary = "before_job_lock" | "after_job_lock";
let testRaceBarrier: ((boundary: TestRaceBoundary) => Promise<void>) | undefined;
/** Test-only in-process synchronization; production leaves this undefined. */
export function setFireAlarmV6AcceptanceTestBarrier(barrier: ((boundary: TestRaceBoundary) => Promise<void>) | undefined) { testRaceBarrier = barrier; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const checklistGroups: Array<[string, readonly string[], string]> = [
  ["chargerAndBatteries", ["main_supply", "battery", "charger"], "charger_batteries.charger_battery_checks"],
  ["mainFunctionKeys", ["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "spka_system", "alarm_lift_trip", "signal_gas_discharge"], "main_function_key.function_checks"]
];
const primaryKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "displaySequence", "assetReference", "alarmZone", "location", "manualCallPoint", "flowSwitch", "heatDetector", "smokeDetector", "remarks"];
const secondaryKeys = [...primaryKeys.filter((key) => !["alarmZone", "flowSwitch", "heatDetector", "smokeDetector", "manualCallPoint"].includes(key)), "alarmBell", "manualCallPoint"];
const isRecord = (value: unknown): value is Value => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Value, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const exactWithOptionalKeys = (value: Value, keys: readonly string[], optionalKeys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key) || optionalKeys.includes(key)) && keys.filter((key) => !optionalKeys.includes(key)).every((key) => key in value);
const text = (value: unknown, maximum: number) => typeof value === "string" && value.length <= maximum;
const canonicalize = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalize).join(",")}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}` : JSON.stringify(value);
const failure = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });

export function isFireAlarmV6Payload(item: SyncItem) {
  return isRecord(item.payload) && isRecord(item.payload.masterTemplate) && item.payload.masterTemplate.version === 6;
}

type Payload = { clientUuid: string; jobId: string; systemKey: "fire_alarm_detector"; instanceKey: "primary"; configuredZoneId: null; configuredLocationId: null; displaySequence: 1; originalCreatorSnapshot: Value | null; masterTemplate: { id: string; code: "MFE-FSSR"; version: 6 }; configuration: { revisionId: string; revisionNumber: number }; inspectionSnapshot: Value; responses: Value; evidenceManifest: EvidenceManifestEntry[]; performedAt: string };
function parse(item: SyncItem): Payload | undefined {
  if (!uuid.test(String(item.operationId)) || item.entityType !== "masterSystemInspection" || item.action !== "create" || !uuid.test(String(item.entityId)) || !isRecord(item.payload)) return undefined;
  const p = item.payload; const keys = ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "evidenceManifest", "performedAt"];
  if (!exact(p, keys) || !uuid.test(String(p.clientUuid)) || p.clientUuid !== item.entityId || !uuid.test(String(p.jobId)) || p.systemKey !== "fire_alarm_detector" || p.instanceKey !== "primary" || p.configuredZoneId !== null || p.configuredLocationId !== null || p.displaySequence !== 1 || !isRecord(p.masterTemplate) || !exact(p.masterTemplate, ["id", "code", "version"]) || !uuid.test(String(p.masterTemplate.id)) || p.masterTemplate.code !== "MFE-FSSR" || p.masterTemplate.version !== 6 || !isRecord(p.configuration) || !exact(p.configuration, ["revisionId", "revisionNumber"]) || !uuid.test(String(p.configuration.revisionId)) || !Number.isInteger(p.configuration.revisionNumber) || !isRecord(p.inspectionSnapshot) || !isRecord(p.responses) || !timestamp.test(String(p.performedAt)) || new Date(String(p.performedAt)).toISOString() !== p.performedAt) return undefined;
  const manifest = parseV6EvidenceManifest(p.evidenceManifest); if (!manifest) return undefined;
  return { ...p, evidenceManifest: manifest } as Payload;
}

function derivePoorFields(responses: Value) {
  const expectedResponse = ["schemaVersion", "controlPanelLocation", "primaryDeviceRows", "chargerAndBatteries", "mainFunctionKeys", "secondaryAlarmDeviceRows", "comments"];
  if (!exact(responses, expectedResponse) || responses.schemaVersion !== 2 || !text(responses.controlPanelLocation, 300) || !(responses.controlPanelLocation as string).trim() || !text(responses.comments, 4000) || !Array.isArray(responses.primaryDeviceRows) || !Array.isArray(responses.secondaryAlarmDeviceRows) || responses.primaryDeviceRows.length < 1 || responses.primaryDeviceRows.length > 250 || responses.secondaryAlarmDeviceRows.length > 250) return undefined;
  const poor = new Set<string>();
  for (const [group, keys, prefix] of checklistGroups) {
    const checklist = responses[group]; if (!isRecord(checklist) || !exact(checklist, keys)) return undefined;
    for (const key of keys) { const field = checklist[key]; if (!isRecord(field) || !exact(field, ["result", "remarks"]) || !["good", "poor", "not_relevant"].includes(String(field.result)) || !text(field.remarks, 2000) || (field.result === "poor" && !(field.remarks as string).trim())) return undefined; if (field.result === "poor") poor.add(`${prefix}.${key}`); }
  }
  const seenRows = new Set<string>();
  for (let index = 0; index < responses.primaryDeviceRows.length; index += 1) {
    const row = responses.primaryDeviceRows[index]; if (!isRecord(row) || !exactWithOptionalKeys(row, primaryKeys, ["assetReference"]) || !uuid.test(String(row.rowUuid)) || seenRows.has(String(row.rowUuid)) || row.displaySequence !== index + 1 || ("assetReference" in row && !text(row.assetReference, 250)) || !text(row.alarmZone, 200) || !(row.alarmZone as string).trim() || !text(row.location, 300) || !(row.location as string).trim() || !text(row.remarks, 2000) || ![row.manualCallPoint, row.flowSwitch, row.heatDetector, row.smokeDetector].every((item) => ["normal", "test", "isolation"].includes(String(item)))) return undefined; seenRows.add(row.rowUuid as string);
  }
  for (let index = 0; index < responses.secondaryAlarmDeviceRows.length; index += 1) {
    const row = responses.secondaryAlarmDeviceRows[index]; if (!isRecord(row) || !exactWithOptionalKeys(row, secondaryKeys, ["assetReference", "fieldRemarks"]) || !uuid.test(String(row.rowUuid)) || seenRows.has(String(row.rowUuid)) || row.displaySequence !== index + 1 || ("assetReference" in row && !text(row.assetReference, 250)) || !text(row.location, 300) || !(row.location as string).trim() || !text(row.remarks, 2000)) return undefined; seenRows.add(row.rowUuid as string);
    const remarks = "fieldRemarks" in row ? row.fieldRemarks : {}; if (!isRecord(remarks) || Object.keys(remarks).some((key) => key !== "alarmBell" && key !== "manualCallPoint") || Object.values(remarks).some((value) => !text(value, 2000))) return undefined;
    for (const [field, wire] of [["alarmBell", "alarm_bell"], ["manualCallPoint", "manual_call_point"]] as const) { const result = row[field]; if (!["good", "poor", "not_relevant"].includes(String(result))) return undefined; const path = `alarm_devices.alarm_device_rows.rows.${row.rowUuid}.${wire}`; if (!isFireAlarmV6EvidenceFieldPath(path)) return undefined; if (result === "poor") { if (!text(remarks[field], 2000) || !(remarks[field] as string).trim()) return undefined; poor.add(path); } }
  }
  return poor;
}

export async function acceptFireAlarmV6Inspection(item: SyncItem, actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] }; const payload = parse(item); const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!payload || !actorUserId) { result.failed.push(failure(id, "VALIDATION_ERROR", "V6 Fire Alarm operation is invalid")); return result; }
  const poorFields = derivePoorFields(payload.responses); if (!poorFields) { result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "V6 Fire Alarm response is malformed or missing a Poor remark")); return result; }
  const manifestPaths = new Set(payload.evidenceManifest.map((entry) => entry.fieldPath));
  if (manifestPaths.size !== poorFields.size || [...poorFields].some((fieldPath) => !manifestPaths.has(fieldPath))) { result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Each Poor V6 Fire Alarm field requires exactly one immutable photo manifest entry")); return result; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const committed = await client.query<{ form_instance_id: string; inspection_group_id: string; request_fingerprint: string; synced_by_user_id: number; inspection_snapshot: unknown; response_payload: unknown; job_id: string; system_key: string; master_template_version_id: string; customer_configuration_revision_id: string; reservation_job_id: string; reservation_system_key: string; system_contract_sha256: string; reserved_by_user_id: number }>(`SELECT instance.id AS form_instance_id,instance.inspection_group_id,instance.request_fingerprint,instance.synced_by_user_id,instance.inspection_snapshot,instance.response_payload,instance.master_template_version_id,instance.customer_configuration_revision_id,inspection.job_id,inspection.system_key,reservation.job_id AS reservation_job_id,reservation.system_key AS reservation_system_key,reservation.system_contract_sha256,reservation.reserved_by_user_id FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id INNER JOIN inspection_evidence_reservations reservation ON reservation.inspection_client_uuid=instance.client_uuid WHERE instance.client_uuid=$1 AND instance.status='submitted' AND inspection.system_key='fire_alarm_detector' AND instance.synced_by_user_id=$2 AND reservation.reserved_by_user_id=$2 FOR UPDATE OF instance,inspection,reservation`, [payload.clientUuid, actorUserId]);
    if (committed.rowCount) {
      const existing = committed.rows[0]!; const snapshot = isRecord(existing.inspection_snapshot) ? existing.inspection_snapshot : undefined;
      const storedSystem = snapshot && isRecord(snapshot.system) ? snapshot.system : undefined;
      const storedManifest = parseV6EvidenceManifest(snapshot?.evidenceManifest);
      const snapshotJob = snapshot && isRecord(snapshot.job) ? snapshot.job : undefined; const snapshotConfiguration = snapshot && isRecord(snapshot.configuration) ? snapshot.configuration : undefined; const snapshotTemplate = snapshot && isRecord(snapshot.template) ? snapshot.template : undefined;
      if (existing.synced_by_user_id !== actorUserId || existing.reserved_by_user_id !== actorUserId || existing.job_id !== payload.jobId || existing.reservation_job_id !== payload.jobId || existing.system_key !== payload.systemKey || existing.reservation_system_key !== payload.systemKey || existing.master_template_version_id !== payload.masterTemplate.id || existing.customer_configuration_revision_id !== payload.configuration.revisionId || !snapshot || snapshot.schemaVersion !== 2 || !snapshotJob || snapshotJob.id !== payload.jobId || !snapshotConfiguration || snapshotConfiguration.revisionId !== payload.configuration.revisionId || snapshotConfiguration.revisionNumber !== payload.configuration.revisionNumber || !snapshotTemplate || snapshotTemplate.id !== payload.masterTemplate.id || snapshotTemplate.version !== 6 || !storedSystem || storedSystem.systemKey !== payload.systemKey || snapshot.contractSha256 !== existing.system_contract_sha256 || !storedManifest || canonicalize(existing.response_payload) !== canonicalize(payload.responses) || canonicalize(storedManifest) !== canonicalize(payload.evidenceManifest)) {
        throw new V6EvidenceError(409, "IDEMPOTENCY_CONFLICT", "This inspection UUID belongs to different accepted authority");
      }
      const { definition: _definition, resolvedControls: _controls, repetitionMode: _mode, ...system } = storedSystem;
      const expected = createHash("sha256").update(canonicalize({ clientUuid: payload.clientUuid, authority: { job: snapshot.job, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system, contractSha256: snapshot.contractSha256 }, responses: payload.responses, evidenceManifest: payload.evidenceManifest, performedAt: payload.performedAt, actorUserId })).digest("hex");
      const bound = await client.query<{ photo_uuid: string; field_path: string; source_sha256: string; inspection_client_uuid: string; job_id: string; system_key: string; master_template_version_id: string; system_contract_sha256: string; uploader_user_id: number }>(`SELECT photo_uuid,field_path,source_sha256,inspection_client_uuid,job_id,system_key,master_template_version_id,system_contract_sha256,uploader_user_id FROM staged_inspection_evidence WHERE form_instance_id=$1 AND status='accepted' FOR UPDATE`, [existing.form_instance_id]);
      if (existing.request_fingerprint !== expected || bound.rowCount !== payload.evidenceManifest.length || bound.rows.some((row) => row.inspection_client_uuid !== payload.clientUuid || row.job_id !== payload.jobId || row.system_key !== payload.systemKey || row.master_template_version_id !== payload.masterTemplate.id || row.system_contract_sha256 !== existing.system_contract_sha256 || row.uploader_user_id !== actorUserId || !payload.evidenceManifest.some((entry) => entry.photoUuid === row.photo_uuid && entry.fieldPath === row.field_path && entry.sourceSha256 === row.source_sha256))) {
        throw new V6EvidenceError(409, "IDEMPOTENCY_CONFLICT", "This inspection UUID belongs to different accepted authority");
      }
      await client.query("ROLLBACK");
      result.duplicateIds.push(payload.clientUuid);
      return result;
    }
    await testRaceBarrier?.("before_job_lock");
    const jobResult = await client.query<{ status: string; job_reference: string; title: string; master_template_version_id: string; customer_configuration_revision_id: string; configuration_snapshot: Value }>(`SELECT status,job_reference,title,master_template_version_id,customer_configuration_revision_id,configuration_snapshot FROM inspection_jobs WHERE id=$1 AND status='open' AND technician_visible=true FOR UPDATE`, [payload.jobId]);
    const job = jobResult.rows[0]; const snapshotTemplate = job && isRecord(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined; const config = job && isRecord(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined; const system = job && Array.isArray(job.configuration_snapshot.enabledSystems) ? job.configuration_snapshot.enabledSystems.find((candidate) => isRecord(candidate) && candidate.systemKey === "fire_alarm_detector" && candidate.definitionStatus === "confirmed") : undefined;
    if (!job || !snapshotTemplate || !config || !isRecord(system) || job.master_template_version_id !== payload.masterTemplate.id || job.customer_configuration_revision_id !== payload.configuration.revisionId || snapshotTemplate.id !== payload.masterTemplate.id || snapshotTemplate.version !== 6 || config.revisionId !== payload.configuration.revisionId || config.revisionNumber !== payload.configuration.revisionNumber) throw new V6EvidenceError(403, "JOB_ACCESS_DENIED", "This open Job no longer accepts this V6 inspection");
    await testRaceBarrier?.("after_job_lock");
    const definition = await client.query<{ definition: unknown; definition_status: string }>(`SELECT definition,definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='fire_alarm_detector'`, [payload.masterTemplate.id]);
    if (definition.rowCount !== 1 || definition.rows[0].definition_status !== "confirmed") throw new V6EvidenceError(409, "CONTRACT_MISMATCH", "Frozen V6 Fire Alarm contract is unavailable");
    const contractSha256 = fireAlarmV6ContractSha256(definition.rows[0].definition); const controls = resolveFireAlarmV6Controls(definition.rows[0].definition);
    if (!expectedConfiguredRows(system)) throw new V6EvidenceError(409, "VALIDATION_ERROR", "Frozen configured Fire Alarm rows are invalid");
    await reserveFireAlarmV6Session(client, { inspectionClientUuid: payload.clientUuid, jobId: payload.jobId, systemKey: payload.systemKey, masterTemplateId: payload.masterTemplate.id, contractSha256, actorUserId });
    const authority = { job: { id: payload.jobId, reference: job.job_reference, title: job.title }, customer: job.configuration_snapshot.customer, configuration: config, template: payload.masterTemplate, system, contractSha256 };
    const fingerprint = createHash("sha256").update(canonicalize({ clientUuid: payload.clientUuid, authority, responses: payload.responses, evidenceManifest: payload.evidenceManifest, performedAt: payload.performedAt, actorUserId })).digest("hex");
    const raced = await client.query<{ request_fingerprint: string }>(`SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid=$1 AND synced_by_user_id=$2 FOR UPDATE`, [payload.clientUuid, actorUserId]);
    if (raced.rowCount) { await client.query("ROLLBACK"); if (raced.rows[0]!.request_fingerprint === fingerprint) result.duplicateIds.push(payload.clientUuid); else result.failed.push(failure(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This inspection UUID was already accepted with different V6 data")); return result; }
    const staged = await client.query<{ photo_uuid: string; field_path: string; source_sha256: string; stored_sha256: string }>(`SELECT photo_uuid,field_path,source_sha256,stored_sha256 FROM staged_inspection_evidence WHERE photo_uuid=ANY($1::uuid[]) AND inspection_client_uuid=$2 AND job_id=$3 AND system_key='fire_alarm_detector' AND master_template_version_id=$4 AND system_contract_sha256=$5 AND uploader_user_id=$6 AND status='staged' FOR UPDATE`, [payload.evidenceManifest.map((entry) => entry.photoUuid), payload.clientUuid, payload.jobId, payload.masterTemplate.id, contractSha256, actorUserId]);
    if (staged.rowCount !== payload.evidenceManifest.length || staged.rows.some((row) => !payload.evidenceManifest.some((entry) => entry.photoUuid === row.photo_uuid && entry.fieldPath === row.field_path && entry.sourceSha256 === row.source_sha256))) throw new V6EvidenceError(409, "EVIDENCE_NOT_STAGED", "Each manifest photo must be staged by this inspection session");
    for (const [label, values] of [["photo UUID", staged.rows.map((row) => row.photo_uuid)], ["source hash", staged.rows.map((row) => row.source_sha256)], ["stored hash", staged.rows.map((row) => row.stored_sha256)]] as const) {
      if (new Set(values).size !== values.length) throw new V6EvidenceError(409, "EVIDENCE_NOT_UNIQUE", `Each Poor V6 Fire Alarm field requires a distinct authoritative ${label}`);
    }
    const group = await client.query(`SELECT 1 FROM master_system_inspections WHERE job_id=$1 AND system_key='fire_alarm_detector' FOR UPDATE`, [payload.jobId]); if (group.rowCount) throw new V6EvidenceError(409, "ACTIVE_INSPECTION_EXISTS", "This Job already has accepted Fire Alarm authority");
    const groupId = randomUUID(); const formId = randomUUID(); const canonicalSnapshot = { schemaVersion: 2, acceptedAt: new Date().toISOString(), ...authority, system: { ...system, definition: definition.rows[0].definition, resolvedControls: controls, repetitionMode: "single_with_two_repeatable_tables" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null }, evidenceManifest: payload.evidenceManifest };
    await client.query(`INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3)`, [groupId, payload.jobId, actorUserId]);
    await client.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) VALUES($1,$2,$3,'primary',NULL,NULL,NULL,NULL,1,$4,$5,2,$6,2,$7,$8,'submitted',$9,$10,$11)`, [formId, groupId, payload.clientUuid, payload.masterTemplate.id, payload.configuration.revisionId, canonicalSnapshot, payload.responses, fingerprint, payload.performedAt, payload.originalCreatorSnapshot, actorUserId]);
    await client.query(`UPDATE staged_inspection_evidence SET status='accepted',form_instance_id=$1,accepted_at=now() WHERE photo_uuid=ANY($2::uuid[]) AND status='staged'`, [formId, payload.evidenceManifest.map((entry) => entry.photoUuid)]);
    await client.query("COMMIT"); result.acceptedIds.push(payload.clientUuid);
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); if (error instanceof V6EvidenceError) result.failed.push(failure(payload.clientUuid, error.code, error.message)); else if (isRecord(error) && error.code === "23505") result.failed.push(failure(payload.clientUuid, "ACTIVE_INSPECTION_EXISTS", "V6 Fire Alarm authority already exists")); else result.failed.push(failure(payload.clientUuid, "SERVER_ERROR", "V6 Fire Alarm inspection could not be accepted")); }
  finally { client.release(); }
  return result;
}
