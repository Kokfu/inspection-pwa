import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { isV7EvidenceFinding, parseV7EvidenceManifest, resolveV7EvidenceContract, v7EvidenceContractSha256, v7EvidenceManifestFailureMessage } from "../inspections/evidence/v7EvidenceContracts.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type Value = Record<string, unknown>;
type SyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type Payload = { clientUuid: string; jobId: string; systemKey: "automatic_sprinkler"; instanceKey: "primary"; configuredZoneId: null; configuredLocationId: null; displaySequence: 1; originalCreatorSnapshot: Value | null; masterTemplate: { id: string; code: "MFE-FSSR"; version: 7 }; configuration: { revisionId: string; revisionNumber: number }; inspectionSnapshot: Value; responses: Value; evidenceManifest: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>; performedAt: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const record = (value: unknown): value is Value => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Value, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : record(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const fail = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });
const unavailable = (id: string) => fail(id, "JOB_ACCESS_DENIED", "This V7 inspection is unavailable");
/** The accepted snapshot stores the PARSED manifest, which `parseV7EvidenceManifest`
 * returns sorted by fieldPath.  An exact retry carries whatever order the client
 * sent, and the API accepts any order.  Comparing the two positionally therefore
 * turned a legitimate unsorted-but-identical retry into IDEMPOTENCY_CONFLICT -
 * and after Job closure that is unrecoverable for the technician.  Compare the
 * two manifests order-independently instead (mirrors `smokeVentilationV7Acceptance.ts`). */
const sameManifest = (stored: readonly unknown[], incoming: readonly unknown[]) => {
  if (stored.length !== incoming.length) return false;
  const fingerprint = (entries: readonly unknown[]) => entries.map(canonical).sort().join("|");
  return fingerprint(stored) === fingerprint(incoming);
};
const v7AcceptedEvidenceUniqueConstraints = new Set(["staged_inspection_evidence_v7_accepted_source_per_job_system", "staged_inspection_evidence_v7_accepted_stored_per_job_system"]);
/** Every checklist field on the V7 Automatic Sprinkler contract, in one flat
 * map: the form has no repeatable table, and the keys are unique across the
 * Water Tank, Pump House, Main Alarm Valve and Test Run blocks. */
const checklistFields = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions", "breaching_inlet", "alarm_gong", "flow_meter_valve_positions", "trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"] as const;
const measurementFields = [["jockey_pump_pressure", ["cut_in", "cut_out"]], ["duty_pump_cut_in", ["value"]], ["standby_pump_cut_in", ["value"]], ["water_supply_gauge", ["value"]], ["installation_gauge", ["value"]]] as const;

export const isAutomaticSprinklerV7AcceptedEvidenceUniqueViolation = (error: unknown) => record(error) && error.code === "23505" && typeof error.constraint === "string" && v7AcceptedEvidenceUniqueConstraints.has(error.constraint);

function parse(item: SyncItem): Payload | undefined {
  if (!uuid.test(String(item.operationId)) || item.entityType !== "masterSystemInspection" || item.action !== "create" || !uuid.test(String(item.entityId)) || !record(item.payload)) return undefined;
  const p = item.payload; const keys = ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "evidenceManifest", "performedAt"];
  if (!exact(p, keys) || !uuid.test(String(p.clientUuid)) || p.clientUuid !== item.entityId || !uuid.test(String(p.jobId)
    ) || p.systemKey !== "automatic_sprinkler" || p.instanceKey !== "primary" || p.configuredZoneId !== null || p.configuredLocationId !== null || p.displaySequence !== 1
    || !record(p.masterTemplate) || !exact(p.masterTemplate, ["id", "code", "version"]) || !uuid.test(String(p.masterTemplate.id)) || p.masterTemplate.code !== "MFE-FSSR" || p.masterTemplate.version !== 7
    || !record(p.configuration) || !exact(p.configuration, ["revisionId", "revisionNumber"]) || !uuid.test(String(p.configuration.revisionId)) || !Number.isSafeInteger(p.configuration.revisionNumber)
    || !record(p.inspectionSnapshot) || !record(p.responses) || !Array.isArray(p.evidenceManifest) || !timestamp.test(String(p.performedAt)) || new Date(String(p.performedAt)).toISOString() !== p.performedAt) return undefined;
  return p as unknown as Payload;
}

