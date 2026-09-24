import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type { ResolvedCo2Controls, ResultControlDefinition } from "../inspectionControls/definitionTypes";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import {
  defaultCatalogTemplate,
  type InspectionCatalogInput
} from "../referenceData/referenceDataTypes";
import { compatibleCatalogSystem } from "../referenceData/systemContractCompatibility";
import { resolvePublishedCo2Controls } from "./co2Definition";
import type {
  Co2ConfiguredInstance,
  Co2DetectorRow,
  Co2InspectionSnapshot,
  Co2Responses,
  MasterSystemFormInstanceRecord,
  MasterSystemInspectionGroupRecord
} from "./co2Types";
import type { SuppressionSystemKey } from "./co2Types";
import { collectV7SiblingEvidence, listV7SuppressionPhotos, v7EvidenceManifest, v7EvidenceOutbox, v7SubmissionIssues } from "./v7Evidence";

const co2SystemKey = "co2_fire_extinguisher" as const;
const wetChemicalSystemKey = "wet_chemical" as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const now = () => new Date().toISOString();
export const co2GroupKey = (jobId: string) => `${jobId}:${co2SystemKey}`;
export const wetChemicalGroupKey = (jobId: string) => `${jobId}:${wetChemicalSystemKey}`;
export type Co2SubmitIssue = { section: string; message: string; targetId: string };

const isUuid = (value: string) => uuidPattern.test(value);
const isExpectedInitializationConstraint = (error: unknown) =>
  error instanceof Error && error.name === "ConstraintError";

function definitionFor(catalog: InspectionCatalogInput, systemKey: SuppressionSystemKey, job: InspectionJob) {
  const compatible = "templates" in catalog
    ? compatibleCatalogSystem(catalog, job.configurationSnapshot.template, systemKey)
    : undefined;
  const template = compatible?.template ?? ("templates" in catalog ? undefined : defaultCatalogTemplate(catalog));
  if (!template) throw new Error("Cached template version is unavailable. Refresh jobs online first.");
  const system = compatible?.system ?? template.systems.find((candidate) => candidate.key === systemKey && candidate.definitionStatus === "confirmed");
  if (!system?.definition) throw new Error(`Cached ${systemKey === wetChemicalSystemKey ? "Wet Chemical" : "CO2"} definition is unavailable. Refresh jobs online first.`);
  return {
    definition: system.definition,
    controls: resolvePublishedCo2Controls(system.definition, template.code, template.version)
  };
}

function expectedInstances(system: JobSystemSnapshot): Co2ConfiguredInstance[] {
  const zones = new Map(system.zones.map((zone) => [zone.id, zone]));
  return system.locations
    .slice()
    .sort((left, right) => {
      const leftZone = left.zoneId ? zones.get(left.zoneId)?.sortOrder ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const rightZone = right.zoneId ? zones.get(right.zoneId)?.sortOrder ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      return leftZone - rightZone || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
    })
    .map((location, index) => {
      const zone = location.zoneId ? zones.get(location.zoneId) : undefined;
      return {
        instanceKey: `location:${location.id}`,
        displaySequence: index + 1,
        zone: zone ? { id: zone.id, key: zone.key, displayName: zone.displayName, sortOrder: zone.sortOrder } : null,
        location: { id: location.id, key: location.key, displayName: location.displayName, sortOrder: location.sortOrder }
      };
    });
}

function blankDetectorRow(instance: Co2ConfiguredInstance): Co2DetectorRow {
  return {
    rowUuid: crypto.randomUUID(),
    displaySequence: 1,
    alarmZone: instance.zone?.displayName ?? "",
    location: instance.location.displayName,
    heatDetectorStatus: null,
    smokeDetectorStatus: null,
    remarks: ""
  };
}

function checklist(definitions: ResolvedCo2Controls["chargerAndBatteries"]) {
  return Object.fromEntries(definitions.map((definition) => [definition.key, { result: null, remarks: "" }]));
}

function blankResponses(instance: Co2ConfiguredInstance, controls: ResolvedCo2Controls): Co2Responses {
  return {
    controlPanelLocation: instance.location.displayName,
    detectorRows: [blankDetectorRow(instance)],
    chargerAndBatteries: checklist(controls.chargerAndBatteries),
    physicalOutlook: checklist(controls.physicalOutlook),
    mainFunctionKeys: checklist(controls.mainFunctionKeys),
    comments: ""
  };
}

