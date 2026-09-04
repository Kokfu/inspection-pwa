import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { attachmentOutboxPayload } from "../attachments/attachmentRepository";
import type {
  AttachmentOutboxPayload,
  InspectionAttachmentRecord
} from "../attachments/attachmentTypes";
import type { DeviceReportedCreator, MasterSystemInspectionRecord } from "../hoseReel/hoseReelTypes";
import type { DryWetRiserInspectionRecord } from "../dryWetRiser/dryWetRiserTypes";
import type { FireAlarmInspectionRecord } from "../fireAlarm/fireAlarmTypes";
import type { HydrantInspectionRecord } from "../hydrant/hydrantTypes";
import type { ResolvedMeasurementRow, ResultControlDefinition } from "../inspectionControls/definitionTypes";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import {
  type InspectionCatalogInput
} from "../referenceData/referenceDataTypes";
import { compatibleCatalogSystem } from "../referenceData/systemContractCompatibility";
import {
  controlsForAutomaticSprinklerSnapshot,
  resolvePublishedAutomaticSprinklerControls
} from "./automaticSprinklerDefinition";
import { listAutomaticSprinklerV7Photos, v7AutomaticSprinklerEvidenceOutbox, v7AutomaticSprinklerManifest, v7AutomaticSprinklerSubmissionIssues } from "./automaticSprinklerV7Evidence";
import type {
  AutomaticSprinklerInspectionRecord,
  AutomaticSprinklerInspectionSnapshot,
  AutomaticSprinklerResponses,
  MainAlarmValveChecklistKey,
  PumpHouseChecklistKey,
  ResolvedAutomaticSprinklerControls,
  SprinklerMeasurementKey,
  SprinklerRowResponse,
  SprinklerResult,
  AutomaticSprinklerV7ChecklistKey,
  WaterTankKey
} from "./automaticSprinklerTypes";

const systemKey = "automatic_sprinkler" as const;
const now = () => new Date().toISOString();
const staleRecordMessage = "This Automatic Sprinkler record changed elsewhere. Reload before continuing.";
export const automaticSprinklerJobSystemKey = (jobId: string) => `${jobId}:${systemKey}`;
export type AutomaticSprinklerSubmitIssue = { section: string; message: string; targetId: string };

function definitionFor(catalog: InspectionCatalogInput, currentTemplateIdentity: InspectionJob["configurationSnapshot"]["template"]) {
  const resolved = "templates" in catalog
    ? compatibleCatalogSystem(catalog, currentTemplateIdentity, systemKey)
    : undefined;
  const template = resolved?.template ?? ("templates" in catalog ? undefined : catalog);
  const system = resolved?.system ?? template?.systems.find((candidate) =>
    candidate.key === systemKey && candidate.definitionStatus === "confirmed");
  if (!template || !system?.definition) throw new Error("Cached Automatic Sprinkler definition is unavailable. Refresh jobs online first.");
  return {
    definition: system.definition,
    controls: resolvePublishedAutomaticSprinklerControls(system.definition, template.code, template.version)
  };
}

function blankRows<T extends string>(definitions: Array<{ key: string }>): Record<T, { result: null; remarks: string }> {
  return Object.fromEntries(definitions.map((definition) => [
    definition.key,
    { result: null, remarks: "" }
  ])) as Record<T, { result: null; remarks: string }>;
}

function measurementDefinition(controls: ResolvedAutomaticSprinklerControls, key: SprinklerMeasurementKey) {
  const definition = controls.measurements.find((candidate) => candidate.key === key);
  if (!definition) throw new Error(`Automatic Sprinkler definition is missing ${key}`);
  return definition;
}

function unit(definition: ResolvedMeasurementRow) {
  const units = new Set(definition.values.map((value) => value.unit));
  if (units.size !== 1) throw new Error(`Automatic Sprinkler measurement ${definition.key} has inconsistent units`);
  return definition.values[0]?.unit ?? "";
}

