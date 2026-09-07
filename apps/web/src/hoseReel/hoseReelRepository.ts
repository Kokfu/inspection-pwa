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
import {
  defaultCatalogTemplate,
  type InspectionCatalogInput
} from "../referenceData/referenceDataTypes";
import { compatibleCatalogSystem } from "../referenceData/systemContractCompatibility";
import type { InspectionJob, JobLocationSnapshot, JobSystemSnapshot } from "../jobs/jobTypes";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import { listHoseReelV7Photos, v7HoseReelEvidenceOutbox, v7HoseReelManifest, v7HoseReelSubmissionIssues } from "./hoseReelV7Evidence";
import { hoseReelLimits, type DeviceReportedCreator, type GoodPoor, type HoseReelDrumType, type HoseReelInspectionSnapshot, type HoseReelResponses, type HoseReelRow, type MasterSystemInspectionRecord } from "./hoseReelTypes";

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
function definitionFor(catalog: InspectionCatalogInput, job: InspectionJob) {
  const resolved = "templates" in catalog
    ? compatibleCatalogSystem(catalog, job.configurationSnapshot.template, key)
    : undefined;
  const template = resolved?.template ?? ("templates" in catalog ? undefined : defaultCatalogTemplate(catalog));
  const system = resolved?.system ?? template?.systems.find((item) => item.key === key && item.definitionStatus === "confirmed");
  if (!template || !system?.definition) throw new Error("Cached Hose Reel definition is unavailable. Refresh reference data while online.");
  const resolvedControls = parseFrozenHoseReelControls(system.resolvedRuntimeControls)
    ?? resolvePublishedHoseReelControls(system.definition, template.code, template.version);
  return { definition: system.definition, resolvedControls };
}
function row(location: JobLocationSnapshot, zone: JobSystemSnapshot["zones"][number] | undefined, sortOrder: number, isV7: boolean) { return { rowUuid: crypto.randomUUID(), source: "configured" as const, configuredLocationId: location.id, zoneSnapshot: zone ? { id: zone.id, key: zone.key, displayName: zone.displayName } : null, locationSnapshot: { id: location.id, key: location.key, displayName: location.displayName }, locationText: location.displayName, assetReference: null, sortOrder, drumResult: null, hoseResult: null, nozzleResult: null, valveResult: null, nozzleBoxResult: null, remarks: "", ...(isV7 ? { fieldRemarks: {}, drumType: null } : {}) }; }
/** A blank technician drum section. Schema 3 (V7) carries the per-drum `drumType`
 * label; schema 2 kept the finding-only `fieldRemarks`; historical rows carry
 * neither. */
function newTechnicianRow(schemaVersion: HoseReelResponses["schemaVersion"], sortOrder: number): HoseReelRow { return { rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: "", assetReference: null, sortOrder, drumResult: null, hoseResult: null, nozzleResult: null, valveResult: null, nozzleBoxResult: null, remarks: "", ...(schemaVersion === 2 || schemaVersion === 3 ? { fieldRemarks: {} } : {}), ...(schemaVersion === 3 ? { drumType: null } : {}) }; }
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
      [...controls.checklist.waterTank, ...controls.checklist.pumpHouse, ...(controls.checklist.testRunFirePump ?? [])]
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
    rows: system.locations.flatMap((location) =>
      Array.from({ length: location.presetRowCount }, () =>
        row(location, zones.get(location.zoneId ?? ""), ++order, controls.source.templateVersion === 7)
      )
    ),
    comments: "",
    // Schema 3 (V7): technician declares the drum count per visit and each drum
    // section carries its own `drumType`. Legacy keeps the global multi-select.
    ...(controls.source.templateVersion === 7 ? { schemaVersion: 3, drumCount: order } : { drumTypes: { swing: false, fixed: false } })
  };
}
function createSnapshot(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalogInput): HoseReelInspectionSnapshot {
  const { definition, resolvedControls } = definitionFor(catalog, job);
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
      drumTypeCardinality: job.configurationSnapshot.template.version === 7 ? "per_drum_technician_declared" : "pending_confirmation"
    }
  };
}

