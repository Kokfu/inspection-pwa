import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { compatibleCatalogSystem } from "../referenceData/systemContractCompatibility";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import {
  smokeVentilationChecklistFields,
  type SmokeVentilationInspectionRecord,
  type SmokeVentilationResponses,
  type SmokeVentilationRow
} from "./smokeVentilationTypes";
import { listSmokeVentilationV7Photos, v7SmokeVentilationEvidenceOutbox, v7SmokeVentilationManifest, v7SmokeVentilationSubmissionIssues } from "./smokeVentilationV7Evidence";

const key = "smoke_ventilation" as const;
const now = () => new Date().toISOString();

function configuredRows(system: JobSystemSnapshot): SmokeVentilationRow[] {
  let count = 0;
  return system.locations.flatMap((location) => Array.from({ length: location.presetRowCount }, (_, index) => ({
    rowUuid: crypto.randomUUID(), source: "configured" as const, configuredLocationId: location.id, configuredRowOrdinal: index + 1,
    zoneSnapshot: null,
    locationSnapshot: { id: location.id, displayName: location.displayName },
    assetReference: typeof location.rowPreset === "object" && location.rowPreset && "assetReference" in location.rowPreset && typeof location.rowPreset.assetReference === "string" ? location.rowPreset.assetReference : "",
    autoResult: null, manualResult: null, remarks: "", fieldRemarks: {}, sortOrder: ++count
  })));
}

function emptyChecklist(): SmokeVentilationResponses["checklist"] {
  return Object.fromEntries(smokeVentilationChecklistFields.map(([key]) => [key, { result: null, remarks: "" }])) as SmokeVentilationResponses["checklist"];
}

export async function getOrCreateSmokeVentilationInspection(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog, creator: { id: number; username: string; role: "admin" | "inspector" } | undefined) {
  const jobSystemKey = `${job.id}:${key}`;
  const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(jobSystemKey).first();
  if (existing) { if (existing.systemKey !== key) throw new Error("Stored inspection identity is invalid"); return existing as SmokeVentilationInspectionRecord; }
  const compatible = compatibleCatalogSystem(catalog, job.configurationSnapshot.template, key), definition = compatible?.system.definition;
  if (!definition || system.systemKey !== key || job.configurationSnapshot.template.version !== 7) throw new Error("Cached compatible Smoke Ventilation definition is unavailable. Refresh jobs online first.");
  const timestamp = now();
  const record: SmokeVentilationInspectionRecord = {
    schemaVersion: 1, clientUuid: crypto.randomUUID(), jobSystemKey, jobId: job.id, systemKey: key, instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: creator ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp } as DeviceReportedCreator : null,
    masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: 7 }, configuration: job.configurationSnapshot.configuration,
    inspectionSnapshot: { schemaVersion: 1, capturedAt: timestamp, job: { id: job.id, reference: job.reference, title: job.title }, customer: job.configurationSnapshot.customer, configuration: job.configurationSnapshot.configuration, template: job.configurationSnapshot.template, system: { ...system, definition, repetitionMode: "single_with_repeatable_rows" } },
    responses: { schemaVersion: 1, controlPanelNo: "", location: "", dateTested: "", checklist: emptyChecklist(), rows: configuredRows(system), comments: "" },
    performedAt: timestamp, localCreatedAt: timestamp, localUpdatedAt: timestamp, syncStatus: "Draft"
  };
  await localDatabase.masterSystemInspections.add(record);
  return record;
}

function structuralSubmitIssues(record: SmokeVentilationInspectionRecord, responses: SmokeVentilationResponses) {
  const issues: string[] = [];
  if (responses.controlPanelNo.length > 200) issues.push("Smoke Ventilation Control Panel No. is too long");
  if (responses.location.length > 300) issues.push("Smoke Ventilation Location is too long");
  if (responses.dateTested.length > 200) issues.push("Smoke Ventilation Date Tested is too long");
  const expected = record.inspectionSnapshot.system.locations.flatMap((location) => Array.from({ length: location.presetRowCount }, (_, index) => `${location.id}:${index + 1}`));
  const seen = new Set<string>();
  if (!responses.rows.length) issues.push("At least one Fan Schedule row is required");
  responses.rows.forEach((row, index) => {
    if (!row.rowUuid || row.sortOrder !== index + 1 || row.assetReference.length > 200 || row.remarks.length > 2000) issues.push("Fan Schedule row is invalid");
    if (row.source === "configured") {
      const identity = `${row.configuredLocationId}:${row.configuredRowOrdinal}`;
      if (!expected.includes(identity) || seen.has(identity)) issues.push("Configured Fan Schedule row identity is invalid");
      seen.add(identity);
    } else if (row.configuredLocationId !== null || row.configuredRowOrdinal !== null) issues.push("Technician Fan Schedule row provenance is invalid");
  });
  if (seen.size !== expected.length) issues.push("Configured Fan Schedule rows must be retained");
  if (responses.comments.length > 4000) issues.push("Comments exceed 4000 characters");
  return issues;
}

