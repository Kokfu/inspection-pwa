import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import { isV7EvidenceFinding, parseV7EvidenceManifest, resolveV7EvidenceContract, v7EvidenceContractSha256, v7EvidenceManifestFailureMessage } from "../inspections/evidence/v7EvidenceContracts.js";
import { configuredSmokeVentilationRowsMatch, expectedConfiguredSmokeVentilationRows } from "./smokeVentilationInspectionSync.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type Value = Record<string, unknown>;
type SyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type Payload = { clientUuid: string; jobId: string; systemKey: "smoke_ventilation"; instanceKey: "primary"; configuredZoneId: null; configuredLocationId: null; displaySequence: 1; originalCreatorSnapshot: Value | null; masterTemplate: { id: string; code: "MFE-FSSR"; version: 7 }; configuration: { revisionId: string; revisionNumber: number }; inspectionSnapshot: Value; responses: Value; evidenceManifest: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>; performedAt: string };

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
 * two manifests order-independently instead. */
const sameManifest = (stored: readonly unknown[], incoming: readonly unknown[]) => {
  if (stored.length !== incoming.length) return false;
  const fingerprint = (entries: readonly unknown[]) => entries.map(canonical).sort().join("|");
  return fingerprint(stored) === fingerprint(incoming);
};
const v7AcceptedEvidenceUniqueConstraints = new Set(["staged_inspection_evidence_v7_accepted_source_per_job_system", "staged_inspection_evidence_v7_accepted_stored_per_job_system"]);

/** Checklist key -> frozen definition section/block. Must stay identical to the
 * smoke_ventilation adapter in `v7EvidenceContracts.ts` and to
 * `smokeVentilationChecklistFields` on the web. */
const checklistColumns = [
  ["main_power_supply_ac", "power_supply", "power_supply_checks"],
  ["secondary_essential_supply_dc", "power_supply", "power_supply_checks"],
  ["cb_battery", "charger_batteries", "charger_battery_checks"],
  ["cb_charger", "charger_batteries", "charger_battery_checks"],
  ["mfk_main_alarm_reset", "main_function_key", "function_checks"],
  ["mfk_lamp_test", "main_function_key", "function_checks"],
  ["mfk_evacuate", "main_function_key", "function_checks"],
  ["mfk_signal_alarm_to_mfap", "main_function_key", "function_checks"]
] as const;
const rowColumns = [["autoResult", "auto"], ["manualResult", "manual"]] as const;

export const isSmokeVentilationV7AcceptedEvidenceUniqueViolation = (error: unknown) => record(error) && error.code === "23505" && typeof error.constraint === "string" && v7AcceptedEvidenceUniqueConstraints.has(error.constraint);

/** Per-field allowed values come from the frozen definition, never a hard-coded set. */
function checklistValues(definition: unknown) {
  if (!record(definition) || !Array.isArray(definition.sections)) return undefined;
  const values = new Map<string, Set<string>>();
  for (const [key, sectionKey, blockKey] of checklistColumns) {
    const section = definition.sections.find((value) => record(value) && value.key === sectionKey);
    const block = record(section) && Array.isArray(section.blocks) ? section.blocks.find((value) => record(value) && value.key === blockKey) : undefined;
    const field = record(block) && Array.isArray(block.items) ? block.items.find((value) => record(value) && value.key === key) : undefined;
    if (!record(field) || field.control !== "good_poor" || !Array.isArray(field.allowedValues) || field.allowedValues.length === 0
      || !field.allowedValues.every((value) => typeof value === "string") || new Set(field.allowedValues).size !== field.allowedValues.length) return undefined;
    values.set(key, new Set(field.allowedValues as string[]));
  }
  return values;
}

