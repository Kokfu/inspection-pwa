import { localDatabase } from "../db/localDatabase";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { parseFireAlarmRowPreset, parseFireAlarmSystemDefinition, resolveFireAlarmControls } from "./fireAlarmDefinition";
import type { FireAlarmInspectionRecord, FireAlarmInspectionSnapshot, FireAlarmPrimaryDeviceRow, FireAlarmResponses, FireAlarmSecondaryAlarmDeviceRow } from "./fireAlarmTypes";
import { canonicalizeFireAlarmResponses } from "./fireAlarmValidation";

const systemKey = "fire_alarm_detector" as const;
const staleMessage = "This Fire Alarm Draft changed elsewhere. Reload before saving.";
const now = () => new Date().toISOString();
const nextUpdatedAt = (previous: string) => {
  const current = now();
  return current > previous ? current : new Date(new Date(previous).getTime() + 1).toISOString();
};
export const fireAlarmJobSystemKey = (jobId: string) => `${jobId}:${systemKey}`;

function definition(job: InspectionJob, catalog: InspectionCatalog) {
  if (job.configurationSnapshot.template.code !== "MFE-FSSR" || job.configurationSnapshot.template.version !== 3) throw new Error("Fire Alarm requires the frozen MFE-FSSR V3 job template");
  const template = catalog.templates.find((item) => item.id === job.configurationSnapshot.template.id && item.code === "MFE-FSSR" && item.version === 3);
  const candidate = template?.systems.find((item) => item.key === systemKey && item.definitionStatus === "confirmed");
  const parsed = parseFireAlarmSystemDefinition(candidate?.definition);
  if (!template || !candidate || !parsed) throw new Error("Confirmed Fire Alarm MFE-FSSR V3 reference data is unavailable or malformed");
  return { definition: parsed, controls: resolveFireAlarmControls(parsed) };
}
function configuredRows(system: JobSystemSnapshot) {
  const zones = new Map(system.zones.map((zone) => [zone.id, zone]));
  const primary: FireAlarmPrimaryDeviceRow[] = []; const secondary: FireAlarmSecondaryAlarmDeviceRow[] = [];
  for (const location of system.locations.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))) {
    const preset = parseFireAlarmRowPreset(location.rowPreset);
    if (!preset) throw new Error(`Fire Alarm location ${location.displayName} has missing or invalid row routing`);
    const zone = location.zoneId === null ? undefined : zones.get(location.zoneId);
    if (location.zoneId !== null && !zone) throw new Error(`Fire Alarm location ${location.displayName} has an unknown frozen zone`);
    for (let ordinal = 1; ordinal <= location.presetRowCount; ordinal += 1) {
      const base = { rowUuid: crypto.randomUUID(), source: "configured" as const, configuredLocationId: location.id, configuredRowOrdinal: ordinal, zoneSnapshot: zone ? { id: zone.id, displayName: zone.displayName } : null, locationSnapshot: { id: location.id, displayName: location.displayName }, assetReference: preset.assetReference ?? "", remarks: "" };
      if (preset.fireAlarmTable === "primary") primary.push({ ...base, displaySequence: primary.length + 1, alarmZone: zone?.displayName ?? "", location: location.displayName, manualCallPoint: null, flowSwitch: null, heatDetector: null, smokeDetector: null });
      else secondary.push({ ...base, displaySequence: secondary.length + 1, location: location.displayName, alarmBell: null, manualCallPoint: null });
    }
  }
  return { primary, secondary };
}
function emptyResponses(system: JobSystemSnapshot): FireAlarmResponses {
  const rows = configuredRows(system); const response = () => ({ result: null, remarks: "" });
  return { schemaVersion: 1, controlPanelLocation: "", primaryDeviceRows: rows.primary, chargerAndBatteries: { main_supply: response(), battery: response(), charger: response() }, mainFunctionKeys: { main_alarm_reset: response(), lamp_test: response(), evacuate: response(), ac_supply: response(), dc_supply: response(), spka_system: response(), alarm_lift_trip: response(), signal_gas_discharge: response() }, secondaryAlarmDeviceRows: rows.secondary, comments: "" };
}
export async function getFireAlarmInspection(jobSystemKey: string) {
  const record = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(jobSystemKey).first();
  if (!record) return undefined;
  if (record.systemKey !== systemKey) throw new Error("Stored Fire Alarm inspection identity is invalid");
  return record as FireAlarmInspectionRecord;
}
export async function getOrCreateFireAlarmInspection(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog, creator: { id: number; username: string; role: "admin" | "inspector" } | undefined) {
  const key = fireAlarmJobSystemKey(job.id); const existing = await getFireAlarmInspection(key); if (existing) return existing;
  if (system.systemKey !== systemKey || !job.configurationSnapshot.enabledSystems.some((item) => item.enabledSystemId === system.enabledSystemId && item.systemKey === systemKey)) throw new Error("Invalid frozen Fire Alarm system identity");
  const resolved = definition(job, catalog); const timestamp = now();
  const originalCreatorSnapshot: DeviceReportedCreator | null = creator ? { source: "device_reported", userId: creator.id, username: creator.username, role: creator.role, capturedAt: timestamp } : null;
  const inspectionSnapshot: FireAlarmInspectionSnapshot = { schemaVersion: 1, capturedAt: timestamp, job: { id: job.id, reference: job.reference, title: job.title }, customer: job.configurationSnapshot.customer, configuration: job.configurationSnapshot.configuration, template: { ...job.configurationSnapshot.template, code: "MFE-FSSR", version: 3 }, system: { ...structuredClone(system), systemKey, definition: resolved.definition, resolvedControls: resolved.controls, repetitionMode: "single_with_two_repeatable_tables" } };
  const record: FireAlarmInspectionRecord = { schemaVersion: 1, clientUuid: crypto.randomUUID(), jobSystemKey: key, jobId: job.id, systemKey, instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot, masterTemplate: { id: job.configurationSnapshot.template.id, code: "MFE-FSSR", version: 3 }, configuration: job.configurationSnapshot.configuration, inspectionSnapshot, responses: emptyResponses(system), performedAt: timestamp, localCreatedAt: timestamp, localUpdatedAt: timestamp, syncStatus: "Draft" };
  record.responses = canonicalizeFireAlarmResponses(record.responses, inspectionSnapshot);
  try { await localDatabase.masterSystemInspections.add(record); return record; } catch (error) { if (!(error instanceof Error) || error.name !== "ConstraintError") throw error; const winner = await getFireAlarmInspection(key); if (!winner) throw error; return winner; }
}
export async function saveFireAlarmDraft(record: FireAlarmInspectionRecord, responses: FireAlarmResponses) {
  let saved: FireAlarmInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, async () => {
    const live = await localDatabase.masterSystemInspections.get(record.clientUuid);
    if (!live || live.systemKey !== systemKey || live.clientUuid !== record.clientUuid || live.jobSystemKey !== record.jobSystemKey || live.localUpdatedAt !== record.localUpdatedAt || live.syncStatus !== "Draft") throw new Error(staleMessage);
    const current = live as FireAlarmInspectionRecord;
    const canonical = canonicalizeFireAlarmResponses(responses, current.inspectionSnapshot);
    assertFireAlarmRowIdentity(current.responses, canonical);
    saved = { ...current, responses: canonical, localUpdatedAt: nextUpdatedAt(current.localUpdatedAt), lastSyncError: undefined };
    await localDatabase.masterSystemInspections.put(saved);
  });
  if (!saved) throw new Error("Fire Alarm Draft was not saved"); return saved;
}