export async function getOrCreateHoseReelInspection(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalogInput, creator: { id: number; username: string; role: "admin" | "inspector" } | undefined): Promise<MasterSystemInspectionRecord> { const groupKey = jobSystemKey(job.id); const existing = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(groupKey).first(); if (existing) { if (existing.systemKey !== key) throw new Error("Stored Master-system inspection identity is invalid"); return existing; } if (job.status === "closed") throw new Error("Completed jobs cannot create new inspection Drafts"); const timestamp = now(); const originalCreatorSnapshot: DeviceReportedCreator | null = creator ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp } : null; const inspectionSnapshot = createSnapshot(job, system, catalog); const record: MasterSystemInspectionRecord = { schemaVersion: 1, clientUuid: crypto.randomUUID(), jobSystemKey: groupKey, jobId: job.id, systemKey: key, originalCreatorSnapshot, masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: job.configurationSnapshot.template.version }, configuration: job.configurationSnapshot.configuration, inspectionSnapshot, responses: emptyResponses(system, controlsForHoseReelSnapshot(inspectionSnapshot)), performedAt: timestamp, localCreatedAt: timestamp, localUpdatedAt: timestamp, syncStatus: "Draft" }; try { await localDatabase.masterSystemInspections.add(record); return record; } catch (error) { const raced = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(groupKey).first(); if (raced?.systemKey === key) return raced; throw error; } }
function preserveConfiguredRows(current: HoseReelResponses, proposed: HoseReelResponses): HoseReelResponses {
  const proposedByUuid = new Map(proposed.rows.map((item) => [item.rowUuid, item]));
  const configured = current.rows.filter((item) => item.source === "configured").map((item) => {
    const proposedRow = proposedByUuid.get(item.rowUuid);
    return proposedRow ? { ...proposedRow, source: "configured" as const, configuredLocationId: item.configuredLocationId, zoneSnapshot: item.zoneSnapshot, locationSnapshot: item.locationSnapshot, locationText: item.locationText, sortOrder: item.sortOrder } : item;
  });
  const technician = proposed.rows.filter((item) => item.source === "technician" && !current.rows.some((currentRow) => currentRow.rowUuid === item.rowUuid && currentRow.source === "configured"));
  return { ...proposed, rows: [...configured, ...technician.map((item, index) => ({ ...item, sortOrder: configured.length + index + 1 }))] };
}
function update(record: MasterSystemInspectionRecord, responses: HoseReelResponses, syncStatus: MasterSystemInspectionRecord["syncStatus"]): MasterSystemInspectionRecord { return { ...record, responses, syncStatus, localUpdatedAt: now(), lastSyncError: undefined }; }
export async function saveHoseReelDraft(record: MasterSystemInspectionRecord, responses: HoseReelResponses) { let next: MasterSystemInspectionRecord | undefined; await localDatabase.transaction("rw", localDatabase.masterSystemInspections, async () => { const live = await localDatabase.masterSystemInspections.get(record.clientUuid); if (!live || live.systemKey !== key || live.syncStatus !== "Draft" || live.localUpdatedAt !== record.localUpdatedAt) throw new Error("Only the current Draft Hose Reel inspection can be edited"); next = update(live, preserveConfiguredRows(live.responses, responses), "Draft"); await localDatabase.masterSystemInspections.put(next); }); if (!next) throw new Error("Hose Reel Draft was not saved"); return next; }
function allowedResult(definition: ResultControlDefinition, value: GoodPoor | null) {
  return value !== null && definition.options.some((option) => option.value === value);
}
export function getHoseReelSubmitIssues(responses: HoseReelResponses, snapshot: HoseReelInspectionSnapshot, record?: MasterSystemInspectionRecord, attachments: InspectionAttachmentRecord[] = []): HoseReelSubmitIssue[] {
  const issues: HoseReelSubmitIssue[] = [];
  const controls = controlsForHoseReelSnapshot(snapshot);
  const checklistGroups = [
    ["Water Tank", controls.checklist.waterTank],
    ["Pump House", controls.checklist.pumpHouse],
    ["Test Run Fire Pump 30 Minutes", controls.checklist.testRunFirePump]
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

  if (responses.schemaVersion === 3) {
    const count = responses.drumCount;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
      issues.push({ section: "Hose Reel Drums", message: "Enter how many hose reel drums were inspected", targetId: "hose-reel-drum-count" });
    } else if (count !== responses.rows.length) {
      issues.push({ section: "Hose Reel Drums", message: `Drum count (${count}) must match the ${responses.rows.length} drum section(s) below`, targetId: "hose-reel-drum-count" });
    }
    responses.rows.forEach((row, index) => {
      if (row.drumType !== "swing" && row.drumType !== "fixed") {
        issues.push({ section: "Hose Reel Drums", message: `Drum ${index + 1}: choose Swing or Fixed`, targetId: `hose-row-${row.rowUuid}` });
      }
    });
  }

  if (responses.comments.length > controls.comments.maxLength) issues.push({ section: "Comments", message: `Comments exceed ${controls.comments.maxLength} characters`, targetId: "hose-reel-comments" });
  if (record) issues.push(...v7HoseReelSubmissionIssues(record, responses, attachments).map((message) => ({ section: "V7 Evidence", message, targetId: "hose-reel-locations" })));
  return issues;
}