function snapshot(
  job: InspectionJob,
  system: JobSystemSnapshot,
  instance: Co2ConfiguredInstance,
  definition: unknown,
  controls: ResolvedCo2Controls,
  capturedAt: string
): Co2InspectionSnapshot {
  // `labelOverrides` is a display-only sibling on the job snapshot. It must NOT
  // enter `inspectionSnapshot.system` — that object is submitted in the sync
  // payload and, for some systems, folded verbatim into the accepted authority /
  // request fingerprint. It rides `record.displayLabelOverrides` instead.
  const { labelOverrides: _labelOverrides, ...systemBase } = system;
  return {
    schemaVersion: job.configurationSnapshot.template.version === 7 ? 2 : 1,
    capturedAt,
    job: { id: job.id, reference: job.reference, title: job.title },
    customer: job.configurationSnapshot.customer,
    configuration: job.configurationSnapshot.configuration,
    template: job.configurationSnapshot.template,
    system: { ...systemBase, definition, resolvedControls: controls, repetitionMode: "per_location" },
    instance
  };
}

/** The job's frozen per-customer label map for this system, only when non-empty
 *  (so a no-override record stays byte-identical to before the feature). */
function frozenDisplayLabelOverrides(system: JobSystemSnapshot): Readonly<Record<string, string>> | undefined {
  const map = system.labelOverrides;
  return map && Object.keys(map).length > 0 ? map : undefined;
}

export async function initializeCo2InspectionGroup(
  job: InspectionJob,
  system: JobSystemSnapshot,
  catalog: InspectionCatalogInput,
  creator: { id: number; username: string; role: "admin" | "inspector" } | undefined
) {
  if (system.systemKey !== co2SystemKey && system.systemKey !== wetChemicalSystemKey) throw new Error("Selected system is not a supported suppression system");
  const systemKey = system.systemKey;
  const expected = expectedInstances(system);
  if (expected.length === 0) {
    throw new Error(`This visit has no ${systemKey === wetChemicalSystemKey ? "Wet Chemical" : "CO2"} locations. Start a new service visit to use the General location.`);
  }
  const { definition, controls } = definitionFor(catalog, systemKey, job);
  const groupKey = `${job.id}:${systemKey}`;
  const timestamp = now();
  const originalCreatorSnapshot: DeviceReportedCreator | null = creator
    ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp }
    : null;

  try {
    await localDatabase.transaction(
      "rw",
      localDatabase.masterSystemInspectionGroups,
      localDatabase.masterSystemFormInstances,
      async () => {
        const existingGroup = await localDatabase.masterSystemInspectionGroups.get(groupKey);
        const group: MasterSystemInspectionGroupRecord = existingGroup ?? {
          groupKey,
          jobId: job.id,
          systemKey,
          jobReference: job.reference,
          jobTitle: job.title,
          customer: job.configurationSnapshot.customer,
          expectedInstances: expected,
          initializedAt: timestamp,
          localUpdatedAt: timestamp
        };
        if (!existingGroup) await localDatabase.masterSystemInspectionGroups.add(group);
        for (const instance of group.expectedInstances) {
          const existing = await localDatabase.masterSystemFormInstances
            .where("[groupKey+instanceKey]")
            .equals([groupKey, instance.instanceKey])
            .first();
          if (existing) continue;
          const inspectionSnapshot = snapshot(job, system, instance, definition, controls, timestamp);
          const record: MasterSystemFormInstanceRecord = {
            schemaVersion: 1,
            clientUuid: crypto.randomUUID(),
            groupKey,
            instanceKey: instance.instanceKey,
            jobId: job.id,
            systemKey,
            configuredZoneId: instance.zone?.id ?? null,
            configuredLocationId: instance.location.id,
            displaySequence: instance.displaySequence,
            originalCreatorSnapshot,
            masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: job.configurationSnapshot.template.version },
            configuration: job.configurationSnapshot.configuration,
            inspectionSnapshot,
            ...(frozenDisplayLabelOverrides(system) ? { displayLabelOverrides: frozenDisplayLabelOverrides(system) } : {}),
            responses: blankResponses(instance, controls),
            startedAt: null,
            performedAt: timestamp,
            localCreatedAt: timestamp,
            localUpdatedAt: timestamp,
            syncStatus: "Draft"
          };
          await localDatabase.masterSystemFormInstances.add(record);
        }
      }
    );
  } catch (error) {
    if (!isExpectedInitializationConstraint(error)) throw error;
    const racedGroup = await localDatabase.masterSystemInspectionGroups.get(groupKey);
    const racedInstances = await listCo2Instances(groupKey);
    const racedKeys = new Set(racedInstances.map((instance) => instance.instanceKey));
    if (
      !racedGroup
      || racedGroup.jobId !== job.id
      || racedGroup.systemKey !== systemKey
      || racedInstances.length !== racedGroup.expectedInstances.length
      || racedGroup.expectedInstances.some((instance) => !racedKeys.has(instance.instanceKey))
    ) {
      throw error;
    }
  }
  const group = await localDatabase.masterSystemInspectionGroups.get(groupKey);
  if (!group) throw new Error("Suppression-system inspection group initialization did not complete");
  return { group, instances: await listCo2Instances(groupKey) };
}

