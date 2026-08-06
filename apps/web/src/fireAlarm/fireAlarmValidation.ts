import { parseFireAlarmRowPreset } from "./fireAlarmDefinition";
import type {
  FireAlarmInspectionSnapshot,
  FireAlarmPrimaryDeviceRow,
  FireAlarmResponses,
  FireAlarmSecondaryAlarmDeviceRow,
  GoodPoorResponse
} from "./fireAlarmTypes";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const responseKeys = ["schemaVersion", "controlPanelLocation", "primaryDeviceRows", "chargerAndBatteries", "mainFunctionKeys", "secondaryAlarmDeviceRows", "comments"] as const;
const primaryKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "displaySequence", "assetReference", "alarmZone", "location", "manualCallPoint", "flowSwitch", "heatDetector", "smokeDetector", "remarks"] as const;
const secondaryKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "displaySequence", "assetReference", "location", "alarmBell", "manualCallPoint", "remarks"] as const;
export const fireAlarmChargerKeys = ["main_supply", "battery", "charger"] as const;
export const fireAlarmFunctionKeys = ["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "spka_system", "alarm_lift_trip", "signal_gas_discharge"] as const;

type RecordValue = Record<string, unknown>;
type Configured = { table: "primary" | "secondary"; locationId: string; ordinal: number; zoneSnapshot: { id: string; displayName: string } | null; locationSnapshot: { id: string; displayName: string }; assetReference: string };
export type FireAlarmValidationIssue = { section: string; message: string; targetId?: string };

function object(value: unknown): value is RecordValue { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value: RecordValue, keys: readonly string[]) { const actual = Object.keys(value); return actual.length === keys.length && keys.every((key) => key in value); }
function text(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length <= maximum; }
function clone<T>(value: T): T { return structuredClone(value); }
function configuredRows(snapshot: FireAlarmInspectionSnapshot): Configured[] {
  const zones = new Map(snapshot.system.zones.map((zone) => [zone.id, zone]));
  return snapshot.system.locations.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).flatMap((location) => {
    const preset = parseFireAlarmRowPreset(location.rowPreset);
    if (!preset) throw new Error(`Fire Alarm location ${location.displayName} has missing or invalid row routing`);
    const zone = location.zoneId === null ? undefined : zones.get(location.zoneId);
    if (location.zoneId !== null && !zone) throw new Error(`Fire Alarm location ${location.displayName} has an unknown frozen zone`);
    return Array.from({ length: location.presetRowCount }, (_, index) => ({
      table: preset.fireAlarmTable,
      locationId: location.id,
      ordinal: index + 1,
      zoneSnapshot: zone ? { id: zone.id, displayName: zone.displayName } : null,
      locationSnapshot: { id: location.id, displayName: location.displayName },
      assetReference: preset.assetReference ?? ""
    }));
  });
}
function configuredKey(table: string, id: unknown, ordinal: unknown) { return `${table}:${String(id)}:${String(ordinal)}`; }
function parseChecklist(value: unknown, keys: readonly string[], section: string): Record<string, GoodPoorResponse> {
  if (!object(value) || !exact(value, keys)) throw new Error(`${section} checklist keys are invalid`);
  return Object.fromEntries(keys.map((key) => {
    const item = value[key];
    if (!object(item) || !exact(item, ["result", "remarks"]) || !(item.result === null || item.result === "good" || item.result === "poor") || !text(item.remarks, 2000)) throw new Error(`${section}: ${key} is malformed`);
    return [key, { result: item.result as "good" | "poor" | null, remarks: item.remarks as string }];
  })) as Record<string, GoodPoorResponse>;
}
function provenance(row: RecordValue, table: "primary" | "secondary", expected: Map<string, Configured>, seen: Set<string>) {
  if (row.source === "configured") {
    const key = configuredKey(table, row.configuredLocationId, row.configuredRowOrdinal);
    const match = expected.get(key);
    if (!match || seen.has(key)) throw new Error("Configured Fire Alarm row provenance is invalid or duplicated");
    if (JSON.stringify(row.zoneSnapshot) !== JSON.stringify(match.zoneSnapshot) || JSON.stringify(row.locationSnapshot) !== JSON.stringify(match.locationSnapshot) || row.assetReference !== match.assetReference) throw new Error("Configured Fire Alarm row provenance was changed");
    if (table === "primary" && (row.alarmZone !== (match.zoneSnapshot?.displayName ?? "") || row.location !== match.locationSnapshot.displayName)) throw new Error("Configured primary Fire Alarm row text was changed");
    if (table === "secondary" && row.location !== match.locationSnapshot.displayName) throw new Error("Configured secondary Fire Alarm row text was changed");
    seen.add(key);
    return;
  }
  if (row.source !== "technician" || row.configuredLocationId !== null || row.configuredRowOrdinal !== null || row.zoneSnapshot !== null || row.locationSnapshot !== null) throw new Error("Technician Fire Alarm row contains configured provenance");
}