function emptyResponses(controls: ResolvedAutomaticSprinklerControls): AutomaticSprinklerResponses {
  const measurements = {
    jockey_pump_pressure: {
      values: { cut_in: null, cut_out: null },
      unit: unit(measurementDefinition(controls, "jockey_pump_pressure")), result: null, remarks: ""
    },
    duty_pump_cut_in: { values: { value: null }, unit: unit(measurementDefinition(controls, "duty_pump_cut_in")), result: null, remarks: "" },
    standby_pump_cut_in: { values: { value: null }, unit: unit(measurementDefinition(controls, "standby_pump_cut_in")), result: null, remarks: "" },
    water_supply_gauge: { values: { value: null }, unit: unit(measurementDefinition(controls, "water_supply_gauge")), result: null, remarks: "" },
    installation_gauge: { values: { value: null }, unit: unit(measurementDefinition(controls, "installation_gauge")), result: null, remarks: "" }
  };
  if (controls.source.templateVersion === 7) return {
    schemaVersion: 2,
    checklist: blankRows<AutomaticSprinklerV7ChecklistKey>([
      ...controls.checklist.waterTank, ...controls.checklist.pumpHouse,
      ...controls.checklist.mainAlarmValve, ...controls.checklist.testRunFirePump
    ]),
    measurements,
    comments: ""
  };
  return {
    schemaVersion: 1,
    waterTank: blankRows<WaterTankKey>(controls.checklist.waterTank),
    pumpHouse: blankRows<PumpHouseChecklistKey>(controls.checklist.pumpHouse),
    measurements,
    mainAlarmValve: blankRows<MainAlarmValveChecklistKey>(controls.checklist.mainAlarmValve),
    comments: ""
  };
}

function snapshot(
  job: InspectionJob,
  system: JobSystemSnapshot,
  definition: unknown,
  controls: ResolvedAutomaticSprinklerControls,
  capturedAt: string
): AutomaticSprinklerInspectionSnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    job: { id: job.id, reference: job.reference, title: job.title },
    customer: job.configurationSnapshot.customer,
    configuration: job.configurationSnapshot.configuration,
    template: job.configurationSnapshot.template,
    system: { ...system, definition, resolvedControls: controls, repetitionMode: "single" },
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null }
  };
}

export async function getOrCreateAutomaticSprinklerInspection(
  job: InspectionJob,
  system: JobSystemSnapshot,
  catalog: InspectionCatalogInput,
  creator: { id: number; username: string; role: "admin" | "inspector" } | undefined
) {
  const jobSystemKey = automaticSprinklerJobSystemKey(job.id);
  const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(jobSystemKey).first();
  if (existing) {
    if (existing.systemKey !== systemKey) throw new Error("Stored Master-system inspection identity is invalid");
    return existing;
  }
  if (job.status === "closed") throw new Error("Completed jobs cannot create new inspection Drafts");
  if (system.systemKey !== systemKey || system.zones.length !== 0 || system.locations.length !== 0) {
    throw new Error("Automatic Sprinkler supports one fixed form without configured zones or locations");
  }
  const { definition, controls } = definitionFor(catalog, job.configurationSnapshot.template);
  const timestamp = now();
  const originalCreatorSnapshot: DeviceReportedCreator | null = creator
    ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp }
    : null;
  const inspectionSnapshot = snapshot(job, system, definition, controls, timestamp);
  const record: AutomaticSprinklerInspectionRecord = {
    schemaVersion: 1,
    clientUuid: crypto.randomUUID(),
    jobSystemKey,
    jobId: job.id,
    systemKey,
    instanceKey: "primary",
    configuredZoneId: null,
    configuredLocationId: null,
    displaySequence: 1,
    originalCreatorSnapshot,
    masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: job.configurationSnapshot.template.version },
    configuration: job.configurationSnapshot.configuration,
    inspectionSnapshot,
    responses: emptyResponses(controls),
    performedAt: timestamp,
    localCreatedAt: timestamp,
    localUpdatedAt: timestamp,
    syncStatus: "Draft"
  };
  try {
    await localDatabase.masterSystemInspections.add(record);
    return record;
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "ConstraintError") throw error;
    const winner = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(jobSystemKey).first();
    if (!winner || winner.systemKey !== systemKey) throw error;
    return winner;
  }
}

