import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { compatibleCatalogSystem } from "../referenceData/systemContractCompatibility";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type {
  FireIntercomInspectionRecord,
  FireIntercomResponses,
  FireIntercomRow
} from "./fireIntercomTypes";
import { fireIntercomRowColumns } from "./fireIntercomTypes";
import { listFireIntercomV7Photos, v7FireIntercomEvidenceOutbox, v7FireIntercomManifest, v7FireIntercomSubmissionIssues } from "./fireIntercomV7Evidence";

const key = "fire_intercom" as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const now = () => new Date().toISOString();

/** Mirrors the server's `exact` helper in
 * `apps/api/src/sync/fireIntercomV7Acceptance.ts`: the object must carry exactly
 * `keys` - no missing, no extra, no unknown. */
const exactKeys = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((name) => name in value);
/** The response-envelope and row key sets `validResponses()` enforces verbatim.
 * Kept as literals here so a drift from the server shows up as a failing parity
 * test rather than a stranded Pending record. */
const responseEnvelopeKeys = ["schemaVersion", "rows", "comments"] as const;
const rowKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "conditionResult", "remarks", "fieldRemarks", "sortOrder"] as const;

/** Mirrors `expectedConfiguredFireIntercomRows` in
 * `apps/api/src/sync/fireIntercomInspectionSync.ts` exactly. The server derives
 * the authoritative row order from `location.sortOrder`, NOT from the array
 * order of `system.locations`, so this must sort too - otherwise a snapshot
 * that happens to arrive out of order builds a Draft the server refuses
 * non-retryably. */
function expectedConfiguredRows(system: JobSystemSnapshot) {
  const expected: Array<{ locationId: string; ordinal: number; sortOrder: number; assetReference: string; displayName: string }> = [];
  for (const location of [...system.locations].sort((left, right) => left.sortOrder - right.sortOrder)) {
    const assetReference = typeof location.rowPreset === "object" && location.rowPreset && "assetReference" in location.rowPreset && typeof location.rowPreset.assetReference === "string" ? location.rowPreset.assetReference : "";
    for (let ordinal = 1; ordinal <= location.presetRowCount; ordinal += 1) {
      expected.push({ locationId: location.id, ordinal, sortOrder: expected.length + 1, assetReference, displayName: location.displayName });
    }
  }
  return expected;
}

function configuredRows(system: JobSystemSnapshot): FireIntercomRow[] {
  let count = 0;
  return [...system.locations].sort((left, right) => left.sortOrder - right.sortOrder).flatMap((location) => Array.from({ length: location.presetRowCount }, (_, index) => ({
    rowUuid: crypto.randomUUID(), source: "configured" as const, configuredLocationId: location.id, configuredRowOrdinal: index + 1,
    zoneSnapshot: null,
    locationSnapshot: { id: location.id, displayName: location.displayName },
    assetReference: typeof location.rowPreset === "object" && location.rowPreset && "assetReference" in location.rowPreset && typeof location.rowPreset.assetReference === "string" ? location.rowPreset.assetReference : "",
    conditionResult: null, remarks: "", fieldRemarks: {}, sortOrder: ++count
  })));
}

export async function getOrCreateFireIntercomInspection(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog, creator: { id: number; username: string; role: "admin" | "inspector" } | undefined) {
  const jobSystemKey = `${job.id}:${key}`;
  const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(jobSystemKey).first();
  if (existing) { if (existing.systemKey !== key) throw new Error("Stored inspection identity is invalid"); return existing as FireIntercomInspectionRecord; }
  const compatible = compatibleCatalogSystem(catalog, job.configurationSnapshot.template, key), definition = compatible?.system.definition;
  if (!definition || system.systemKey !== key || job.configurationSnapshot.template.version !== 7) throw new Error("Cached compatible Fire Intercom definition is unavailable. Refresh jobs online first.");
  const timestamp = now();
  const record: FireIntercomInspectionRecord = {
    schemaVersion: 1, clientUuid: crypto.randomUUID(), jobSystemKey, jobId: job.id, systemKey: key, instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: creator ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp } as DeviceReportedCreator : null,
    masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: 7 }, configuration: job.configurationSnapshot.configuration,
    inspectionSnapshot: { schemaVersion: 1, capturedAt: timestamp, job: { id: job.id, reference: job.reference, title: job.title }, customer: job.configurationSnapshot.customer, configuration: job.configurationSnapshot.configuration, template: job.configurationSnapshot.template, system: { ...system, definition, repetitionMode: "single_with_repeatable_rows" } },
    responses: { schemaVersion: 1, rows: configuredRows(system), comments: "" },
    performedAt: timestamp, localCreatedAt: timestamp, localUpdatedAt: timestamp, syncStatus: "Draft"
  };
  await localDatabase.masterSystemInspections.add(record);
  return record;
}

