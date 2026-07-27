import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { attachmentOutboxPayload } from "../attachments/attachmentRepository";
import type {
  AttachmentOutboxPayload,
  InspectionAttachmentRecord
} from "../attachments/attachmentTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type { ResolvedMeasurementRow, ResultControlDefinition } from "../inspectionControls/definitionTypes";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import {
  controlsForAutomaticSprinklerSnapshot,
  resolvePublishedAutomaticSprinklerControls
} from "./automaticSprinklerDefinition";
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
  WaterTankKey
} from "./automaticSprinklerTypes";

const systemKey = "automatic_sprinkler" as const;
const now = () => new Date().toISOString();
export const automaticSprinklerJobSystemKey = (jobId: string) => `${jobId}:${systemKey}`;
export type AutomaticSprinklerSubmitIssue = { section: string; message: string; targetId: string };

function definitionFor(catalog: InspectionCatalog) {
  const system = catalog.systems.find((candidate) =>
    candidate.key === systemKey && candidate.definitionStatus === "confirmed"
  );
  if (!system?.definition) throw new Error("Cached Automatic Sprinkler definition is unavailable. Refresh jobs online first.");
  return {
    definition: system.definition,
    controls: resolvePublishedAutomaticSprinklerControls(system.definition, catalog.code, catalog.version)
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
  return {
    schemaVersion: 1,
    waterTank: blankRows<WaterTankKey>(controls.checklist.waterTank),
    pumpHouse: blankRows<PumpHouseChecklistKey>(controls.checklist.pumpHouse),
    measurements: {
      jockey_pump_pressure: {
        values: { cut_in: null, cut_out: null },
        unit: unit(measurementDefinition(controls, "jockey_pump_pressure")),
        result: null,
        remarks: ""
      },
      duty_pump_cut_in: {
        values: { value: null },
        unit: unit(measurementDefinition(controls, "duty_pump_cut_in")),
        result: null,
        remarks: ""
      },
      standby_pump_cut_in: {
        values: { value: null },
        unit: unit(measurementDefinition(controls, "standby_pump_cut_in")),
        result: null,
        remarks: ""
      },
      water_supply_gauge: {
        values: { value: null },
        unit: unit(measurementDefinition(controls, "water_supply_gauge")),
        result: null,
        remarks: ""
      },
      installation_gauge: {
        values: { value: null },
        unit: unit(measurementDefinition(controls, "installation_gauge")),
        result: null,
        remarks: ""
      }
    },
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
  catalog: InspectionCatalog,
  creator: { id: number; username: string; role: "admin" | "inspector" } | undefined
) {
  const jobSystemKey = automaticSprinklerJobSystemKey(job.id);
  const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(jobSystemKey).first();
  if (existing) {
    if (existing.systemKey !== systemKey) throw new Error("Stored Master-system inspection identity is invalid");
    return existing;
  }
  if (system.systemKey !== systemKey || system.zones.length !== 0 || system.locations.length !== 0) {
    throw new Error("Automatic Sprinkler V1 supports one fixed form without configured zones or locations");
  }
  const { definition, controls } = definitionFor(catalog);
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
    masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: 1 },
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
  const checklistGroups = [
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

export async function saveAutomaticSprinklerDraft(
  record: AutomaticSprinklerInspectionRecord,
  responses: AutomaticSprinklerResponses
) {
  let next: AutomaticSprinklerInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, async () => {
    const liveRecord = await localDatabase.masterSystemInspections.get(record.clientUuid);
    if (
      !liveRecord
      || liveRecord.systemKey !== "automatic_sprinkler"
      || liveRecord.syncStatus !== "Draft"
    ) {
      throw new Error("Only the current Draft Automatic Sprinkler inspection can be edited");
    }
    next = updated(
      liveRecord as AutomaticSprinklerInspectionRecord,
      responses,
      "Draft"
    );
    await localDatabase.masterSystemInspections.put(next);
  });
  if (!next) throw new Error("Automatic Sprinkler Draft was not saved");
  return next;
}

function payload(record: AutomaticSprinklerInspectionRecord) {
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
    performedAt: record.performedAt
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
  if (record.syncStatus !== "Draft") throw new Error("This Automatic Sprinkler inspection cannot be submitted in its current state");
  if (getAutomaticSprinklerSubmitIssues(responses, record.inspectionSnapshot).length > 0) {
    throw new Error("Complete required Automatic Sprinkler results and PSI values");
  }
  const submittedAt = now();
  const activeKey = `masterSystemInspection:create:${record.clientUuid}`;
  let submittedRecord: AutomaticSprinklerInspectionRecord | undefined;
  await localDatabase.transaction(
    "rw",
    localDatabase.masterSystemInspections,
    localDatabase.inspectionAttachments,
    localDatabase.syncOutbox,
    async () => {
    const liveRecord = await localDatabase.masterSystemInspections.get(record.clientUuid);
    if (
      liveRecord
      && liveRecord.systemKey === "automatic_sprinkler"
      && liveRecord.syncStatus !== "Draft"
      && liveRecord.attachmentSetSubmittedAt
    ) {
      submittedRecord = liveRecord as AutomaticSprinklerInspectionRecord;
      return;
    }
    if (
      !liveRecord
      || liveRecord.systemKey !== "automatic_sprinkler"
      || liveRecord.syncStatus !== "Draft"
    ) {
      throw new Error("This Automatic Sprinkler inspection was already submitted");
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
    if (
      correctionDraft
      && attachments.some((attachment) =>
        !attachmentOutboxItems.some((item) => item.entityId === attachment.photoUuid)
      )
    ) {
      throw new Error("A submitted photo retry operation is missing");
    }
    const next: AutomaticSprinklerInspectionRecord = {
      ...updated(
        liveRecord as AutomaticSprinklerInspectionRecord,
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
    const existing = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first()
      ?? (await localDatabase.syncOutbox
        .where("entityType")
        .equals("masterSystemInspection")
        .toArray())
        .find((item) => item.entityId === record.clientUuid && item.action === "create");
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
        if (correctionDraft) {
          throw new Error("A submitted photo retry operation is missing");
        }
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
  const activeKey = `masterSystemInspection:create:${record.clientUuid}`;
  let next: AutomaticSprinklerInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => {
    const liveRecord = await localDatabase.masterSystemInspections.get(record.clientUuid);
    if (
      !liveRecord
      || liveRecord.systemKey !== "automatic_sprinkler"
      || (liveRecord.syncStatus !== "Failed" && liveRecord.syncStatus !== "Conflict")
    ) {
      throw new Error("Only the current failed Automatic Sprinkler inspection can be corrected");
    }
    const item = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first()
      ?? (await localDatabase.syncOutbox
        .where("entityType")
        .equals("masterSystemInspection")
        .toArray())
        .find((candidate) =>
          candidate.entityId === record.clientUuid
          && candidate.action === "create"
        );
    if (!item) {
      throw new Error("The submitted inspection retry operation is missing");
    }
    next = {
      ...liveRecord,
      syncStatus: "Draft",
      localUpdatedAt: now(),
      lastSyncError: undefined
    } as AutomaticSprinklerInspectionRecord;
    await localDatabase.masterSystemInspections.put(next);
    await localDatabase.syncOutbox.update(item.operationId, {
      status: "Completed",
      activeKey,
      completedAt: now(),
      lastError: "Superseded by technician correction"
    });
  });
  if (!next) throw new Error("Automatic Sprinkler inspection was not returned for correction");
  return next;
}
