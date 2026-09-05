import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { dryWetRiserOutletMaximum } from "../inspections/dryWetRiserAccepted.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";
import { isV7EvidenceFinding, parseV7EvidenceManifest, resolveV7EvidenceContract, v7EvidenceContractSha256, v7EvidenceManifestFailureMessage } from "../inspections/evidence/v7EvidenceContracts.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type Value = Record<string, unknown>;
type SyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };
type Payload = { clientUuid: string; jobId: string; systemKey: "dry_wet_riser"; instanceKey: "primary"; configuredZoneId: null; configuredLocationId: null; displaySequence: 1; originalCreatorSnapshot: Value | null; masterTemplate: { id: string; code: "MFE-FSSR"; version: 7 }; configuration: { revisionId: string; revisionNumber: number }; inspectionSnapshot: Value; responses: Value; evidenceManifest: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }>; performedAt: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const record = (value: unknown): value is Value => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Value, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : record(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const fail = (id: string, code: string, message: string): SyncFailure => ({ id, code, message });
const unavailable = (id: string) => fail(id, "JOB_ACCESS_DENIED", "This V7 inspection is unavailable");
const v7AcceptedEvidenceUniqueConstraints = new Set(["staged_inspection_evidence_v7_accepted_source_per_job_system", "staged_inspection_evidence_v7_accepted_stored_per_job_system"]);
/** 13 flat checklist fields: 4 Water Tank + 9 Pump House (the Jockey/Duty/
 * Standby pressure judgement lives solely on the paired measurement row -
 * see masterServiceReportV7.ts's `upgradeV7DryWetRiser`). */
const checklistFields = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"] as const;
const measurementFields = [["jockey_psi", ["cut_in", "cut_out"]], ["duty_psi", ["cut_in"]], ["standby_psi", ["cut_in"]]] as const;
const rowFields = ["canvasHoseAt2Result", "diffuserNozzleResult", "landingValveResult", "crandleResult", "doorResult"] as const;
const rowKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "locationText", ...rowFields, "remarks", "fieldRemarks", "sortOrder"] as const;

export const isDryWetRiserV7AcceptedEvidenceUniqueViolation = (error: unknown) => record(error) && error.code === "23505" && typeof error.constraint === "string" && v7AcceptedEvidenceUniqueConstraints.has(error.constraint);

function parse(item: SyncItem): Payload | undefined {
  if (!uuid.test(String(item.operationId)) || item.entityType !== "masterSystemInspection" || item.action !== "create" || !uuid.test(String(item.entityId)) || !record(item.payload)) return undefined;
  const p = item.payload; const keys = ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "evidenceManifest", "performedAt"];
  if (!exact(p, keys) || !uuid.test(String(p.clientUuid)) || p.clientUuid !== item.entityId || !uuid.test(String(p.jobId)
    ) || p.systemKey !== "dry_wet_riser" || p.instanceKey !== "primary" || p.configuredZoneId !== null || p.configuredLocationId !== null || p.displaySequence !== 1
    || !record(p.masterTemplate) || !exact(p.masterTemplate, ["id", "code", "version"]) || !uuid.test(String(p.masterTemplate.id)) || p.masterTemplate.code !== "MFE-FSSR" || p.masterTemplate.version !== 7
    || !record(p.configuration) || !exact(p.configuration, ["revisionId", "revisionNumber"]) || !uuid.test(String(p.configuration.revisionId)) || !Number.isSafeInteger(p.configuration.revisionNumber)
    || !record(p.inspectionSnapshot) || !record(p.responses) || !Array.isArray(p.evidenceManifest) || !timestamp.test(String(p.performedAt)) || new Date(String(p.performedAt)).toISOString() !== p.performedAt) return undefined;
  return p as unknown as Payload;
}

/** V7 is dispatched before the legacy Dry/Wet Riser synchronizer. V1-V6
 * envelopes contain no manifest and remain wholly on that historical path. */