function rowValues(definition: unknown) {
  if (!record(definition) || !Array.isArray(definition.sections)) return undefined;
  const section = definition.sections.find((value) => record(value) && value.key === "fan_schedule");
  const block = record(section) && Array.isArray(section.blocks) ? section.blocks.find((value) => record(value) && value.key === "fan_schedule_rows") : undefined;
  if (!record(block) || !Array.isArray(block.columns)) return undefined;
  const values = new Map<string, Set<string>>();
  for (const [responseKey, columnKey] of rowColumns) {
    const field = block.columns.find((value) => record(value) && value.key === columnKey);
    if (!record(field) || field.control !== "good_poor" || !Array.isArray(field.allowedValues) || field.allowedValues.length === 0
      || !field.allowedValues.every((value) => typeof value === "string") || new Set(field.allowedValues).size !== field.allowedValues.length) return undefined;
    values.set(responseKey, new Set(field.allowedValues as string[]));
  }
  return values;
}

/** The V7 adapter owns finding evidence. This keeps the rest of the response strict. */
function validResponses(responses: Value, checklist: Map<string, Set<string>>, rows: Map<string, Set<string>>) {
  const rowKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "autoResult", "manualResult", "remarks", "fieldRemarks", "sortOrder"];
  if (!exact(responses, ["schemaVersion", "controlPanelNo", "location", "dateTested", "checklist", "rows", "comments"]) || responses.schemaVersion !== 1
    || typeof responses.controlPanelNo !== "string" || responses.controlPanelNo.length > 200
    || typeof responses.location !== "string" || responses.location.length > 300
    || typeof responses.dateTested !== "string" || responses.dateTested.length > 200
    || typeof responses.comments !== "string" || responses.comments.length > 4000
    || !record(responses.checklist) || !exact(responses.checklist, checklistColumns.map(([key]) => key))
    || !Array.isArray(responses.rows) || responses.rows.length < 1 || responses.rows.length > 250) return false;
  for (const [key] of checklistColumns) {
    const entry = (responses.checklist as Value)[key];
    if (!record(entry) || !exact(entry, ["result", "remarks"]) || typeof entry.result !== "string" || !checklist.get(key)?.has(entry.result)
      || typeof entry.remarks !== "string" || entry.remarks.length > 2000) return false;
    if (isV7EvidenceFinding(entry.result) && !entry.remarks.trim()) return false;
  }
  const ids = new Set<string>();
  for (let index = 0; index < responses.rows.length; index += 1) {
    const row = responses.rows[index];
    if (!record(row) || !exact(row, rowKeys) || typeof row.rowUuid !== "string" || !uuid.test(row.rowUuid) || ids.has(row.rowUuid)
      || row.sortOrder !== index + 1 || row.zoneSnapshot !== null
      || typeof row.assetReference !== "string" || row.assetReference.length > 200
      || typeof row.remarks !== "string" || row.remarks.length > 2000
      || !record(row.fieldRemarks)
      || Object.keys(row.fieldRemarks).some((key) => !rowColumns.some(([responseKey]) => responseKey === key))
      || Object.values(row.fieldRemarks).some((value) => typeof value !== "string" || value.length > 2000)
      || (row.source === "technician"
        ? !(row.configuredLocationId === null && row.configuredRowOrdinal === null && row.locationSnapshot === null)
        : !(row.source === "configured" && typeof row.configuredLocationId === "string" && uuid.test(row.configuredLocationId) && Number.isInteger(row.configuredRowOrdinal) && Number(row.configuredRowOrdinal) > 0))) return false;
    for (const [responseKey] of rowColumns) {
      const result = row[responseKey];
      if (typeof result !== "string" || !rows.get(responseKey)?.has(result)) return false;
      if (isV7EvidenceFinding(result) && !String((row.fieldRemarks as Value)[responseKey] ?? "").trim()) return false;
    }
    ids.add(row.rowUuid);
  }
  return true;
}