/** Shared by the visible submit gate and the IndexedDB submit transaction. */
export function submitIssues(record: SmokeVentilationInspectionRecord, responses: SmokeVentilationResponses, attachments: InspectionAttachmentRecord[] = []) {
  return [...structuralSubmitIssues(record, responses), ...v7SmokeVentilationSubmissionIssues(record, responses, attachments)];
}

const payload = (record: SmokeVentilationInspectionRecord, evidenceManifest: ReturnType<typeof v7SmokeVentilationManifest>) => ({ clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey, instanceKey: record.instanceKey, configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: record.originalCreatorSnapshot, masterTemplate: record.masterTemplate, configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot, responses: record.responses, performedAt: record.performedAt, evidenceManifest });

async function write(record: SmokeVentilationInspectionRecord, responses: SmokeVentilationResponses, submit: boolean) {
  let saved: SmokeVentilationInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => {
    const live = await localDatabase.masterSystemInspections.get(record.clientUuid) as SmokeVentilationInspectionRecord | undefined;
    if (!live || live.systemKey !== key || live.syncStatus !== "Draft" || live.localUpdatedAt !== record.localUpdatedAt) throw new Error("This Smoke Ventilation record changed elsewhere. Reload before continuing.");
    const photos = await listSmokeVentilationV7Photos(live.clientUuid);
    if (submit && submitIssues(live, responses, photos).length) throw new Error("Complete required Smoke Ventilation fields and evidence before local submission");
    saved = { ...live, responses, syncStatus: submit ? "Pending" : "Draft", performedAt: submit ? now() : live.performedAt, localUpdatedAt: now(), lastSyncError: undefined };
    await localDatabase.masterSystemInspections.put(saved);
    if (!submit) return;
    const evidenceManifest = v7SmokeVentilationManifest(photos, responses);
    const activeKey = `masterSystemInspection:create:${live.clientUuid}`;
    const old = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    const item: SyncOutboxItem = { operationId: old?.operationId ?? crypto.randomUUID(), entityType: "masterSystemInspection", entityId: live.clientUuid, action: "create", payload: payload(saved, evidenceManifest), createdAt: saved.localCreatedAt, attempts: old?.attempts ?? 0, status: "Pending", activeKey };
    if (old) await localDatabase.syncOutbox.put(item); else await localDatabase.syncOutbox.add(item);
    for (const photo of photos.filter((candidate) => evidenceManifest.some((entry) => entry.photoUuid === candidate.photoUuid))) {
      await localDatabase.inspectionAttachments.update(photo.photoUuid, { syncStatus: "Pending", localUpdatedAt: saved.localUpdatedAt });
      const evidenceActiveKey = `v7StagedEvidence:create:${photo.photoUuid}`;
      if (!await localDatabase.syncOutbox.where("activeKey").equals(evidenceActiveKey).first()) await localDatabase.syncOutbox.add(v7SmokeVentilationEvidenceOutbox(photo));
    }
  });
  return saved!;
}

export const saveSmokeVentilationDraft = (record: SmokeVentilationInspectionRecord, responses: SmokeVentilationResponses) => write(record, responses, false);
export const submitLocalSmokeVentilation = (record: SmokeVentilationInspectionRecord, responses: SmokeVentilationResponses) => write(record, responses, true);
export async function returnFailedSmokeVentilationToDraft(record: SmokeVentilationInspectionRecord) {
  const live = await localDatabase.masterSystemInspections.get(record.clientUuid) as SmokeVentilationInspectionRecord | undefined;
  if (!live || !["Failed", "Conflict"].includes(live.syncStatus)) throw new Error("This Smoke Ventilation record changed elsewhere.");
  const saved = { ...live, syncStatus: "Draft" as const, localUpdatedAt: now(), lastSyncError: undefined };
  await localDatabase.masterSystemInspections.put(saved);
  return saved;
}