function validResult(definition: ResultControlDefinition, value: SprinklerResult | null) {
  return value !== null && definition.options.some((option) => option.value === value);
}

export function getAutomaticSprinklerSubmitIssues(
  responses: AutomaticSprinklerResponses,
  inspectionSnapshot: AutomaticSprinklerInspectionSnapshot
) {
  const controls = controlsForAutomaticSprinklerSnapshot(inspectionSnapshot);
  const issues: AutomaticSprinklerSubmitIssue[] = [];
  const checklistGroups = responses.schemaVersion === 2 ? [
    ["Water Tank", controls.checklist.waterTank, responses.checklist],
    ["Pump House", controls.checklist.pumpHouse, responses.checklist],
    ["Main Alarm Valve", controls.checklist.mainAlarmValve, responses.checklist],
    ["Test Run Fire Pump 30 Minutes", controls.checklist.testRunFirePump, responses.checklist]
  ] as const : [
    ["Water Tank", controls.checklist.waterTank, responses.waterTank],
    ["Pump House", controls.checklist.pumpHouse, responses.pumpHouse],
    ["Main Alarm Valve", controls.checklist.mainAlarmValve, responses.mainAlarmValve]
  ] as const;
  checklistGroups.forEach(([section, definitions, values]) => definitions.forEach((definition) => {
    const response = (values as Record<string, SprinklerRowResponse>)[definition.key];
    const targetId = `sprinkler-${definition.key}`;
    if (!response || !validResult(definition.result, response.result)) {
      issues.push({ section, message: `${definition.label}: Result required or invalid`, targetId });
    }
    if ((response?.remarks.length ?? 0) > definition.remarks.maxLength) {
      issues.push({ section, message: `${definition.label}: Remarks exceed ${definition.remarks.maxLength} characters`, targetId });
    }
  }));

  controls.measurements.forEach((definition) => {
    const response = responses.measurements[definition.key as SprinklerMeasurementKey];
    const section = definition.key === "water_supply_gauge" || definition.key === "installation_gauge"
      ? "Main Alarm Valve"
      : "Pump House";
    const targetId = `sprinkler-${definition.key}`;
    definition.values.forEach((valueDefinition) => {
      const value = response?.values[valueDefinition.key as keyof typeof response.values];
      if (!Number.isFinite(value)) {
        issues.push({ section, message: `${definition.label}: ${valueDefinition.label} ${valueDefinition.unit} required`, targetId });
      }
    });
    if (!response || response.unit !== unit(definition)) {
      issues.push({ section, message: `${definition.label}: Unit is invalid`, targetId });
    }
    if (!response || !validResult(definition.result, response.result)) {
      issues.push({ section, message: `${definition.label}: Result required or invalid`, targetId });
    }
    if ((response?.remarks.length ?? 0) > definition.remarks.maxLength) {
      issues.push({ section, message: `${definition.label}: Remarks exceed ${definition.remarks.maxLength} characters`, targetId });
    }
  });
  if (responses.comments.length > controls.comments.maxLength) {
    issues.push({ section: "Comments", message: `Comments exceed ${controls.comments.maxLength} characters`, targetId: "sprinkler-comments" });
  }
  return issues;
}

function updated(
  record: AutomaticSprinklerInspectionRecord,
  responses: AutomaticSprinklerResponses,
  syncStatus: AutomaticSprinklerInspectionRecord["syncStatus"]
) {
  const timestamp = now();
  return {
    ...record,
    responses,
    syncStatus,
    performedAt: syncStatus === "Pending" ? timestamp : record.performedAt,
    localUpdatedAt: timestamp,
    lastSyncError: undefined
  };
}

