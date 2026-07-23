import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import type { InspectionJob, JobLocationSnapshot, JobSystemSnapshot } from "../jobs/jobTypes";
import { hoseReelChecklistItems, hoseReelLimits, type DeviceReportedCreator, type HoseReelInspectionSnapshot, type HoseReelResponses, type MasterSystemInspectionRecord } from "./hoseReelTypes";

const key = "hose_reel";
const now = () => new Date().toISOString();
export type HoseReelSubmitIssue = { section: string; message: string; targetId: string };
export const jobSystemKey = (jobId: string) => `${jobId}:${key}`;
function definitionFor(catalog: InspectionCatalog) { const definition = catalog.systems.find((item) => item.key === key && item.definitionStatus === "confirmed")?.definition; if (!definition) throw new Error("Cached Hose Reel definition is unavailable. Refresh reference data while online."); return definition; }
function row(location: JobLocationSnapshot, zone: JobSystemSnapshot["zones"][number] | undefined, sortOrder: number) { return { rowUuid: crypto.randomUUID(), source: "configured" as const, configuredLocationId: location.id, zoneSnapshot: zone ? { id: zone.id, key: zone.key, displayName: zone.displayName } : null, locationSnapshot: { id: location.id, key: location.key, displayName: location.displayName }, locationText: location.displayName, assetReference: null, sortOrder, drumResult: null, hoseResult: null, nozzleResult: null, valveResult: null, nozzleBoxResult: null, remarks: "" }; }
function emptyResponses(system: JobSystemSnapshot): HoseReelResponses { const zones = new Map(system.zones.map((zone) => [zone.id, zone])); let order = 0; return { checklist: Object.fromEntries(hoseReelChecklistItems.map(([itemKey]) => [itemKey, { result: null, remarks: "" }])), measurements: { jockey_pump_pressure: { values: { cut_in: null, cut_out: null }, unit: "PSI", result: null, remarks: "" }, standby_pump_cut_in: { values: { value: null }, unit: "PSI", result: null, remarks: "" } }, drumTypes: { swing: false, fixed: false }, rows: system.locations.flatMap((location) => Array.from({ length: location.presetRowCount }, () => row(location, zones.get(location.zoneId ?? ""), ++order))), comments: "" }; }
function createSnapshot(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog): HoseReelInspectionSnapshot { return { schemaVersion: 1, capturedAt: now(), job: { id: job.id, reference: job.reference, title: job.title }, customer: job.configurationSnapshot.customer, configuration: job.configurationSnapshot.configuration, template: job.configurationSnapshot.template, system: { ...system, definition: definitionFor(catalog), repetitionMode: "single_with_repeatable_rows", drumTypeCardinality: "pending_confirmation" } }; }

