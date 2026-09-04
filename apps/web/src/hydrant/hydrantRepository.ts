import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { compatibleCatalogSystem } from "../referenceData/systemContractCompatibility";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import { hydrantResultColumns, type HydrantInspectionRecord, type HydrantResponses, type HydrantRow } from "./hydrantTypes";
import { listHydrantV7Photos, v7HydrantEvidenceOutbox, v7HydrantManifest, v7HydrantSubmissionIssues } from "./hydrantV7Evidence";

const key = "hydrant" as const;
const now = () => new Date().toISOString();
const fields = hydrantResultColumns.map(([responseKey]) => responseKey);

function configured(system: JobSystemSnapshot, isV7: boolean): HydrantRow[] {
  let count = 0;
  return system.locations.flatMap((location) => Array.from({ length: location.presetRowCount }, (_, index) => ({
    rowUuid: crypto.randomUUID(), source: "configured" as const, configuredLocationId: location.id, configuredRowOrdinal: index + 1,
    zoneSnapshot: system.zones.find((zone) => zone.id === location.zoneId) ? { id: location.zoneId!, displayName: system.zones.find((zone) => zone.id === location.zoneId)!.displayName } : null,
    locationSnapshot: { id: location.id, displayName: location.displayName },
    assetReference: typeof location.rowPreset === "object" && location.rowPreset && "assetReference" in location.rowPreset && typeof location.rowPreset.assetReference === "string" ? location.rowPreset.assetReference : "",
    locationText: location.displayName,
    canvasHose1Result: null, canvasHose2Result: null, diffuserNozzleResult: null, landingValveResult: null, landingValveHandleResult: null, hoseCabinetResult: null, keyLockResult: null,
    remarks: "", ...(isV7 ? { fieldRemarks: {} } : {}), sortOrder: ++count
  })));
}

export async function getOrCreateHydrantInspection(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog, creator: { id: number; username: string; role: "admin" | "inspector" } | undefined) {
  const jobSystemKey = `${job.id}:${key}`;
  const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(jobSystemKey).first();
  if (existing) { if (existing.systemKey !== key) throw new Error("Stored inspection identity is invalid"); return existing as HydrantInspectionRecord; }
  const compatible = compatibleCatalogSystem(catalog, job.configurationSnapshot.template, key), definition = compatible?.system.definition;
  if (!definition || system.systemKey !== key) throw new Error("Cached compatible Hydrant definition is unavailable. Refresh jobs online first.");
  const timestamp = now();
  const record: HydrantInspectionRecord = {
    schemaVersion: 1, clientUuid: crypto.randomUUID(), jobSystemKey, jobId: job.id, systemKey: key, instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: creator ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp } as DeviceReportedCreator : null,
    masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: job.configurationSnapshot.template.version }, configuration: job.configurationSnapshot.configuration,
    inspectionSnapshot: { schemaVersion: 1, capturedAt: timestamp, job: { id: job.id, reference: job.reference, title: job.title }, customer: job.configurationSnapshot.customer, configuration: job.configurationSnapshot.configuration, template: job.configurationSnapshot.template, system: { ...system, definition, repetitionMode: "single_with_repeatable_rows" } },
    responses: { schemaVersion: 1, hydrantType: null, rows: configured(system, job.configurationSnapshot.template.version === 7), comments: "" }, performedAt: timestamp, localCreatedAt: timestamp, localUpdatedAt: timestamp, syncStatus: "Draft"
  };
  await localDatabase.masterSystemInspections.add(record);
  return record;
}

function structuralSubmitIssues(record: HydrantInspectionRecord, responses: HydrantResponses) {
  const issues: string[] = [];
  if (!["pressurize", "meter", "public"].includes(responses.hydrantType ?? "")) issues.push("Hydrant Type is required");
  const expected = record.inspectionSnapshot.system.locations.flatMap((location) => Array.from({ length: location.presetRowCount }, (_, index) => `${location.id}:${index + 1}`));
  const seen = new Set<string>();
  if (!responses.rows.length) issues.push("At least one Hydrant Location is required");
  responses.rows.forEach((row, index) => {
    if (!row.rowUuid || row.sortOrder !== index + 1 || !row.locationText || row.locationText.length > 300 || row.assetReference.length > 200 || row.remarks.length > 2000) issues.push("Hydrant Location row is invalid");
    if (record.masterTemplate.version !== 7 && !fields.every((field) => row[field] === "good" || row[field] === "poor")) issues.push("Every Hydrant Location result is required");
    if (row.source === "configured") {
      const identity = `${row.configuredLocationId}:${row.configuredRowOrdinal}`;
      if (!expected.includes(identity) || seen.has(identity)) issues.push("Configured Hydrant row identity is invalid");
      seen.add(identity);
    } else if (row.configuredLocationId !== null || row.configuredRowOrdinal !== null) issues.push("Technician Hydrant row provenance is invalid");
  });
  if (seen.size !== expected.length) issues.push("Configured Hydrant rows must be retained");
  if (responses.comments.length > 4000) issues.push("Comments exceed 4000 characters");
  return issues;
}