/** This gate must be at least as strict as the server's
 * `configuredFireIntercomRowsMatch` + `validResponses` pair. Anything the
 * browser lets through that the server refuses becomes a Pending record
 * stranded behind an impossible acceptance - offline that is unrecoverable
 * field data loss, so the checks below are deliberately duplicated rather
 * than trusted to the server. */
function structuralSubmitIssues(record: FireIntercomInspectionRecord, responses: FireIntercomResponses) {
  const issues: string[] = [];
  // Envelope parity with the server's `validResponses()`: exactly
  // schemaVersion / rows / comments. An extra or unknown top-level key is
  // rejected non-retryably server-side.
  if (!exactKeys(responses, responseEnvelopeKeys)) issues.push("Fire Intercom response envelope shape is invalid");
  const expected = expectedConfiguredRows(record.inspectionSnapshot.system);
  const expectedByIdentity = new Map(expected.map((row) => [`${row.locationId}:${row.ordinal}`, row]));
  const seen = new Set<string>();
  const rowUuids = new Set<string>();
  let technicianRowsStarted = false;
  if (!responses.rows.length) issues.push("At least one Station row is required");
  // The server caps the table at 250 rows (`validResponses`); refuse the 251st
  // here rather than queueing a record it will reject.
  if (responses.rows.length > 250) issues.push("A Fire Intercom inspection cannot have more than 250 Station rows");
  responses.rows.forEach((row, index) => {
    if (!row.rowUuid || !uuid.test(row.rowUuid) || rowUuids.has(row.rowUuid)) issues.push("Station row identity is invalid");
    rowUuids.add(row.rowUuid);
    if (row.sortOrder !== index + 1 || row.assetReference.length > 200 || row.remarks.length > 2000) issues.push("Station row is invalid");
    // Exact row-key parity with the server (`exact(row, rowKeys)`): an extra own
    // property strands the record behind a non-retryable acceptance.
    if (!exactKeys(row, rowKeys)) issues.push("Station row shape is invalid");
    // The server requires every Fire Intercom row's `zoneSnapshot` to be null.
    if ((row as unknown as Record<string, unknown>).zoneSnapshot !== null) issues.push("Station row zone snapshot must be null");
    if (Object.values(row.fieldRemarks ?? {}).some((value) => typeof value !== "string" || value.length > 2000)
      || Object.keys(row.fieldRemarks ?? {}).some((remarkKey) => !fireIntercomRowColumns.some(([responseKey]) => responseKey === remarkKey))) issues.push("Station row field remarks are invalid");
    if (row.source === "configured") {
      // Configured rows come before technician rows in the server's ordering.
      if (technicianRowsStarted) issues.push("Configured Station rows must come before technician rows");
      const identity = `${row.configuredLocationId}:${row.configuredRowOrdinal}`;
      const authoritative = expectedByIdentity.get(identity);
      if (!authoritative || seen.has(identity)) issues.push("Configured Station row identity is invalid");
      else {
        if (row.sortOrder !== authoritative.sortOrder) issues.push("Configured Station row order does not match the frozen configuration");
        if (row.assetReference !== authoritative.assetReference) issues.push("Configured Station label does not match the frozen configuration");
        if (!row.locationSnapshot || Object.keys(row.locationSnapshot).length !== 2
          || row.locationSnapshot.id !== row.configuredLocationId
          || row.locationSnapshot.displayName !== authoritative.displayName) issues.push("Configured Station row location snapshot does not match the frozen configuration");
      }
      seen.add(identity);
    } else {
      technicianRowsStarted = true;
      if (row.source !== "technician" || row.configuredLocationId !== null || row.configuredRowOrdinal !== null || row.locationSnapshot !== null) issues.push("Technician Station row provenance is invalid");
    }
  });
  if (seen.size !== expected.length) issues.push("Configured Station rows must be retained");
  if (responses.comments.length > 4000) issues.push("Comments exceed 4000 characters");
  return issues;
}