function configuredIdentity(table: "primary" | "secondary", row: FireAlarmPrimaryDeviceRow | FireAlarmSecondaryAlarmDeviceRow) {
  return row.source === "configured" ? `${table}:${row.configuredLocationId}:${row.configuredRowOrdinal}` : undefined;
}
function assertTableRowIdentity(
  table: "primary" | "secondary",
  currentRows: Array<FireAlarmPrimaryDeviceRow | FireAlarmSecondaryAlarmDeviceRow>,
  incomingRows: Array<FireAlarmPrimaryDeviceRow | FireAlarmSecondaryAlarmDeviceRow>
) {
  const currentConfigured = new Map(currentRows.flatMap((row) => {
    const identity = configuredIdentity(table, row);
    return identity ? [[identity, row.rowUuid] as const] : [];
  }));
  const incomingConfigured = new Map(incomingRows.flatMap((row) => {
    const identity = configuredIdentity(table, row);
    return identity ? [[identity, row.rowUuid] as const] : [];
  }));
  if (currentConfigured.size !== incomingConfigured.size
    || [...currentConfigured].some(([identity, rowUuid]) => incomingConfigured.get(identity) !== rowUuid)) {
    throw new Error("Configured Fire Alarm row identity cannot be changed");
  }
  const currentTechnician = currentRows.filter((row) => row.source === "technician").map((row) => row.rowUuid).sort();
  const incomingTechnician = incomingRows.filter((row) => row.source === "technician").map((row) => row.rowUuid).sort();
  if (currentTechnician.length !== incomingTechnician.length
    || currentTechnician.some((rowUuid, index) => incomingTechnician[index] !== rowUuid)) {
    throw new Error("Technician Fire Alarm rows must be added or removed with the dedicated row controls");
  }
}
function assertFireAlarmRowIdentity(current: FireAlarmResponses, incoming: FireAlarmResponses) {
  assertTableRowIdentity("primary", current.primaryDeviceRows, incoming.primaryDeviceRows);
  assertTableRowIdentity("secondary", current.secondaryAlarmDeviceRows, incoming.secondaryAlarmDeviceRows);
}

