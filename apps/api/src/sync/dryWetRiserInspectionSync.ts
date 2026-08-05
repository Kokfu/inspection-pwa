import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";
import { canonicalDryWetRiserResponses } from "../inspections/dryWetRiserAccepted.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type R = Record<string, unknown>;
type Item = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type TestRaceBoundary = "beforeParentInsert" | "beforeFormInsert";
let testRaceBarrier: ((boundary: TestRaceBoundary) => Promise<void>) | undefined;
/** Test-only in-process synchronization; production leaves this undefined. */
export function setDryWetRiserSyncTestBarrier(barrier: ((boundary: TestRaceBoundary) => Promise<void>) | undefined) { testRaceBarrier = barrier; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rec = (value: unknown): value is R => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: R, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const failure = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });
const groupConstraint = "master_system_inspections_job_id_system_key_key";
const clientUuidConstraint = "master_system_form_instances_client_uuid_key";
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : rec(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const canonicalUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function creator(value: unknown): R | null | undefined {
  if (value === null) return null;
  if (!rec(value) || !exact(value, ["source", "userId", "username", "role", "capturedAt"]) || value.source !== "device_reported" || !Number.isSafeInteger(value.userId) || Number(value.userId) <= 0 || typeof value.username !== "string" || (value.role !== "admin" && value.role !== "inspector") || typeof value.capturedAt !== "string" || value.capturedAt.length > 24 || !canonicalUtc.test(value.capturedAt) || new Date(value.capturedAt).toISOString() !== value.capturedAt) return undefined;
  const username = value.username.trim();
  return username.length > 0 && username.length <= 160 ? { ...value, username } : undefined;
}
function isExpectedUniqueViolation(error: unknown) {
  return rec(error) && error.code === "23505" && (error.constraint === groupConstraint || error.constraint === clientUuidConstraint);
}
async function classifyAfterUniqueViolation(id: string, jobId: string, fingerprint: string) {
  const existing = await pool.query<{ request_fingerprint: string }>("SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid=$1", [id]);
  if (existing.rowCount) return existing.rows[0].request_fingerprint === fingerprint
    ? { duplicate: true as const }
    : { failure: failure(id, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different Dry/Wet Riser data") };
  const group = await pool.query("SELECT 1 FROM master_system_inspections WHERE job_id=$1 AND system_key='dry_wet_riser'", [jobId]);
  return group.rowCount ? { failure: failure(id, "ACTIVE_INSPECTION_EXISTS", "This job already has a Dry/Wet Riser inspection") } : undefined;
}

export async function syncDryWetRiserInspections(items: Item[], actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };
  for (const item of items) {
    const id = typeof item.entityId === "string" ? item.entityId : "unknown";
    if (!uuid.test(id) || typeof item.operationId !== "string" || !uuid.test(item.operationId) || item.entityType !== "masterSystemInspection" || item.action !== "create" || !rec(item.payload)) { result.failed.push(failure(id, "VALIDATION_ERROR", "Dry/Wet Riser operation is invalid")); continue; }
    const payload = item.payload;
    const originalCreatorSnapshot = creator(payload.originalCreatorSnapshot);
    if (!exact(payload, ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "performedAt"]) || payload.clientUuid !== id || typeof payload.jobId !== "string" || !uuid.test(payload.jobId) || payload.systemKey !== "dry_wet_riser" || payload.instanceKey !== "primary" || payload.configuredZoneId !== null || payload.configuredLocationId !== null || payload.displaySequence !== 1 || originalCreatorSnapshot === undefined || !rec(payload.masterTemplate) || !exact(payload.masterTemplate, ["id", "code", "version"]) || typeof payload.masterTemplate.id !== "string" || !uuid.test(payload.masterTemplate.id) || payload.masterTemplate.code !== "MFE-FSSR" || payload.masterTemplate.version !== 2 || !rec(payload.configuration) || !exact(payload.configuration, ["revisionId", "revisionNumber"]) || typeof payload.configuration.revisionId !== "string" || !uuid.test(payload.configuration.revisionId) || !Number.isInteger(payload.configuration.revisionNumber) || !rec(payload.inspectionSnapshot) || !rec(payload.responses) || typeof payload.performedAt !== "string" || Number.isNaN(Date.parse(payload.performedAt))) { result.failed.push(failure(id, "VALIDATION_ERROR", "Dry/Wet Riser payload is invalid")); continue; }
    const client = await pool.connect(); let fingerprint = "";
    try {
      await client.query("BEGIN");
      const job = (await client.query<{ status:string; job_reference:string; title:string; master_template_version_id:string; customer_configuration_revision_id:string; configuration_snapshot:R }>("SELECT status,job_reference,title,master_template_version_id,customer_configuration_revision_id,configuration_snapshot FROM inspection_jobs WHERE id=$1", [payload.jobId])).rows[0];
      const frozenConfiguration = job && rec(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined;
      const frozenTemplate = job && rec(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined;
      const system = job && Array.isArray(job.configuration_snapshot.enabledSystems) ? job.configuration_snapshot.enabledSystems.find((value) => rec(value) && value.systemKey === "dry_wet_riser" && value.definitionStatus === "confirmed") as R | undefined : undefined;
      const databaseConfiguration = job ? (await client.query<{ systemConfiguration:unknown }>("SELECT system_configuration AS \"systemConfiguration\" FROM customer_enabled_systems WHERE configuration_revision_id=$1 AND template_version_id=$2 AND system_key='dry_wet_riser'", [job.customer_configuration_revision_id, job.master_template_version_id])).rows[0]?.systemConfiguration : undefined;
      const authoritative = parseDryWetRiserSystemConfiguration(databaseConfiguration);
      const frozen = system ? parseDryWetRiserSystemConfiguration(system.systemConfiguration) : undefined;
      if (!authoritative || !frozen) { await client.query("ROLLBACK"); result.failed.push(failure(id, "CONFIGURATION_ERROR", "Dry/Wet Riser authoritative configuration is missing or invalid")); continue; }
      if (!job || job.status !== "open" || !system || !frozenConfiguration || !frozenTemplate || job.master_template_version_id !== payload.masterTemplate.id || job.customer_configuration_revision_id !== payload.configuration.revisionId || frozenConfiguration.revisionId !== payload.configuration.revisionId || frozenConfiguration.revisionNumber !== payload.configuration.revisionNumber || frozenTemplate.id !== payload.masterTemplate.id || frozenTemplate.code !== "MFE-FSSR" || frozenTemplate.version !== 2 || authoritative.riserMode !== frozen.riserMode) { await client.query("ROLLBACK"); result.failed.push(failure(id, "VALIDATION_ERROR", "Dry/Wet Riser job configuration is unavailable")); continue; }
      const submittedSystem = rec(payload.inspectionSnapshot.system) ? parseDryWetRiserSystemConfiguration(payload.inspectionSnapshot.system.systemConfiguration) : undefined;
      if (!submittedSystem || submittedSystem.riserMode !== frozen.riserMode) { await client.query("ROLLBACK"); result.failed.push(failure(id, "VALIDATION_ERROR", "Dry/Wet Riser mode does not match the frozen configuration")); continue; }
      const responses = canonicalDryWetRiserResponses(payload.responses, system, authoritative.riserMode);
      if (!responses) { await client.query("ROLLBACK"); result.failed.push(failure(id, "VALIDATION_ERROR", "Dry/Wet Riser inspection is incomplete or invalid")); continue; }
      const definition = (await client.query<{ definition:unknown; definition_status:string }>("SELECT definition,definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='dry_wet_riser'", [payload.masterTemplate.id])).rows[0];
      if (!definition || definition.definition_status !== "confirmed") { await client.query("ROLLBACK"); result.failed.push(failure(id, "VALIDATION_ERROR", "Dry/Wet Riser V2 definition is unavailable")); continue; }
      const snapshot = { schemaVersion: 1, acceptedAt: new Date().toISOString(), job: { id: payload.jobId, reference: job.job_reference, title: job.title }, customer: job.configuration_snapshot.customer, configuration: frozenConfiguration, template: frozenTemplate, system: { ...system, systemConfiguration: authoritative, definition: definition.definition, repetitionMode: "single_with_repeatable_rows" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null } };
      const { acceptedAt: _acceptedAt, ...snapshotForFingerprint } = snapshot;
      fingerprint = createHash("sha256").update(canonical({ clientUuid:id, jobId:payload.jobId, systemKey:"dry_wet_riser", instanceKey:"primary", configuredZoneId:null, configuredLocationId:null, displaySequence:1, masterTemplate:frozenTemplate, configuration:frozenConfiguration, inspectionSnapshot:snapshotForFingerprint, responses, performedAt:payload.performedAt, originalCreatorSnapshot, actorUserId:actorUserId ?? null })).digest("hex");
      const old = (await client.query<{ request_fingerprint:string }>("SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid=$1", [id])).rows[0];
      if (old) { await client.query("ROLLBACK"); old.request_fingerprint === fingerprint ? result.duplicateIds.push(id) : result.failed.push(failure(id, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different Dry/Wet Riser data")); continue; }
      if ((await client.query("SELECT 1 FROM master_system_inspections WHERE job_id=$1 AND system_key='dry_wet_riser' FOR UPDATE", [payload.jobId])).rowCount) { await client.query("ROLLBACK"); result.failed.push(failure(id, "ACTIVE_INSPECTION_EXISTS", "This job already has a Dry/Wet Riser inspection")); continue; }
      const group = randomUUID();
      await testRaceBarrier?.("beforeParentInsert");
      await client.query("INSERT INTO master_system_inspections (id,job_id,system_key,created_by_user_id) VALUES ($1,$2,'dry_wet_riser',$3)", [group, payload.jobId, actorUserId ?? null]);
      await testRaceBarrier?.("beforeFormInsert");
      await client.query("INSERT INTO master_system_form_instances (id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) VALUES ($1,$2,$3,'primary',NULL,NULL,NULL,NULL,1,$4,$5,1,$6,1,$7,$8,'submitted',$9,$10,$11)", [randomUUID(), group, id, frozenTemplate.id, frozenConfiguration.revisionId, snapshot, responses, fingerprint, payload.performedAt, originalCreatorSnapshot, actorUserId ?? null]);
      await client.query("COMMIT"); result.acceptedIds.push(id);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const classification = fingerprint && isExpectedUniqueViolation(error)
        ? await classifyAfterUniqueViolation(id, payload.jobId, fingerprint).catch(() => undefined)
        : undefined;
      if (classification && "duplicate" in classification) result.duplicateIds.push(id);
      else if (classification && "failure" in classification) result.failed.push(classification.failure);
      else result.failed.push(failure(id, "SERVER_ERROR", "Dry/Wet Riser inspection could not be saved"));
    } finally { client.release(); }
  }
  return result;
}