export function isDryWetRiserV7Payload(item: SyncItem) {
  return record(item.payload) && item.payload.systemKey === "dry_wet_riser" && record(item.payload.masterTemplate) && item.payload.masterTemplate.version === 7;
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
  const pumpHouse = definition.sections.find((value) => record(value) && value.key === "pump_house");
  const measurementBlock = record(pumpHouse) && Array.isArray(pumpHouse.blocks) ? pumpHouse.blocks.find((value) => record(value) && value.type === "measurement") : undefined;
  for (const [key] of measurementFields) {
    const item = record(measurementBlock) && Array.isArray(measurementBlock.items) ? measurementBlock.items.find((value) => record(value) && value.key === key) : undefined;
    const result = record(item) ? item.result : undefined;
    if (!record(result) || result.control !== "good_poor" || !Array.isArray(result.allowedValues) || result.allowedValues.length === 0 || !result.allowedValues.every((value) => typeof value === "string")) return undefined;
    values.set(key, new Set(result.allowedValues as string[]));
  }
  const outlet = definition.sections.find((value) => record(value) && value.key === "riser_outlet");
  const rows = record(outlet) && Array.isArray(outlet.blocks) ? outlet.blocks.find((value) => record(value) && value.key === "riser_outlet_rows") : undefined;
  for (const key of rowFields) {
    const column = record(rows) && Array.isArray(rows.columns) ? rows.columns.find((value) => record(value) && value.key === key) : undefined;
    if (!record(column) || column.control !== "good_poor" || !Array.isArray(column.allowedValues) || !column.allowedValues.every((value) => typeof value === "string")) return undefined;
    values.set(key, new Set(column.allowedValues as string[]));
  }
  return values;
}

/** Configured rows carry frozen zone/location authority (mirroring the G4
 * class of guard already closed for the Manager write path): a row claiming
 * `source:"configured"` must resolve to a real preset row on a currently
 * enabled location, and its zoneSnapshot/locationSnapshot/assetReference/
 * locationText must match that location's frozen data exactly - the client
 * never gets to invent or stale-cache what a configured row displays as.
 * Unlike V1-V6's `canonicalDryWetRiserResponses`, this only validates; it
 * never rewrites, matching every other V7 acceptance module's
 * validate-then-store-as-submitted contract. */
function validRiserOutlets(rows: unknown, system: Value, values: Map<string, Set<string>>): boolean {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > dryWetRiserOutletMaximum) return false;
  if (!Array.isArray(system.locations) || !Array.isArray(system.zones)) return false;
  const locations = system.locations.filter(record);
  if (locations.length !== system.locations.length) return false;
  const zones = new Map(system.zones.filter(record).map((zone) => [zone.id, zone]));
  const sortedLocations = locations.slice().sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || String(a.id).localeCompare(String(b.id)));
  const expected = new Map<string, Value>();
  for (const location of sortedLocations) {
    if (typeof location.id !== "string" || !uuid.test(location.id) || !Number.isSafeInteger(location.presetRowCount) || Number(location.presetRowCount) < 0 || typeof location.displayName !== "string" || location.displayName.length === 0 || location.displayName.length > 250) return false;
    for (let ordinal = 1; ordinal <= Number(location.presetRowCount); ordinal += 1) expected.set(`${location.id}:${ordinal}`, location);
  }
  const ids = new Set<string>(); const seen = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!record(row) || !exact(row, rowKeys) || typeof row.rowUuid !== "string" || !uuid.test(row.rowUuid) || ids.has(row.rowUuid) || row.sortOrder !== index + 1) return false;
    ids.add(row.rowUuid);
    if (typeof row.remarks !== "string" || row.remarks.length > 2000 || !record(row.fieldRemarks) || Object.keys(row.fieldRemarks).some((key) => !(rowFields as readonly string[]).includes(key)) || Object.values(row.fieldRemarks).some((value) => typeof value !== "string" || value.length > 2000)) return false;
    for (const key of rowFields) {
      const value = row[key];
      if (typeof value !== "string" || !values.get(key)?.has(value) || isV7EvidenceFinding(value) && !String(row.fieldRemarks[key] ?? "").trim()) return false;
    }
    if (row.source === "technician") {
      if (row.configuredLocationId !== null || row.configuredRowOrdinal !== null || row.zoneSnapshot !== null || row.locationSnapshot !== null
        || typeof row.assetReference !== "string" || row.assetReference.length > 250
        || typeof row.locationText !== "string" || !row.locationText.trim() || row.locationText.length > 250) return false;
      continue;
    }
    if (row.source !== "configured" || typeof row.configuredLocationId !== "string" || !uuid.test(row.configuredLocationId) || !Number.isSafeInteger(row.configuredRowOrdinal) || Number(row.configuredRowOrdinal) < 1) return false;
    const key = `${row.configuredLocationId}:${row.configuredRowOrdinal}`; const location = expected.get(key);
    if (!location || seen.has(key)) return false;
    seen.add(key);
    const zoneId = location.zoneId; const zone = typeof zoneId === "string" ? zones.get(zoneId) : undefined;
    if (zoneId === null || zoneId === undefined) { if (row.zoneSnapshot !== null) return false; }
    else if (!zone || !record(row.zoneSnapshot) || !exact(row.zoneSnapshot, ["id", "displayName"]) || row.zoneSnapshot.id !== zoneId || row.zoneSnapshot.displayName !== (zone as Value).displayName) return false;
    if (!record(row.locationSnapshot) || !exact(row.locationSnapshot, ["id", "displayName"]) || row.locationSnapshot.id !== location.id || row.locationSnapshot.displayName !== location.displayName) return false;
    const preset = record(location.rowPreset) ? location.rowPreset : undefined;
    const asset = preset && typeof preset.assetReference === "string" ? preset.assetReference : "";
    if (row.assetReference !== asset || row.locationText !== location.displayName) return false;
  }
  return seen.size === expected.size;
}