export function canonicalizeFireAlarmResponses(value: unknown, snapshot: FireAlarmInspectionSnapshot): FireAlarmResponses {
  if (!object(value) || !exact(value, responseKeys) || value.schemaVersion !== 1 || !text(value.controlPanelLocation, 300) || !text(value.comments, 4000) || !Array.isArray(value.primaryDeviceRows) || !Array.isArray(value.secondaryAlarmDeviceRows) || value.primaryDeviceRows.length > 250 || value.secondaryAlarmDeviceRows.length > 250) throw new Error("Fire Alarm responses are malformed or exceed approved limits");
  const configured = configuredRows(snapshot);
  const expected = new Map(configured.map((row) => [configuredKey(row.table, row.locationId, row.ordinal), row]));
  const seenConfigured = new Set<string>(); const seenUuids = new Set<string>();
  const parseRows = (rows: unknown[], table: "primary" | "secondary") => rows.map((entry, index) => {
    if (!object(entry) || !exact(entry, table === "primary" ? primaryKeys : secondaryKeys) || typeof entry.rowUuid !== "string" || !uuid.test(entry.rowUuid) || seenUuids.has(entry.rowUuid) || entry.displaySequence !== index + 1 || !text(entry.assetReference, 250) || !text(entry.location, 300) || !text(entry.remarks, 2000)) throw new Error(`${table === "primary" ? "Primary" : "Secondary"} Fire Alarm row ${index + 1} is malformed`);
    if (index > 0 && rows.slice(0, index).some((prior) => object(prior) && prior.source === "technician") && entry.source === "configured") throw new Error("Configured Fire Alarm rows must appear before technician rows");
    if (table === "primary" && (!text(entry.alarmZone, 200) || !([null, "normal", "test", "isolation"] as unknown[]).includes(entry.manualCallPoint) || !([null, "normal", "test", "isolation"] as unknown[]).includes(entry.flowSwitch) || !([null, "normal", "test", "isolation"] as unknown[]).includes(entry.heatDetector) || !([null, "normal", "test", "isolation"] as unknown[]).includes(entry.smokeDetector))) throw new Error(`Primary Fire Alarm row ${index + 1} is malformed`);
    if (table === "secondary" && (!([null, "good", "poor"] as unknown[]).includes(entry.alarmBell) || !([null, "good", "poor"] as unknown[]).includes(entry.manualCallPoint))) throw new Error(`Secondary Fire Alarm row ${index + 1} is malformed`);
    provenance(entry, table, expected, seenConfigured); seenUuids.add(entry.rowUuid);
    return clone(entry);
  });
  const primaryDeviceRows = parseRows(value.primaryDeviceRows, "primary") as FireAlarmPrimaryDeviceRow[];
  const secondaryAlarmDeviceRows = parseRows(value.secondaryAlarmDeviceRows, "secondary") as FireAlarmSecondaryAlarmDeviceRow[];
  if (seenConfigured.size !== expected.size) throw new Error("All configured Fire Alarm rows must be retained in their original tables");
  return {
    schemaVersion: 1, controlPanelLocation: value.controlPanelLocation,
    primaryDeviceRows,
    chargerAndBatteries: parseChecklist(value.chargerAndBatteries, fireAlarmChargerKeys, "Charger & Batteries") as FireAlarmResponses["chargerAndBatteries"],
    mainFunctionKeys: parseChecklist(value.mainFunctionKeys, fireAlarmFunctionKeys, "Main Function Key") as FireAlarmResponses["mainFunctionKeys"],
    secondaryAlarmDeviceRows, comments: value.comments
  };
}

export function getFireAlarmSubmissionIssues(value: unknown, snapshot: FireAlarmInspectionSnapshot): FireAlarmValidationIssue[] {
  let responses: FireAlarmResponses;
  try { responses = canonicalizeFireAlarmResponses(value, snapshot); } catch (error) { return [{ section: "Form", message: error instanceof Error ? error.message : "Fire Alarm responses are invalid" }]; }
  const issues: FireAlarmValidationIssue[] = [];
  if (!responses.controlPanelLocation.trim()) issues.push({ section: "Control Panel", message: "Control Panel Location is required", targetId: "fire-alarm-control-panel" });
  if (responses.primaryDeviceRows.length === 0) issues.push({ section: "Primary devices", message: "At least one primary detector/device row is required" });
  responses.primaryDeviceRows.forEach((row, index) => {
    const targetId = `fire-alarm-primary-${row.rowUuid}`;
    if (!row.alarmZone.trim() || !row.location.trim() || !row.manualCallPoint || !row.flowSwitch || !row.heatDetector || !row.smokeDetector) issues.push({ section: "Primary devices", message: `Row ${index + 1} requires Alarm Zone, Location and all four results`, targetId });
  });
  fireAlarmChargerKeys.forEach((key) => { if (!responses.chargerAndBatteries[key].result) issues.push({ section: "Charger & Batteries", message: `${key.replaceAll("_", " ")} result is required`, targetId: `fire-alarm-charger-${key}` }); });
  fireAlarmFunctionKeys.forEach((key) => { if (!responses.mainFunctionKeys[key].result) issues.push({ section: "Main Function Key", message: `${key.replaceAll("_", " ")} result is required`, targetId: `fire-alarm-function-${key}` }); });
  responses.secondaryAlarmDeviceRows.forEach((row, index) => { if (!row.location.trim() || !row.alarmBell || !row.manualCallPoint) issues.push({ section: "Secondary devices", message: `Row ${index + 1} requires Location and both results`, targetId: `fire-alarm-secondary-${row.rowUuid}` }); });
  return issues;
}

export function assertFireAlarmConfiguration(snapshot: FireAlarmInspectionSnapshot) { configuredRows(snapshot); }
