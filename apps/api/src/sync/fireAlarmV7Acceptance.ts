import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { parseV7EvidenceManifest, resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { expectedConfiguredRows } from "./fireAlarmInspectionSync.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type Value = Record<string, unknown>;
type SyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type Payload = { clientUuid: string; jobId: string; systemKey: "fire_alarm_detector"; instanceKey: "primary"; configuredZoneId: null; configuredLocationId: null; displaySequence: 1; originalCreatorSnapshot: Value | null; masterTemplate: { id: string; code: "MFE-FSSR"; version: 7 }; configuration: { revisionId: string; revisionNumber: number }; inspectionSnapshot: Value; responses: Value; evidenceManifest: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>; performedAt: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const record = (value: unknown): value is Value => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Value, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : record(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const fail = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });
const unavailable = (id: string) => fail(id, "JOB_ACCESS_DENIED", "This V7 inspection is unavailable");
const v7AcceptedEvidenceUniqueConstraints = new Set(["staged_inspection_evidence_v7_accepted_source_per_job_system", "staged_inspection_evidence_v7_accepted_stored_per_job_system"]);
export const isFireAlarmV7AcceptedEvidenceUniqueViolation = (error: unknown) => record(error) && error.code === "23505" && typeof error.constraint === "string" && v7AcceptedEvidenceUniqueConstraints.has(error.constraint);

function parse(item: SyncItem): Payload | undefined {
  if (!uuid.test(String(item.operationId)) || item.entityType !== "masterSystemInspection" || item.action !== "create" || !uuid.test(String(item.entityId)) || !record(item.payload)) return undefined;
  const p = item.payload; const keys = ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "evidenceManifest", "performedAt"];
  if (!exact(p, keys) || !uuid.test(String(p.clientUuid)) || p.clientUuid !== item.entityId || !uuid.test(String(p.jobId)) || p.systemKey !== "fire_alarm_detector" || p.instanceKey !== "primary" || p.configuredZoneId !== null || p.configuredLocationId !== null || p.displaySequence !== 1 || !record(p.masterTemplate) || !exact(p.masterTemplate, ["id", "code", "version"]) || !uuid.test(String(p.masterTemplate.id)) || p.masterTemplate.code !== "MFE-FSSR" || p.masterTemplate.version !== 7 || !record(p.configuration) || !exact(p.configuration, ["revisionId", "revisionNumber"]) || !uuid.test(String(p.configuration.revisionId)) || !Number.isSafeInteger(p.configuration.revisionNumber) || !record(p.inspectionSnapshot) || !record(p.responses) || !Array.isArray(p.evidenceManifest) || !timestamp.test(String(p.performedAt)) || new Date(String(p.performedAt)).toISOString() !== p.performedAt) return undefined;
  return p as unknown as Payload;
}

/** The V7 adapter owns Poor evidence. This validator keeps the non-evidence
 * Fire Alarm semantics strict, including the independent Normal/Test/Isolation rows. */
