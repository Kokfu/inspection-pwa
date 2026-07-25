import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import {
  controlsForHoseReelSnapshot,
  parseFrozenHoseReelControls,
  resolvePublishedHoseReelControls
} from "../inspectionControls/definitionResolver";
import type {
  ResolvedHoseReelControls,
  ResolvedMeasurementRow,
  ResultControlDefinition
} from "../inspectionControls/definitionTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import type { InspectionJob, JobLocationSnapshot, JobSystemSnapshot } from "../jobs/jobTypes";
import { hoseReelLimits, type DeviceReportedCreator, type GoodPoor, type HoseReelInspectionSnapshot, type HoseReelResponses, type MasterSystemInspectionRecord } from "./hoseReelTypes";

const key = "hose_reel";
const now = () => new Date().toISOString();
export type HoseReelSubmitIssue = { section: string; message: string; targetId: string };
export const jobSystemKey = (jobId: string) => `${jobId}:${key}`;
const rowResultFields = {
  drum: "drumResult",
  hose: "hoseResult",
  nozzle: "nozzleResult",
  valve: "valveResult",
  nozzle_box: "nozzleBoxResult"
} as const;
function definitionFor(catalog: InspectionCatalog) {
  const system = catalog.systems.find((item) => item.key === key && item.definitionStatus === "confirmed");
  if (!system?.definition) throw new Error("Cached Hose Reel definition is unavailable. Refresh reference data while online.");
  const resolvedControls = parseFrozenHoseReelControls(system.resolvedRuntimeControls)
    ?? resolvePublishedHoseReelControls(system.definition, catalog.code, catalog.version);
  return { definition: system.definition, resolvedControls };
}
function row(location: JobLocationSnapshot, zone: JobSystemSnapshot["zones"][number] | undefined, sortOrder: number) { return { rowUuid: crypto.randomUUID(), source: "configured" as const, configuredLocationId: location.id, zoneSnapshot: zone ? { id: zone.id, key: zone.key, displayName: zone.displayName } : null, locationSnapshot: { id: location.id, key: location.key, displayName: location.displayName }, locationText: location.displayName, assetReference: null, sortOrder, drumResult: null, hoseResult: null, nozzleResult: null, valveResult: null, nozzleBoxResult: null, remarks: "" }; }
function measurement(controls: ResolvedHoseReelControls, measurementKey: string): ResolvedMeasurementRow {
  const value = controls.measurements.find((item) => item.key === measurementKey);
  if (!value) throw new Error(`Hose Reel definition is missing ${measurementKey}`);
  return value;
}
function measurementUnit(definition: ResolvedMeasurementRow): string {
  const units = new Set(definition.values.map((value) => value.unit));
  if (units.size !== 1) throw new Error(`Hose Reel measurement ${definition.key} has inconsistent units`);
  return definition.values[0]?.unit ?? "";
}
function emptyResponses(system: JobSystemSnapshot, controls: ResolvedHoseReelControls): HoseReelResponses {
  const zones = new Map(system.zones.map((zone) => [zone.id, zone]));
  const jockey = measurement(controls, "jockey_pump_pressure");
  const standby = measurement(controls, "standby_pump_cut_in");
  let order = 0;
  return {
    checklist: Object.fromEntries(
      [...controls.checklist.waterTank, ...controls.checklist.pumpHouse]
        .map((item) => [item.key, { result: null, remarks: "" }])
    ),
    measurements: {
      jockey_pump_pressure: {
        values: { cut_in: null, cut_out: null },
        unit: measurementUnit(jockey),
        result: null,
        remarks: ""
      },
      standby_pump_cut_in: {
        values: { value: null },
        unit: measurementUnit(standby),
        result: null,
        remarks: ""
      }
    },
    drumTypes: { swing: false, fixed: false },
    rows: system.locations.flatMap((location) =>
      Array.from({ length: location.presetRowCount }, () =>
        row(location, zones.get(location.zoneId ?? ""), ++order)
      )
    ),
    comments: ""
  };
}
function createSnapshot(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog): HoseReelInspectionSnapshot {
  const { definition, resolvedControls } = definitionFor(catalog);
  return {
    schemaVersion: 1,
    capturedAt: now(),
    job: { id: job.id, reference: job.reference, title: job.title },
    customer: job.configurationSnapshot.customer,
    configuration: job.configurationSnapshot.configuration,
    template: job.configurationSnapshot.template,
    system: {
      ...system,
      definition,
      resolvedControls,
      repetitionMode: "single_with_repeatable_rows",
      drumTypeCardinality: "pending_confirmation"
    }
  };
}