/** Shared by the visible submit gate and the IndexedDB submit transaction. */
export function submitIssues(record: FireIntercomInspectionRecord, responses: FireIntercomResponses, attachments: InspectionAttachmentRecord[] = []) {
  return [...structuralSubmitIssues(record, responses), ...v7FireIntercomSubmissionIssues(record, responses, attachments)];
}

const payload = (record: FireIntercomInspectionRecord, evidenceManifest: ReturnType<typeof v7FireIntercomManifest>) => ({ clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey, instanceKey: record.instanceKey, configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: record.originalCreatorSnapshot, masterTemplate: record.masterTemplate, configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot, responses: record.responses, performedAt: record.performedAt, evidenceManifest });

async function write(record: FireIntercomInspectionRecord, responses: FireIntercomResponses, submit: boolean) {
  let saved: FireIntercomInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => {
    const live = await localDatabase.masterSystemInspections.get(record.clientUuid) as FireIntercomInspectionRecord | undefined;
    if (!live || live.systemKey !== key || live.syncStatus !== "Draft" || live.localUpdatedAt !== record.localUpdatedAt) throw new Error("This Fire Intercom record changed elsewhere. Reload before continuing.");
    const photos = await listFireIntercomV7Photos(live.clientUuid);
    if (submit && submitIssues(live, responses, photos).length) throw new Error("Complete required Fire Intercom fields and evidence before local submission");
    saved = { ...live, responses, syncStatus: submit ? "Pending" : "Draft", performedAt: submit ? now() : live.performedAt, localUpdatedAt: now(), lastSyncError: undefined };
    await localDatabase.masterSystemInspections.put(saved);
    if (!submit) return;
    const evidenceManifest = v7FireIntercomManifest(photos, responses);
    const activeKey = `masterSystemInspection:create:${live.clientUuid}`;
    const old = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    const item: SyncOutboxItem = { operationId: old?.operationId ?? crypto.randomUUID(), entityType: "masterSystemInspection", entityId: live.clientUuid, action: "create", payload: payload(saved, evidenceManifest), createdAt: saved.localCreatedAt, attempts: old?.attempts ?? 0, status: "Pending", activeKey };
    if (old) await localDatabase.syncOutbox.put(item); else await localDatabase.syncOutbox.add(item);
    for (const photo of photos.filter((candidate) => evidenceManifest.some((entry) => entry.photoUuid === candidate.photoUuid))) {
      await localDatabase.inspectionAttachments.update(photo.photoUuid, { syncStatus: "Pending", localUpdatedAt: saved.localUpdatedAt });
      const evidenceActiveKey = `v7StagedEvidence:create:${photo.photoUuid}`;
      if (!await localDatabase.syncOutbox.where("activeKey").equals(evidenceActiveKey).first()) await localDatabase.syncOutbox.add(v7FireIntercomEvidenceOutbox(photo));
    }
  });
  return saved!;
}

export const saveFireIntercomDraft = (record: FireIntercomInspectionRecord, responses: FireIntercomResponses) => write(record, responses, false);
export const submitLocalFireIntercom = (record: FireIntercomInspectionRecord, responses: FireIntercomResponses) => write(record, responses, true);
export async function returnFailedFireIntercomToDraft(record: FireIntercomInspectionRecord) {
  const live = await localDatabase.masterSystemInspections.get(record.clientUuid) as FireIntercomInspectionRecord | undefined;
  if (!live || !["Failed", "Conflict"].includes(live.syncStatus)) throw new Error("This Fire Intercom record changed elsewhere.");
  const saved = { ...live, syncStatus: "Draft" as const, localUpdatedAt: now(), lastSyncError: undefined };
  await localDatabase.masterSystemInspections.put(saved);
  return saved;
}
