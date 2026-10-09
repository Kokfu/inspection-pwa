import { startCorrectedCopy } from "../attachments/correctedCopy";
import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { compatibleCatalogSystem } from "../referenceData/systemContractCompatibility";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type {
  FireRatedRollerShutterInspectionRecord,
  FireRatedRollerShutterResponses,
  FireRatedRollerShutterRow
} from "./fireRatedRollerShutterTypes";
import { fireRatedRollerShutterRowColumns } from "./fireRatedRollerShutterTypes";
import { maxZoneTextLength, shutterRowLabels } from "./fireRatedRollerShutterSetup";
import { listFireRatedRollerShutterV7Photos, v7FireRatedRollerShutterEvidenceOutbox, v7FireRatedRollerShutterManifest, v7FireRatedRollerShutterSubmissionIssues } from "./fireRatedRollerShutterV7Evidence";

const key = "fire_rated_roller_shutter" as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const now = () => new Date().toISOString();

/** Mirrors the server's `exact` helper in
 * `apps/api/src/sync/fireRatedRollerShutterV7Acceptance.ts`: the object must carry exactly
 * `keys` - no missing, no extra, no unknown. */
const exactKeys = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((name) => name in value);
/** The response-envelope and row key sets `validResponses()` enforces verbatim.
 * Kept as literals here so a drift from the server shows up as a failing parity
 * test rather than a stranded Pending record. */
const responseEnvelopeKeys = ["schemaVersion", "dateTested", "zone", "inspectedBy", "rows", "comments"] as const;
const rowKeysV1 = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "locationText", "autoAlarmModeResult", "manualModeResult", "remarks", "fieldRemarks", "sortOrder"] as const;
/** Schema 2 adds a free-text `zoneText` heading to every row (server: `fireRatedRollerShutterV7Acceptance.ts`). */
const rowKeysV2 = [...rowKeysV1, "zoneText"] as const;

/** Mirrors `expectedConfiguredFireRatedRollerShutterRows` in
 * `apps/api/src/sync/fireRatedRollerShutterInspectionSync.ts` exactly. The server derives
 * the authoritative row order from `location.sortOrder`, NOT from the array
 * order of `system.locations`, so this must sort too - otherwise a snapshot
 * that happens to arrive out of order builds a Draft the server refuses
 * non-retryably. */
function rowPresets(location: JobSystemSnapshot["locations"][number], legacy: boolean): Array<{ assetReference: string; locationText: string; zoneText?: string }> | undefined {
  const preset = location.rowPreset;
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) return undefined;
  const rows: unknown = (preset as Record<string, unknown>).rows;
  if (!Array.isArray(rows)
    || rows.length !== location.presetRowCount) return undefined;
  // A schema-1 record is read the way a pre-zone client read it: any zoned row makes the whole location
  // fall back to default labels (the server's `expectedConfiguredFireRatedRollerShutterRows(.., 1)` does the same).
  if (legacy && rows.some((row: unknown) => !!row && typeof row === "object" && Object.hasOwn(row, "zoneText"))) return undefined;
  if (!rows.every((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const value = row as Record<string, unknown>;
    return (Object.keys(value).length === 2 || (Object.keys(value).length === 3 && typeof value.zoneText === "string" && value.zoneText.length <= maxZoneTextLength))
      && typeof value.assetReference === "string" && value.assetReference.length <= 200
      && typeof value.locationText === "string" && value.locationText.trim().length > 0 && value.locationText.length <= 300;
  })) return undefined;
  return rows as Array<{ assetReference: string; locationText: string; zoneText?: string }>;
}

function expectedConfiguredRows(system: JobSystemSnapshot, schemaVersion: 1 | 2) {
  const expected: Array<{ locationId: string; ordinal: number; sortOrder: number; assetReference: string; displayName: string; locationText: string; zoneText: string }> = [];
  for (const location of [...system.locations].sort((left, right) => left.sortOrder - right.sortOrder)) {
    const assetReference = typeof location.rowPreset === "object" && location.rowPreset && "assetReference" in location.rowPreset && typeof location.rowPreset.assetReference === "string" ? location.rowPreset.assetReference : "";
    const presets = rowPresets(location, schemaVersion === 1);
    for (let ordinal = 1; ordinal <= location.presetRowCount; ordinal += 1) {
      expected.push({ locationId: location.id, ordinal, sortOrder: expected.length + 1,
        assetReference: presets?.[ordinal - 1]?.assetReference ?? assetReference,
        locationText: presets?.[ordinal - 1]?.locationText ?? location.displayName,
        zoneText: presets?.[ordinal - 1]?.zoneText ?? "",
        displayName: location.displayName });
    }
  }
  return expected;
}