export async function getOrCreateHoseReelInspection(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog, creator: { id: number; username: string; role: "admin" | "inspector" } | undefined) { const groupKey = jobSystemKey(job.id); const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(groupKey).first(); if (existing) return existing; const timestamp = now(); const originalCreatorSnapshot: DeviceReportedCreator | null = creator ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp } : null; const inspectionSnapshot = createSnapshot(job, system, catalog); const record: MasterSystemInspectionRecord = { schemaVersion: 1, clientUuid: crypto.randomUUID(), jobSystemKey: groupKey, jobId: job.id, systemKey: key, originalCreatorSnapshot, masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: 1 }, configuration: job.configurationSnapshot.configuration, inspectionSnapshot, responses: emptyResponses(system, controlsForHoseReelSnapshot(inspectionSnapshot)), performedAt: timestamp, localCreatedAt: timestamp, localUpdatedAt: timestamp, syncStatus: "Draft" }; try { await localDatabase.masterSystemInspections.add(record); return record; } catch (error) { const raced = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(groupKey).first(); if (raced) return raced; throw error; } }
function update(record: MasterSystemInspectionRecord, responses: HoseReelResponses, syncStatus: MasterSystemInspectionRecord["syncStatus"]): MasterSystemInspectionRecord { return { ...record, responses, syncStatus, localUpdatedAt: now(), lastSyncError: undefined }; }
export async function saveHoseReelDraft(record: MasterSystemInspectionRecord, responses: HoseReelResponses) { if (record.syncStatus !== "Draft") throw new Error("Only Draft Hose Reel inspections can be edited"); const next = update(record, responses, "Draft"); await localDatabase.masterSystemInspections.put(next); return next; }
function allowedResult(definition: ResultControlDefinition, value: GoodPoor | null) {
  return value !== null && definition.options.some((option) => option.value === value);
}
export function getHoseReelSubmitIssues(responses: HoseReelResponses, snapshot: HoseReelInspectionSnapshot): HoseReelSubmitIssue[] {
  const issues: HoseReelSubmitIssue[] = [];
  const controls = controlsForHoseReelSnapshot(snapshot);
  const checklistGroups = [
    ["Water Tank", controls.checklist.waterTank],
    ["Pump House", controls.checklist.pumpHouse]
  ] as const;
  checklistGroups.forEach(([section, definitions]) => definitions.forEach((definition) => {
    const item = responses.checklist[definition.key];
    if (definition.result.required && !allowedResult(definition.result, item?.result ?? null)) issues.push({ section, message: `${definition.label}: Result required or invalid`, targetId: `check-${definition.key}` });
    if ((item?.remarks.length ?? 0) > definition.remarks.maxLength) issues.push({ section, message: `${definition.label}: Remarks exceed ${definition.remarks.maxLength} characters`, targetId: `check-${definition.key}` });
  }));

  const jockeyDefinition = measurement(controls, "jockey_pump_pressure");
  const standbyDefinition = measurement(controls, "standby_pump_cut_in");
  const jockeyUnit = measurementUnit(jockeyDefinition);
  const standbyUnit = measurementUnit(standbyDefinition);
  const jockey = responses.measurements.jockey_pump_pressure;
  if (!Number.isFinite(jockey.values.cut_in)) issues.push({ section: "Pump House", message: `${jockeyDefinition.label}: ${jockeyDefinition.values[0]?.label ?? "Cut In"} ${jockeyUnit} required`, targetId: "jockey-measurement" });
  if (!Number.isFinite(jockey.values.cut_out)) issues.push({ section: "Pump House", message: `${jockeyDefinition.label}: ${jockeyDefinition.values[1]?.label ?? "Cut Out"} ${jockeyUnit} required`, targetId: "jockey-measurement" });
  if (jockey.unit !== jockeyUnit) issues.push({ section: "Pump House", message: `${jockeyDefinition.label}: Unit is invalid`, targetId: "jockey-measurement" });
  if (!allowedResult(jockeyDefinition.result, jockey.result)) issues.push({ section: "Pump House", message: `${jockeyDefinition.label}: Result required or invalid`, targetId: "jockey-measurement" });
  if (jockey.remarks.length > jockeyDefinition.remarks.maxLength) issues.push({ section: "Pump House", message: `${jockeyDefinition.label}: Remarks exceed ${jockeyDefinition.remarks.maxLength} characters`, targetId: "jockey-measurement" });

  const standby = responses.measurements.standby_pump_cut_in;
  if (!Number.isFinite(standby.values.value)) issues.push({ section: "Pump House", message: `${standbyDefinition.label}: ${standbyDefinition.values[0]?.label ?? "Cut In"} ${standbyUnit} required`, targetId: "standby-measurement" });
  if (standby.unit !== standbyUnit) issues.push({ section: "Pump House", message: `${standbyDefinition.label}: Unit is invalid`, targetId: "standby-measurement" });
  if (!allowedResult(standbyDefinition.result, standby.result)) issues.push({ section: "Pump House", message: `${standbyDefinition.label}: Result required or invalid`, targetId: "standby-measurement" });
  if (standby.remarks.length > standbyDefinition.remarks.maxLength) issues.push({ section: "Pump House", message: `${standbyDefinition.label}: Remarks exceed ${standbyDefinition.remarks.maxLength} characters`, targetId: "standby-measurement" });

  if (responses.rows.length === 0) issues.push({ section: "Hose Reel Locations", message: "At least one location is required", targetId: "hose-reel-locations" });
  if (responses.rows.length > hoseReelLimits.rows) issues.push({ section: "Hose Reel Locations", message: `No more than ${hoseReelLimits.rows} rows may be submitted`, targetId: "hose-reel-locations" });
  responses.rows.forEach((row, index) => {
    const name = `Location ${index + 1}`;
    const targetId = `hose-row-${row.rowUuid}`;
    if (!row.locationText.trim()) issues.push({ section: "Hose Reel Locations", message: `${name}: Location required`, targetId });
    controls.repeatableRows.resultColumns.forEach((column) => {
      const responseField = rowResultFields[column.key as keyof typeof rowResultFields];
      if (!responseField || !allowedResult(column.result, row[responseField])) {
        issues.push({ section: "Hose Reel Locations", message: `${name}: ${column.label} result required or invalid`, targetId });
      }
    });
    if (row.locationText.length > hoseReelLimits.location) issues.push({ section: "Hose Reel Locations", message: `${name}: Location exceeds ${hoseReelLimits.location} characters`, targetId });
    if ((row.assetReference?.length ?? 0) > hoseReelLimits.assetReference) issues.push({ section: "Hose Reel Locations", message: `${name}: Reference exceeds ${hoseReelLimits.assetReference} characters`, targetId });
    if (row.remarks.length > controls.repeatableRows.remarks.maxLength) issues.push({ section: "Hose Reel Locations", message: `${name}: Remarks exceed ${controls.repeatableRows.remarks.maxLength} characters`, targetId });
  });

  if (responses.comments.length > controls.comments.maxLength) issues.push({ section: "Comments", message: `Comments exceed ${controls.comments.maxLength} characters`, targetId: "hose-reel-comments" });
  return issues;
}