function validResponses(responses: Value, values: Map<string, Set<string>>, system: Value, riserMode: "dry" | "wet") {
  if (!exact(responses, ["schemaVersion", "mode", "checklist", "measurements", "riserOutlets", "comments"]) || responses.schemaVersion !== 2 || responses.mode !== riserMode
    || !record(responses.checklist) || !exact(responses.checklist, checklistFields)
    || !record(responses.measurements) || !exact(responses.measurements, measurementFields.map(([key]) => key))
    || typeof responses.comments !== "string" || responses.comments.length > 4000) return false;
  for (const key of checklistFields) {
    const value = responses.checklist[key];
    if (!record(value) || !exact(value, ["result", "remarks"]) || typeof value.result !== "string" || !values.get(key)?.has(value.result) || typeof value.remarks !== "string" || value.remarks.length > 2000 || isV7EvidenceFinding(value.result) && !value.remarks.trim()) return false;
  }
  for (const [key, measurementKeys] of measurementFields) {
    const value = responses.measurements[key];
    const measured = record(value) && record(value.values) ? value.values : undefined;
    if (!record(value) || !exact(value, ["values", "unit", "result", "remarks"]) || !measured || !exact(measured, measurementKeys) || value.unit !== "PSI" || typeof value.result !== "string" || !values.get(key)?.has(value.result) || typeof value.remarks !== "string" || value.remarks.length > 2000 || measurementKeys.some((measurementKey) => measured[measurementKey] !== null && (typeof measured[measurementKey] !== "number" || !Number.isFinite(measured[measurementKey]))) || isV7EvidenceFinding(value.result) && !value.remarks.trim()) return false;
  }
  return validRiserOutlets(responses.riserOutlets, system, values);
}