/** `schemaVersion` 2 (the default for new records) carries each row's frozen zone heading; schema 1 does not. */
export function configuredFireRatedRollerShutterRows(system: JobSystemSnapshot, schemaVersion: 1 | 2 = 2): FireRatedRollerShutterRow[] {
  return expectedConfiguredRows(system, schemaVersion).map((expected) => ({
    rowUuid: crypto.randomUUID(), source: "configured" as const, configuredLocationId: expected.locationId, configuredRowOrdinal: expected.ordinal,
    zoneSnapshot: null,
    locationSnapshot: { id: expected.locationId, displayName: expected.displayName },
    assetReference: expected.assetReference,
    locationText: expected.locationText, ...(schemaVersion === 2 ? { zoneText: expected.zoneText } : {}),
    autoAlarmModeResult: null, manualModeResult: null,
    remarks: "", fieldRemarks: {}, sortOrder: expected.sortOrder
  }));
}

export async function getOrCreateFireRatedRollerShutterInspection(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog, creator: { id: number; username: string; role: "admin" | "inspector" } | undefined) {
  const jobSystemKey = `${job.id}:${key}`;
  const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(jobSystemKey).first();
  if (existing) { if (existing.systemKey !== key) throw new Error("Stored inspection identity is invalid"); return existing as FireRatedRollerShutterInspectionRecord; }
  const compatible = compatibleCatalogSystem(catalog, job.configurationSnapshot.template, key), definition = compatible?.system.definition;
  if (!definition || system.systemKey !== key || job.configurationSnapshot.template.version !== 7) throw new Error("Cached compatible Fire Rated Roller Shutter definition is unavailable. Refresh jobs online first.");
  const timestamp = now();
  const record: FireRatedRollerShutterInspectionRecord = {
    schemaVersion: 1, clientUuid: crypto.randomUUID(), jobSystemKey, jobId: job.id, systemKey: key, instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: creator ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp } as DeviceReportedCreator : null,
    masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: 7 }, configuration: job.configurationSnapshot.configuration,
    inspectionSnapshot: { schemaVersion: 1, capturedAt: timestamp, job: { id: job.id, reference: job.reference, title: job.title }, customer: job.configurationSnapshot.customer, configuration: job.configurationSnapshot.configuration, template: job.configurationSnapshot.template, system: { ...system, definition, repetitionMode: "single_with_repeatable_rows" } },
    responses: { schemaVersion: 2, dateTested: "", zone: "", inspectedBy: "", rows: configuredFireRatedRollerShutterRows(system, 2), comments: "" },
    performedAt: timestamp, localCreatedAt: timestamp, localUpdatedAt: timestamp, syncStatus: "Draft"
  };
  await localDatabase.masterSystemInspections.add(record);
  return record;
}

/** This gate must be at least as strict as the server's
 * `configuredFireRatedRollerShutterRowsMatch` + `validResponses` pair. Anything the
 * browser lets through that the server refuses becomes a Pending record
 * stranded behind an impossible acceptance - offline that is unrecoverable
 * field data loss, so the checks below are deliberately duplicated rather
 * than trusted to the server. */