function validateSubmit(record: MasterSystemInspectionRecord, responses: HoseReelResponses, attachments: InspectionAttachmentRecord[]) {
  if (getHoseReelSubmitIssues(responses, record.inspectionSnapshot, record, attachments).length > 0) {
    throw new Error("Complete required Hose Reel results and keep submitted text within the allowed limits");
  }
}
function payload(record: MasterSystemInspectionRecord, evidenceManifest?: ReturnType<typeof v7HoseReelManifest>) { return { clientUuid: record.clientUuid, jobId: record.jobId, systemKey: record.systemKey, ...(record.masterTemplate.version === 7 ? { instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1 } : {}), originalCreatorSnapshot: record.originalCreatorSnapshot ?? null, masterTemplate: record.masterTemplate, configuration: record.configuration, inspectionSnapshot: record.inspectionSnapshot, responses: record.responses, performedAt: record.performedAt, ...(evidenceManifest ? { evidenceManifest } : {}) }; }
export async function submitLocalHoseReel(record: MasterSystemInspectionRecord, responses: HoseReelResponses) { let next: MasterSystemInspectionRecord | undefined; const activeKey = `masterSystemInspection:create:${record.clientUuid}`; await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, localDatabase.syncOutbox, async () => { const live = await localDatabase.masterSystemInspections.get(record.clientUuid); if (!live || live.systemKey !== key || live.localUpdatedAt !== record.localUpdatedAt || live.syncStatus !== "Draft") throw new Error("This Hose Reel record changed elsewhere. Reload before submitting."); const current = live as MasterSystemInspectionRecord; const merged = preserveConfiguredRows(current.responses, responses); const photos = current.masterTemplate.version === 7 ? await listHoseReelV7Photos(current.clientUuid) : []; validateSubmit(current, merged, photos); next = update(current, merged, "Pending"); const manifest = current.masterTemplate.version === 7 ? v7HoseReelManifest(photos, merged) : undefined; const existing = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first(); const outbox: SyncOutboxItem = { operationId: existing?.operationId ?? crypto.randomUUID(), entityType: "masterSystemInspection", entityId: current.clientUuid, action: "create", payload: payload(next, manifest), createdAt: next.localCreatedAt, attempts: existing?.attempts ?? 0, status: "Pending", activeKey }; await localDatabase.masterSystemInspections.put(next); if (existing) await localDatabase.syncOutbox.put(outbox); else await localDatabase.syncOutbox.add(outbox); for (const photo of photos.filter((photo) => manifest?.some((entry) => entry.photoUuid === photo.photoUuid))) { await localDatabase.inspectionAttachments.update(photo.photoUuid, { syncStatus: "Pending", localUpdatedAt: next.localUpdatedAt }); const evidenceKey = `v7StagedEvidence:create:${photo.photoUuid}`; if (!await localDatabase.syncOutbox.where("activeKey").equals(evidenceKey).first()) await localDatabase.syncOutbox.add(v7HoseReelEvidenceOutbox(photo)); } }); if (!next) throw new Error("Hose Reel inspection was not submitted"); return next; }
export async function editFailedHoseReel(record: MasterSystemInspectionRecord) { let next: MasterSystemInspectionRecord | undefined; const activeKey = `masterSystemInspection:create:${record.clientUuid}`; await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.syncOutbox, async () => { const live = await localDatabase.masterSystemInspections.get(record.clientUuid); if (!live || live.systemKey !== key || live.localUpdatedAt !== record.localUpdatedAt || (live.syncStatus !== "Failed" && live.syncStatus !== "Conflict")) throw new Error("This Hose Reel record changed elsewhere. Reload before correcting it."); next = { ...(live as MasterSystemInspectionRecord), syncStatus: "Draft", localUpdatedAt: now(), lastSyncError: undefined }; const item = await localDatabase.syncOutbox.where("activeKey").equals(activeKey).first(); if (item) await localDatabase.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: now(), lastError: "Superseded by technician correction" }); await localDatabase.masterSystemInspections.put(next); }); if (!next) throw new Error("Hose Reel inspection was not corrected"); return next; }
export function addHoseReelRow(responses: HoseReelResponses): HoseReelResponses {
  const sortOrder = Math.max(0, ...responses.rows.map((item) => item.sortOrder)) + 1;
  const rows = [...responses.rows, newTechnicianRow(responses.schemaVersion, sortOrder)];
  return { ...responses, rows, ...(responses.schemaVersion === 3 ? { drumCount: rows.length } : {}) };
}