export async function acceptDryWetRiserV7Inspection(item: SyncItem, actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] }; const payload = parse(item); const id = typeof item.entityId === "string" ? item.entityId : "unknown";
  if (!payload || !actorUserId) { result.failed.push(fail(id, "VALIDATION_ERROR", "V7 Dry/Wet Riser operation is invalid")); return result; }
  const client: PoolClient = await pool.connect(); let fingerprint = "";
  try {
    await client.query("BEGIN");
    const committed = await client.query<{ synced_by_user_id: string; response_payload: Value; inspection_snapshot: Value; performed_at: Date }>("SELECT instance.synced_by_user_id,instance.response_payload,instance.inspection_snapshot,instance.performed_at FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE instance.client_uuid=$1 AND instance.status='submitted' AND inspection.system_key='dry_wet_riser' FOR UPDATE", [payload.clientUuid]);
    if (committed.rowCount) {
      const existing = committed.rows[0]!; const snapshot = existing.inspection_snapshot; const configuration = record(snapshot.configuration) ? snapshot.configuration : undefined; const template = record(snapshot.template) ? snapshot.template : undefined; const job = record(snapshot.job) ? snapshot.job : undefined; const manifest = Array.isArray(snapshot.evidenceManifest) ? snapshot.evidenceManifest : undefined;
      await client.query("ROLLBACK");
      if (existing.synced_by_user_id !== String(actorUserId)) result.failed.push(unavailable(payload.clientUuid));
      else if (job?.id === payload.jobId && configuration?.revisionId === payload.configuration.revisionId && configuration?.revisionNumber === payload.configuration.revisionNumber && template?.id === payload.masterTemplate.id && template?.version === 7 && manifest && canonical(existing.response_payload) === canonical(payload.responses) && canonical(manifest) === canonical(payload.evidenceManifest) && existing.performed_at.toISOString() === payload.performedAt) result.duplicateIds.push(payload.clientUuid);
      else result.failed.push(fail(payload.clientUuid, "IDEMPOTENCY_CONFLICT", "This inspection UUID belongs to different accepted authority"));
      return result;
    }
    const jobResult = await client.query<{ job_reference: string; title: string; master_template_version_id: string; customer_configuration_revision_id: string; configuration_snapshot: Value }>("SELECT job_reference,title,master_template_version_id,customer_configuration_revision_id,configuration_snapshot FROM inspection_jobs WHERE id=$1 AND status='open' AND technician_visible=true FOR UPDATE", [payload.jobId]);
    const job = jobResult.rows[0]; const configuration = job && record(job.configuration_snapshot.configuration) ? job.configuration_snapshot.configuration : undefined; const template = job && record(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined; const system = job && Array.isArray(job.configuration_snapshot.enabledSystems) ? job.configuration_snapshot.enabledSystems.find((value) => record(value) && value.systemKey === "dry_wet_riser" && value.definitionStatus === "confirmed") : undefined;
    const databaseConfiguration = job ? (await client.query<{ systemConfiguration: unknown }>("SELECT system_configuration AS \"systemConfiguration\" FROM customer_enabled_systems WHERE configuration_revision_id=$1 AND template_version_id=$2 AND system_key='dry_wet_riser'", [job.customer_configuration_revision_id, job.master_template_version_id])).rows[0]?.systemConfiguration : undefined;
    const authoritative = parseDryWetRiserSystemConfiguration(databaseConfiguration);
    const frozen = record(system) ? parseDryWetRiserSystemConfiguration(system.systemConfiguration) : undefined;
    const definition = job ? await client.query<{ definition: unknown; definition_status: string }>("SELECT definition,definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='dry_wet_riser'", [payload.masterTemplate.id]) : undefined;
    const contractSha256 = definition?.rows[0] ? v7EvidenceContractSha256(definition.rows[0].definition) : ""; const adapter = definition?.rows[0] ? resolveV7EvidenceContract({ systemKey: "dry_wet_riser", templateId: payload.masterTemplate.id, templateVersion: 7, definition: definition.rows[0].definition, contractSha256 }) : undefined; const manifest = adapter ? parseV7EvidenceManifest(payload.evidenceManifest, adapter, payload.responses) : undefined; const values = definition?.rows[0] ? fieldAllowedValues(definition.rows[0].definition) : undefined;
    if (!job || !configuration || !template || !record(system) || !authoritative || !frozen || authoritative.riserMode !== frozen.riserMode || definition?.rowCount !== 1 || definition.rows[0]!.definition_status !== "confirmed" || !adapter || !values || job.master_template_version_id !== payload.masterTemplate.id || job.customer_configuration_revision_id !== payload.configuration.revisionId || template.id !== payload.masterTemplate.id || template.code !== "MFE-FSSR" || template.version !== 7 || configuration.revisionId !== payload.configuration.revisionId || configuration.revisionNumber !== payload.configuration.revisionNumber) { await client.query("ROLLBACK"); result.failed.push(unavailable(payload.clientUuid)); return result; }
    if (!validResponses(payload.responses, values, system, authoritative.riserMode)) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", "V7 Dry/Wet Riser responses are invalid")); return result; }
    if (!manifest) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "VALIDATION_ERROR", v7EvidenceManifestFailureMessage(payload.evidenceManifest, "V7 evidence photos do not match the current findings"))); return result; }
    const authority = { job: { id: payload.jobId, reference: job.job_reference, title: job.title }, customer: job.configuration_snapshot.customer, configuration, template: payload.masterTemplate, system, contractSha256 };
    fingerprint = createHash("sha256").update(canonical({ clientUuid: payload.clientUuid, authority, responses: payload.responses, evidenceManifest: manifest, performedAt: payload.performedAt, actorUserId })).digest("hex");
    const reservation = await client.query<{ job_id: string; system_key: string; master_template_version_id: string; master_template_version: number; system_contract_sha256: string; reserved_by_user_id: string }>("SELECT job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id FROM inspection_evidence_reservations WHERE inspection_client_uuid=$1 FOR UPDATE", [payload.clientUuid]); const reserved = reservation.rows[0];
    if (!reserved || reserved.job_id !== payload.jobId || reserved.system_key !== "dry_wet_riser" || reserved.master_template_version_id !== payload.masterTemplate.id || reserved.master_template_version !== 7 || reserved.system_contract_sha256 !== contractSha256 || reserved.reserved_by_user_id !== String(actorUserId)) { await client.query("ROLLBACK"); result.failed.push(unavailable(payload.clientUuid)); return result; }
    const staged = await client.query<{ photo_uuid: string; field_path: string; source_sha256: string; stored_sha256: string; uploader_user_id: string }>("SELECT photo_uuid,field_path,source_sha256,stored_sha256,uploader_user_id FROM staged_inspection_evidence WHERE inspection_client_uuid=$1 AND status='staged' FOR UPDATE", [payload.clientUuid]);
    if (staged.rowCount !== manifest.length || staged.rows.some((row) => row.uploader_user_id !== String(actorUserId) || !manifest.some((entry) => entry.photoUuid === row.photo_uuid && entry.fieldPath === row.field_path && entry.sourceSha256 === row.source_sha256))) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_NOT_STAGED", "Staged V7 evidence does not exactly match the frozen manifest")); return result; }
    if (new Set(staged.rows.map((row) => row.stored_sha256)).size !== staged.rowCount) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_NOT_STAGED", "Each finding needs its own photo; two findings resolved to the same stored image")); return result; }
    const accepted = await client.query("SELECT 1 FROM staged_inspection_evidence WHERE job_id=$1 AND system_key='dry_wet_riser' AND master_template_version=7 AND status='accepted' AND (photo_uuid=ANY($2::uuid[]) OR source_sha256=ANY($3::text[]) OR stored_sha256=ANY($4::text[])) FOR UPDATE", [payload.jobId, staged.rows.map((row) => row.photo_uuid), staged.rows.map((row) => row.source_sha256), staged.rows.map((row) => row.stored_sha256)]);
    if (accepted.rowCount) { await client.query("ROLLBACK"); result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence is already bound to another location in this Job")); return result; }
    await client.query("INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'dry_wet_riser',$3) ON CONFLICT(job_id,system_key) DO NOTHING", [randomUUID(), payload.jobId, actorUserId]); const group = await client.query<{ id: string }>("SELECT id FROM master_system_inspections WHERE job_id=$1 AND system_key='dry_wet_riser' FOR UPDATE", [payload.jobId]); if (!group.rowCount) throw new Error("V7 Dry/Wet Riser group unavailable");
    const snapshot = { schemaVersion: 2, acceptedAt: new Date().toISOString(), ...authority, system: { ...system, key: "dry_wet_riser", systemConfiguration: authoritative, definition: definition!.rows[0]!.definition, repetitionMode: "single_with_repeatable_rows" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null }, evidenceManifest: manifest };
    const formId = randomUUID(); await client.query("INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) VALUES($1,$2,$3,'primary',NULL,NULL,NULL,NULL,1,$4,$5,2,$6,2,$7,$8,'submitted',$9,$10,$11)", [formId, group.rows[0]!.id, payload.clientUuid, payload.masterTemplate.id, payload.configuration.revisionId, snapshot, payload.responses, fingerprint, payload.performedAt, payload.originalCreatorSnapshot, actorUserId]);
    await client.query("UPDATE staged_inspection_evidence SET status='accepted',form_instance_id=$1,accepted_at=now() WHERE inspection_client_uuid=$2 AND status='staged'", [formId, payload.clientUuid]); await client.query("COMMIT"); result.acceptedIds.push(payload.clientUuid);
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); if (isDryWetRiserV7AcceptedEvidenceUniqueViolation(error)) result.failed.push(fail(payload.clientUuid, "EVIDENCE_CONFLICT", "V7 evidence was accepted concurrently for another location; retry safely")); else result.failed.push(fail(payload.clientUuid, "SERVER_ERROR", "Dry/Wet Riser V7 form could not be saved"));
  } finally { client.release(); }
  return result;
}