function structuralSubmitIssues(record: FireRatedRollerShutterInspectionRecord, responses: FireRatedRollerShutterResponses) {
  const issues: string[] = [];
  // Envelope parity with the server's `validResponses()`: exactly
  // schemaVersion / rows / comments. An extra or unknown top-level key is
  // rejected non-retryably server-side.
  if (!exactKeys(responses, responseEnvelopeKeys) || (responses.schemaVersion !== 1 && responses.schemaVersion !== 2)) issues.push("Fire Rated Roller Shutter response envelope shape is invalid");
  if (responses.dateTested.length > 200 || responses.zone.length > 200 || responses.inspectedBy.length > 200) issues.push("Inspection details are too long");
  const expected = expectedConfiguredRows(record.inspectionSnapshot.system, responses.schemaVersion === 1 ? 1 : 2);
  const expectedByIdentity = new Map(expected.map((row) => [`${row.locationId}:${row.ordinal}`, row]));
  const seen = new Set<string>();
  const rowUuids = new Set<string>();
  let technicianRowsStarted = false;
  if (!responses.rows.length) issues.push("At least one Shutter row is required");
  // The server caps the table at 250 rows (`validResponses`); refuse the 251st
  // here rather than queueing a record it will reject.
  if (responses.rows.length > 250) issues.push("A Fire Rated Roller Shutter inspection cannot have more than 250 Shutter rows");
  const labels = shutterRowLabels(responses);
  responses.rows.forEach((row, index) => {
    if (!row.rowUuid || !uuid.test(row.rowUuid) || rowUuids.has(row.rowUuid)) issues.push("Shutter row identity is invalid");
    rowUuids.add(row.rowUuid);
    // A blank Location is the usual reason, so say so and name the shutter as the form does.
    if (!row.locationText.trim()) issues.push(`${labels[index]} needs a Location`);
    if (row.sortOrder !== index + 1 || row.assetReference.length > 200 || row.locationText.length > 300 || row.remarks.length > 2000) issues.push(`${labels[index]} is invalid`);
    // Exact row-key parity with the server (`exact(row, rowKeys)`): an extra own
    // property strands the record behind a non-retryable acceptance.
    if (!exactKeys(row, responses.schemaVersion === 2 ? rowKeysV2 : rowKeysV1)) issues.push("Shutter row shape is invalid");
    if (responses.schemaVersion === 2) {
      if (typeof row.zoneText !== "string" || row.zoneText.length > maxZoneTextLength) issues.push("Shutter zone heading is invalid");
      else if (row.source === "configured") {
        const frozen = expectedByIdentity.get(`${row.configuredLocationId}:${row.configuredRowOrdinal}`);
        if (frozen && row.zoneText !== frozen.zoneText) issues.push("Configured Shutter zone does not match the frozen configuration");
      }
    }
    // The server requires every Fire Rated Roller Shutter row's `zoneSnapshot` to be null.
    if ((row as unknown as Record<string, unknown>).zoneSnapshot !== null) issues.push("Shutter row zone snapshot must be null");
    if (Object.values(row.fieldRemarks ?? {}).some((value) => typeof value !== "string" || value.length > 2000)
      || Object.keys(row.fieldRemarks ?? {}).some((remarkKey) => !fireRatedRollerShutterRowColumns.some(([responseKey]) => responseKey === remarkKey))) issues.push("Shutter row field remarks are invalid");
    if (row.source === "configured") {
      // Configured rows come before technician rows in the server's ordering.
      if (technicianRowsStarted) issues.push("Configured Shutter rows must come before technician rows");
      const identity = `${row.configuredLocationId}:${row.configuredRowOrdinal}`;
      const authoritative = expectedByIdentity.get(identity);
      if (!authoritative || seen.has(identity)) issues.push("Configured Shutter row identity is invalid");
      else {
        if (row.sortOrder !== authoritative.sortOrder) issues.push("Configured Shutter row order does not match the frozen configuration");
        if (row.assetReference !== authoritative.assetReference) issues.push("Configured Shutter label does not match the frozen configuration");
        if (row.locationText !== authoritative.locationText) issues.push("Configured Shutter location does not match the frozen configuration");
        if (!row.locationSnapshot || Object.keys(row.locationSnapshot).length !== 2
          || row.locationSnapshot.id !== row.configuredLocationId
          || row.locationSnapshot.displayName !== authoritative.displayName) issues.push("Configured Shutter row location snapshot does not match the frozen configuration");
      }
      seen.add(identity);
    } else {
      technicianRowsStarted = true;
      if (row.source !== "technician" || row.configuredLocationId !== null || row.configuredRowOrdinal !== null || row.locationSnapshot !== null) issues.push("Technician Shutter row provenance is invalid");
    }
  });
  if (seen.size !== expected.length) issues.push("Configured Shutter rows must be retained");
  if (responses.comments.length > 4000) issues.push("Comments exceed 4000 characters");
  return issues;
}

