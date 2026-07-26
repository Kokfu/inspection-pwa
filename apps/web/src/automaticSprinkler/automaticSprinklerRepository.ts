import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
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
  if (record.syncStatus !== "Draft") throw new Error("Only Draft Automatic Sprinkler inspections can be edited");
  const next = updated(record, responses, "Draft");
  await localDatabase.masterSystemInspections.put(next);
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

export async function submitLocalAutomaticSprinkler(
  record: AutomaticSprinklerInspectionRecord,
  responses: AutomaticSprinklerResponses
) {
  if (record.syncStatus !== "Draft") throw new Error("This Automatic Sprinkler inspection cannot be submitted in its current state");
  if (getAutomaticSprinklerSubmitIssues(responses, record.inspectionSnapshot).length > 0) {
    throw new Error("Complete required Automatic Sprinkler results and PSI values");
  }
  const next = updated(record, responses, "Pending");
  const activeKey = `masterSystemInspection:create:${record.clientUuid}`;
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
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => {
    await localDatabase.masterSystemInspections.put(next);
    const existing = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    if (existing) {
      await localDatabase.syncOutbox.update(existing.operationId, {
        payload: outbox.payload,
        status: "Pending",
        lastError: undefined
      });
    } else {
      await localDatabase.syncOutbox.add(outbox);
    }
  });
  return next;
}

export async function returnFailedAutomaticSprinklerToDraft(record: AutomaticSprinklerInspectionRecord) {
  if (record.syncStatus !== "Failed" && record.syncStatus !== "Conflict") {
    throw new Error("Only failed Automatic Sprinkler inspections can be corrected");
  }
  const next = { ...record, syncStatus: "Draft" as const, localUpdatedAt: now(), lastSyncError: undefined };
  const activeKey = `masterSystemInspection:create:${record.clientUuid}`;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => {
    await localDatabase.masterSystemInspections.put(next);
    const item = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first();
    if (item) {
      await localDatabase.syncOutbox.update(item.operationId, {
        status: "Completed",
        activeKey: undefined,
        completedAt: now(),
        lastError: "Superseded by technician correction"
      });
    }
  });
  return next;
}