export function listCo2Instances(groupKey: string) {
  return localDatabase.masterSystemFormInstances.where("groupKey").equals(groupKey).sortBy("displaySequence");
}

function allowed(control: ResultControlDefinition, value: string | null) {
  return value !== null && control.options.some((option) => option.value === value);
}
export function isCanonicalDetectorStates(control: ResultControlDefinition, value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.length <= control.options.length
    && value.every((item, index) => typeof item === "string" && control.options.some((option) => option.value === item)
      && (index === 0 || control.options.findIndex((option) => option.value === value[index - 1]) < control.options.findIndex((option) => option.value === item)));
}
function canonicalV7DetectorStates(control: ResultControlDefinition, value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length
    || !value.every((item) => typeof item === "string" && control.options.some((option) => option.value === item))) return value;
  return control.options.filter((option) => value.includes(option.value)).map((option) => option.value);
}
function canonicalV7Responses(record: MasterSystemFormInstanceRecord, responses: Co2Responses): Co2Responses {
  if (record.masterTemplate.version !== 7) return responses;
  const controls = record.inspectionSnapshot.system.resolvedControls;
  return { ...responses, detectorRows: responses.detectorRows.map((row) => ({ ...row,
    heatDetectorStatus: canonicalV7DetectorStates(controls.detectorRows.heatDetector.result, row.heatDetectorStatus) as Co2DetectorRow["heatDetectorStatus"],
    smokeDetectorStatus: canonicalV7DetectorStates(controls.detectorRows.smokeDetector.result, row.smokeDetectorStatus) as Co2DetectorRow["smokeDetectorStatus"]
  })) };
}