function currentLiveRecord(
  liveRecord: AutomaticSprinklerInspectionRecord | MasterSystemInspectionRecord | DryWetRiserInspectionRecord | FireAlarmInspectionRecord | HydrantInspectionRecord | undefined,
  caller: AutomaticSprinklerInspectionRecord
) {
  if (
    !liveRecord
    || liveRecord.systemKey !== systemKey
    || liveRecord.clientUuid !== caller.clientUuid
    || liveRecord.jobSystemKey !== caller.jobSystemKey
    || liveRecord.jobId !== caller.jobId
    || liveRecord.instanceKey !== caller.instanceKey
    || liveRecord.localUpdatedAt !== caller.localUpdatedAt
  ) {
    throw new Error(staleRecordMessage);
  }
  return liveRecord as AutomaticSprinklerInspectionRecord;
}

export async function saveAutomaticSprinklerDraft(
  record: AutomaticSprinklerInspectionRecord,
  responses: AutomaticSprinklerResponses
) {
  let next: AutomaticSprinklerInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, async () => {
    const liveRecord = currentLiveRecord(
      await localDatabase.masterSystemInspections.get(record.clientUuid), record
    );
    if (liveRecord.syncStatus !== "Draft") throw new Error(staleRecordMessage);
    next = updated(liveRecord, responses, "Draft");
    await localDatabase.masterSystemInspections.put(next);
  });
  if (!next) throw new Error("Automatic Sprinkler Draft was not saved");
  return next;
}