/** Schema 3 (V7): the technician's declared drum count drives how many per-drum
 * sections the form renders. Reconcile the row list to `count`, appending blank
 * technician sections or trimming trailing technician sections — configured rows
 * are never dropped (repeatable-row-model invariant 1). */
export function setHoseReelDrumCount(responses: HoseReelResponses, count: number): HoseReelResponses {
  if (responses.schemaVersion !== 3) return responses;
  const configured = responses.rows.filter((item) => item.source === "configured");
  const technician = responses.rows.filter((item) => item.source === "technician");
  const requested = Number.isFinite(count) ? Math.floor(count) : 0;
  const target = Math.max(configured.length, Math.min(Math.max(requested, 0), hoseReelLimits.rows));
  const technicianTarget = target - configured.length;
  let nextTechnician = technician;
  if (technicianTarget > technician.length) {
    nextTechnician = [
      ...technician,
      ...Array.from({ length: technicianTarget - technician.length }, () => newTechnicianRow(3, 0))
    ];
  } else if (technicianTarget < technician.length) {
    nextTechnician = technician.slice(0, technicianTarget);
  }
  const rows: HoseReelRow[] = [...configured, ...nextTechnician].map((item, index) => ({ ...item, sortOrder: index + 1 }));
  return { ...responses, rows, drumCount: rows.length };
}

/** Non-binding reference: the technician's most recent local Hose Reel record for
 * the SAME customer. Surfaced read-only so the form can hint the previous drum
 * count + per-drum types without auto-applying them. */
export async function latestHoseReelReferenceForCustomer(customerId: string, excludeClientUuid: string): Promise<{ drumCount: number; drumTypes: Array<HoseReelDrumType | null>; jobReference: string; localUpdatedAt: string } | undefined> {
  if (!customerId) return undefined;
  const stored = await localDatabase.masterSystemInspections.where("systemKey").equals(key).toArray();
  const candidates = stored.filter((item): item is MasterSystemInspectionRecord =>
    item.systemKey === key && item.clientUuid !== excludeClientUuid
    && item.inspectionSnapshot?.customer?.id === customerId && Array.isArray(item.responses?.rows));
  const latest = candidates.sort((left, right) => right.localUpdatedAt.localeCompare(left.localUpdatedAt))[0];
  if (!latest) return undefined;
  return {
    drumCount: typeof latest.responses.drumCount === "number" ? latest.responses.drumCount : latest.responses.rows.length,
    drumTypes: latest.responses.rows.map((item) => item.drumType ?? null),
    jobReference: latest.inspectionSnapshot?.job?.reference ?? "",
    localUpdatedAt: latest.localUpdatedAt
  };
}