/** V7 is dispatched before the legacy Automatic Sprinkler synchronizer. V1-V6
 * envelopes contain no manifest and remain wholly on that historical path,
 * including their frozen legacy PSI evidence policy. */
export function isAutomaticSprinklerV7Payload(item: SyncItem) {
  return record(item.payload) && item.payload.systemKey === "automatic_sprinkler" && record(item.payload.masterTemplate) && item.payload.masterTemplate.version === 7;
}

function fieldAllowedValues(definition: unknown) {
  if (!record(definition) || !Array.isArray(definition.sections)) return undefined;
  const values = new Map<string, Set<string>>();
  for (const key of checklistFields) {
    const section = definition.sections.find((value) => record(value) && Array.isArray(value.blocks) && value.blocks.some((block) => record(block) && block.type === "checklist" && Array.isArray(block.items) && block.items.some((item) => record(item) && item.key === key)));
    const block = record(section) && Array.isArray(section.blocks) ? section.blocks.find((value) => record(value) && value.type === "checklist" && Array.isArray(value.items) && value.items.some((item) => record(item) && item.key === key)) : undefined;
    const field = record(block) && Array.isArray(block.items) ? block.items.find((item) => record(item) && item.key === key) : undefined;
    if (!record(field) || field.control !== "good_poor" || !Array.isArray(field.allowedValues) || field.allowedValues.length === 0 || !field.allowedValues.every((value) => typeof value === "string")) return undefined;
    values.set(key, new Set(field.allowedValues as string[]));
  }
  for (const [key] of measurementFields) {
    const section = definition.sections.find((value) => record(value) && Array.isArray(value.blocks) && value.blocks.some((block) => record(block) && block.type === "measurement" && Array.isArray(block.items) && block.items.some((item) => record(item) && item.key === key)));
    const block = record(section) && Array.isArray(section.blocks) ? section.blocks.find((value) => record(value) && value.type === "measurement" && Array.isArray(value.items) && value.items.some((item) => record(item) && item.key === key)) : undefined;
    const item = record(block) && Array.isArray(block.items) ? block.items.find((value) => record(value) && value.key === key) : undefined;
    const result = record(item) ? item.result : undefined;
    if (!record(result) || result.control !== "good_poor" || !Array.isArray(result.allowedValues) || result.allowedValues.length === 0 || !result.allowedValues.every((value) => typeof value === "string")) return undefined;
    values.set(key, new Set(result.allowedValues as string[]));
  }
  return values;
}

function validResponses(responses: Value, values: Map<string, Set<string>>) {
  if (!exact(responses, ["schemaVersion", "checklist", "measurements", "comments"]) || responses.schemaVersion !== 2 || !record(responses.checklist) || !exact(responses.checklist, checklistFields)
    || !record(responses.measurements) || !exact(responses.measurements, measurementFields.map(([key]) => key)) || typeof responses.comments !== "string" || responses.comments.length > 4000) return false;
  for (const key of checklistFields) {
    const value = responses.checklist[key];
    if (!record(value) || !exact(value, ["result", "remarks"]) || typeof value.result !== "string" || !values.get(key)?.has(value.result) || typeof value.remarks !== "string" || value.remarks.length > 2000 || isV7EvidenceFinding(value.result) && !value.remarks.trim()) return false;
  }
  for (const [key, measurementKeys] of measurementFields) {
    const value = responses.measurements[key];
    const measured = record(value) && record(value.values) ? value.values : undefined;
    if (!record(value) || !exact(value, ["values", "unit", "result", "remarks"]) || !measured || !exact(measured, measurementKeys) || value.unit !== "PSI" || typeof value.result !== "string" || !values.get(key)?.has(value.result) || typeof value.remarks !== "string" || value.remarks.length > 2000 || measurementKeys.some((measurementKey) => measured[measurementKey] !== null && (typeof measured[measurementKey] !== "number" || !Number.isFinite(measured[measurementKey]))) || isV7EvidenceFinding(value.result) && !value.remarks.trim()) return false;
  }
  return true;
}