/** Shared by the visible submit gate and the IndexedDB submit transaction. */
export function submitIssues(record: FireRatedRollerShutterInspectionRecord, responses: FireRatedRollerShutterResponses, attachments: InspectionAttachmentRecord[] = []) {
  return [...structuralSubmitIssues(record, responses), ...v7FireRatedRollerShutterSubmissionIssues(record, responses, attachments)];
}

const payload = (record: FireRatedRollerShutterInspectionRecord, evidenceManifest: ReturnType<typeof v7FireRatedRollerShutterManifest>) => ({ clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey, instanceKey: record.instanceKey, configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: record.originalCreatorSnapshot, masterTemplate: record.masterTemplate, configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot, responses: record.responses, performedAt: record.performedAt, evidenceManifest });

async function write(record: FireRatedRollerShutterInspectionRecord, responses: FireRatedRollerShutterResponses, submit: boolean) {
  let saved: FireRatedRollerShutterInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => {
    const live = await localDatabase.masterSystemInspections.get(record.clientUuid) as FireRatedRollerShutterInspectionRecord | undefined;
    if (!live || live.systemKey !== key || live.syncStatus !== "Draft" || live.localUpdatedAt !== record.localUpdatedAt) throw new Error("This Fire Rated Roller Shutter record changed elsewhere. Reload before continuing.");
    const photos = await listFireRatedRollerShutterV7Photos(live.clientUuid);
    if (submit && submitIssues(live, responses, photos).length) throw new Error("Complete required Fire Rated Roller Shutter fields and evidence before local submission");
    saved = { ...live, responses, syncStatus: submit ? "Pending" : "Draft", performedAt: submit ? now() : live.performedAt, localUpdatedAt: now(), lastSyncError: undefined };
    await localDatabase.masterSystemInspections.put(saved);
    if (!submit) return;
    const evidenceManifest = v7FireRatedRollerShutterManifest(photos, responses);
    const activeKey = `masterSystemInspection:create:${live.clientUuid}`;
    const old = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    const item: SyncOutboxItem = { operationId: old?.operationId ?? crypto.randomUUID(), entityType: "masterSystemInspection", entityId: live.clientUuid, action: "create", payload: payload(saved, evidenceManifest), createdAt: saved.localCreatedAt, attempts: old?.attempts ?? 0, status: "Pending", activeKey };
    if (old) await localDatabase.syncOutbox.put(item); else await localDatabase.syncOutbox.add(item);
    for (const photo of photos.filter((candidate) => evidenceManifest.some((entry) => entry.photoUuid === candidate.photoUuid))) {
      await localDatabase.inspectionAttachments.update(photo.photoUuid, { syncStatus: "Pending", localUpdatedAt: saved.localUpdatedAt });
      const evidenceActiveKey = `v7StagedEvidence:create:${photo.photoUuid}`;
      if (!await localDatabase.syncOutbox.where("activeKey").equals(evidenceActiveKey).first()) await localDatabase.syncOutbox.add(v7FireRatedRollerShutterEvidenceOutbox(photo));
    }
  });
  return saved!;
}

export const saveFireRatedRollerShutterDraft = (record: FireRatedRollerShutterInspectionRecord, responses: FireRatedRollerShutterResponses) => write(record, responses, false);
export const submitLocalFireRatedRollerShutter = (record: FireRatedRollerShutterInspectionRecord, responses: FireRatedRollerShutterResponses) => write(record, responses, true);
export async function returnFailedFireRatedRollerShutterToDraft(record: FireRatedRollerShutterInspectionRecord) {
  const live = await localDatabase.masterSystemInspections.get(record.clientUuid) as FireRatedRollerShutterInspectionRecord | undefined;
  if (!live || !["Failed", "Conflict"].includes(live.syncStatus)) throw new Error("This Fire Rated Roller Shutter record changed elsewhere.");
  const saved = { ...live, syncStatus: "Draft" as const, localUpdatedAt: now(), lastSyncError: undefined };
  await localDatabase.masterSystemInspections.put(saved);
  return saved;
}

/** I-21: corrected copy (shared core in attachments/correctedCopy.ts). */
export const startCorrectedFireRatedRollerShutterCopy = (record: FireRatedRollerShutterInspectionRecord) => startCorrectedCopy(record, "masterSystemInspections", "Fire Rated Roller Shutter");