export function getCo2SubmitIssues(record: MasterSystemFormInstanceRecord, responses: Co2Responses): Co2SubmitIssue[] {
  const controls = record.inspectionSnapshot.system.resolvedControls;
  const issues: Co2SubmitIssue[] = [];
  if (!responses.controlPanelLocation.trim()) issues.push({ section: "CO2 Control Panel", message: "Control Panel Location is required", targetId: "co2-panel-location" });
  if (responses.controlPanelLocation.length > controls.controlPanelLocation.maxLength) issues.push({ section: "CO2 Control Panel", message: `Control Panel Location exceeds ${controls.controlPanelLocation.maxLength} characters`, targetId: "co2-panel-location" });
  if (responses.detectorRows.length < controls.detectorRows.minimum) issues.push({ section: "Detector Table", message: "At least one detector row is required", targetId: "co2-detectors" });
  if (responses.detectorRows.length > controls.detectorRows.maximum) issues.push({ section: "Detector Table", message: `No more than ${controls.detectorRows.maximum} detector rows may be submitted`, targetId: "co2-detectors" });
  const rowIds = new Set<string>();
  const displaySequences = new Set<number>();
  responses.detectorRows.forEach((row, index) => {
    const targetId = `co2-detector-${row.rowUuid}`;
    const prefix = `Detector row ${index + 1}`;
    if (!isUuid(row.rowUuid)) issues.push({ section: "Detector Table", message: `${prefix}: row identity must be a valid UUID`, targetId });
    if (rowIds.has(row.rowUuid)) issues.push({ section: "Detector Table", message: `${prefix}: duplicate row identity`, targetId });
    rowIds.add(row.rowUuid);
    if (!Number.isInteger(row.displaySequence) || row.displaySequence < 1 || displaySequences.has(row.displaySequence)) {
      issues.push({ section: "Detector Table", message: `${prefix}: display sequence is invalid or duplicated`, targetId });
    }
    displaySequences.add(row.displaySequence);
    if (!row.alarmZone.trim()) issues.push({ section: "Detector Table", message: `${prefix}: Alarm Zone is required`, targetId });
    if (!row.location.trim()) issues.push({ section: "Detector Table", message: `${prefix}: Location is required`, targetId });
    if (record.masterTemplate.version === 7) {
      if (!isCanonicalDetectorStates(controls.detectorRows.heatDetector.result, row.heatDetectorStatus)) issues.push({ section: "Detector Table", message: `${prefix}: select at least one Normal/Test/Isolation for ${controls.detectorRows.heatDetector.label}`, targetId });
      if (!isCanonicalDetectorStates(controls.detectorRows.smokeDetector.result, row.smokeDetectorStatus)) issues.push({ section: "Detector Table", message: `${prefix}: select at least one Normal/Test/Isolation for ${controls.detectorRows.smokeDetector.label}`, targetId });
    } else {
      if (!allowed(controls.detectorRows.heatDetector.result, row.heatDetectorStatus as string | null) && !allowed(controls.detectorRows.smokeDetector.result, row.smokeDetectorStatus as string | null)) {
        issues.push({ section: "Detector Table", message: `${prefix}: complete ${controls.detectorRows.heatDetector.label} or ${controls.detectorRows.smokeDetector.label} status`, targetId });
      }
      if (row.heatDetectorStatus !== null && !allowed(controls.detectorRows.heatDetector.result, row.heatDetectorStatus as string)) issues.push({ section: "Detector Table", message: `${prefix}: ${controls.detectorRows.heatDetector.label} status is invalid`, targetId });
      if (row.smokeDetectorStatus !== null && !allowed(controls.detectorRows.smokeDetector.result, row.smokeDetectorStatus as string)) issues.push({ section: "Detector Table", message: `${prefix}: ${controls.detectorRows.smokeDetector.label} status is invalid`, targetId });
    }
    if (row.alarmZone.length > controls.detectorRows.alarmZone.maxLength || row.location.length > controls.detectorRows.location.maxLength || row.remarks.length > controls.detectorRows.remarks.maxLength) {
      issues.push({ section: "Detector Table", message: `${prefix}: text exceeds the allowed length`, targetId });
    }
  });
  const groups = [
    ["Charger & Batteries", controls.chargerAndBatteries, responses.chargerAndBatteries],
    ["Physical Outlook", controls.physicalOutlook, responses.physicalOutlook],
    ["Main Function Keys", controls.mainFunctionKeys, responses.mainFunctionKeys]
  ] as const;
  groups.forEach(([section, definitions, values]) => definitions.forEach((definition) => {
    const value = values[definition.key];
    const targetId = `co2-check-${definition.key}`;
    if (!value || !allowed(definition.result, value.result)) issues.push({ section, message: `${definition.label}: Result required or invalid`, targetId });
    if ((value?.remarks.length ?? 0) > definition.remarks.maxLength) issues.push({ section, message: `${definition.label}: Remarks exceed ${definition.remarks.maxLength} characters`, targetId });
  }));
  if (responses.comments.length > controls.comments.maxLength) issues.push({ section: "Comments", message: `Comments exceed ${controls.comments.maxLength} characters`, targetId: "co2-comments" });
  return issues;
}

function updated(record: MasterSystemFormInstanceRecord, responses: Co2Responses, status: MasterSystemFormInstanceRecord["syncStatus"]) {
  const timestamp = now();
  return {
    ...record,
    responses,
    startedAt: record.startedAt ?? timestamp,
    performedAt: status === "Pending" ? timestamp : record.performedAt,
    localUpdatedAt: timestamp,
    syncStatus: status,
    lastSyncError: undefined
  };
}

export async function saveCo2Draft(record: MasterSystemFormInstanceRecord, responses: Co2Responses) {
  let next: MasterSystemFormInstanceRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemFormInstances, async () => {
    const live = await localDatabase.masterSystemFormInstances.get(record.clientUuid);
    if (!live || live.systemKey !== record.systemKey || live.syncStatus !== "Draft" || live.localUpdatedAt !== record.localUpdatedAt) {
      throw new Error("Only the current Draft suppression-system form can be edited");
    }
    next = updated(live, canonicalV7Responses(live, responses), "Draft");
    await localDatabase.masterSystemFormInstances.put(next);
  });
  if (!next) throw new Error("Suppression-system Draft was not saved");
  return next;
}

function payload(record: MasterSystemFormInstanceRecord, evidenceManifest?: ReturnType<typeof v7EvidenceManifest>) {
  return {
    clientUuid: record.clientUuid,
    jobId: record.jobId,
    systemKey: record.systemKey,
    instanceKey: record.instanceKey,
    configuredZoneId: record.configuredZoneId,
    configuredLocationId: record.configuredLocationId,
    displaySequence: record.displaySequence,
    originalCreatorSnapshot: record.originalCreatorSnapshot,
    masterTemplate: record.masterTemplate,
    configuration: record.configuration,
    inspectionSnapshot: record.inspectionSnapshot,
    responses: record.responses,
    performedAt: record.performedAt,
    ...(evidenceManifest ? { evidenceManifest } : {})
  };
}