function parse(item: SyncItem): Payload | undefined {
  if (!uuid.test(String(item.operationId)) || item.entityType !== "masterSystemInspection" || item.action !== "create" || !uuid.test(String(item.entityId)) || !record(item.payload)) return undefined;
  const p = item.payload;
  const keys = ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "evidenceManifest", "performedAt"];
  if (!exact(p, keys) || !uuid.test(String(p.clientUuid)) || p.clientUuid !== item.entityId || !uuid.test(String(p.jobId))
    || p.systemKey !== "smoke_ventilation" || p.instanceKey !== "primary" || p.configuredZoneId !== null || p.configuredLocationId !== null || p.displaySequence !== 1
    || !record(p.masterTemplate) || !exact(p.masterTemplate, ["id", "code", "version"]) || !uuid.test(String(p.masterTemplate.id)) || p.masterTemplate.code !== "MFE-FSSR" || p.masterTemplate.version !== 7
    || !record(p.configuration) || !exact(p.configuration, ["revisionId", "revisionNumber"]) || !uuid.test(String(p.configuration.revisionId)) || !Number.isSafeInteger(p.configuration.revisionNumber)
    || !record(p.inspectionSnapshot) || !record(p.responses) || !Array.isArray(p.evidenceManifest)
    || !timestamp.test(String(p.performedAt)) || new Date(String(p.performedAt)).toISOString() !== p.performedAt) return undefined;
  return p as unknown as Payload;
}

/** A V7 Smoke Ventilation payload is a `masterSystemInspection` frozen to
 * template version 7. Smoke Ventilation has no historical (V1-V6) sync path
 * at all - see masterServiceReportV7.ts. */
export function isSmokeVentilationV7Payload(item: SyncItem) {
  return record(item.payload) && item.payload.systemKey === "smoke_ventilation" && record(item.payload.masterTemplate) && item.payload.masterTemplate.version === 7;
}

/** Smoke Ventilation has no historical (V1-V6) path to fall back to - every
 * item dispatched here is V7, unlike `syncHydrantInspections` and friends. */
export async function syncSmokeVentilationInspections(items: SyncItem[], actorUserId?: number): Promise<SyncResult> {
  const out: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };
  for (const item of items) {
    const v7 = await acceptSmokeVentilationV7Inspection(item, actorUserId);
    out.acceptedIds.push(...v7.acceptedIds); out.duplicateIds.push(...v7.duplicateIds); out.failed.push(...v7.failed);
  }
  return out;
}