export async function acceptAutomaticSprinklerV7Inspection(item: SyncItem, actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] }; const payload = parse(item); const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!payload || !actorUserId) { result.failed.push(fail(id, "VALIDATION_ERROR", "V7 Automatic Sprinkler operation is invalid")); return result; }
  const client: PoolClient = await pool.connect(); let fingerprint = "";
  try {
    await client.query("BEGIN");
    const committed = await client.query<{ synced_by_user_id: string; response_payload: Value; inspection_snapshot: Value; performed_at: Date }>("SELECT instance.synced_by_user_id,instance.response_payload,instance.inspection_snapshot,instance.performed_at FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE instance.client_uuid=$1 AND instance.status='submitted' AND inspection.system_key='automatic_sprinkler' FOR UPDATE", [payload.clientUuid]);
    if (committed.rowCount) {
      const existing = committed.rows[0]!; const snapshot = existing.inspection_snapshot; const configuration = record(snapshot.configuration) ? snapshot.configuration : undefined; const template = record(snapshot.template) ? snapshot.template : undefined; const job = record(snapshot.job) ? snapshot.job : undefined; const manifest = Array.isArray(snapshot.evidenceManifest) ? snapshot.evidenceManifest : undefined;
      await client.query("ROLLBACK");
      if (existing.synced_by_user_id !== String(actorUserId)) result.failed.push(unavailable(payload.clientUuid));
      else if (job?.id === payload.jobId && configuration?.revisionId === payload.configuration.revisionId && configuration?.revisionNumber === payload.configuration.revisionNumber && template?.id === payload.masterTemplate.id && template?.version === 7 && manifest && canonical(existing.response_payload) === canonical(payload.responses) && sameManifest(manifest, payload.evidenceManifest) && existing.performed_at.toISOString() === payload.performedAt) result.duplicateIds.push(payload.clientUuid);
      else result.failed.push(fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This inspection UUID belongs to different accepted authority"));
      return result;
    }
    const jobResult = await client.query<{ job_reference: string; title: string; master_template_version_id: string; customer_configuration_revision_id: string; configuration_snapshot: Value }>("SELECT job_reference,title,master_template_version_id,customer_configuration_revision_id,configuration_snapshot FROM inspection_jobs WHERE id=$1 AND status='open' AND technician_visible=true FOR UPDATE", [payload.jobId]);
    const job = jobResult.rows[0]; const configuration = job && record(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined; const template = job && record(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined; const rawSystem = job && Array.isArray(job.configuration_snapshot.enabledSystems) ? job.configuration_snapshot.enabledSystems.find((value) => record(value) && value.systemKey === "automatic_sprinkler" && value.definitionStatus === "confirmed") : undefined;
    // `labelOverrides` is a display-only sibling that slice 1a-i freezes onto the
    // enabled-system entry. Drop it before it enters `authority` (hashed into the
    // request fingerprint) or the stored `inspection_snapshot.system`. Stripping
    // an absent key is a no-op, so a no-override job stays byte-identical.
    const system = record(rawSystem) ? (({ labelOverrides: _labelOverrides, ...rest }) => rest)(rawSystem) : undefined;
    const definition = job ? await client.query<{ definition: unknown; definition_status: string }>("SELECT definition,definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='automatic_sprinkler'", [payload.masterTemplate.id]) : undefined;
    const contractSha256 = definition?.rows[0] ? v7EvidenceContractSha256(definition.rows[0].definition) : ""; const adapter = definition?.rows[0] ? resolveV7EvidenceContract({ systemKey: "automatic_sprinkler", templateId: payload.masterTemplate.id, templateVersion: 7, definition: definition.rows[0].definition, contractSha256 }) : undefined; const manifest = adapter ? parseV7EvidenceManifest(payload.evidenceManifest, adapter, payload.responses) : undefined; const values = definition?.rows[0] ? fieldAllowedValues(definition.rows[0].definition) : undefined;
    if (!job || !configuration || !template || !record(system) || definition?.rowCount !== 1 || definition.rows[0]!.definition_status !== "confirmed" || !adapter || !values || job.master_template_version_id !== payload.masterTemplate.id || job.customer_configuration_revision_id !== payload.configuration.revisionId || template.id !== payload.masterTemplate.id || template.code !== "MFE-FSSR" || template.version !== 7 || configuration.revisionId !== payload.configuration.revisionId || configuration.revisionNumber !== payload.configuration.revisionNumber) { await client.query("ROLLBACK"); result.failed.push(unavailable(payload.clientUuid)); return result; }
    if (!validResponses(payload.responses, values)) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "V7 Automatic Sprinkler responses are invalid")); return result; }
    if (!manifest) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", v7EvidenceManifestFailureMessage(payload.evidenceManifest, "V7 evidence photos do not match the current findings"))); return result; }
    const authority = { job: { id: payload.jobId, reference: job.job_reference, title: job.title }, customer: job.configuration_snapshot.customer, configuration, template: payload.masterTemplate, system, contractSha256 };
    fingerprint = createHash("sha256").update(canonical({ clientUuid: payload.clientUuid, authority, responses: payload.responses, evidenceManifest: manifest, performedAt: payload.performedAt, actorUserId })).digest("hex");
    const reservation = await client.query<{ job_id: string; system_key: string; master_template_version_id: string; master_template_version: number; system_contract_sha256: string; reserved_by_user_id: string }>("SELECT job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id FROM inspection_evidence_reservations WHERE inspection_client_uuid=$1 FOR UPDATE", [payload.clientUuid]); const reserved = reservation.rows[0];
    if ((manifest.length > 0 || reserved) && (!reserved || reserved.job_id !== payload.jobId || reserved.system_key !== "automatic_sprinkler" || reserved.master_template_version_id !== payload.masterTemplate.id || reserved.master_template_version !== 7 || reserved.system_contract_sha256 !== contractSha256 || reserved.reserved_by_user_id !== String(actorUserId))) { await client.query("ROLLBACK"); result.failed.push(unavailable(payload.clientUuid)); return result; }
    const staged = await client.query<{ photo_uuid: string; field_path: string; source_sha256: string; stored_sha256: string; uploader_user_id: string }>("SELECT photo_uuid,field_path,source_sha256,stored_sha256,uploader_user_id FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 AND status='staged' FOR UPDATE", [payload.clientUuid]);
    if (staged.rowCount !== manifest.length || staged.rows.some((row) => row.uploader_user_id !== String(actorUserId) || !manifest.some((entry) => entry.photoUuid === row.photo_uuid && entry.fieldPath === row.field_path && entry.sourceSha256 === row.source_sha256))) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_NOT_STAGED", "Staged V7 evidence does not exactly match the frozen manifest")); return result; }
    if (new Set(staged.rows.map((row) => row.stored_sha256)).size !== staged.rowCount) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_NOT_STAGED", "Each finding needs its own photo; two findings resolved to the same stored image")); return result; }
    const accepted = await client.query("SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1 AND system_key='automatic_sprinkler' AND master_template_version=7 AND status='accepted' AND (photo_uuid=ANY($2::uuid[]) OR source_sha256=ANY($3::text[]) OR stored_sha256=ANY($4::text[])) FOR UPDATE", [payload.jobId, staged.rows.map((row) => row.photo_uuid), staged.rows.map((row) => row.source_sha256), staged.rows.map((row) => row.stored_sha256)]);
    if (accepted.rowCount) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence is already bound to another location in this Job")); return result; }
    await client.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'automatic_sprinkler',$3) ON CONFLICT(job_id,system_key) DO NOTHING", [randomUUID(), payload.jobId, actorUserId]); const group = await client.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id=$1 AND system_key='automatic_sprinkler' FOR UPDATE", [payload.jobId]); if (!group.rowCount) throw new Error("V7 Automatic Sprinkler group unavailable");
    const snapshot = { schemaVersion: 2, acceptedAt: new Date().toISOString(), ...authority, system: { ...system, key: "automatic_sprinkler", definition: definition.rows[0]!.definition, repetitionMode: "single" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null }, evidenceManifest: manifest };
    const formId = randomUUID(); await client.query("INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) VALUES($1,$2,$3,'primary',NULL,NULL,NULL,NULL,1,$4,$5,2,$6,2,$7,$8,'submitted',$9,$10,$11)", [formId, group.rows[0]!.id, payload.clientUuid, payload.masterTemplate.id, payload.configuration.revisionId, snapshot, payload.responses, fingerprint, payload.performedAt, payload.originalCreatorSnapshot, actorUserId]);
    await client.query("UPDATE staged_inspection_evidence SET status='accepted',form_instance_id=$1,accepted_at=now() WHERE inspection_client_uuid=$2 AND status='staged'", [formId, payload.clientUuid]); await client.query("COMMIT"); result.acceptedIds.push(payload.clientUuid);
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); if (isAutomaticSprinklerV7AcceptedEvidenceUniqueViolation(error)) result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence was accepted concurrently for another location and needs attention")); else result.failed.push(fail(payload.clientUuid, "SERVER_ERROR", "Automatic Sprinkler V7 form could not be saved")); }
  finally { client.release(); }
  return result;
}