/** Shared by the visible submit gate and the IndexedDB submit transaction. */
export function submitIssues(record: HydrantInspectionRecord, responses: HydrantResponses, attachments: InspectionAttachmentRecord[] = []) {
  const issues = structuralSubmitIssues(record, responses);
  return record.masterTemplate.version === 7 ? [...issues, ...v7HydrantSubmissionIssues(record, responses, attachments)] : issues;
}

const payload = (record: HydrantInspectionRecord, evidenceManifest?: ReturnType<typeof v7HydrantManifest>) => ({ clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey, instanceKey: record.instanceKey, configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: record.originalCreatorSnapshot, masterTemplate: record.masterTemplate, configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot, responses: record.responses, performedAt: record.performedAt, ...(evidenceManifest ? { evidenceManifest } : {}) });

async function write(record: HydrantInspectionRecord, responses: HydrantResponses, submit: boolean) {
  let saved: HydrantInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => {
    const live = await localDatabase.masterSystemInspections.get(record.clientUuid) as HydrantInspectionRecord | undefined;
    if (!live || live.systemKey !== key || live.syncStatus !== "Draft" || live.localUpdatedAt !== record.localUpdatedAt) throw new Error("This Hydrant record changed elsewhere. Reload before continuing.");
    const isV7 = live.masterTemplate.version === 7;
    const photos = isV7 ? await listHydrantV7Photos(live.clientUuid) : [];
    if (submit && submitIssues(live, responses, photos).length) throw new Error("Complete required Hydrant fields and evidence before local submission");
    saved = { ...live, responses, syncStatus: submit ? "Pending" : "Draft", performedAt: submit ? now() : live.performedAt, localUpdatedAt: now(), lastSyncError: undefined };
    await localDatabase.masterSystemInspections.put(saved);
    if (!submit) return;
    const evidenceManifest = isV7 ? v7HydrantManifest(photos, responses) : undefined;
    const activeKey = `masterSystemInspection:create:${live.clientUuid}`;
    const old = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    const item: SyncOutboxItem = { operationId: old?.operationId ?? crypto.randomUUID(), entityType: "masterSystemInspection", entityId: live.clientUuid, action: "create", payload: payload(saved, evidenceManifest), createdAt: saved.localCreatedAt, attempts: old?.attempts ?? 0, status: "Pending", activeKey };
    if (old) await localDatabase.syncOutbox.put(item); else await localDatabase.syncOutbox.add(item);
    if (isV7) for (const photo of photos.filter((candidate) => evidenceManifest!.some((entry) => entry.photoUuid === candidate.photoUuid))) {
      await localDatabase.inspectionAttachments.update(photo.photoUuid, { syncStatus: "Pending", localUpdatedAt: saved.localUpdatedAt });
      const evidenceActiveKey = `v7StagedEvidence:create:${photo.photoUuid}`;
      if (!await localDatabase.syncOutbox.where("activeKey").equals(evidenceActiveKey).first()) await localDatabase.syncOutbox.add(v7HydrantEvidenceOutbox(photo));
    }
  });
  return saved!;
}

export const saveHydrantDraft = (record: HydrantInspectionRecord, responses: HydrantResponses) => write(record, responses, false);
export const submitLocalHydrant = (record: HydrantInspectionRecord, responses: HydrantResponses) => write(record, responses, true);
export async function returnFailedHydrantToDraft(record: HydrantInspectionRecord) {
  const live = await localDatabase.masterSystemInspections.get(record.clientUuid) as HydrantInspectionRecord | undefined;
  if (!live || !["Failed", "Conflict"].includes(live.syncStatus)) throw new Error("This Hydrant record changed elsewhere.");
  const saved = { ...live, syncStatus: "Draft" as const, localUpdatedAt: now(), lastSyncError: undefined };
  await localDatabase.masterSystemInspections.put(saved);
  return saved;
}