export async function acceptSmokeVentilationV7Inspection(item: SyncItem, actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };
  const payload = parse(item);
  const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!payload || !actorUserId) { result.failed.push(fail(id, "VALIDATION_ERROR", "V7 Smoke Ventilation operation is invalid")); return result; }
  const client: PoolClient = await pool.connect();
  let fingerprint = "";
  try {
    await client.query("BEGIN");
    const committed = await client.query<{ synced_by_user_id: string; response_payload: Value; inspection_snapshot: Value; performed_at: Date }>(
      "SELECT instance.synced_by_user_id,instance.response_payload,instance.inspection_snapshot,instance.performed_at FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE instance.client_uuid=$1 AND instance.status='submitted' AND inspection.system_key='smoke_ventilation' FOR UPDATE",
      [payload.clientUuid]
    );
    if (committed.rowCount) {
      const existing = committed.rows[0]!;
      const snapshot = existing.inspection_snapshot;
      const snapshotJob = record(snapshot.job) ? snapshot.job : undefined;
      const snapshotConfiguration = record(snapshot.configuration) ? snapshot.configuration : undefined;
      const snapshotTemplate = record(snapshot.template) ? snapshot.template : undefined;
      const snapshotManifest = Array.isArray(snapshot.evidenceManifest) ? snapshot.evidenceManifest : undefined;
      await client.query("ROLLBACK");
      if (existing.synced_by_user_id !== String(actorUserId)) result.failed.push(unavailable(payload.clientUuid));
      else if (snapshotJob?.id === payload.jobId && snapshotConfiguration?.revisionId === payload.configuration.revisionId
        && snapshotConfiguration?.revisionNumber === payload.configuration.revisionNumber
        && snapshotTemplate?.id === payload.masterTemplate.id && snapshotTemplate?.version === 7
        && canonical(existing.response_payload) === canonical(payload.responses)
        && snapshotManifest && sameManifest(snapshotManifest, payload.evidenceManifest)
        && existing.performed_at.toISOString() === payload.performedAt) result.duplicateIds.push(payload.clientUuid);
      else result.failed.push(fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This inspection UUID belongs to different accepted authority"));
      return result;
    }
    const jobResult = await client.query<{ status: string; job_reference: string; title: string; master_template_version_id: string; customer_configuration_revision_id: string; configuration_snapshot: Value }>(
      "SELECT status,job_reference,title,master_template_version_id,customer_configuration_revision_id,configuration_snapshot FROM inspection_jobs WHERE id=$1 AND status='open' AND technician_visible=true FOR UPDATE",
      [payload.jobId]
    );
    const job = jobResult.rows[0];
    const configuration = job && record(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined;
    const template = job && record(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined;
    const system = job && Array.isArray(job.configuration_snapshot.enabledSystems)
      ? job.configuration_snapshot.enabledSystems.find((value) => record(value) && value.systemKey === "smoke_ventilation" && value.definitionStatus === "confirmed")
      : undefined;
    const definition = job ? await client.query<{ definition: unknown; definition_status: string }>("SELECT definition,definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='smoke_ventilation'", [payload.masterTemplate.id]) : undefined;
    const contractSha256 = definition?.rows[0] ? v7EvidenceContractSha256(definition.rows[0].definition) : "";
    const adapter = definition?.rows[0] ? resolveV7EvidenceContract({ systemKey: "smoke_ventilation", templateId: payload.masterTemplate.id, templateVersion: 7, definition: definition.rows[0].definition, contractSha256 }) : undefined;
    const manifest = adapter ? parseV7EvidenceManifest(payload.evidenceManifest, adapter, payload.responses) : undefined;
    const expectedRows = record(system) ? expectedConfiguredSmokeVentilationRows(system) : undefined;
    if (!job || !configuration || !template || !record(system) || definition?.rowCount !== 1 || definition.rows[0]!.definition_status !== "confirmed" || !adapter
      || job.master_template_version_id !== payload.masterTemplate.id || job.customer_configuration_revision_id !== payload.configuration.revisionId
      || template.id !== payload.masterTemplate.id || template.code !== "MFE-FSSR" || template.version !== 7
      || configuration.revisionId !== payload.configuration.revisionId || configuration.revisionNumber !== payload.configuration.revisionNumber
      || !expectedRows) { await client.query("ROLLBACK"); result.failed.push(unavailable(payload.clientUuid)); return result; }
    const checklist = checklistValues(definition.rows[0]!.definition);
    const rows = rowValues(definition.rows[0]!.definition);
    if (!checklist || !rows) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "CONTRACT_MISMATCH", "Frozen Smoke Ventilation V7 contract is invalid")); return result; }
    if (!validResponses(payload.responses, checklist, rows) || !configuredSmokeVentilationRowsMatch(payload.responses, expectedRows)) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "V7 Smoke Ventilation responses are invalid")); return result; }
    // G7: the manifest describes the technician's own payload, never whether the
    // Job exists, so it is reported only after the collapsed job-access guard
    // above has passed.
    if (!manifest) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", v7EvidenceManifestFailureMessage(payload.evidenceManifest, "V7 evidence photos do not match the current findings"))); return result; }
    const authority = { job: { id: payload.jobId, reference: job.job_reference, title: job.title }, customer: job.configuration_snapshot.customer, configuration, template: payload.masterTemplate, system, contractSha256 };
    fingerprint = createHash("sha256").update(canonical({ clientUuid: payload.clientUuid, authority, responses: payload.responses, evidenceManifest: manifest, performedAt: payload.performedAt, actorUserId })).digest("hex");
    const reservation = await client.query<{ job_id: string; system_key: string; master_template_version_id: string; master_template_version: number; system_contract_sha256: string; reserved_by_user_id: string }>(
      "SELECT job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id FROM inspection_evidence_reservations WHERE inspection_client_uuid=$1 FOR UPDATE",
      [payload.clientUuid]
    );
    const reserved = reservation.rows[0];
    if ((manifest.length > 0 || reserved) && (!reserved || reserved.job_id !== payload.jobId || reserved.system_key !== payload.systemKey || reserved.master_template_version_id !== payload.masterTemplate.id
      || reserved.master_template_version !== 7 || reserved.system_contract_sha256 !== contractSha256 || reserved.reserved_by_user_id !== String(actorUserId))) { await client.query("ROLLBACK"); result.failed.push(unavailable(payload.clientUuid)); return result; }
    const staged = await client.query<{ photo_uuid: string; field_path: string; source_sha256: string; stored_sha256: string; uploader_user_id: string }>(
      "SELECT photo_uuid,field_path,source_sha256,stored_sha256,uploader_user_id FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 AND status='staged' FOR UPDATE",
      [payload.clientUuid]
    );
    if (staged.rowCount !== manifest.length || staged.rows.some((row) => row.uploader_user_id !== String(actorUserId) || !manifest.some((entry) => entry.photoUuid === row.photo_uuid && entry.fieldPath === row.field_path && entry.sourceSha256 === row.source_sha256))) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_NOT_STAGED", "Staged V7 evidence does not exactly match the frozen manifest")); return result; }
    // Two different source images can still normalize to the same stored bytes.
    if (new Set(staged.rows.map((row) => row.stored_sha256)).size !== staged.rowCount) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_NOT_STAGED", "Each finding needs its own photo; two findings resolved to the same stored image")); return result; }
    const accepted = await client.query("SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1 AND system_key='smoke_ventilation' AND master_template_version=7 AND status='accepted' AND (photo_uuid=ANY($2::uuid[]) OR source_sha256=ANY($3::text[]) OR stored_sha256=ANY($4::text[])) FOR UPDATE", [payload.jobId, staged.rows.map((row) => row.photo_uuid), staged.rows.map((row) => row.source_sha256), staged.rows.map((row) => row.stored_sha256)]);
    if (accepted.rowCount) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence is already bound to another location in this Job")); return result; }
    const groupId = randomUUID();
    await client.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'smoke_ventilation',$3) ON CONFLICT(job_id,system_key) DO NOTHING", [groupId, payload.jobId, actorUserId]);
    const group = await client.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id=$1 AND system_key='smoke_ventilation' FOR UPDATE", [payload.jobId]);
    if (!group.rowCount) throw new Error("V7 Smoke Ventilation group unavailable");
    const snapshot = { schemaVersion: 2, acceptedAt: new Date().toISOString(), ...authority, system: { ...system, key: "smoke_ventilation", definition: definition.rows[0]!.definition, repetitionMode: "single_with_repeatable_rows" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null }, evidenceManifest: manifest };
    const formId = randomUUID();
    await client.query(
      "INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) VALUES($1,$2,$3,'primary',NULL,NULL,NULL,NULL,1,$4,$5,2,$6,1,$7,$8,'submitted',$9,$10,$11)",
      [formId, group.rows[0]!.id, payload.clientUuid, payload.masterTemplate.id, payload.configuration.revisionId, snapshot, payload.responses, fingerprint, payload.performedAt, payload.originalCreatorSnapshot, actorUserId]
    );
    await client.query("UPDATE staged_inspection_evidence SET status='accepted',form_instance_id=$1,accepted_at=now() WHERE inspection_client_uuid=$2 AND status='staged'", [formId, payload.clientUuid]);
    await client.query("COMMIT");
    result.acceptedIds.push(payload.clientUuid);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (isSmokeVentilationV7AcceptedEvidenceUniqueViolation(error)) result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence was accepted concurrently for another location; retry safely"));
    else result.failed.push(fail(payload.clientUuid, "SERVER_ERROR", "Smoke Ventilation V7 form could not be saved"));
  } finally { client.release(); }
  return result;
}