function validateSubmit(record: MasterSystemInspectionRecord, responses: HoseReelResponses) {
  if (getHoseReelSubmitIssues(responses, record.inspectionSnapshot).length > 0) {
    throw new Error("Complete required Hose Reel results and keep submitted text within the allowed limits");
  }
}
function payload(record: MasterSystemInspectionRecord) { return { clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey, originalCreatorSnapshot: record.originalCreatorSnapshot ?? null, masterTemplate: record.masterTemplate, configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot, responses: record.responses, performedAt: record.performedAt }; }
export async function submitLocalHoseReel(record: MasterSystemInspectionRecord, responses: HoseReelResponses) { if (record.syncStatus !== "Draft" && record.syncStatus !== "Failed") throw new Error("This Hose Reel inspection cannot be submitted in its current state"); validateSubmit(record, responses); const next = update(record, responses, "Pending"); const activeKey = `masterSystemInspection:create:${record.clientUuid}`; const outbox: SyncOutboxItem = { operationId: crypto.randomUUID(), entityType: "masterSystemInspection", entityId: record.clientUuid, action: "create", payload: payload(next), createdAt: next.localCreatedAt, attempts: 0, status: "Pending", activeKey }; await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => { await localDatabase.masterSystemInspections.put(next); const current = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first(); if (current) await localDatabase.syncOutbox.update(current.operationId, { payload: outbox.payload, status: "Pending", activeKey, lastError: undefined }); else await localDatabase.syncOutbox.add(outbox); }); return next; }
export async function editFailedHoseReel(record: MasterSystemInspectionRecord) { if (record.syncStatus !== "Failed") throw new Error("Only failed inspections can be corrected"); const next = { ...record, syncStatus: "Draft" as const, localUpdatedAt: now(), lastSyncError: undefined }; const activeKey = `masterSystemInspection:create:${record.clientUuid}`; await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => { await localDatabase.masterSystemInspections.put(next); const item = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first(); if (item) await localDatabase.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: now(), lastError: "Superseded by technician correction" }); }); return next; }
export function addHoseReelRow(responses: HoseReelResponses): HoseReelResponses { const sortOrder = Math.max(0, ...responses.rows.map((item) => item.sortOrder)) + 1; return { ...responses, rows: [...responses.rows, { rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: "", assetReference: null, sortOrder, drumResult: null, hoseResult: null, nozzleResult: null, valveResult: null, nozzleBoxResult: null, remarks: "" }] }; }