export async function submitLocalCo2(record: MasterSystemFormInstanceRecord, responses: Co2Responses) {
  let next: MasterSystemFormInstanceRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemFormInstances, localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => {
    const live = await localDatabase.masterSystemFormInstances.get(record.clientUuid);
    if (!live || live.systemKey !== record.systemKey || live.localUpdatedAt !== record.localUpdatedAt || live.syncStatus !== "Draft") {
      throw new Error("This suppression-system form cannot be submitted in its current state");
    }
    const canonicalResponses = canonicalV7Responses(live, responses);
    const photos = live.masterTemplate.version === 7 ? await listV7SuppressionPhotos(live.clientUuid) : [];
    // G9: the same bytes on two location-instances of one system is refused at
    // acceptance (jobId+systemKey uniqueness) with a retryable error the outbox
    // can never clear, so the submit gate has to see the siblings too.
    const siblings = live.masterTemplate.version === 7 ? await collectV7SiblingEvidence(live) : [];
    if (getCo2SubmitIssues(live, canonicalResponses).length > 0 || v7SubmissionIssues(live, canonicalResponses, photos, siblings).length > 0) throw new Error("Complete the required suppression-system fields and evidence before local submission");
    next = updated(live, canonicalResponses, "Pending");
    const activeKey = `masterSystemFormInstance:create:${live.clientUuid}`;
    const outbox: SyncOutboxItem = {
      operationId: crypto.randomUUID(), entityType: "masterSystemFormInstance", entityId: live.clientUuid,
      action: "create", payload: payload(next, live.masterTemplate.version === 7 ? v7EvidenceManifest(photos, canonicalResponses) : undefined), createdAt: next.localCreatedAt, attempts: 0, status: "Pending", activeKey
    };
    // Evidence operations are intentionally enqueued before the parent form.
    // The sync engine additionally gates parent dispatch on exact photo confirmation.
    if (live.masterTemplate.version === 7) for (const photo of photos.filter((photo) => v7EvidenceManifest(photos, canonicalResponses).some((entry) => entry.photoUuid === photo.photoUuid))) { await localDatabase.inspectionAttachments.update(photo.photoUuid, { syncStatus: "Pending", localUpdatedAt: now() }); const existingEvidence = await localDatabase.syncOutbox.where("activeKey").equals(`v7StagedEvidence:create:${photo.photoUuid}`).first(); if (!existingEvidence) await localDatabase.syncOutbox.add(v7EvidenceOutbox(photo)); }
    await localDatabase.masterSystemFormInstances.put(next);
    const existing = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    if (existing) await localDatabase.syncOutbox.update(existing.operationId, { payload: outbox.payload, status: "Pending", lastError: undefined });
    else await localDatabase.syncOutbox.add(outbox);
  });
  if (!next) throw new Error("Suppression-system form was not submitted locally");
  return next;
}

export async function returnFailedCo2ToDraft(record: MasterSystemFormInstanceRecord) {
  let next: MasterSystemFormInstanceRecord | undefined;
  const activeKey = `masterSystemFormInstance:create:${record.clientUuid}`;
  await localDatabase.transaction("rw", localDatabase.masterSystemFormInstances, localDatabase.syncOutbox, async () => {
    const live = await localDatabase.masterSystemFormInstances.get(record.clientUuid);
    if (!live || live.systemKey !== record.systemKey || live.localUpdatedAt !== record.localUpdatedAt || (live.syncStatus !== "Failed" && live.syncStatus !== "Conflict")) {
      throw new Error("This suppression-system form changed elsewhere. Reload before correcting it.");
    }
    next = { ...live, syncStatus: "Draft", localUpdatedAt: now(), lastSyncError: undefined };
    const item = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    if (item) await localDatabase.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: now(), lastError: "Superseded by technician correction" });
    await localDatabase.masterSystemFormInstances.put(next);
  });
  if (!next) throw new Error("Suppression-system form was not corrected");
  return next;
}

export function addCo2DetectorRow(responses: Co2Responses) {
  if (responses.detectorRows.length >= 250) return responses;
  const first = responses.detectorRows[0];
  return {
    ...responses,
    detectorRows: [...responses.detectorRows, {
      rowUuid: crypto.randomUUID(),
      displaySequence: Math.max(0, ...responses.detectorRows.map((row) => row.displaySequence)) + 1,
      alarmZone: first?.alarmZone ?? "",
      location: first?.location ?? "",
      heatDetectorStatus: null,
      smokeDetectorStatus: null,
      remarks: ""
    }]
  };
}