function validResponses(responses: Value) {
  const responseKeys = ["schemaVersion", "controlPanelLocation", "primaryDeviceRows", "chargerAndBatteries", "mainFunctionKeys", "secondaryAlarmDeviceRows", "comments"];
  if (!exact(responses, responseKeys) || responses.schemaVersion !== 2 || typeof responses.controlPanelLocation !== "string" || !responses.controlPanelLocation.trim() || responses.controlPanelLocation.length > 300 || typeof responses.comments !== "string" || responses.comments.length > 4000 || !Array.isArray(responses.primaryDeviceRows) || responses.primaryDeviceRows.length < 1 || responses.primaryDeviceRows.length > 250 || !Array.isArray(responses.secondaryAlarmDeviceRows) || responses.secondaryAlarmDeviceRows.length > 250) return false;
  const checkGroup = (group: unknown, keys: readonly string[]) => record(group) && exact(group, keys) && keys.every((key) => record(group[key]) && exact(group[key] as Value, ["result", "remarks"]) && ["good", "poor", "not_relevant"].includes(String((group[key] as Value).result)) && typeof (group[key] as Value).remarks === "string" && ((group[key] as Value).remarks as string).length <= 2000);
  if (!checkGroup(responses.chargerAndBatteries, ["main_supply", "battery", "charger"]) || !checkGroup(responses.mainFunctionKeys, ["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "spka_system", "alarm_lift_trip", "signal_gas_discharge"])) return false;
  const ids = new Set<string>();
  for (let index = 0; index < responses.primaryDeviceRows.length; index += 1) {
    const row = responses.primaryDeviceRows[index]; const keys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "displaySequence", "assetReference", "alarmZone", "location", "manualCallPoint", "flowSwitch", "heatDetector", "smokeDetector", "remarks"];
    if (!record(row) || !exact(row, keys) || typeof row.rowUuid !== "string" || !uuid.test(row.rowUuid) || ids.has(row.rowUuid) || row.displaySequence !== index + 1 || typeof row.assetReference !== "string" || row.assetReference.length > 250 || typeof row.alarmZone !== "string" || !row.alarmZone.trim() || row.alarmZone.length > 200 || typeof row.location !== "string" || !row.location.trim() || row.location.length > 300 || typeof row.remarks !== "string" || row.remarks.length > 2000 || ![row.manualCallPoint, row.flowSwitch, row.heatDetector, row.smokeDetector].every((value) => ["normal", "test", "isolation"].includes(String(value)))) return false;
    ids.add(row.rowUuid);
  }
  for (let index = 0; index < responses.secondaryAlarmDeviceRows.length; index += 1) {
    const row = responses.secondaryAlarmDeviceRows[index]; const keys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "displaySequence", "assetReference", "location", "alarmBell", "manualCallPoint", "remarks", "fieldRemarks"];
    if (!record(row) || !exact(row, keys) || typeof row.rowUuid !== "string" || !uuid.test(row.rowUuid) || ids.has(row.rowUuid) || row.displaySequence !== index + 1 || typeof row.assetReference !== "string" || row.assetReference.length > 250 || typeof row.location !== "string" || !row.location.trim() || row.location.length > 300 || typeof row.remarks !== "string" || row.remarks.length > 2000 || ![row.alarmBell, row.manualCallPoint].every((value) => ["good", "poor", "not_relevant"].includes(String(value))) || !record(row.fieldRemarks) || Object.keys(row.fieldRemarks).some((key) => key !== "alarmBell" && key !== "manualCallPoint") || Object.values(row.fieldRemarks).some((value) => typeof value !== "string" || value.length > 2000)) return false;
    ids.add(row.rowUuid);
  }
  return true;
}

function existingResult(client: PoolClient, payload: Payload, fingerprint: string, actorUserId: number) {
  return client.query<{ request_fingerprint: string; synced_by_user_id: string }>("SELECT request_fingerprint,synced_by_user_id FROM master_system_form_instances WHERE client_uuid=$1 FOR UPDATE", [payload.clientUuid]).then((found) => {
    if (!found.rowCount) return undefined;
    if (found.rows[0]!.synced_by_user_id !== String(actorUserId)) return fail(payload.clientUuid, "JOB_ACCESS_DENIED", "This V7 form is not available to this actor");
    return found.rows[0]!.request_fingerprint === fingerprint ? "duplicate" as const : fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This inspection UUID belongs to different accepted authority");
  });
}

export function isFireAlarmV7Payload(item: SyncItem) { return record(item.payload) && record(item.payload.masterTemplate) && item.payload.masterTemplate.version === 7; }

export async function acceptFireAlarmV7Inspection(item: SyncItem, actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] }; const payload = parse(item); const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!payload || !actorUserId || !validResponses(payload.responses)) { result.failed.push(fail(id, "VALIDATION_ERROR", "V7 Fire Alarm operation is invalid")); return result; }
  const client = await pool.connect(); let fingerprint = "";
  try {
    await client.query("BEGIN");
    const committed = await client.query<{ synced_by_user_id: string; response_payload: Value; inspection_snapshot: Value; performed_at: Date }>("SELECT instance.synced_by_user_id,instance.response_payload,instance.inspection_snapshot,instance.performed_at FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE instance.client_uuid=$1 AND instance.status='submitted' AND inspection.system_key='fire_alarm_detector' FOR UPDATE", [payload.clientUuid]);
    if (committed.rowCount) {
      const existing = committed.rows[0]!; const snapshot = existing.inspection_snapshot; const snapshotJob = record(snapshot.job) ? snapshot.job : undefined; const snapshotConfiguration = record(snapshot.configuration) ? snapshot.configuration : undefined; const snapshotTemplate = record(snapshot.template) ? snapshot.template : undefined; const snapshotManifest = Array.isArray(snapshot.evidenceManifest) ? snapshot.evidenceManifest : undefined;
      await client.query("ROLLBACK");
      if (existing.synced_by_user_id !== String(actorUserId)) result.failed.push(unavailable(payload.clientUuid));
      else if (snapshotJob?.id === payload.jobId && snapshotConfiguration?.revisionId === payload.configuration.revisionId && snapshotConfiguration?.revisionNumber === payload.configuration.revisionNumber && snapshotTemplate?.id === payload.masterTemplate.id && snapshotTemplate?.version === 7 && canonical(existing.response_payload) === canonical(payload.responses) && snapshotManifest && canonical(snapshotManifest) === canonical(payload.evidenceManifest) && existing.performed_at.toISOString() === payload.performedAt) result.duplicateIds.push(payload.clientUuid);
      else result.failed.push(fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This inspection UUID belongs to different accepted authority"));
      return result;
    }
    const jobResult = await client.query<{ status: string; job_reference: string; title: string; master_template_version_id: string; customer_configuration_revision_id: string; configuration_snapshot: Value }>("SELECT status,job_reference,title,master_template_version_id,customer_configuration_revision_id,configuration_snapshot FROM inspection_jobs WHERE id=$1 AND status='open' AND technician_visible=true FOR UPDATE", [payload.jobId]);
    const job = jobResult.rows[0]; const configuration = job && record(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined; const template = job && record(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined; const system = job && Array.isArray(job.configuration_snapshot.enabledSystems) ? job.configuration_snapshot.enabledSystems.find((value) => record(value) && value.systemKey === "fire_alarm_detector" && value.definitionStatus === "confirmed") : undefined;
    const definition = job ? await client.query<{ definition: unknown; definition_status: string }>("SELECT definition,definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='fire_alarm_detector'", [payload.masterTemplate.id]) : undefined;
    const contractSha256 = definition?.rows[0] ? v7EvidenceContractSha256(definition.rows[0].definition) : "";
    const adapter = definition?.rows[0] ? resolveV7EvidenceContract({ systemKey: "fire_alarm_detector", templateId: payload.masterTemplate.id, templateVersion: 7, definition: definition.rows[0].definition, contractSha256 }) : undefined;
    const manifest = adapter ? parseV7EvidenceManifest(payload.evidenceManifest, adapter, payload.responses) : undefined;
    if (!job || !configuration || !template || !record(system) || definition?.rowCount !== 1 || definition.rows[0]!.definition_status !== "confirmed" || !adapter || !manifest || job.master_template_version_id !== payload.masterTemplate.id || job.customer_configuration_revision_id !== payload.configuration.revisionId || template.id !== payload.masterTemplate.id || template.code !== "MFE-FSSR" || template.version !== 7 || configuration.revisionId !== payload.configuration.revisionId || configuration.revisionNumber !== payload.configuration.revisionNumber || !expectedConfiguredRows(system)) { await client.query("ROLLBACK"); result.failed.push(unavailable(payload.clientUuid)); return result; }
    try { resolveFireAlarmV6Controls(definition.rows[0]!.definition, 7); } catch { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "CONTRACT_MISMATCH", "Frozen Fire Alarm V7 contract is invalid")); return result; }
    const authority = { job: { id: payload.jobId, reference: job.job_reference, title: job.title }, customer: job.configuration_snapshot.customer, configuration, template: payload.masterTemplate, system, contractSha256 };
    fingerprint = createHash("sha256").update(canonical({ clientUuid: payload.clientUuid, authority, responses: payload.responses, evidenceManifest: manifest, performedAt: payload.performedAt, actorUserId })).digest("hex");
    const reservation = await client.query<{ job_id: string; system_key: string; master_template_version_id: string; master_template_version: number; system_contract_sha256: string; reserved_by_user_id: string }>("SELECT job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id FROM inspection_evidence_reservations WHERE inspection_client_uuid=$1 FOR UPDATE", [payload.clientUuid]);
    const reserved = reservation.rows[0];
    if (!reserved || reserved.job_id !== payload.jobId || reserved.system_key !== payload.systemKey || reserved.master_template_version_id !== payload.masterTemplate.id || reserved.master_template_version !== 7 || reserved.system_contract_sha256 !== contractSha256 || reserved.reserved_by_user_id !== String(actorUserId)) { await client.query("ROLLBACK"); result.failed.push(unavailable(payload.clientUuid)); return result; }
    const staged = await client.query<{ photo_uuid: string; field_path: string; source_sha256: string; stored_sha256: string; uploader_user_id: string }>("SELECT photo_uuid,field_path,source_sha256,stored_sha256,uploader_user_id FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 AND status='staged' FOR UPDATE", [payload.clientUuid]);
    if (staged.rowCount !== manifest.length || staged.rows.some((row) => row.uploader_user_id !== String(actorUserId) || !manifest.some((entry) => entry.photoUuid === row.photo_uuid && entry.fieldPath === row.field_path && entry.sourceSha256 === row.source_sha256)) || new Set(staged.rows.map((row) => row.stored_sha256)).size !== staged.rowCount) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_NOT_STAGED", "Staged V7 evidence does not exactly match the frozen manifest")); return result; }
    const accepted = await client.query("SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1 AND system_key='fire_alarm_detector' AND master_template_version=7 AND status='accepted' AND (photo_uuid=ANY($2::uuid[]) OR source_sha256=ANY($3::text[]) OR stored_sha256=ANY($4::text[])) FOR UPDATE", [payload.jobId, staged.rows.map((row) => row.photo_uuid), staged.rows.map((row) => row.source_sha256), staged.rows.map((row) => row.stored_sha256)]);
    if (accepted.rowCount) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence is already bound to another location in this Job")); return result; }
    const groupId = randomUUID(); await client.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3) ON CONFLICT(job_id,system_key) DO NOTHING", [groupId, payload.jobId, actorUserId]);
    const group = await client.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id=$1 AND system_key='fire_alarm_detector' FOR UPDATE", [payload.jobId]); if (!group.rowCount) throw new Error("V7 Fire Alarm group unavailable");
    const snapshot = { schemaVersion: 2, acceptedAt: new Date().toISOString(), ...authority, system: { ...system, key: "fire_alarm_detector", definition: definition.rows[0]!.definition, resolvedControls: resolveFireAlarmV6Controls(definition.rows[0]!.definition, 7), repetitionMode: "single_with_two_repeatable_tables" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null }, evidenceManifest: manifest };
    const formId = randomUUID(); await client.query("INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) VALUES($1,$2,$3,'primary',NULL,NULL,NULL,NULL,1,$4,$5,2,$6,2,$7,$8,'submitted',$9,$10,$11)", [formId, group.rows[0]!.id, payload.clientUuid, payload.masterTemplate.id, payload.configuration.revisionId, snapshot, payload.responses, fingerprint, payload.performedAt, payload.originalCreatorSnapshot, actorUserId]);
    await client.query("UPDATE staged_inspection_evidence SET status='accepted',form_instance_id=$1,accepted_at=now() WHERE inspection_client_uuid=$2 AND status='staged'", [formId, payload.clientUuid]);
    await client.query("COMMIT"); result.acceptedIds.push(payload.clientUuid);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (isFireAlarmV7AcceptedEvidenceUniqueViolation(error)) result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence was accepted concurrently for another location; retry safely"));
    else result.failed.push(fail(payload.clientUuid, "SERVER_ERROR", "Fire Alarm V7 form could not be saved"));
  } finally { client.release(); }
  return result;
}