function resequence<T extends { displaySequence: number }>(rows: T[]) { return rows.map((row, index) => ({ ...row, displaySequence: index + 1 })); }
type RowMutation = (responses: FireAlarmResponses) => FireAlarmResponses;
async function mutateFireAlarmDraft(record: FireAlarmInspectionRecord, responses: FireAlarmResponses, mutation: RowMutation) {
  let saved: FireAlarmInspectionRecord | undefined;
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, async () => {
    const live = await localDatabase.masterSystemInspections.get(record.clientUuid);
    if (!live || live.systemKey !== systemKey || live.clientUuid !== record.clientUuid || live.jobSystemKey !== record.jobSystemKey || live.localUpdatedAt !== record.localUpdatedAt || live.syncStatus !== "Draft") throw new Error(staleMessage);
    const current = live as FireAlarmInspectionRecord;
    const canonical = canonicalizeFireAlarmResponses(responses, current.inspectionSnapshot);
    assertFireAlarmRowIdentity(current.responses, canonical);
    const mutated = canonicalizeFireAlarmResponses(mutation(canonical), current.inspectionSnapshot);
    saved = { ...current, responses: mutated, localUpdatedAt: nextUpdatedAt(current.localUpdatedAt), lastSyncError: undefined };
    await localDatabase.masterSystemInspections.put(saved);
  });
  if (!saved) throw new Error("Fire Alarm rows were not changed");
  return saved;
}
export function addFireAlarmPrimaryTechnicianRow(record: FireAlarmInspectionRecord, responses: FireAlarmResponses) {
  return mutateFireAlarmDraft(record, responses, (current) => {
    if (current.primaryDeviceRows.length >= 250) throw new Error("Primary Fire Alarm row maximum reached");
    return { ...current, primaryDeviceRows: [...current.primaryDeviceRows, { rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: current.primaryDeviceRows.length + 1, assetReference: "", alarmZone: "", location: "", manualCallPoint: null, flowSwitch: null, heatDetector: null, smokeDetector: null, remarks: "" }] };
  });
}
export function removeFireAlarmPrimaryTechnicianRow(record: FireAlarmInspectionRecord, responses: FireAlarmResponses, rowUuid: string) {
  return mutateFireAlarmDraft(record, responses, (current) => {
    const row = current.primaryDeviceRows.find((item) => item.rowUuid === rowUuid);
    if (!row || row.source !== "technician") throw new Error("Configured Fire Alarm rows cannot be removed");
    return { ...current, primaryDeviceRows: resequence(current.primaryDeviceRows.filter((item) => item.rowUuid !== rowUuid)) };
  });
}
export function addFireAlarmSecondaryTechnicianRow(record: FireAlarmInspectionRecord, responses: FireAlarmResponses) {
  return mutateFireAlarmDraft(record, responses, (current) => {
    if (current.secondaryAlarmDeviceRows.length >= 250) throw new Error("Secondary Fire Alarm row maximum reached");
    return { ...current, secondaryAlarmDeviceRows: [...current.secondaryAlarmDeviceRows, { rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: current.secondaryAlarmDeviceRows.length + 1, assetReference: "", location: "", alarmBell: null, manualCallPoint: null, remarks: "" }] };
  });
}
export function removeFireAlarmSecondaryTechnicianRow(record: FireAlarmInspectionRecord, responses: FireAlarmResponses, rowUuid: string) {
  return mutateFireAlarmDraft(record, responses, (current) => {
    const row = current.secondaryAlarmDeviceRows.find((item) => item.rowUuid === rowUuid);
    if (!row || row.source !== "technician") throw new Error("Configured Fire Alarm rows cannot be removed");
    return { ...current, secondaryAlarmDeviceRows: resequence(current.secondaryAlarmDeviceRows.filter((item) => item.rowUuid !== rowUuid)) };
  });
}