export async function getOrCreateHoseReelInspection(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog, creator: { id: number; username: string; role: "admin" | "inspector" } | undefined) { const groupKey = jobSystemKey(job.id); const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(groupKey).first(); if (existing) return existing; const timestamp = now(); const originalCreatorSnapshot: DeviceReportedCreator | null = creator ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp } : null; const record: MasterSystemInspectionRecord = { schemaVersion: 1, clientUuid: crypto.randomUUID(), jobSystemKey: groupKey, jobId: job.id, systemKey: key, originalCreatorSnapshot, masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: 1 }, configuration: job.configurationSnapshot.configuration, inspectionSnapshot: createSnapshot(job, system, catalog), responses: emptyResponses(system), performedAt: timestamp, localCreatedAt: timestamp, localUpdatedAt: timestamp, syncStatus: "Draft" }; try { await localDatabase.masterSystemInspections.add(record); return record; } catch (error) { const raced = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(groupKey).first(); if (raced) return raced; throw error; } }
function update(record: MasterSystemInspectionRecord, responses: HoseReelResponses, syncStatus: MasterSystemInspectionRecord["syncStatus"]): MasterSystemInspectionRecord { return { ...record, responses, syncStatus, localUpdatedAt: now(), lastSyncError: undefined }; }
export async function saveHoseReelDraft(record: MasterSystemInspectionRecord, responses: HoseReelResponses) { if (record.syncStatus !== "Draft") throw new Error("Only Draft Hose Reel inspections can be edited"); const next = update(record, responses, "Draft"); await localDatabase.masterSystemInspections.put(next); return next; }
export function getHoseReelSubmitIssues(responses: HoseReelResponses): HoseReelSubmitIssue[] {
  const issues: HoseReelSubmitIssue[] = [];
  hoseReelChecklistItems.forEach(([itemKey, label], index) => {
    const section = index < 4 ? "Water Tank" : "Pump House";
    const item = responses.checklist[itemKey];
    if (!item?.result) issues.push({ section, message: `${label}: Result required`, targetId: `check-${itemKey}` });
    if ((item?.remarks.length ?? 0) > hoseReelLimits.remarks) issues.push({ section, message: `${label}: Remarks exceed ${hoseReelLimits.remarks} characters`, targetId: `check-${itemKey}` });
  });

  const jockey = responses.measurements.jockey_pump_pressure;
  if (!Number.isFinite(jockey.values.cut_in)) issues.push({ section: "Pump House", message: "Jockey Pump: Cut In PSI required", targetId: "jockey-measurement" });
  if (!Number.isFinite(jockey.values.cut_out)) issues.push({ section: "Pump House", message: "Jockey Pump: Cut Out PSI required", targetId: "jockey-measurement" });
  if (!jockey.result) issues.push({ section: "Pump House", message: "Jockey Pump: Result required", targetId: "jockey-measurement" });
  if (jockey.remarks.length > hoseReelLimits.remarks) issues.push({ section: "Pump House", message: `Jockey Pump: Remarks exceed ${hoseReelLimits.remarks} characters`, targetId: "jockey-measurement" });

  const standby = responses.measurements.standby_pump_cut_in;
  if (!Number.isFinite(standby.values.value)) issues.push({ section: "Pump House", message: "Stand-By Pump: Cut In PSI required", targetId: "standby-measurement" });
  if (!standby.result) issues.push({ section: "Pump House", message: "Stand-By Pump: Result required", targetId: "standby-measurement" });
  if (standby.remarks.length > hoseReelLimits.remarks) issues.push({ section: "Pump House", message: `Stand-By Pump: Remarks exceed ${hoseReelLimits.remarks} characters`, targetId: "standby-measurement" });

  if (responses.rows.length === 0) issues.push({ section: "Hose Reel Locations", message: "At least one location is required", targetId: "hose-reel-locations" });
  if (responses.rows.length > hoseReelLimits.rows) issues.push({ section: "Hose Reel Locations", message: `No more than ${hoseReelLimits.rows} rows may be submitted`, targetId: "hose-reel-locations" });
  responses.rows.forEach((row, index) => {
    const name = `Location ${index + 1}`;
    const targetId = `hose-row-${row.rowUuid}`;
    if (!row.locationText.trim()) issues.push({ section: "Hose Reel Locations", message: `${name}: Location required`, targetId });
    if (!row.drumResult) issues.push({ section: "Hose Reel Locations", message: `${name}: Drum result required`, targetId });
    if (!row.hoseResult) issues.push({ section: "Hose Reel Locations", message: `${name}: Hose result required`, targetId });
    if (!row.nozzleResult) issues.push({ section: "Hose Reel Locations", message: `${name}: Nozzle result required`, targetId });
    if (!row.valveResult) issues.push({ section: "Hose Reel Locations", message: `${name}: Valve result required`, targetId });
    if (!row.nozzleBoxResult) issues.push({ section: "Hose Reel Locations", message: `${name}: Nozzle Box result required`, targetId });
    if (row.locationText.length > hoseReelLimits.location) issues.push({ section: "Hose Reel Locations", message: `${name}: Location exceeds ${hoseReelLimits.location} characters`, targetId });
    if ((row.assetReference?.length ?? 0) > hoseReelLimits.assetReference) issues.push({ section: "Hose Reel Locations", message: `${name}: Reference exceeds ${hoseReelLimits.assetReference} characters`, targetId });
    if (row.remarks.length > hoseReelLimits.remarks) issues.push({ section: "Hose Reel Locations", message: `${name}: Remarks exceed ${hoseReelLimits.remarks} characters`, targetId });
  });

  if (responses.comments.length > hoseReelLimits.comments) issues.push({ section: "Comments", message: `Comments exceed ${hoseReelLimits.comments} characters`, targetId: "hose-reel-comments" });
  return issues;
}

function validateSubmit(responses: HoseReelResponses) {
  if (getHoseReelSubmitIssues(responses).length > 0) {
    throw new Error("Complete required Hose Reel results and keep submitted text within the allowed limits");
  }
}
function payload(record: MasterSystemInspectionRecord) { return { clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey, originalCreatorSnapshot: record.originalCreatorSnapshot ?? null, masterTemplate: record.masterTemplate, configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot, responses: record.responses, performedAt: record.performedAt }; }
export async function submitLocalHoseReel(record: MasterSystemInspectionRecord, responses: HoseReelResponses) { if (record.syncStatus !== "Draft" && record.syncStatus !== "Failed") throw new Error("This Hose Reel inspection cannot be submitted in its current state"); validateSubmit(responses); const next = update(record, responses, "Pending"); const activeKey = `masterSystemInspection:create:${record.clientUuid}`; const outbox: SyncOutboxItem = { operationId: crypto.randomUUID(), entityType: "masterSystemInspection", entityId: record.clientUuid, action: "create", payload: payload(next), createdAt: next.localCreatedAt, attempts: 0, status: "Pending", activeKey }; await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => { await localDatabase.masterSystemInspections.put(next); const current = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first(); if (current) await localDatabase.syncOutbox.update(current.operationId, { payload: outbox.payload, status: "Pending", activeKey, lastError: undefined }); else await localDatabase.syncOutbox.add(outbox); }); return next; }
export async function editFailedHoseReel(record: MasterSystemInspectionRecord) { if (record.syncStatus !== "Failed") throw new Error("Only failed inspections can be corrected"); const next = { ...record, syncStatus: "Draft" as const, localUpdatedAt: now(), lastSyncError: undefined }; const activeKey = `masterSystemInspection:create:${record.clientUuid}`; await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => { await localDatabase.masterSystemInspections.put(next); const item = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first(); if (item) await localDatabase.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: now(), lastError: "Superseded by technician correction" }); }); return next; }
export function addHoseReelRow(responses: HoseReelResponses): HoseReelResponses { const sortOrder = Math.max(0, ...responses.rows.map((item) => item.sortOrder)) + 1; return { ...responses, rows: [...responses.rows, { rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: "", assetReference: null, sortOrder, drumResult: null, hoseResult: null, nozzleResult: null, valveResult: null, nozzleBoxResult: null, remarks: "" }] }; }