function payload(record: AutomaticSprinklerInspectionRecord, evidenceManifest?: ReturnType<typeof v7AutomaticSprinklerManifest>) {
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

function attachmentManifestEntry(attachment: InspectionAttachmentRecord) {
  const {
    photoUuid,
    fieldPath,
    evidencePolicyId,
    evidencePolicyVersion,
    captureSource,
    mimeType,
    sizeBytes,
    width,
    height,
    sha256,
    capturedAt
  } = attachment;
  return {
    photoUuid,
    fieldPath,
    evidencePolicyId,
    evidencePolicyVersion,
    captureSource,
    mimeType,
    sizeBytes,
    width,
    height,
    sha256,
    capturedAt
  };
}

function sameManifest(
  attachments: InspectionAttachmentRecord[],
  manifest: NonNullable<AutomaticSprinklerInspectionRecord["submittedAttachmentManifest"]>
) {
  const current = attachments
    .map(attachmentManifestEntry)
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
  const frozen = [...manifest]
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
  return JSON.stringify(current) === JSON.stringify(frozen);
}

function isAttachmentPayload(value: unknown): value is AttachmentOutboxPayload {
  return typeof value === "object"
    && value !== null
    && "photoUuid" in value
    && "inspectionClientUuid" in value
    && "fieldPath" in value
    && "sha256" in value;
}

export async function submitLocalAutomaticSprinkler(
  record: AutomaticSprinklerInspectionRecord,
  responses: AutomaticSprinklerResponses
) {
  const submittedAt = now();
  const activeKey = `masterSystemInspection:create:${record.clientUuid}`;
  let submittedRecord: AutomaticSprinklerInspectionRecord | undefined;
  await localDatabase.transaction(
    "rw",
    localDatabase.masterSystemInspections,
    localDatabase.inspectionAttachments,
    localDatabase.syncOutbox,
    async () => {
    const liveRecord = currentLiveRecord(
      await localDatabase.masterSystemInspections.get(record.clientUuid), record
    );
    if (liveRecord.syncStatus !== "Draft") {
      if (liveRecord.syncStatus !== "Pending" || !liveRecord.attachmentSetSubmittedAt) {
        throw new Error(staleRecordMessage);
      }
      submittedRecord = liveRecord;
      return;
    }
    const isV7 = liveRecord.masterTemplate.version === 7;
    const v7Photos = isV7 ? await listAutomaticSprinklerV7Photos(liveRecord.clientUuid) : [];
    if (getAutomaticSprinklerSubmitIssues(responses, liveRecord.inspectionSnapshot).length > 0
      || (isV7 && v7AutomaticSprinklerSubmissionIssues(liveRecord, responses, v7Photos).length > 0)) {
      throw new Error("Complete required Automatic Sprinkler results and PSI values");
    }
    if (isV7) {
      const next = updated(liveRecord, responses, "Pending");
      const manifest = v7AutomaticSprinklerManifest(v7Photos, responses);
      const existing = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
      const outbox: SyncOutboxItem = { operationId: existing?.operationId ?? crypto.randomUUID(), entityType: "masterSystemInspection", entityId: record.clientUuid, action: "create", payload: payload(next, manifest), createdAt: next.localCreatedAt, attempts: existing?.attempts ?? 0, status: "Pending", activeKey };
      await localDatabase.masterSystemInspections.put(next); submittedRecord = next;
      if (existing) await localDatabase.syncOutbox.put(outbox); else await localDatabase.syncOutbox.add(outbox);
      for (const photo of v7Photos.filter((candidate) => manifest.some((entry) => entry.photoUuid === candidate.photoUuid))) {
        await localDatabase.inspectionAttachments.update(photo.photoUuid, { syncStatus: "Pending", localUpdatedAt: next.localUpdatedAt });
        const evidenceKey = `v7StagedEvidence:create:${photo.photoUuid}`;
        if (!await localDatabase.syncOutbox.where("activeKey").equals(evidenceKey).first()) await localDatabase.syncOutbox.add(v7AutomaticSprinklerEvidenceOutbox(photo));
      }
      return;
    }
    const attachments = await localDatabase.inspectionAttachments
      .where("inspectionClientUuid")
      .equals(record.clientUuid)
      .toArray();
    const correctionDraft = Boolean(liveRecord.attachmentSetSubmittedAt);
    const attachmentOutboxItems = (await localDatabase.syncOutbox
      .where("entityType")
      .equals("inspectionAttachment")
      .toArray())
      .filter((item) =>
        isAttachmentPayload(item.payload)
        && item.payload.inspectionClientUuid === record.clientUuid
      );
    const legacyManifest = attachmentOutboxItems
      .map((item) => item.payload)
      .filter(isAttachmentPayload)
      .map((item) => ({
        photoUuid: item.photoUuid,
        fieldPath: item.fieldPath,
        evidencePolicyId: item.evidencePolicyId,
        evidencePolicyVersion: item.evidencePolicyVersion,
        captureSource: item.captureSource,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        width: item.width,
        height: item.height,
        sha256: item.sha256,
        capturedAt: item.capturedAt
      }));
    const frozenManifest = liveRecord.submittedAttachmentManifest
      ?? legacyManifest;

    if (!correctionDraft && attachments.some((attachment) => attachment.syncStatus !== "Draft")) {
      throw new Error("The submitted photo set is already frozen");
    }
    if (correctionDraft && !sameManifest(attachments, frozenManifest)) {
      throw new Error("The submitted photo set changed and cannot be resubmitted");
    }
    const next: AutomaticSprinklerInspectionRecord = {
      ...updated(
        liveRecord,
        responses,
        "Pending"
      ),
      attachmentSetSubmittedAt: liveRecord.attachmentSetSubmittedAt ?? submittedAt,
      submittedAttachmentManifest: correctionDraft
        ? frozenManifest
        : attachments.map(attachmentManifestEntry)
    };
    const outbox: SyncOutboxItem = {
      operationId: crypto.randomUUID(),
      entityType: "masterSystemInspection",
      entityId: record.clientUuid,
      action: "create",
      payload: payload(next),
      createdAt: next.localCreatedAt,
      attempts: 0,
      status: "Pending",
      activeKey
    };
    await localDatabase.masterSystemInspections.put(next);
    submittedRecord = next;
    const existing = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    if (existing) {
      await localDatabase.syncOutbox.update(existing.operationId, {
        payload: outbox.payload,
        status: "Pending",
        activeKey,
        completedAt: undefined,
        lastError: undefined
      });
    } else {
      await localDatabase.syncOutbox.add(outbox);
    }
    for (const attachment of attachments) {
      const attachmentActiveKey =
        `inspectionAttachment:create:${attachment.photoUuid}`;
      const attachmentPayload = attachmentOutboxPayload(attachment);
      const existingAttachmentOutbox = await localDatabase.syncOutbox
        .where("activeKey")
        .equals(attachmentActiveKey)
        .first();
      if (attachment.syncStatus !== "Synced") {
        await localDatabase.inspectionAttachments.update(attachment.photoUuid, {
          syncStatus: "Pending",
          localUpdatedAt: submittedAt,
          lastSyncError: undefined
        });
      }
      if (existingAttachmentOutbox) {
        if (attachment.syncStatus !== "Synced") {
          await localDatabase.syncOutbox.update(existingAttachmentOutbox.operationId, {
            payload: attachmentPayload,
            status: "Pending",
            activeKey: attachmentActiveKey,
            completedAt: undefined,
            lastError: undefined
          });
        }
      } else {
        await localDatabase.syncOutbox.add({
          operationId: crypto.randomUUID(),
          entityType: "inspectionAttachment",
          entityId: attachment.photoUuid,
          action: "create",
          payload: attachmentPayload,
          createdAt: submittedAt,
          attempts: 0,
          status: "Pending",
          activeKey: attachmentActiveKey
        });
      }
    }
  });
  if (!submittedRecord) throw new Error("Automatic Sprinkler inspection was not submitted");
  return submittedRecord;
}

export async function returnFailedAutomaticSprinklerToDraft(record: AutomaticSprinklerInspectionRecord) {
  let next: AutomaticSprinklerInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => {
    const liveRecord = currentLiveRecord(
      await localDatabase.masterSystemInspections.get(record.clientUuid), record
    );
    if (liveRecord.syncStatus !== "Failed" && liveRecord.syncStatus !== "Conflict") {
      throw new Error(staleRecordMessage);
    }
    const operations = await localDatabase.syncOutbox.toArray();
    const parentOperations = operations.filter((item) =>
      item.entityType === "masterSystemInspection"
      && item.entityId === record.clientUuid
      && item.action === "create"
      && item.status !== "Completed"
    );
    if (parentOperations.length === 0) {
      throw new Error("The submitted inspection retry operation is missing");
    }
    next = {
      ...liveRecord,
      syncStatus: "Draft",
      localUpdatedAt: now(),
      lastSyncError: undefined
    } as AutomaticSprinklerInspectionRecord;
    await localDatabase.masterSystemInspections.put(next);
    const attachmentIds = new Set((await localDatabase.inspectionAttachments
      .where("inspectionClientUuid").equals(record.clientUuid).toArray()).map((attachment) => attachment.photoUuid));
    const completedAt = now();
    for (const item of operations) {
      const relatedEvidence = item.entityType === "inspectionAttachment"
        && isAttachmentPayload(item.payload)
        && item.payload.inspectionClientUuid === record.clientUuid;
      if (parentOperations.some((parent) => parent.operationId === item.operationId) || relatedEvidence) {
        await localDatabase.syncOutbox.update(item.operationId, {
          status: "Completed",
          activeKey: undefined,
          completedAt,
          lastError: "Superseded by technician correction"
        });
      }
    }
    if (attachmentIds.size !== liveRecord.submittedAttachmentManifest?.length) {
      throw new Error("The submitted photo set changed and cannot be corrected");
    }
  });
  if (!next) throw new Error("Automatic Sprinkler inspection was not returned for correction");
  return next;
}
